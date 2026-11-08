"""
Risks, questions, answers and group view use the db
Group view returns 403 until the expert has submitted an answer
Never includes expert IDs
"""

import json
import os
import secrets
import statistics
import threading
from datetime import datetime, timezone

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import Base, SessionLocal, add_missing_columns, engine, get_db
from .models import Alert, Expert, Invite, PanelInvite, PanelMembership, Question, Response, Risk, RiskDecision
from .routers.moderator import router as moderator_router
from .routers.public import router as public_router
from .schemas import (
    AlertDecision,
    AnswerIn,
    JoinIn,
    LoginLinkIn,
    PanelInviteIn,
    PanelRequestIn,
    RiskDecisionIn,
    SettingsUpdate,
)
from .services import mailer, ml_outputs, panels
from .services.alert_import import import_alert_items
from .services.auth import require_moderator
from .services.links import expert_invites, require_invite, resolve_link
from .services.rate_limit import RateLimiter
from .services.routing import clean_followed, followed_countries, route_question, should_notify
from .services.scoring import expert_scores, latest_answers

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")  # Moderator dashboard
# Browser origins allowed to call the API: the dashboard and the expert app (comma-separated)
CORS_ORIGINS = [o.strip().rstrip("/") for o in os.getenv("CORS_ORIGINS", f"{FRONTEND_URL},http://localhost:8080").split(",") if o.strip()]
EXPERT_APP_URL = os.getenv("EXPERT_APP_URL", "http://localhost:8080")  # Expert app; links in emails point here
MODERATOR_ONLY = [Depends(require_moderator)]
MIN_GROUP_SIZE = 5  # Below this, group figures could reveal individual answers

Base.metadata.create_all(engine)
add_missing_columns(engine)
with SessionLocal() as _db:
    panels.backfill(_db)  # Follows become panels + pending requests, once per expert

app = FastAPI(title="Data Peaks API")
app.state.session_factory = SessionLocal  # Background jobs open their own session; tests swap this

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
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
        "country": alert.country,
        "iso3": alert.iso3,
        "impact_score": alert.impact_score,
        "intensity_score": alert.intensity_score,
        "exposure_score": alert.exposure_score,
        "description": alert.description,
        # Heuristic place-name match, not proof that a trigger fired
        "region_match": alert.region_match,
        "matched_place": alert.matched_place,
        "status": alert.status,
    }


_summarising: set[str] = set()  # Questions with a theme summary in progress
_summary_lock = threading.Lock()


def summarise_question(question_id: str, session_factory=SessionLocal, force: bool = False):
    """Background job: ask the LLM for themes in the experts' reasons and store them."""
    with _summary_lock:
        if question_id in _summarising:
            return
        _summarising.add(question_id)
    db = session_factory()
    try:
        question = db.get(Question, question_id)
        if question is None or (question.themes and not force):
            return
        reasons = [r.reason for r in latest_answers(db, question_id).values()]
        if len(reasons) < MIN_GROUP_SIZE:  # Themes from a smaller group could point at one person
            return
        themes = ml_outputs.summarise_reasons(reasons)
        if any(themes.values()):  # On failure nothing is stored, so the app keeps its fallback text
            question.themes = json.dumps(themes)
            db.commit()
    finally:
        db.close()
        with _summary_lock:
            _summarising.discard(question_id)


def get_invite(db: Session, token: str, question_id: str | None = None) -> Invite:
    """The invite behind a link, for one question (see require_invite)."""
    return require_invite(db, token, question_id)


def commit_once(db: Session, conflict_detail: str):
    """Commits an answer; two submits at the same moment hit the unique constraint and get 409, not 500."""
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=conflict_detail)


def nickname_taken(db: Session, name: str, expert_id: str | None = None) -> bool:
    query = select(Expert).where(func.lower(Expert.pseudonym) == name.lower())
    if expert_id:
        query = query.where(Expert.id != expert_id)
    return db.scalar(query) is not None


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
        if not nickname_taken(db, name):
            return name


def get_open_panel_invite(db: Session, token: str) -> PanelInvite:
    invite = db.get(PanelInvite, token)
    if invite is None:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.used:
        raise HTTPException(status_code=409, detail="Invite already used")
    return invite


def answer_labels(expert: Expert) -> dict:
    """Privacy level and nickname at answer time, stored on the response."""
    return {"anonymity_level": expert.anonymity_level, "pseudonym": expert.pseudonym}


