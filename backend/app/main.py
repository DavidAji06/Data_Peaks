"""
Risks, questions, answers and group view use the db
Group view returns 403 until the expert has submitted an answer
Never includes expert IDs
"""

import json
import statistics
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import Base, engine, get_db
from .models import Expert, Question, Response, Risk
from .schemas import ResponseIn

CONTRACTS = Path(__file__).resolve().parents[2] / "contracts"

Base.metadata.create_all(engine)

app = FastAPI(title="Data Peaks API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_sample(name: str):
    path = CONTRACTS / f"{name}.json"
    if not path.exists():
        raise HTTPException(status_code=500, detail=f"Missing {path.name}")
    return json.loads(path.read_text(encoding="utf-8"))


def to_dict(obj):
    return {column.name: getattr(obj, column.name) for column in obj.__table__.columns}


def has_answered(db: Session, question_id: str, expert_id: str, round: int) -> bool:
    return db.scalar(
        select(Response).where(
            Response.question_id == question_id,
            Response.expert_id == expert_id,
            Response.round == round,
        )
    ) is not None


def get_open_question(db: Session, question_id: str) -> Question:
    question = db.get(Question, question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    if question.status != "open":
        raise HTTPException(status_code=400, detail="Question is closed")
    return question


@app.get("/")
def root():
    return {"name": "Data Peaks API", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}


# Mock routes until the ML pipeline is ready

@app.get("/alerts")
def list_alerts():
    return [load_sample("alert")]


@app.post("/alerts/{alert_id}/decision")
def decide_alert(alert_id: str, decision: dict):
    return {"alert_id": alert_id, "status": decision.get("status", "approved")}


@app.get("/risks/ranked")
def ranked_risks():
    return [load_sample("ranked_risk")]


@app.get("/risks/{risk_id}/similar")
def similar_risks(risk_id: str):
    return [load_sample("similar_risk")]


# Database routes

@app.get("/risks/{risk_id}")
def get_risk(risk_id: str, db: Session = Depends(get_db)):
    risk = db.get(Risk, risk_id)
    if risk is None:
        raise HTTPException(status_code=404, detail="Risk not found")
    return to_dict(risk)


@app.get("/questions/{question_id}")
def get_question(question_id: str, db: Session = Depends(get_db)):
    question = db.get(Question, question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    return to_dict(question)


@app.post("/questions/{question_id}/responses")
def submit_response(question_id: str, body: ResponseIn, db: Session = Depends(get_db)):
    get_open_question(db, question_id)
    if db.get(Expert, body.expert_id) is None:
        raise HTTPException(status_code=404, detail="Expert not found")
    if has_answered(db, question_id, body.expert_id, 1):
        raise HTTPException(status_code=409, detail="Already answered")

    db.add(Response(
        question_id=question_id,
        expert_id=body.expert_id,
        probability=body.probability,
        reason=body.reason,
        round=1,
    ))
    db.commit()
    return {"question_id": question_id, "status": "received"}


@app.post("/questions/{question_id}/revision")
def submit_revision(question_id: str, body: ResponseIn, db: Session = Depends(get_db)):
    get_open_question(db, question_id)
    if not has_answered(db, question_id, body.expert_id, 1):
        raise HTTPException(status_code=403, detail="Submit your first answer before revising")
    if has_answered(db, question_id, body.expert_id, 2):
        raise HTTPException(status_code=409, detail="Already revised")

    db.add(Response(
        question_id=question_id,
        expert_id=body.expert_id,
        probability=body.probability,
        reason=body.reason,
        round=2,
    ))
    db.commit()
    return {"question_id": question_id, "status": "revised"}


@app.get("/questions/{question_id}/group")
def group_view(question_id: str, expert_id: str, db: Session = Depends(get_db)):
    if db.get(Question, question_id) is None:
        raise HTTPException(status_code=404, detail="Question not found")
    if not has_answered(db, question_id, expert_id, 1):
        raise HTTPException(status_code=403, detail="Submit your answer before seeing the group view")

    responses = db.scalars(
        select(Response).where(Response.question_id == question_id)
    ).all()

    latest = {}
    for response in responses:
        current = latest.get(response.expert_id)
        if current is None or response.round > current.round:
            latest[response.expert_id] = response

    probabilities = [r.probability for r in latest.values()]

    return {
        "question_id": question_id,
        "response_count": len(probabilities),
        "median": round(statistics.median(probabilities), 2),
        "min": min(probabilities),
        "max": max(probabilities),
        "themes": {"agreement": [], "disagreement": [], "new_information": []},
    }