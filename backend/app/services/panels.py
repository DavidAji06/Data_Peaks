"""
Country panels: who answers questions for which country.

- The invite gives the expert their first panel (member as soon as they activate).
- Any other country is a request (pending) that a moderator approves, declines or later removes.
- Questions are routed to panel members only. Following on the map no longer routes anything.

An expert with no rows yet (older data, test fixtures) counts as a member of their own country;
`ensure_rows` writes that down before anything changes.
"""

import secrets
from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Expert, Invite, PanelMembership, Question, Risk
from .routing import followed_countries, parse_countries

PANEL_TARGET = (5, 10)  # ACAPS guideline: about 5 to 10 experts per country


def now():
    return datetime.now(timezone.utc)


def rows(db: Session, expert_id: str) -> list[PanelMembership]:
    return list(db.scalars(
        select(PanelMembership).where(PanelMembership.expert_id == expert_id).order_by(PanelMembership.id)
    ).all())


def find(db: Session, expert_id: str, country: str) -> PanelMembership | None:
    return db.scalar(select(PanelMembership).where(
        PanelMembership.expert_id == expert_id,
        func.lower(PanelMembership.country) == country.strip().lower(),
    ))


def ensure_rows(db: Session, expert: Expert) -> list[PanelMembership]:
    """Writes the implicit own-country membership down, so it can be listed and changed."""
    existing = rows(db, expert.id)
    if existing or not expert.country:
        return existing
    row = PanelMembership(expert_id=expert.id, country=expert.country, status="member", decided_at=now())
    db.add(row)
    db.flush()
    return [row]


def member_countries(db: Session, expert: Expert) -> list[str]:
    existing = rows(db, expert.id)
    if not existing:
        return [expert.country] if expert.country else []
    return [row.country for row in existing if row.status == "member"]


def panel_list(db: Session, expert: Expert) -> list[dict]:
    """The expert's own view: every panel they're on or asked for."""
    existing = rows(db, expert.id)
    if not existing:
        return [{"country": expert.country, "status": "member"}] if expert.country else []
    return [{"country": row.country, "status": row.status} for row in existing]


def request(db: Session, expert: Expert, country: str, note: str | None) -> PanelMembership:
    """Ask to join a country panel. Asking again after a decline or removal re-opens the request."""
    ensure_rows(db, expert)
    country = " ".join(country.split())
    row = find(db, expert.id, country)
    if row is None:
        row = PanelMembership(expert_id=expert.id, country=country, status="pending", note=note)
        db.add(row)
    elif row.status in ("declined", "removed"):
        row.status, row.note, row.requested_at, row.decided_at = "pending", note, now(), None
    db.flush()
    return row


def invite_to_open_questions(db: Session, expert_id: str, country: str) -> int:
    """A newly approved member also gets the country's questions that are still open."""
    wanted = country.lower()
    already = set(db.scalars(select(Invite.question_id).where(Invite.expert_id == expert_id)).all())
    added = 0
    for question, risk_country in db.execute(
        select(Question, Risk.country).join(Risk, Question.risk_id == Risk.id).where(
            Question.status == "open", Question.deadline >= date.today()
        )
    ).all():
        if question.id in already or wanted not in parse_countries(risk_country):
            continue
        db.add(Invite(token=secrets.token_urlsafe(16), question_id=question.id, expert_id=expert_id))
        added += 1
    return added


def backfill(db: Session):
    """
    One-off move from follows to panels for existing data: the expert's own country becomes their
    panel, and every other followed country becomes a pending request for a moderator to decide.
    Experts that already have panel rows are left alone, so this is safe to run at every start.
    """
    for expert in db.scalars(select(Expert)).all():
        if rows(db, expert.id) or not expert.country:
            continue
        ensure_rows(db, expert)
        if expert.followed is not None:
            for country in followed_countries(expert):
                if country.lower() != expert.country.lower():
                    db.add(PanelMembership(expert_id=expert.id, country=country, status="pending"))
    db.commit()
