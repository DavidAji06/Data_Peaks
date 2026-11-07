from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Question, Response

BASELINE_BRIER = 0.25  # Score for always answering 50%


def brier(probability: float, outcome: int) -> float:
    return round((probability - outcome) ** 2, 4)


def latest_answers(db: Session, question_id: str) -> dict[str, Response]:
    responses = db.scalars(
        select(Response).where(Response.question_id == question_id)
    ).all()
    latest = {}
    for response in responses:
        current = latest.get(response.expert_id)
        if current is None or response.round > current.round:
            latest[response.expert_id] = response
    return latest


def expert_scores(db: Session, expert_id: str, exclude_anonymous: bool = False) -> list[dict]:
    rows = db.execute(
        select(Response, Question)
        .join(Question, Response.question_id == Question.id)
        .where(Response.expert_id == expert_id, Question.status == "resolved")
    ).all()

    latest = {}
    for response, question in rows:
        current = latest.get(question.id)
        if current is None or response.round > current[0].round:
            latest[question.id] = (response, question)

    scores = []
    for response, question in sorted(latest.values(), key=lambda pair: pair[1].id):
        # Answers given anonymously must never count towards a public identity
        if exclude_anonymous and response.anonymity_level == "anonymous":
            continue
        scores.append({
            "question_id": question.id,
            "question_text": question.text,
            "probability": response.probability,
            "outcome": question.outcome,
            "brier": brier(response.probability, question.outcome),
        })
    return scores


def summarise_scores(scores: list[dict]) -> dict:
    if not scores:
        return {"resolved": 0, "mean_brier": None, "beats_baseline": None}
    mean = round(sum(score["brier"] for score in scores) / len(scores), 4)
    return {
        "resolved": len(scores),
        "mean_brier": mean,
        "beats_baseline": mean < BASELINE_BRIER,
    }