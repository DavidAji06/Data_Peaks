"""
Sends a question to every member of one of the risk's country panels (see services/panels.py).

Panel membership is decided by ACAPS moderators: an expert's invite gives their first panel,
and other countries are requests a moderator approves. Following on the map routes nothing.
A risk on "Chad, Niger, Cameroon, Nigeria" reaches members of any of the four panels.

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


def clean_followed(countries: list[str]) -> str:
    """Stores followed countries comma-separated, trimmed, without duplicates (case-insensitive)."""
    seen: dict[str, str] = {}
    for name in countries:
        name = " ".join(name.split())
        if name and name.lower() not in seen:
            seen[name.lower()] = name
    return ",".join(seen.values())


def followed_countries(expert: Expert) -> list[str]:
    if expert.followed is None:  # Never set: follows their own country
        return [expert.country] if expert.country else []
    return [name for name in expert.followed.split(",") if name]


def should_notify(db: Session, expert: Expert) -> bool:
    """True when the expert is under their max_open_questions (counting the new invite)."""
    return open_invite_count(db, expert.id) <= expert.max_open_questions


def route_question(db: Session, question: Question, country: str) -> list[Invite]:
    """Invites every panel member for one of the risk's countries. Returns the new invites."""
    from .panels import member_countries  # panels imports this module

    countries = parse_countries(country)
    experts = [
        expert
        for expert in db.scalars(select(Expert).order_by(Expert.id)).all()
        if countries & {name.lower() for name in member_countries(db, expert)}
    ]

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
