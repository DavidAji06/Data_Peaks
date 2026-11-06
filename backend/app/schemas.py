"""
Experts send a probability and reason.
Approving alerts requires a complete question

"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator

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


class JoinIn(BaseModel):
    anonymity_level: AnonymityLevel
    country: str = Field(min_length=2, max_length=80)
    topics: list[str] = Field(default_factory=list, max_length=10)
    language: str = Field(default="en", min_length=2, max_length=10)
    max_open_questions: int = Field(default=3, ge=1, le=5)


class SettingsUpdate(BaseModel):
    anonymity_level: AnonymityLevel | None = None
    country: str | None = Field(default=None, min_length=2, max_length=80)
    topics: list[str] | None = Field(default=None, max_length=10)
    language: str | None = Field(default=None, min_length=2, max_length=10)
    max_open_questions: int | None = Field(default=None, ge=1, le=5)

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