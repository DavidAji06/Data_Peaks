"""
Experts send a probability and reason.
Approving alerts requires a complete question

"""


from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator


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