"""
Risks, questions, answers and group view use the db
Group view returns 403 until the expert has submitted an answer
Never includes expert IDs
"""

import json
import secrets
import statistics
import threading

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import Base, SessionLocal, engine, get_db
from .models import Alert, Expert, Invite, PanelInvite, Question, Response, Risk, RiskDecision
from .routers.moderator import router as moderator_router
from .routers.public import router as public_router
from .schemas import (
    AlertDecision,
    AnswerIn,
    JoinIn,
    PanelInviteIn,
    RiskDecisionIn,
    SettingsUpdate,
)
from .services import ml_outputs
from .services.alert_import import import_alert_items
from .services.auth import require_moderator
from .services.routing import route_question
from .services.scoring import BASELINE_BRIER, expert_scores, latest_answers, summarise_scores

FRONTEND_URL = "http://localhost:3000"
MODERATOR_ONLY = [Depends(require_moderator)]
MIN_GROUP_SIZE = 5  # Below this, group figures could reveal individual answers

Base.metadata.create_all(engine)

app = FastAPI(title="Data Peaks API")
app.state.session_factory = SessionLocal  # Background jobs open their own session; tests swap this

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(moderator_router)
app.include_router(public_router)


# Helpers

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


_summarising: set[str] = set()  # Questions with a theme summary in progress
_summary_lock = threading.Lock()


def summarise_question(question_id: str, session_factory=SessionLocal):
    """Background job: ask the LLM once for themes in the experts' reasons and store them."""
    with _summary_lock:
        if question_id in _summarising:
            return
        _summarising.add(question_id)
    db = session_factory()
    try:
        question = db.get(Question, question_id)
        if question is None or question.themes:
            return
        reasons = [r.reason for r in latest_answers(db, question_id).values()]
        themes = ml_outputs.summarise_reasons(reasons)
        if any(themes.values()):  # On failure nothing is stored, so the app keeps its fallback text
            question.themes = json.dumps(themes)
            db.commit()
    finally:
        db.close()
        with _summary_lock:
            _summarising.discard(question_id)


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


def clean_topics(topics: list[str]) -> str:
    cleaned = [topic.strip().lower() for topic in topics if topic.strip()]
    return ",".join(dict.fromkeys(cleaned))  # Removes duplicates, keeps order


def new_pseudonym(db: Session) -> str:
    while True:
        name = f"Analyst {secrets.token_hex(2).upper()}"
        if db.scalar(select(Expert).where(Expert.pseudonym == name)) is None:
            return name


def get_open_panel_invite(db: Session, token: str) -> PanelInvite:
    invite = db.get(PanelInvite, token)
    if invite is None:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.used:
        raise HTTPException(status_code=409, detail="Invite already used")
    return invite


def settings_dict(expert: Expert):
    return {
        "pseudonym": expert.pseudonym,
        "anonymity_level": expert.anonymity_level,
        "country": expert.country,
        "topics": [topic for topic in expert.topics.split(",") if topic],
        "language": expert.language,
        "max_open_questions": expert.max_open_questions,
    }


# General

@app.get("/")
def root():
    return {"name": "Data Peaks API", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}


# Moderator: panel invitations

@app.post("/moderator/panel-invites", dependencies=MODERATOR_ONLY, tags=["moderator"])
def create_panel_invite(body: PanelInviteIn, db: Session = Depends(get_db)):
    invite = PanelInvite(
        token=secrets.token_urlsafe(16),
        email=body.email,
        country=body.country,
    )
    db.add(invite)
    db.commit()

    join_link = f"{FRONTEND_URL}/join/{invite.token}"
    print(f"[notify] Invitation for {body.email}: {join_link}")  # Stand-in for an email
    return {"status": "invited", "join_link": join_link}


# Moderator: alerts

@app.get("/alerts", dependencies=MODERATOR_ONLY)
def list_alerts(status: str = "pending", db: Session = Depends(get_db)):
    alerts = db.scalars(select(Alert).where(Alert.status == status)).all()
    return [alert_to_dict(alert) for alert in alerts]


@app.post("/alerts/import", dependencies=MODERATOR_ONLY)
def import_alerts(db: Session = Depends(get_db)):
    added, skipped = import_alert_items(db, ml_outputs.alerts_from_file())
    db.commit()
    return {"imported": len(added), "skipped": skipped}


@app.post("/alerts/{alert_id}/decision", dependencies=MODERATOR_ONLY)
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
    count = db.scalar(
        select(func.count()).select_from(Question).where(Question.id.like("Q%"))
    )
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

@app.get("/risks/ranked", dependencies=MODERATOR_ONLY)
def ranked_risks():
    return ml_outputs.ranked_risks()


@app.get("/risks/{risk_id}/similar", dependencies=MODERATOR_ONLY)
def similar_risks(risk_id: str):
    return ml_outputs.similar_risks(risk_id)


