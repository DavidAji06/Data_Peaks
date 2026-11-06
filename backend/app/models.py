"""
Each class is a table, responses link to an experts
Psudononym ID, not directly to a real name.
Each expert can submit one answer per round of Q's
"""

from datetime import date, datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Risk(Base):
    __tablename__ = "risks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    country: Mapped[str]
    iso: Mapped[str]
    risk_type: Mapped[str | None]
    probability: Mapped[str | None]
    impact: Mapped[int | None]
    risk_level: Mapped[str | None]
    status: Mapped[str | None]
    expected_exposure: Mapped[str | None]
    rationale: Mapped[str | None] = mapped_column(Text)
    triggers: Mapped[str | None] = mapped_column(Text)


class Expert(Base):
    __tablename__ = "experts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    pseudonym: Mapped[str]
    anonymity_level: Mapped[str]  # known_to_acaps, pseudonymous, anonymous
    country: Mapped[str]
    topics: Mapped[str]  # Comma-separated tags


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    risk_id: Mapped[str] = mapped_column(ForeignKey("risks.id"))
    alert_id: Mapped[str | None]
    text: Mapped[str] = mapped_column(Text)
    resolution_criteria: Mapped[str] = mapped_column(Text)
    deadline: Mapped[date]
    status: Mapped[str] = mapped_column(default="open")
    outcome: Mapped[int | None]  # 1 = happened, 0 = didn't, None = unresolved


class Response(Base):
    __tablename__ = "responses"
    __table_args__ = (UniqueConstraint("question_id", "expert_id", "round"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    question_id: Mapped[str] = mapped_column(ForeignKey("questions.id"))
    expert_id: Mapped[str] = mapped_column(ForeignKey("experts.id"))
    probability: Mapped[float] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(Text)
    round: Mapped[int]  # 1 = blind answer, 2 = revision
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)