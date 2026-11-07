import statistics
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Invite, Question, Risk
from ..services import ml_outputs
from ..services.geo import COUNTRY_CENTRES
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

# Globe on the expert app's Home screen

MAX_RISKS_PER_COUNTRY = 3


def ranking_date() -> str | None:
    path = ml_outputs.PROCESSED / "ranked_risks.json"
    if not path.exists():
        return None
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).date().isoformat()


def countries_with_question(db: Session, token: str | None) -> set[str]:
    """ISO3 codes where the expert behind this link has an open question."""
    if not token:
        return set()
    invite = db.get(Invite, token)
    if invite is None:
        return set()
    rows = db.execute(
        select(Risk.iso)
        .join(Question, Question.risk_id == Risk.id)
        .join(Invite, Invite.question_id == Question.id)
        .where(Invite.expert_id == invite.expert_id, Question.status == "open")
    ).scalars()
    return {code.strip() for iso in rows for code in iso.split(",") if code.strip()}


@router.get("/contexts")
def public_contexts(token: str | None = None, db: Session = Depends(get_db)):
    """Countries with active ranked risks, for the globe. Only public Risk Radar fields."""
    mine = countries_with_question(db, token)
    by_country: dict[str, dict] = {}

    for ranked in ml_outputs.ranked_risks():
        risk = db.get(Risk, ranked.get("risk_id"))
        if risk is None:
            continue
        names = [name.strip() for name in risk.country.split(",")]
        codes = [code.strip() for code in risk.iso.split(",")]
        for code, name in zip(codes, names):
            if code not in COUNTRY_CENTRES:
                continue
            lat, lng = COUNTRY_CENTRES[code]
            entry = by_country.setdefault(code, {
                "iso3": code,
                "country": name,
                "lat": lat,
                "lng": lng,
                "risks": [],
                "has_question": code in mine,
            })
            entry["risks"].append({
                "id": risk.id,
                "title": risk.title,
                "risk_level": risk.risk_level,
                "priority_score": ranked.get("priority_score"),
            })

    contexts = []
    for entry in by_country.values():
        entry["risks"].sort(key=lambda r: r["priority_score"] or 0, reverse=True)
        entry["risks"] = entry["risks"][:MAX_RISKS_PER_COUNTRY]
        contexts.append(entry)
    contexts.sort(key=lambda c: c["risks"][0]["priority_score"] or 0, reverse=True)

    return {"ranked_at": ranking_date(), "contexts": contexts}
