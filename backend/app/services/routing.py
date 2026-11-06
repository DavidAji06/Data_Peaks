"""
Picks the experts, those with the fewest open questions go first,
spreads the load across the panel
"""


import secrets

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Expert, Invite, Question

MAX_PANEL_SIZE = 10


def open_invite_count(db: Session, expert_id: str) -> int:
    return db.scalar(
        select(func.count())
        .select_from(Invite)
        .join(Question, Invite.question_id == Question.id)
        .where(Invite.expert_id == expert_id, Question.status == "open")
    )


def parse_countries(country: str) -> set[str]:
    # Multi-country risks are stored like "Chad, Niger, Cameroon, Nigeria"
    return {name.strip().lower() for name in country.split(",") if name.strip()}


def route_question(db: Session, question: Question, country: str) -> list[Invite]:
    countries = parse_countries(country)
    experts = db.scalars(
        select(Expert).where(func.lower(Expert.country).in_(countries))
    ).all()

    candidates = []
    for expert in experts:
        count = open_invite_count(db, expert.id)
        if count < expert.max_open_questions:
            candidates.append((count, expert))
    candidates.sort(key=lambda pair: pair[0])

    invites = []
    for _, expert in candidates[:MAX_PANEL_SIZE]:
        invite = Invite(
            token=secrets.token_urlsafe(16),
            question_id=question.id,
            expert_id=expert.id,
        )
        db.add(invite)
        invites.append(invite)
    return invites