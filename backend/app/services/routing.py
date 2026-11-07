"""
Sends a question to every expert in the region.

For now "region" means the expert's country: an expert is invited when their country is one
of the risk's countries, so a risk on "Chad, Niger, Cameroon, Nigeria" reaches all four.
There is no panel cap.

max_open_questions is a notification preference, not a filter: experts already at their
limit are still invited (the question is waiting in the app), they just are not pinged now.
"""

import secrets

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Expert, Invite, Question


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


def should_notify(db: Session, expert: Expert) -> bool:
    """True when the expert is under their max_open_questions (counting the new invite)."""
    return open_invite_count(db, expert.id) <= expert.max_open_questions


def route_question(db: Session, question: Question, country: str) -> list[Invite]:
    """Invites every expert whose country matches. Returns the new invites."""
    countries = parse_countries(country)
    experts = db.scalars(
        select(Expert).where(func.lower(Expert.country).in_(countries)).order_by(Expert.id)
    ).all()

    invites = []
    for expert in experts:
        invite = Invite(
            token=secrets.token_urlsafe(16),
            question_id=question.id,
            expert_id=expert.id,
        )
        db.add(invite)
        invites.append(invite)
    return invites
