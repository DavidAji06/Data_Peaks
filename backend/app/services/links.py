"""
Turns an expert link token into (expert, current invite).

Two kinds of token open the expert app:
- an invite token, created by route_question for one expert and one question
- an expert's personal link (Expert.link_token), which works before any question exists.
  It points at the expert's newest open invite, or at none ("You're up to date").
"""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Expert, Invite, Question


def current_invite(db: Session, expert_id: str) -> Invite | None:
    """The expert's newest invite to an open question."""
    return db.scalar(
        select(Invite)
        .join(Question, Invite.question_id == Question.id)
        .where(Invite.expert_id == expert_id, Question.status == "open")
        .order_by(Invite.created_at.desc(), Question.id.desc())
        .limit(1)
    )


def resolve_link(db: Session, token: str) -> tuple[Expert, Invite | None]:
    invite = db.get(Invite, token)
    if invite is not None:
        return db.get(Expert, invite.expert_id), invite
    expert = db.scalar(select(Expert).where(Expert.link_token == token))
    if expert is None:
        raise HTTPException(status_code=404, detail="Link not found")
    return expert, current_invite(db, expert.id)


def expert_invites(db: Session, expert_id: str) -> list[tuple[Invite, Question]]:
    """Every question this expert was invited to: open ones first, then newest first."""
    rows = db.execute(
        select(Invite, Question)
        .join(Question, Invite.question_id == Question.id)
        .where(Invite.expert_id == expert_id)
        .order_by(Invite.created_at.desc(), Question.id.desc())
    ).all()
    return sorted(rows, key=lambda row: row[1].status != "open")  # Stable: keeps newest first


def require_invite(db: Session, token: str, question_id: str | None = None) -> Invite:
    """
    For question routes. With question_id, the expert's invite to that exact question (404 if
    they were never invited to it). Without it, the link's own question: the invite behind an
    invite token, or the newest open one for a personal link. Clients should always send
    question_id, so an answer can never land on a question that arrived in the meantime.
    """
    expert, invite = resolve_link(db, token)
    if question_id is not None:
        invite = db.scalar(
            select(Invite).where(Invite.expert_id == expert.id, Invite.question_id == question_id)
        )
        if invite is None:
            raise HTTPException(status_code=404, detail="You were not invited to this question")
        return invite
    if invite is None:
        raise HTTPException(status_code=404, detail="No open question for this link yet")
    return invite
