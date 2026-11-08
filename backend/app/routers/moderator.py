"""
Moderator view gives ACAPS:
1. number of experts who were invited, answered and revised
2. blind and latest answers: how the group view changed expert estimates
3. distribution: how many forecasts fall in each 20% band
4. responses: each probability and reason, labelled according to experts anonymity
"""


import statistics
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..services import ml_outputs
from ..services.auth import require_moderator
from ..db import get_db
from ..models import Expert, Invite, Question, Response, Risk
from ..schemas import ResolveIn
from ..services.anonymity import moderator_label, stricter
from ..services.scoring import (
    BASELINE_BRIER,
    brier,
    expert_scores,
    expert_weights,
    latest_answers,
    summarise_scores,
)
from ..services import weighting
from ..services.consensus import compute_delphi_metrics

router = APIRouter(
    prefix="/moderator",
    tags=["moderator"],
    dependencies=[Depends(require_moderator)],
)

MIN_RESOLVED_FOR_RANKING = 3


def summarise(values: list[float]):
    if not values:
        return None
    return {
        "count": len(values),
        "median": round(statistics.median(values), 2),
        "min": min(values),
        "max": max(values),
    }


def bands(values: list[float]):
    counts = [0] * 5
    for value in values:
        counts[min(int(value * 5), 4)] += 1
    return [
        {"range": f"{i * 20}-{(i + 1) * 20}%", "count": count}
        for i, count in enumerate(counts)
    ]


def answers_by_expert(db: Session, question_id: str) -> dict[str, dict[int, Response]]:
    responses = db.scalars(
        select(Response).where(Response.question_id == question_id)
    ).all()
    by_expert = {}
    for response in responses:
        by_expert.setdefault(response.expert_id, {})[response.round] = response
    return by_expert


def weighted_group(db: Session, question_id: str, by_expert: dict[str, dict[int, Response]]):
    """Brier-weighted estimate of the latest answers, plus each expert's weight (moderators only)."""
    weights = expert_weights(db, list(by_expert), exclude_question=question_id)
    estimate = weighting.weighted_estimate([
        (rounds[max(rounds)].probability, weights[expert_id]) for expert_id, rounds in by_expert.items()
    ])
    if estimate is not None:
        estimate["label"] = weighting.LABEL
        estimate["experts_with_history"] = sum(1 for w in weights.values() if w != weighting.NEUTRAL_WEIGHT)
    return estimate, weights


def invited_count(db: Session, question_id: str) -> int:
    return db.scalar(
        select(func.count()).select_from(Invite).where(Invite.question_id == question_id)
    )


@router.get("/questions")
def list_questions(db: Session = Depends(get_db)):
    questions = db.scalars(select(Question).order_by(Question.id)).all()
    result = []
    for question in questions:
        by_expert = answers_by_expert(db, question.id)
        latest = [rounds[max(rounds)].probability for rounds in by_expert.values()]
        summary = summarise(latest)
        weighted, _ = weighted_group(db, question.id, by_expert)
        revised_count = sum(1 for rounds in by_expert.values() if 2 in rounds)
        if question.status == "resolved":
            phase = "Resolved"
        elif question.status == "closed":
            phase = "Delphi Completed (Final Results)"
        elif getattr(question, "delphi_round", 1) == 2:
            phase = "Phase 2: Delphi Consensus"
        else:
            phase = "Phase 1: Initial Elicitation"
        result.append({
            "id": question.id,
            "risk_id": question.risk_id,
            "text": question.text,
            "status": question.status,
            "delphi_round": getattr(question, "delphi_round", 1),
            "outcome": question.outcome,
            "deadline": question.deadline,
            "invited": invited_count(db, question.id),
            "answered": len(by_expert),
            "revised": revised_count,
            "phase": phase,
            "median": summary["median"] if summary else None,
            "weighted_mean": weighted["mean"] if weighted else None,
        })
    return result