@app.get("/risks/{risk_id}", dependencies=MODERATOR_ONLY)
def get_risk(risk_id: str, db: Session = Depends(get_db)):
    risk = db.get(Risk, risk_id)
    if risk is None:
        raise HTTPException(status_code=404, detail="Risk not found")
    return to_dict(risk)


@app.get("/questions/{question_id}", dependencies=MODERATOR_ONLY)
def get_question(question_id: str, db: Session = Depends(get_db)):
    question = db.get(Question, question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    return to_dict(question)


# Expert: joining the panel

@app.get("/join/{token}")
def join_info(token: str, db: Session = Depends(get_db)):
    invite = get_open_panel_invite(db, token)
    return {"country": invite.country}


@app.post("/join/{token}")
def join_panel(token: str, body: JoinIn, db: Session = Depends(get_db)):
    invite = get_open_panel_invite(db, token)
    expert = Expert(
        id=f"expert-{secrets.token_hex(4)}",
        pseudonym=new_pseudonym(db),
        anonymity_level=body.anonymity_level,
        country=body.country,
        topics=clean_topics(body.topics),
        language=body.language,
        max_open_questions=body.max_open_questions,
        email=invite.email,
    )
    db.add(expert)
    invite.used = True
    db.commit()
    return {"status": "joined", "pseudonym": expert.pseudonym}


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
        "similar_risks": ml_outputs.similar_risks(risk.id),
        "answered": get_response(db, question.id, invite.expert_id, 1) is not None,
        "revised": get_response(db, question.id, invite.expert_id, 2) is not None,
    }


@app.post("/q/{token}/responses")
def submit_answer(
    token: str,
    body: AnswerIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
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
        anonymity_level=db.get(Expert, invite.expert_id).anonymity_level,
    ))
    db.commit()

    question = db.get(Question, invite.question_id)
    if not question.themes and len(latest_answers(db, question.id)) >= MIN_GROUP_SIZE:
        background.add_task(summarise_question, question.id, app.state.session_factory)
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
        anonymity_level=db.get(Expert, invite.expert_id).anonymity_level,
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

    # Small groups: min, max and median would expose other experts' exact answers
    if len(probabilities) < MIN_GROUP_SIZE:
        return {
            "question_id": invite.question_id,
            "response_count": len(probabilities),
            "median": None,
            "min": None,
            "max": None,
            "themes": ml_outputs.empty_themes(),
        }

    return {
        "question_id": invite.question_id,
        "response_count": len(probabilities),
        "median": round(statistics.median(probabilities), 2),
        "min": min(probabilities),
        "max": max(probabilities),
        "themes": ml_outputs.stored_themes(db.get(Question, invite.question_id)),
    }


@app.get("/q/{token}/track-record")
def track_record(token: str, db: Session = Depends(get_db)):
    invite = get_invite(db, token)
    scores = expert_scores(db, invite.expert_id)
    return {
        **summarise_scores(scores),
        "baseline_brier": BASELINE_BRIER,
        "history": scores,
    }


@app.get("/q/{token}/settings")
def get_settings(token: str, db: Session = Depends(get_db)):
    invite = get_invite(db, token)
    return settings_dict(db.get(Expert, invite.expert_id))


@app.patch("/q/{token}/settings")
def update_settings(token: str, body: SettingsUpdate, db: Session = Depends(get_db)):
    invite = get_invite(db, token)
    expert = db.get(Expert, invite.expert_id)

    updates = body.model_dump(exclude_unset=True, exclude_none=True)
    if "topics" in updates:
        updates["topics"] = clean_topics(updates["topics"])
    for field, value in updates.items():
        setattr(expert, field, value)

    db.commit()
    return settings_dict(expert)

# Moderator: single alert and risk decisions

@app.get("/alerts/{alert_id}", dependencies=MODERATOR_ONLY)
def get_alert(alert_id: str, db: Session = Depends(get_db)):
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert_to_dict(alert)


@app.post("/risks/{risk_id}/decide", dependencies=MODERATOR_ONLY)
def decide_risk(risk_id: str, body: RiskDecisionIn, db: Session = Depends(get_db)):
    if db.get(Risk, risk_id) is None:
        raise HTTPException(status_code=404, detail="Risk not found")
    if body.question_id:
        question = db.get(Question, body.question_id)
        if question is None or question.risk_id != risk_id:
            raise HTTPException(status_code=400, detail="Question doesn't belong to this risk")

    decision = RiskDecision(risk_id=risk_id, **body.model_dump())
    db.add(decision)
    db.commit()
    db.refresh(decision)
    return to_dict(decision)


@app.get("/risks/{risk_id}/decisions", dependencies=MODERATOR_ONLY)
def list_risk_decisions(risk_id: str, db: Session = Depends(get_db)):
    decisions = db.scalars(
        select(RiskDecision)
        .where(RiskDecision.risk_id == risk_id)
        .order_by(RiskDecision.created_at.desc())
    ).all()
    return [to_dict(decision) for decision in decisions]