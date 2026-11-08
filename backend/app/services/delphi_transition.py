"""Delphi consensus round transitions.

Enforces:
1. Transition from Round 1 (Initial Elicitation) to Round 2 (Consensus):
   - Automatically triggered when >= 80% of invited regional experts answer Round 1.
   - Or manually triggered earlier by an administrator.
2. Transition from Round 2 (Consensus) to Closed (Final Results):
   - Automatically triggered when >= 80% of Round 1 respondents submit their Round 2 evaluation.
   - Or manually closed earlier by an administrator.
"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Invite, Question, Response
from . import ml_outputs
from .scoring import latest_answers

MIN_GROUP_SIZE = 5
DELPHI_TRANSITION_THRESHOLD = 0.80  # 80% of experts required for automatic stage progression


def summarise_question_sync(question_id: str, db: Session):
    """Generates and commits themes synchronously for the question when group size is sufficient."""
    question = db.get(Question, question_id)
    if not question:
        return
    reasons = [r.reason for r in latest_answers(db, question_id).values()]
    if len(reasons) < MIN_GROUP_SIZE:
        return
    themes = ml_outputs.summarise_reasons(reasons)
    if any(themes.values()):
        question.themes = json.dumps(themes)
        db.commit()


def check_and_advance_delphi_stage(db: Session, question: Question, summarise: bool = True) -> dict[str, Any]:
    """
    Evaluates current participation against the 80% threshold and transitions
    the question if criteria are met. summarise=False leaves the theme summary to the
    caller (the expert endpoints run it in the background so a submit never waits on the LLM).
    """
    if question.status != "open":
        return {"action": "none", "reason": "Question is not open"}

    current_round = getattr(question, "delphi_round", 1)

    if current_round == 1:
        # Check Round 1 completion: answers / invited
        invited_count = db.scalar(
            select(func.count()).select_from(Invite).where(Invite.question_id == question.id)
        ) or 0
        answered_count = db.scalar(
            select(func.count(func.distinct(Response.expert_id))).where(
                Response.question_id == question.id, Response.round == 1
            )
        ) or 0

        if invited_count > 0:
            ratio = answered_count / invited_count
            if ratio >= DELPHI_TRANSITION_THRESHOLD:
                question.delphi_round = 2
                db.commit()
                if summarise:
                    summarise_question_sync(question.id, db)
                return {
                    "action": "advanced_to_round_2",
                    "delphi_round": 2,
                    "answered": answered_count,
                    "invited": invited_count,
                    "ratio": round(ratio, 2),
                }

    elif current_round == 2:
        # Check Round 2 completion: revisions / round 1 respondents
        round_1_count = db.scalar(
            select(func.count(func.distinct(Response.expert_id))).where(
                Response.question_id == question.id, Response.round == 1
            )
        ) or 0
        round_2_count = db.scalar(
            select(func.count(func.distinct(Response.expert_id))).where(
                Response.question_id == question.id, Response.round == 2
            )
        ) or 0

        if round_1_count > 0:
            ratio = round_2_count / round_1_count
            if ratio >= DELPHI_TRANSITION_THRESHOLD:
                question.status = "closed"
                db.commit()
                if summarise:
                    summarise_question_sync(question.id, db)
                return {
                    "action": "closed_with_final_results",
                    "delphi_round": 2,
                    "status": "closed",
                    "revised": round_2_count,
                    "answered": round_1_count,
                    "ratio": round(ratio, 2),
                }

    return {"action": "none", "delphi_round": current_round, "status": question.status}


def manual_advance_to_round_2(db: Session, question: Question) -> dict[str, Any]:
    """Admin override: moves question to Round 2 immediately."""
    if question.status != "open":
        return {"action": "error", "message": "Cannot advance a question that is not open"}
    question.delphi_round = 2
    db.commit()
    summarise_question_sync(question.id, db)
    return {"action": "advanced_to_round_2", "delphi_round": 2, "status": question.status}


def manual_close_question(db: Session, question: Question) -> dict[str, Any]:
    """Admin override: closes question to finalize Delphi results."""
    if question.status != "open":
        return {"action": "error", "message": "Question is already closed or resolved"}
    question.status = "closed"
    db.commit()
    summarise_question_sync(question.id, db)
    return {"action": "closed_with_final_results", "status": "closed"}