def settings_dict(expert: Expert):
    return {
        "pseudonym": expert.pseudonym,
        "anonymity_level": expert.anonymity_level,
        "country": expert.country,
        "topics": [topic for topic in expert.topics.split(",") if topic],
        "language": expert.language,
        "max_open_questions": expert.max_open_questions,
        "followed": followed_countries(expert),
    }


# General

@app.get("/")
def root():
    return {"name": "Data Peaks API", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}


# Moderator: panel invitations

def join_link_for(invite: PanelInvite) -> str:
    """The activation page lives in the expert app, the only app experts ever use."""
    return f"{EXPERT_APP_URL}/?join={invite.token}"


def email_invite(db: Session, invite: PanelInvite) -> dict:
    link = join_link_for(invite)
    sent, error = mailer.send_invite(invite.email, link, invite.country)
    invite.email_sent = sent
    db.commit()
    # The link is always returned so the moderator can pass it on when email is off or fails
    return {"status": "invited", "email_sent": sent, "email_error": error, "join_link": link}


def invite_expert(db: Session, invite: PanelInvite) -> Expert | None:
    if invite.expert_id:
        return db.get(Expert, invite.expert_id)
    if invite.used:  # Joined before invites recorded the expert: match on the stored email
        return db.scalar(select(Expert).where(func.lower(Expert.email) == invite.email.lower()))
    return None


@app.post("/moderator/panel-invites", dependencies=MODERATOR_ONLY, tags=["moderator"])
def create_panel_invite(body: PanelInviteIn, db: Session = Depends(get_db)):
    email = body.email.strip()
    if db.scalar(select(Expert).where(func.lower(Expert.email) == email.lower())):
        raise HTTPException(status_code=409, detail="This person is already on the panel")

    # Inviting the same address again re-sends the open invite instead of making a second one
    invite = db.scalar(
        select(PanelInvite).where(func.lower(PanelInvite.email) == email.lower(), PanelInvite.used.is_(False))
    )
    if invite is None:
        invite = PanelInvite(token=secrets.token_urlsafe(16), email=email, country=body.country)
        db.add(invite)
    else:
        invite.country = body.country
    db.commit()
    return email_invite(db, invite)


@app.post("/moderator/panel-invites/{token}/resend", dependencies=MODERATOR_ONLY, tags=["moderator"])
def resend_panel_invite(token: str, db: Session = Depends(get_db)):
    invite = get_open_panel_invite(db, token)
    return email_invite(db, invite)


@app.get("/moderator/panel-invites", dependencies=MODERATOR_ONLY, tags=["moderator"])
def list_panel_invites(db: Session = Depends(get_db)):
    """Who was invited and whether they joined. Never links an email to an anonymous expert."""
    invites = db.scalars(select(PanelInvite).order_by(PanelInvite.created_at.desc())).all()
    rows = []
    for invite in invites:
        expert = invite_expert(db, invite)
        anonymous = expert is not None and expert.anonymity_level == "anonymous"
        rows.append({
            "token": None if invite.used else invite.token,  # Only open invites can be re-sent
            "email": invite.email,
            "country": invite.country,
            "status": "joined" if invite.used else "pending",
            "email_sent": invite.email_sent,
            "invited_at": invite.created_at,
            "joined_at": invite.joined_at,
            "expert": None if expert is None or anonymous else expert.pseudonym,
            "anonymous": anonymous,
        })
    return {"email_configured": mailer.is_configured(), "invites": rows}


# Moderator: alerts

