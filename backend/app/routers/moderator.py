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

from ..services import ml_outputs, panels
from ..services.auth import require_moderator
from ..db import get_db
from ..models import Expert, Invite, PanelMembership, Question, Response, Risk
from ..schemas import PanelDecisionIn, ResolveIn
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


def participation(db: Session, expert_id: str) -> dict:
    """How much an expert takes part: invited, answered, revised and still waiting on them."""
    invited = db.execute(
        select(Question.id, Question.status)
        .join(Invite, Invite.question_id == Question.id)
        .where(Invite.expert_id == expert_id)
    ).all()
    rounds: dict[str, set[int]] = {}
    for question_id, round_ in db.execute(
        select(Response.question_id, Response.round).where(Response.expert_id == expert_id)
    ).all():
        rounds.setdefault(question_id, set()).add(round_)
    return {
        "invited": len(invited),
        "answered": len(rounds),
        "revised": sum(1 for r in rounds.values() if 2 in r),
        "open_unanswered": sum(1 for qid, status in invited if status == "open" and qid not in rounds),
    }


def is_synthetic(expert: Expert) -> bool:
    """Seeded demo experts (fake people with simulated practice answers)."""
    return (expert.link_token or "").startswith("demo-expert-")


@router.get("/leaderboard")
def leaderboard(db: Session = Depends(get_db)):
    """
    The whole panel, in three groups:
    - experts: named experts with enough resolved questions, ranked by mean Brier
    - unranked: named experts still building a track record
    - anonymous: experts who chose full anonymity. No name, no rank and no exact score,
      since those would link their answers across questions; participation and a
      better-than-50% flag are shown so ACAPS can still see the panel is healthy.
    """
    ranked, unranked, anonymous = [], [], []
    for expert in db.scalars(select(Expert).order_by(Expert.id)).all():
        base = {
            # The panels they answer for (falls back to the profile country when they have none)
            "country": ", ".join(panels.member_countries(db, expert)) or expert.country,
            "synthetic": is_synthetic(expert),
            **participation(db, expert.id),
        }
        if expert.anonymity_level == "anonymous":
            summary = summarise_scores(expert_scores(db, expert.id))
            anonymous.append({
                **base,
                "resolved": summary["resolved"],
                # Only once there's enough history for the flag to mean something
                "beats_baseline": summary["beats_baseline"] if summary["resolved"] >= MIN_RESOLVED_FOR_RANKING else None,
            })
            continue

        # Answers given while anonymous never count towards a named identity
        summary = summarise_scores(expert_scores(db, expert.id, exclude_anonymous=True))
        row = {"label": expert.pseudonym, "anonymity_level": expert.anonymity_level, **base, **summary}
        if summary["resolved"] >= MIN_RESOLVED_FOR_RANKING:
            ranked.append(row)
        else:
            row["needed"] = MIN_RESOLVED_FOR_RANKING - summary["resolved"]
            unranked.append(row)

    ranked.sort(key=lambda row: row["mean_brier"])
    for rank, row in enumerate(ranked, start=1):
        row["rank"] = rank
    unranked.sort(key=lambda row: (-row["resolved"], -row["answered"], row["label"].lower()))

    # Numbered by country then activity, never by a stored id, so the label can't follow a person over time
    anonymous.sort(key=lambda row: (row["country"], -row["answered"], -row["invited"]))
    for n, row in enumerate(anonymous, start=1):
        row["label"] = f"Anonymous expert {n}"

    return {
        "baseline_brier": BASELINE_BRIER,
        "min_resolved": MIN_RESOLVED_FOR_RANKING,
        "experts": ranked,
        "unranked": unranked,
        "anonymous": anonymous,
        "note": "Anonymous experts are scored privately: their answers are weighted, but never named or ranked.",
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


# Country panels: membership requests and removals

def anonymous_labels(experts: list[Expert], panel_rows: dict[str, list[PanelMembership]]) -> dict[str, str]:
    """
    "Anonymous expert N", numbered by first panel then id order of this response only.
    The same numbering is used across this page so a request and a member row match,
    but it is never stored, so it can't follow a person into the calibration or question views.
    """
    anonymous = [e for e in experts if e.anonymity_level == "anonymous"]
    anonymous.sort(key=lambda e: ([r.country for r in panel_rows[e.id] if r.status == "member"] or [""])[0])
    return {e.id: f"Anonymous expert {n}" for n, e in enumerate(anonymous, start=1)}


@router.get("/panels")
def list_panels(db: Session = Depends(get_db)):
    """Every country panel with its members, plus the requests waiting for a decision."""
    experts = db.scalars(select(Expert).order_by(Expert.id)).all()
    for expert in experts:
        panels.ensure_rows(db, expert)  # Implicit own-country panels become rows that can be removed
    db.commit()

    panel_rows = {e.id: panels.rows(db, e.id) for e in experts}
    anon = anonymous_labels(experts, panel_rows)

    def who(expert: Expert) -> dict:
        return {
            "label": anon.get(expert.id, expert.pseudonym),
            "anonymity_level": expert.anonymity_level,
            "synthetic": is_synthetic(expert),
        }

    countries: dict[str, dict] = {}
    requests = []
    for expert in experts:
        member_of = [r.country for r in panel_rows[expert.id] if r.status == "member"]
        for row in panel_rows[expert.id]:
            if row.status == "member":
                entry = countries.setdefault(row.country.lower(), {"country": row.country, "members": [], "pending": 0})
                entry["members"].append({"membership_id": row.id, "since": row.decided_at, **who(expert)})
            elif row.status == "pending":
                countries.setdefault(row.country.lower(), {"country": row.country, "members": [], "pending": 0})["pending"] += 1
                requests.append({
                    "membership_id": row.id,
                    "country": row.country,
                    "note": row.note,
                    "requested_at": row.requested_at,
                    "member_of": member_of,
                    **who(expert),
                })

    panel_list = sorted(countries.values(), key=lambda c: (-len(c["members"]), c["country"].lower()))
    for entry in panel_list:
        entry["members"].sort(key=lambda m: m["label"].lower())
    requests.sort(key=lambda r: r["requested_at"])
    return {
        "target": {"min": panels.PANEL_TARGET[0], "max": panels.PANEL_TARGET[1]},
        "panels": panel_list,
        "requests": requests,
    }


@router.post("/panel-memberships/{membership_id}/decision")
def decide_membership(membership_id: int, body: PanelDecisionIn, db: Session = Depends(get_db)):
    row = db.get(PanelMembership, membership_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Membership not found")
    allowed = {"approve": "pending", "decline": "pending", "remove": "member"}
    if row.status != allowed[body.action]:
        raise HTTPException(status_code=409, detail=f"Can't {body.action}: this is {row.status}")

    row.status = {"approve": "member", "decline": "declined", "remove": "removed"}[body.action]
    row.decided_at = panels.now()
    invited = panels.invite_to_open_questions(db, row.expert_id, row.country) if body.action == "approve" else 0
    db.commit()
    # Removing keeps past answers and open invites: only new questions stop
    return {"membership_id": row.id, "status": row.status, "invited_to_open_questions": invited}


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
