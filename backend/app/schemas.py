from pydantic import BaseModel, Field


class ResponseIn(BaseModel):
    expert_id: str
    probability: float = Field(ge=0, le=1)
    reason: str = Field(min_length=1, max_length=280)