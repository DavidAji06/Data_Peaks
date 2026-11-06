"""
Moderator view gives ACAPS:
1. number of experts who were invited, answered and revised
2. blind and latest answers: how the group view changed expert estimates
3. distribution: how many forecasts fall in each 20% band
4. responses: each probability and reason, labelled according to experts anonymity
"""


import statistics

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Expert, Invite, Question, Response, Risk
from ..services.anonymity import moderator_label

router = APIRouter(prefix="/moderator", tags=["moderator"])


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
        result.append({
            "id": question.id,
            "risk_id": question.risk_id,
            "text": question.text,
            "status": question.status,
            "deadline": question.deadline,
            "invited": invited_count(db, question.id),
            "answered": len(by_expert),
            "median": summary["median"] if summary else None,
        })
    return result


@router.get("/questions/{question_id}")
def question_detail(question_id: str, db: Session = Depends(get_db)):
    question = db.get(Question, question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    risk = db.get(Risk, question.risk_id)

    by_expert = answers_by_expert(db, question_id)
    experts = {
        expert.id: expert
        for expert in db.scalars(
            select(Expert).where(Expert.id.in_(list(by_expert)))
        ).all()
    }

    first = [rounds[1].probability for rounds in by_expert.values() if 1 in rounds]
    latest = [rounds[max(rounds)].probability for rounds in by_expert.values()]

    # Sort by latest probability so the order doesn't reveal who answered when
    ordered = sorted(by_expert.items(), key=lambda item: item[1][max(item[1])].probability)

    responses = []
    anonymous_number = 0
    for expert_id, rounds in ordered:
        expert = experts[expert_id]
        if expert.anonymity_level == "anonymous":
            anonymous_number += 1

        first_answer = rounds.get(1)
        revision = rounds.get(2)
        latest_answer = revision or first_answer

        responses.append({
            **moderator_label(expert, anonymous_number),
            "first_probability": first_answer.probability if first_answer else None,
            "first_reason": first_answer.reason if first_answer else None,
            "latest_probability": latest_answer.probability,
            "revision_reason": revision.reason if revision else None,
            "revised": revision is not None,
        })

    first_summary = summarise(first)
    latest_summary = summarise(latest)
    median_shift = None
    if first_summary and latest_summary:
        median_shift = round(latest_summary["median"] - first_summary["median"], 2)

    return {
        "question": {
            "id": question.id,
            "text": question.text,
            "resolution_criteria": question.resolution_criteria,
            "deadline": question.deadline,
            "status": question.status,
        },
        "risk": {
            "id": risk.id,
            "title": risk.title,
            "country": risk.country,
            "risk_level": risk.risk_level,
            "acaps_probability": risk.probability,
        },
        "participation": {
            "invited": invited_count(db, question_id),
            "answered": len(by_expert),
            "revised": sum(1 for rounds in by_expert.values() if 2 in rounds),
        },
        "first_round": first_summary,
        "latest": latest_summary,
        "median_shift": median_shift,
        "distribution": bands(latest),
        "responses": responses,
        "themes": {"agreement": [], "disagreement": [], "new_information": []},
    }