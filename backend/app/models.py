"""
Each class is a table, responses link to an experts
Psudononym ID, not directly to a real name.
Each expert can submit one answer per round of Q's
"""

from datetime import date, datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utc_now():
    return datetime.now(timezone.utc)


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
    language: Mapped[str] = mapped_column(default="en")
    max_open_questions: Mapped[int] = mapped_column(default=3)
    email: Mapped[str | None]  # Synthetic only; never returned by the API
    # Personal link that opens the expert app even before any question is routed to them.
    # The seed gives synthetic experts fixed ones (demo-expert-a ...); joined experts get a random one.
    link_token: Mapped[str | None] = mapped_column(String, unique=True)
    # Countries the expert follows on the Home map, comma-separated. Questions are routed by these.
    # NULL = never set, which counts as following their own country; "" = follows nothing.
    followed: Mapped[str | None] = mapped_column(Text, default=None)


class PanelInvite(Base):
    __tablename__ = "panel_invites"

    token: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str]
    country: Mapped[str]
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    risk_id: Mapped[str] = mapped_column(ForeignKey("risks.id"))
    trigger_id: Mapped[str | None]
    report_title: Mapped[str] = mapped_column(Text)
    report_source: Mapped[str | None]
    report_url: Mapped[str | None]
    published_at: Mapped[str | None]
    direction: Mapped[str | None]
    strength: Mapped[float | None]
    evidence: Mapped[str | None] = mapped_column(Text)
    # Why the alert is in the queue: the LLM scores of the ACAPS access event
    country: Mapped[str | None]
    iso3: Mapped[str | None]
    impact_score: Mapped[int | None]  # 1-5, from intensity x exposure
    intensity_score: Mapped[int | None]
    exposure_score: Mapped[int | None]
    description: Mapped[str | None] = mapped_column(Text)  # Full event text
    # Heuristic place-name match between the event text and the risk/trigger text
    region_match: Mapped[bool | None]
    matched_place: Mapped[str | None]
    status: Mapped[str] = mapped_column(default="pending")


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    risk_id: Mapped[str] = mapped_column(ForeignKey("risks.id"))
    alert_id: Mapped[str | None]
    text: Mapped[str] = mapped_column(Text)
    resolution_criteria: Mapped[str] = mapped_column(Text)
    deadline: Mapped[date]
    status: Mapped[str] = mapped_column(default="open")
    delphi_round: Mapped[int] = mapped_column(default=1)  # 1 = Round 1 (Initial), 2 = Round 2 (Consensus)
    outcome: Mapped[int | None]  # 1 = happened, 0 = didn't, None = unresolved
    themes: Mapped[str | None] = mapped_column(Text)  # AI summary as JSON


class Invite(Base):
    __tablename__ = "invites"
    __table_args__ = (UniqueConstraint("question_id", "expert_id"),)

    token: Mapped[str] = mapped_column(String, primary_key=True)
    question_id: Mapped[str] = mapped_column(ForeignKey("questions.id"))
    expert_id: Mapped[str] = mapped_column(ForeignKey("experts.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Response(Base):
    __tablename__ = "responses"
    __table_args__ = (UniqueConstraint("question_id", "expert_id", "round"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    question_id: Mapped[str] = mapped_column(ForeignKey("questions.id"))
    expert_id: Mapped[str] = mapped_column(ForeignKey("experts.id"))
    probability: Mapped[float] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(Text)
    round: Mapped[int]  # 1 = blind answer, 2 = revision
    anonymity_level: Mapped[str | None]  # The expert's level when they answered
    pseudonym: Mapped[str | None]  # The expert's nickname when they answered, so a rename never relabels past answers
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class RiskDecision(Base):
    __tablename__ = "risk_decisions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    risk_id: Mapped[str] = mapped_column(ForeignKey("risks.id"))
    question_id: Mapped[str | None] = mapped_column(ForeignKey("questions.id"))
    decision: Mapped[str]  # keep, raise, lower, update_trigger, add_trigger
    trigger_id: Mapped[str | None]
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)