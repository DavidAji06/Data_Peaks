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
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import Base, engine, get_db
from .models import Alert, Invite, Question, Response, Risk
from .schemas import AlertDecision, AnswerIn
from .services.routing import route_question

CONTRACTS = Path(__file__).resolve().parents[2] / "contracts"
FRONTEND_URL = "http://localhost:3000"

Base.metadata.create_all(engine)

app = FastAPI(title="Data Peaks API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Helpers

def load_sample(name: str):
    path = CONTRACTS / f"{name}.json"
    if not path.exists():
        raise HTTPException(status_code=500, detail=f"Missing {path.name}")
    return json.loads(path.read_text(encoding="utf-8"))


def to_dict(obj):
    return {column.name: getattr(obj, column.name) for column in obj.__table__.columns}


def alert_to_dict(alert: Alert):
    return {
        "id": alert.id,
        "risk_id": alert.risk_id,
        "trigger_id": alert.trigger_id,
        "report": {
            "title": alert.report_title,
            "source": alert.report_source,
            "url": alert.report_url,
            "published_at": alert.published_at,
        },
        "direction": alert.direction,
        "strength": alert.strength,
        "evidence": alert.evidence,
        "status": alert.status,
    }


def get_invite(db: Session, token: str) -> Invite:
    invite = db.get(Invite, token)
    if invite is None:
        raise HTTPException(status_code=404, detail="Link not found")
    return invite


def get_response(db: Session, question_id: str, expert_id: str, round: int):
    return db.scalar(
        select(Response).where(
            Response.question_id == question_id,
            Response.expert_id == expert_id,
            Response.round == round,
        )
    )


def require_open(question: Question):
    if question.status != "open":
        raise HTTPException(status_code=400, detail="Question is closed")


# General

@app.get("/")
def root():
    return {"name": "Data Peaks API", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}


# Moderator: alerts

@app.get("/alerts")
def list_alerts(status: str = "pending", db: Session = Depends(get_db)):
    alerts = db.scalars(select(Alert).where(Alert.status == status)).all()
    return [alert_to_dict(alert) for alert in alerts]


@app.post("/alerts/{alert_id}/decision")
def decide_alert(alert_id: str, body: AlertDecision, db: Session = Depends(get_db)):
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.status != "pending":
        raise HTTPException(status_code=409, detail="Alert already decided")

    if body.status == "rejected":
        alert.status = "rejected"
        db.commit()
        return {"alert_id": alert_id, "status": "rejected"}

    risk = db.get(Risk, alert.risk_id)
    count = db.scalar(select(func.count()).select_from(Question))
    question = Question(
        id=f"Q{count + 1:03d}",
        risk_id=risk.id,
        alert_id=alert.id,
        text=body.question_text,
        resolution_criteria=body.resolution_criteria,
        deadline=body.deadline,
    )
    db.add(question)
    invites = route_question(db, question, risk.country)
    alert.status = "approved"
    db.commit()

    # Stand-in for real notifications
    for invite in invites:
        print(f"[notify] {invite.expert_id}: {FRONTEND_URL}/q/{invite.token}")

    return {
        "alert_id": alert_id,
        "status": "approved",
        "question_id": question.id,
        "experts_invited": len(invites),
    }


# Moderator: risks and questions

@app.get("/risks/ranked")
def ranked_risks():
    return [load_sample("ranked_risk")]  # Mock until ML is ready


@app.get("/risks/{risk_id}/similar")
def similar_risks(risk_id: str):
    return [load_sample("similar_risk")]  # Mock until ML is ready


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


# Expert: secret-link routes

@app.get("/q/{token}")
def expert_question(token: str, db: Session = Depends(get_db)):
    invite = get_invite(db, token)
    question = db.get(Question, invite.question_id)
    risk = db.get(Risk, question.risk_id)
    alert = db.get(Alert, question.alert_id) if question.alert_id else None

    return {
        "question": {
            "id": question.id,
            "text": question.text,
            "resolution_criteria": question.resolution_criteria,
            "deadline": question.deadline,
            "status": question.status,
        },
        "risk": {
            "id": risk.id,
            "title": risk.title,
            "country": risk.country,
            "risk_level": risk.risk_level,
        },
        "trigger_update": alert_to_dict(alert) if alert else None,
        "similar_risks": [load_sample("similar_risk")],  # Mock until ML is ready
        "answered": get_response(db, question.id, invite.expert_id, 1) is not None,
        "revised": get_response(db, question.id, invite.expert_id, 2) is not None,
    }


@app.post("/q/{token}/responses")
def submit_answer(token: str, body: AnswerIn, db: Session = Depends(get_db)):
    invite = get_invite(db, token)
    require_open(db.get(Question, invite.question_id))
    if get_response(db, invite.question_id, invite.expert_id, 1):
        raise HTTPException(status_code=409, detail="Already answered")

    db.add(Response(
        question_id=invite.question_id,
        expert_id=invite.expert_id,
        probability=body.probability,
        reason=body.reason,
        round=1,
    ))
    db.commit()
    return {"status": "received"}


@app.post("/q/{token}/revision")
def submit_revision(token: str, body: AnswerIn, db: Session = Depends(get_db)):
    invite = get_invite(db, token)
    require_open(db.get(Question, invite.question_id))
    if not get_response(db, invite.question_id, invite.expert_id, 1):
        raise HTTPException(status_code=403, detail="Submit your first answer before revising")
    if get_response(db, invite.question_id, invite.expert_id, 2):
        raise HTTPException(status_code=409, detail="Already revised")

    db.add(Response(
        question_id=invite.question_id,
        expert_id=invite.expert_id,
        probability=body.probability,
        reason=body.reason,
        round=2,
    ))
    db.commit()
    return {"status": "revised"}


@app.get("/q/{token}/group")
def group_view(token: str, db: Session = Depends(get_db)):
    invite = get_invite(db, token)
    if not get_response(db, invite.question_id, invite.expert_id, 1):
        raise HTTPException(status_code=403, detail="Submit your answer before seeing the group view")

    responses = db.scalars(
        select(Response).where(Response.question_id == invite.question_id)
    ).all()

    latest = {}
    for response in responses:
        current = latest.get(response.expert_id)
        if current is None or response.round > current.round:
            latest[response.expert_id] = response

    probabilities = [r.probability for r in latest.values()]

    return {
        "question_id": invite.question_id,
        "response_count": len(probabilities),
        "median": round(statistics.median(probabilities), 2),
        "min": min(probabilities),
        "max": max(probabilities),
        "themes": {"agreement": [], "disagreement": [], "new_information": []},
    }