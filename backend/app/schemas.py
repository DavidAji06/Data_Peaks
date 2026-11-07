"""
Experts send a probability and reason.
Approving alerts requires a complete question

"""

from datetime import date
from typing import Literal

import re

from pydantic import BaseModel, Field, field_validator, model_validator

AnonymityLevel = Literal["known_to_acaps", "pseudonymous", "anonymous"]


class AnswerIn(BaseModel):
    probability: float = Field(ge=0, le=1)
    reason: str = Field(min_length=1, max_length=280)


class AlertDecision(BaseModel):
    status: Literal["approved", "rejected"]
    question_text: str | None = None
    resolution_criteria: str | None = None
    deadline: date | None = None

    @model_validator(mode="after")
    def check_question(self):
        if self.status == "approved":
            if not (self.question_text and self.resolution_criteria and self.deadline):
                raise ValueError("Approving needs question_text, resolution_criteria and deadline")
            if self.deadline <= date.today():
                raise ValueError("Deadline must be in the future")
        return self


class ResolveIn(BaseModel):
    outcome: Literal[0, 1]  # 1 = happened, 0 = didn't


class PanelInviteIn(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=254)
    country: str = Field(min_length=2, max_length=80)


class PanelRequestIn(BaseModel):
    country: str = Field(min_length=2, max_length=80)
    note: str | None = Field(default=None, max_length=280)  # Optional: why they know this context

    @field_validator("country")
    @classmethod
    def check_country(cls, value: str) -> str:
        if "," in value:
            raise ValueError("One country per request")
        return " ".join(value.split())


class PanelDecisionIn(BaseModel):
    action: Literal["approve", "decline", "remove"]


class JoinIn(BaseModel):
    anonymity_level: AnonymityLevel
    country: str | None = Field(default=None, min_length=2, max_length=80)  # Defaults to the invite's country
    topics: list[str] = Field(default_factory=list, max_length=10)
    language: str = Field(default="en", min_length=2, max_length=10)
    max_open_questions: int = Field(default=3, ge=1, le=5)


PSEUDONYM_CHARS = re.compile(r"^[A-Za-z0-9 _-]+$")
RESERVED_PREFIX = "anonymous expert"  # Used for anonymous answers in the moderator view


def clean_pseudonym(value: str) -> str:
    """Trims and checks a nickname chosen by the expert. Raises ValueError with a readable message."""
    name = " ".join(value.split())  # Trim and collapse inner spaces
    if not 3 <= len(name) <= 30:
        raise ValueError("Nickname must be 3 to 30 characters")
    if "@" in name or re.search(r"(gmail|yahoo|hotmail|outlook)|dot (com|org|net)", name, re.I):
        raise ValueError("Nickname must not look like an email address")
    if sum(ch.isdigit() for ch in name) >= 7:
        raise ValueError("Nickname must not look like a phone number")
    if not PSEUDONYM_CHARS.match(name):
        raise ValueError("Use only letters, numbers, spaces, - and _")
    if name.lower().startswith(RESERVED_PREFIX):
        raise ValueError("This nickname is reserved")
    return name


class SettingsUpdate(BaseModel):
    pseudonym: str | None = None
    anonymity_level: AnonymityLevel | None = None
    country: str | None = Field(default=None, min_length=2, max_length=80)
    topics: list[str] | None = Field(default=None, max_length=10)
    language: str | None = Field(default=None, min_length=2, max_length=10)
    max_open_questions: int | None = Field(default=None, ge=1, le=5)
    # Countries followed on the Home map; questions are routed by these. [] = follow nothing.
    followed: list[str] | None = Field(default=None, max_length=60)

    @field_validator("followed")
    @classmethod
    def check_followed(cls, value: list[str] | None) -> list[str] | None:
        if value is not None and any(not 2 <= len(v.strip()) <= 80 or "," in v for v in value):
            raise ValueError("Each followed country must be 2-80 characters, without commas")
        return value

    @field_validator("pseudonym")
    @classmethod
    def check_pseudonym(cls, value: str | None) -> str | None:
        return None if value is None else clean_pseudonym(value)


class AlertImport(BaseModel):
    id: str = Field(min_length=1, max_length=50)
    risk_id: str
    trigger_id: str | None = None
    report_title: str = Field(min_length=1)
    report_source: str | None = None
    report_url: str | None = None
    published_at: str | None = None
    direction: str | None = None
    strength: float | None = Field(default=None, ge=0, le=1)
    evidence: str | None = None
    # Event scores from the ML pipeline (optional, so older alerts.json files still import)
    country: str | None = None
    iso3: str | None = None
    impact_score: int | None = Field(default=None, ge=1, le=5)
    intensity_score: int | None = Field(default=None, ge=1, le=5)
    exposure_score: int | None = Field(default=None, ge=1, le=5)
    description: str | None = None
    region_match: bool | None = None
    matched_place: str | None = None


class RiskDecisionIn(BaseModel):
    decision: Literal["keep", "raise", "lower", "update_trigger", "add_trigger"]
    question_id: str | None = None
    trigger_id: str | None = None
    note: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def check_details(self):
        if self.decision == "update_trigger" and not self.trigger_id:
            raise ValueError("update_trigger needs a trigger_id")
        if self.decision in ("update_trigger", "add_trigger") and not self.note:
            raise ValueError("Trigger changes need a note")
        return self