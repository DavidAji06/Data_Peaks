import statistics

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Question, Risk
from ..services.scoring import brier, latest_answers

router = APIRouter(prefix="/public", tags=["public"])

MIN_PUBLIC_GROUP = 5  # Hide group results below this, so no one can be singled out


@router.get("/questions")
def public_questions(db: Session = Depends(get_db)):
    questions = db.scalars(
        select(Question).where(Question.status == "resolved").order_by(Question.id)
    ).all()

    result = []
    for question in questions:
        risk = db.get(Risk, question.risk_id)
        probabilities = [r.probability for r in latest_answers(db, question.id).values()]
        enough = len(probabilities) >= MIN_PUBLIC_GROUP
        median = round(statistics.median(probabilities), 2) if enough else None

        result.append({
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
        })
    return result