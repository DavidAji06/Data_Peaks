import statistics

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Question, Risk
from ..services.scoring import brier, latest_answers

router = APIRouter(prefix="/public", tags=["public"])

MIN_PUBLIC_GROUP = 5  # Hide group results below this, so no one can be singled out


def public_summary(db: Session, question: Question) -> dict:
    risk = db.get(Risk, question.risk_id)
    probabilities = [r.probability for r in latest_answers(db, question.id).values()]
    enough = len(probabilities) >= MIN_PUBLIC_GROUP
    median = round(statistics.median(probabilities), 2) if enough else None

    return {
        "id": question.id,
        "text": question.text,
        "country": risk.country,
        "risk_title": risk.title,
        "deadline": question.deadline,
        "outcome": question.outcome,
        "expert_count": len(probabilities) if enough else None,
        "group_median": median,
        "group_median_brier": brier(median, question.outcome) if enough else None,
        "simulated": question.id.startswith("H"),  # Seeded past questions
    }


@router.get("/questions")
def public_questions(db: Session = Depends(get_db)):
    questions = db.scalars(
        select(Question).where(Question.status == "resolved").order_by(Question.id)
    ).all()
    return [public_summary(db, question) for question in questions]


@router.get("/questions/{question_id}")
def public_question(question_id: str, db: Session = Depends(get_db)):
    question = db.get(Question, question_id)
    # Open questions aren't public, so they look the same as missing ones
    if question is None or question.status != "resolved":
        raise HTTPException(status_code=404, detail="Question not found")
    return public_summary(db, question)