@app.get("/alerts", dependencies=MODERATOR_ONLY)
def list_alerts(status: str = "pending", min_impact: int = 0, db: Session = Depends(get_db)):
    """Alerts sorted by impact score, then newest first. min_impact=4 keeps only high-impact events."""
    alerts = db.scalars(select(Alert).where(Alert.status == status)).all()
    alerts = [a for a in alerts if (a.impact_score or 0) >= min_impact]
    alerts.sort(key=lambda a: (a.impact_score or 0, a.published_at or ""), reverse=True)
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

    # Stand-in for real notifications. Every invited expert sees the question in the app;
    # only those under their max_open_questions are pinged now.
    notified = 0
    for invite in invites:
        if should_notify(db, db.get(Expert, invite.expert_id)):
            notified += 1
            print(f"[notify] {invite.expert_id}: {EXPERT_APP_URL}/?token={invite.token}")
        else:
            print(f"[notify] {invite.expert_id}: invited, not pinged (at max_open_questions)")

    return {
        "alert_id": alert_id,
        "status": "approved",
        "question_id": question.id,
        "experts_invited": len(invites),
        "experts_notified": notified,
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
    country = body.country or invite.country
    expert = Expert(
        id=f"expert-{secrets.token_hex(4)}",
        pseudonym=new_pseudonym(db),
        anonymity_level=body.anonymity_level,
        country=country,
        topics=clean_topics(body.topics),
        language=body.language,
        max_open_questions=body.max_open_questions,
        email=invite.email,
        link_token=secrets.token_urlsafe(16),
        followed=clean_followed([country]),  # Starts by following the country they joined for
    )
    db.add(expert)
    db.flush()
    # The invite's country is their first panel: no approval needed, ACAPS chose them for it
    db.add(PanelMembership(expert_id=expert.id, country=country, status="member", decided_at=panels.now()))
    invite.used = True
    invite.expert_id = expert.id
    invite.joined_at = datetime.now(timezone.utc)
    db.commit()
    app_link = f"{EXPERT_APP_URL}/?token={expert.link_token}"  # The expert's personal link
    print(f"[notify] {expert.id} joined: {app_link}")
    emailed, _ = mailer.send_welcome(invite.email, app_link, expert.pseudonym, expert.anonymity_level == "anonymous")
    return {
        "status": "joined",
        "pseudonym": expert.pseudonym,
        "token": expert.link_token,  # Lets the expert app sign straight in after activation
        "app_link": app_link,
        "link_emailed": emailed,  # False: the app shows the link so the expert can save it
    }


# Expert: signing in again with email (passwordless)

LOGIN_LINK_RESPONSE = {
    "status": "sent",
    "detail": "If this email belongs to a panel member, a sign-in link is on its way.",
}
login_by_email = RateLimiter(limit=3, window_seconds=15 * 60)
login_by_ip = RateLimiter(limit=20, window_seconds=15 * 60)


def client_ip(request: Request) -> str:
    # Render (and most hosts) put the caller first in X-Forwarded-For
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def expert_for_email(db: Session, email: str) -> Expert | None:
    expert = db.scalar(select(Expert).where(func.lower(Expert.email) == email).limit(1))
    if expert is not None:
        return expert
    invite = db.scalar(
        select(PanelInvite)
        .where(func.lower(PanelInvite.email) == email, PanelInvite.used.is_(True), PanelInvite.expert_id.is_not(None))
        .order_by(PanelInvite.joined_at.desc())
        .limit(1)
    )
    return db.get(Expert, invite.expert_id) if invite else None


@app.post("/auth/login-link")
def request_login_link(body: LoginLinkIn, request: Request, background: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Emails the expert their personal link. The answer is the same whether or not the email is
    known, so the form can't be used to find out who is on the panel. The link is never returned.
    """
    if not login_by_ip.allow(client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many sign-in requests. Try again in a few minutes.")
    email = body.email.strip().lower()
    if not login_by_email.allow(email):
        return LOGIN_LINK_RESPONSE  # Same answer: silently stop emailing this address for a while
    expert = expert_for_email(db, email)
    if expert is not None:
        if not expert.link_token:
            expert.link_token = secrets.token_urlsafe(16)
            db.commit()
        # Sent after the response, so the reply takes as long for unknown emails as for known ones
        background.add_task(mailer.send_login_link, expert.email or email, f"{EXPERT_APP_URL}/?token={expert.link_token}")
    return LOGIN_LINK_RESPONSE


# Expert: secret-link routes

@app.get("/q/{token}/questions")
def expert_questions(token: str, db: Session = Depends(get_db)):
    """Every question this expert was invited to, open ones first, so none disappears when a new one arrives."""
    expert, _ = resolve_link(db, token)
    items = []
    for invite, question in expert_invites(db, expert.id):
        risk = db.get(Risk, question.risk_id)
        items.append({
            "question_id": question.id,
            "text": question.text,
            "deadline": question.deadline,
            "status": question.status,
            "delphi_round": getattr(question, "delphi_round", 1),
            "risk": {"id": risk.id, "title": risk.title, "country": risk.country},
            "answered": get_response(db, question.id, expert.id, 1) is not None,
            "revised": get_response(db, question.id, expert.id, 2) is not None,
        })
    return items


@app.get("/q/{token}")
def expert_question(token: str, question_id: str | None = None, db: Session = Depends(get_db)):
    invite = get_invite(db, token, question_id)
    question = db.get(Question, invite.question_id)
    risk = db.get(Risk, question.risk_id)
    alert = db.get(Alert, question.alert_id) if question.alert_id else None
    first = get_response(db, question.id, invite.expert_id, 1)
    revision = get_response(db, question.id, invite.expert_id, 2)

    return {
        # The expert's own answers (probabilities 0-1), so they show on any device or browser
        "own": {
            "first": first.probability if first else None,
            "latest": (revision or first).probability if first else None,
            "first_reason": first.reason if first else "",
        },
        "question": {
            "id": question.id,
            "text": question.text,
            "resolution_criteria": question.resolution_criteria,
            "deadline": question.deadline,
            "status": question.status,
            "delphi_round": getattr(question, "delphi_round", 1),
        },
        "risk": {
            "id": risk.id,
            "title": risk.title,
            "country": risk.country,
            "risk_level": risk.risk_level,
        },
        "trigger_update": alert_to_dict(alert) if alert else None,
        "similar_risks": ml_outputs.similar_risks(risk.id),
        "answered": first is not None,
        "revised": revision is not None,
        # Both Delphi rounds of the expert's own answer, for the round-2 keep/adjust screen
        "own_response": {
            "round_1": {
                "probability": first.probability,
                "reason": first.reason,
                "status": "tentative",
                "created_at": first.created_at.isoformat() if first.created_at else None,
            } if first else None,
            "round_2": {
                "probability": revision.probability,
                "reason": revision.reason,
                "status": "finalised",
                "decision": "kept" if (first and abs(revision.probability - first.probability) < 0.001) else "adjusted",
                "created_at": revision.created_at.isoformat() if revision.created_at else None,
            } if revision else None,
        },
    }


@app.post("/q/{token}/responses")
def submit_answer(
    token: str,
    body: AnswerIn,
    background: BackgroundTasks,
    question_id: str | None = None,
    db: Session = Depends(get_db),
):
    invite = get_invite(db, token, question_id)
    question = db.get(Question, invite.question_id)
    require_open(question)
    if get_response(db, invite.question_id, invite.expert_id, 1):
        raise HTTPException(status_code=409, detail="Already answered")
    if getattr(question, "delphi_round", 1) != 1:
        raise HTTPException(status_code=400, detail="Round 1 elicitation is closed for this question")

    db.add(Response(
        question_id=invite.question_id,
        expert_id=invite.expert_id,
        probability=body.probability,
        reason=body.reason,
        round=1,
        **answer_labels(db.get(Expert, invite.expert_id)),
    ))
    commit_once(db, "Already answered")

    # Round 2 opens automatically once 80% of the invited experts have answered
    from .services.delphi_transition import check_and_advance_delphi_stage
    transition = check_and_advance_delphi_stage(db, question, summarise=False)

    if transition.get("action") == "advanced_to_round_2":
        # Round 2 shows the group's themes, so refresh them from every round-1 reason
        background.add_task(summarise_question, question.id, app.state.session_factory, True)
    elif not question.themes and len(latest_answers(db, question.id)) >= MIN_GROUP_SIZE:
        background.add_task(summarise_question, question.id, app.state.session_factory)

    return {
        "status": "received",
        "delphi_round": getattr(question, "delphi_round", 1),
        "transition": transition.get("action", "none"),
    }


@app.post("/q/{token}/revision")
def submit_revision(
    token: str,
    body: AnswerIn,
    background: BackgroundTasks,
    question_id: str | None = None,
    db: Session = Depends(get_db),
):
    invite = get_invite(db, token, question_id)
    question = db.get(Question, invite.question_id)
    require_open(question)
    if not get_response(db, invite.question_id, invite.expert_id, 1):
        raise HTTPException(status_code=403, detail="Submit your first answer before revising")
    if get_response(db, invite.question_id, invite.expert_id, 2):
        raise HTTPException(status_code=409, detail="Already revised")
    if getattr(question, "delphi_round", 1) < 2:
        raise HTTPException(status_code=400, detail="Delphi Round 2 is not open yet")

    db.add(Response(
        question_id=invite.question_id,
        expert_id=invite.expert_id,
        probability=body.probability,
        reason=body.reason,
        round=2,
        **answer_labels(db.get(Expert, invite.expert_id)),
    ))
    commit_once(db, "Already revised")

    # The question closes with final results once 80% of round-1 respondents have revised
    from .services.delphi_transition import check_and_advance_delphi_stage
    transition = check_and_advance_delphi_stage(db, question, summarise=False)
    background.add_task(summarise_question, invite.question_id, app.state.session_factory, True)

    return {
        "status": "revised",
        "question_status": question.status,
        "transition": transition.get("action", "none"),
    }


@app.get("/q/{token}/group")
def group_view(token: str, question_id: str | None = None, db: Session = Depends(get_db)):
    invite = get_invite(db, token, question_id)
    if not get_response(db, invite.question_id, invite.expert_id, 1):
        raise HTTPException(status_code=403, detail="Submit your answer before seeing the group view")

    responses = db.scalars(
        select(Response).where(Response.question_id == invite.question_id)
    ).all()

    r1_answers = [r for r in responses if r.round == 1]
    r2_answers = [r for r in responses if r.round == 2]

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

    r1_probs = [r.probability for r in r1_answers]
    r2_probs = [r.probability for r in r2_answers]

    r1_median = round(statistics.median(r1_probs), 2) if r1_probs else None
    current_median = round(statistics.median(probabilities), 2)
    median_shift = round(current_median - r1_median, 2) if r1_median is not None else None

    return {
        "question_id": invite.question_id,
        "response_count": len(probabilities),
        "round_1_count": len(r1_probs),
        "round_2_count": len(r2_probs),
        "median": current_median,
        "round_1_median": r1_median,
        "median_shift": median_shift,
        "min": min(probabilities),
        "max": max(probabilities),
        "themes": ml_outputs.stored_themes(db.get(Question, invite.question_id)),
    }


@app.get("/q/{token}/track-record")
def track_record(token: str, db: Session = Depends(get_db)):
    """The expert's own record: counts and outcomes only. Brier scores are for moderators."""
    expert, _ = resolve_link(db, token)
    answered = db.scalar(
        select(func.count(func.distinct(Response.question_id))).where(Response.expert_id == expert.id)
    )
    scores = expert_scores(db, expert.id)
    return {
        "answered": answered,
        "resolved": len(scores),
        "history": [
            {"question_id": s["question_id"], "question_text": s["question_text"], "outcome": s["outcome"]}
            for s in scores
        ],
    }


@app.get("/q/{token}/panels")
def my_panels(token: str, db: Session = Depends(get_db)):
    """Country panels the expert is on or has asked to join."""
    expert, _ = resolve_link(db, token)
    return panels.panel_list(db, expert)


@app.post("/q/{token}/panels")
def request_panel(token: str, body: PanelRequestIn, db: Session = Depends(get_db)):
    """Ask to answer for another country. A moderator approves or declines."""
    expert, _ = resolve_link(db, token)
    panels.ensure_rows(db, expert)
    existing = panels.find(db, expert.id, body.country)
    if existing is not None and existing.status == "member":
        raise HTTPException(status_code=409, detail="You're already on this panel")
    panels.request(db, expert, body.country, body.note)
    db.commit()
    return panels.panel_list(db, expert)


@app.delete("/q/{token}/panels/{country}")
def withdraw_panel_request(token: str, country: str, db: Session = Depends(get_db)):
    """Withdraw a request that is still pending."""
    expert, _ = resolve_link(db, token)
    row = panels.find(db, expert.id, country)
    if row is None or row.status != "pending":
        raise HTTPException(status_code=409, detail="No pending request for this country")
    db.delete(row)
    db.commit()
    return panels.panel_list(db, expert)


@app.get("/q/{token}/settings")
def get_settings(token: str, db: Session = Depends(get_db)):
    expert, _ = resolve_link(db, token)
    return settings_dict(expert)


@app.patch("/q/{token}/settings")
def update_settings(token: str, body: SettingsUpdate, db: Session = Depends(get_db)):
    expert, _ = resolve_link(db, token)

    updates = body.model_dump(exclude_unset=True, exclude_none=True)
    if "pseudonym" in updates and nickname_taken(db, updates["pseudonym"], expert.id):
        raise HTTPException(status_code=409, detail="That nickname is already taken. Try another one.")
    if "topics" in updates:
        updates["topics"] = clean_topics(updates["topics"])
    if "followed" in updates:
        updates["followed"] = clean_followed(updates["followed"])
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