@router.get("/questions/{question_id}")
def question_detail(question_id: str, db: Session = Depends(get_db)):
    question = db.get(Question, question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    risk = db.get(Risk, question.risk_id)
    resolved = question.outcome is not None

    by_expert = answers_by_expert(db, question_id)
    experts = {
        expert.id: expert
        for expert in db.scalars(
            select(Expert).where(Expert.id.in_(list(by_expert)))
        ).all()
    }

    first = [rounds[1].probability for rounds in by_expert.values() if 1 in rounds]
    latest = [rounds[max(rounds)].probability for rounds in by_expert.values()]

    first_dict = {expert_id: rounds[1].probability for expert_id, rounds in by_expert.items() if 1 in rounds}
    second_dict = {expert_id: rounds[2].probability for expert_id, rounds in by_expert.items() if 2 in rounds}
    latest_dict = {expert_id: rounds[max(rounds)].probability for expert_id, rounds in by_expert.items()}
    delphi_metrics = compute_delphi_metrics(first_dict, second_dict, latest_dict)

    if question.status == "resolved":
        phase = "Resolved"
    elif question.status == "closed":
        phase = "Delphi Completed (Final Results)"
    elif getattr(question, "delphi_round", 1) == 2:
        phase = "Phase 2: Delphi Consensus"
    else:
        phase = "Phase 1: Initial Elicitation"

    # Sort by latest probability so the order doesn't reveal who answered when
    ordered = sorted(by_expert.items(), key=lambda item: item[1][max(item[1])].probability)

    weighted, weights = weighted_group(db, question_id, by_expert)

    responses = []
    anonymous_number = 0
    for expert_id, rounds in ordered:
        expert = experts[expert_id]
        first_answer = rounds.get(1)
        revision = rounds.get(2)
        latest_answer = revision or first_answer

        # Use the most private level the expert has had for this question, so
        # changing settings later can never reveal who gave an anonymous answer
        level = stricter(
            expert.anonymity_level,
            first_answer.anonymity_level if first_answer else None,
            revision.anonymity_level if revision else None,
        )
        if level == "anonymous":
            anonymous_number += 1

        # The nickname stored with the answer, so renaming later never relabels past answers
        pseudonym = (first_answer or revision).pseudonym or expert.pseudonym

        # Delphi decision and status
        if revision:
            if first_answer and abs(revision.probability - first_answer.probability) < 0.001:
                decision = "kept"
            else:
                decision = "adjusted"
            resp_status = "finalised"
        else:
            decision = "pending_round_2"
            resp_status = "tentative"

        shift = round(revision.probability - first_answer.probability, 4) if (revision and first_answer) else None

        round_1_entry = {
            "probability": first_answer.probability,
            "reason": first_answer.reason,
            "status": "tentative",
            "created_at": first_answer.created_at.isoformat() if first_answer and first_answer.created_at else None,
        } if first_answer else None

        round_2_entry = {
            "probability": revision.probability,
            "reason": revision.reason,
            "status": "finalised",
            "decision": decision,
            "shift": shift,
            "created_at": revision.created_at.isoformat() if revision and revision.created_at else None,
        } if revision else None

        responses.append({
            **moderator_label(expert, anonymous_number, level, pseudonym),
            "first_probability": first_answer.probability if first_answer else None,
            "first_reason": first_answer.reason if first_answer else None,
            "latest_probability": latest_answer.probability,
            "revision_reason": revision.reason if revision else None,
            "revised": revision is not None,
            "brier": brier(latest_answer.probability, question.outcome) if resolved else None,
            # An anonymous expert's weight is used privately but never shown next to their answer
            "weight": None if level == "anonymous" else weights[expert_id],
            "status": resp_status,
            "decision": decision,
            "shift": shift,
            "is_tentative": revision is None,
            "is_finalised": revision is not None,
            "round_1": round_1_entry,
            "round_2": round_2_entry,
        })

    tentative_responses = [r for r in responses if r["is_tentative"]]
    finalised_responses = [r for r in responses if r["is_finalised"]]

    first_summary = summarise(first)
    latest_summary = summarise(latest)
    median_shift = None
    if first_summary and latest_summary:
        median_shift = round(latest_summary["median"] - first_summary["median"], 2)

    group_brier = None
    if resolved and latest_summary:
        group_brier = brier(latest_summary["median"], question.outcome)

    return {
        "question": {
            "id": question.id,
            "text": question.text,
            "resolution_criteria": question.resolution_criteria,
            "deadline": question.deadline,
            "status": question.status,
            "delphi_round": getattr(question, "delphi_round", 1),
            "outcome": question.outcome,
        },
        "risk": {
            "id": risk.id,
            "title": risk.title,
            "country": risk.country,
            "risk_level": risk.risk_level,
            "acaps_probability": risk.probability,
        },
        "phase": phase,
        "participation": {
            "invited": invited_count(db, question_id),
            "answered": len(by_expert),
            "revised": sum(1 for rounds in by_expert.values() if 2 in rounds),
        },
        "first_round": first_summary,
        "latest": latest_summary,
        "median_shift": median_shift,
        "consensus_metrics": delphi_metrics,
        "weighted": weighted,
        "group_median_brier": group_brier,
        "baseline_brier": BASELINE_BRIER,
        "distribution": bands(latest),
        "responses": responses,
        "tentative_responses": tentative_responses,
        "finalised_responses": finalised_responses,
        "themes": ml_outputs.stored_themes(question),
    }


@router.post("/questions/{question_id}/resolve")
def resolve_question(question_id: str, body: ResolveIn, db: Session = Depends(get_db)):
    question = db.get(Question, question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    if question.status == "resolved":
        raise HTTPException(status_code=409, detail="Question already resolved")

    question.outcome = body.outcome
    question.status = "resolved"
    db.commit()

    answers = latest_answers(db, question_id)
    if not answers:
        return {"question_id": question_id, "outcome": body.outcome, "scored": 0}

    probabilities = [response.probability for response in answers.values()]
    scores = [brier(p, body.outcome) for p in probabilities]

    return {
        "question_id": question_id,
        "outcome": body.outcome,
        "scored": len(scores),
        "mean_expert_brier": round(sum(scores) / len(scores), 4),
        "group_median_brier": brier(statistics.median(probabilities), body.outcome),
        "baseline_brier": BASELINE_BRIER,
    }


@router.get("/leaderboard")
def leaderboard(db: Session = Depends(get_db)):
    rows = []
    for expert in db.scalars(select(Expert)).all():
        # Ranking anonymous experts would link their answers across questions
        if expert.anonymity_level == "anonymous":
            continue
        summary = summarise_scores(expert_scores(db, expert.id, exclude_anonymous=True))
        if summary["resolved"] < MIN_RESOLVED_FOR_RANKING:
            continue
        rows.append({
            "label": expert.pseudonym,
            "anonymity_level": expert.anonymity_level,
            **summary,
        })

    rows.sort(key=lambda row: row["mean_brier"])
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank

    return {
        "baseline_brier": BASELINE_BRIER,
        "min_resolved": MIN_RESOLVED_FOR_RANKING,
        "experts": rows,
        "note": "Anonymous experts are scored privately and not ranked.",
    }

@router.post("/questions/{question_id}/summarise")
def summarise_question(question_id: str, db: Session = Depends(get_db)):
    question = db.get(Question, question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")

    # Sorted so the order doesn't reveal who answered when
    reasons = sorted(
        response.reason
        for response in db.scalars(
            select(Response).where(Response.question_id == question_id)
        ).all()
    )
    themes = ml_outputs.summarise_reasons(reasons)
    question.themes = json.dumps(themes)
    db.commit()
    return {"question_id": question_id, "reason_count": len(reasons), "themes": themes}


@router.post("/questions/{question_id}/advance")
def advance_question_round(question_id: str, db: Session = Depends(get_db)):
    """Admin override: advance a question to Delphi Round 2 earlier."""
    question = db.get(Question, question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    from ..services.delphi_transition import manual_advance_to_round_2
    res = manual_advance_to_round_2(db, question)
    if res.get("action") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res


@router.post("/questions/{question_id}/close")
def close_question(question_id: str, db: Session = Depends(get_db)):
    """Admin override: close a question to finalize Delphi results."""
    question = db.get(Question, question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    from ..services.delphi_transition import manual_close_question
    res = manual_close_question(db, question)
    if res.get("action") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res