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


def require_invite(db: Session, token: str) -> Invite:
    """For question routes: 404 when the link is unknown or has no open question yet."""
    _, invite = resolve_link(db, token)
    if invite is None:
        raise HTTPException(status_code=404, detail="No open question for this link yet")
    return invite
