"""
Each test uses its own temporary in-memory db, 
so demo data never touched
"""


from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Expert, Invite, PanelInvite, Question, Response, Risk
from app.services.auth import MODERATOR_KEY
from app.models import Alert
from app.services import ml_outputs
from app.services.routing import parse_countries
from app.services.weighting import NEUTRAL_WEIGHT, expert_weight, weighted_estimate
from app.demo_answers import DemoError, add_demo_answers

MOD = {"X-Moderator-Key": MODERATOR_KEY}
ANSWER = {"probability": 0.6, "reason": "Test reason"}


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSession = sessionmaker(bind=engine, autoflush=False)
    Base.metadata.create_all(engine)

    db = TestSession()
    db.add(Risk(id="R1", title="Test risk", country="Chad", iso="TCD"))
    levels = ["pseudonymous", "anonymous", "known_to_acaps"]
    for i, letter in enumerate("abc"):
        db.add(Expert(
            id=f"expert-{letter}",
            pseudonym=f"Analyst {letter.upper()}",
            anonymity_level=levels[i],
            country="Chad",
            topics="conflict",
            email=f"{letter}@example.org",
        ))
    db.add(Question(
        id="Q001",
        risk_id="R1",
        text="Test question?",
        resolution_criteria="Test criteria",
        deadline=date(2030, 1, 1),
    ))
    for letter in "abc":
        db.add(Invite(token=f"tok-{letter}", question_id="Q001", expert_id=f"expert-{letter}"))
    db.add(Response(question_id="Q001", expert_id="expert-b", probability=0.8, reason="B reason", round=1))
    db.add(Response(question_id="Q001", expert_id="expert-c", probability=0.4, reason="C reason", round=1))
    db.add(PanelInvite(token="join-1", email="new@example.org", country="Chad"))
    db.commit()
    db.close()

    def override_get_db():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    real_factory = app.state.session_factory
    app.state.session_factory = TestSession  # Background jobs use the test db too
    yield TestClient(app)
    app.state.session_factory = real_factory
    app.dependency_overrides.clear()


def test_group_view_locked_until_answered(client):
    assert client.get("/q/tok-a/group").status_code == 403
    assert client.post("/q/tok-a/responses", json=ANSWER).status_code == 200

    group = client.get("/q/tok-a/group").json()
    assert group["response_count"] == 3
    assert group["median"] is None  # Below the minimum group size
    assert group["min"] is None


def test_cannot_answer_twice(client):
    client.post("/q/tok-a/responses", json=ANSWER)
    assert client.post("/q/tok-a/responses", json=ANSWER).status_code == 409


def test_revision_needs_first_answer(client):
    assert client.post("/q/tok-a/revision", json=ANSWER).status_code == 403


def test_invalid_probability_rejected(client):
    bad = {"probability": 60, "reason": "Sent as a percentage"}
    assert client.post("/q/tok-a/responses", json=bad).status_code == 422


def test_bad_link_not_found(client):
    assert client.get("/q/wrong-token").status_code == 404


def test_moderator_routes_need_key(client):
    assert client.get("/moderator/questions").status_code == 401
    assert client.get("/alerts").status_code == 401
    assert client.get("/moderator/questions", headers=MOD).status_code == 200


def test_moderator_view_hides_identity(client):
    response = client.get("/moderator/questions/Q001", headers=MOD)
    text = response.text

    assert "expert-" not in text
    assert "tok-" not in text
    assert "@example.org" not in text

    labels = [r["label"] for r in response.json()["responses"]]
    assert "Anonymous expert 1" in labels  # Expert B is anonymous
    assert "Analyst C" in labels


def test_resolve_scores_and_closes_question(client):
    result = client.post("/moderator/questions/Q001/resolve", json={"outcome": 1}, headers=MOD).json()

    # Brier scores: (0.8 - 1)^2 = 0.04, (0.4 - 1)^2 = 0.36, median 0.6 -> 0.16
    assert result["scored"] == 2
    assert result["mean_expert_brier"] == pytest.approx(0.2)
    assert result["group_median_brier"] == pytest.approx(0.16)

    assert client.post("/q/tok-a/responses", json=ANSWER).status_code == 400
    again = client.post("/moderator/questions/Q001/resolve", json={"outcome": 1}, headers=MOD)
    assert again.status_code == 409


def test_public_page_hides_small_groups(client):
    client.post("/moderator/questions/Q001/resolve", json={"outcome": 1}, headers=MOD)
    response = client.get("/public/questions")
    question = response.json()[0]

    assert question["expert_count"] is None  # Only 2 answers, below the minimum of 3
    assert question["group_median"] is None
    assert "B reason" not in response.text


def test_join_link_works_once(client):
    body = {"anonymity_level": "anonymous", "country": "Chad", "topics": ["Conflict"]}
    joined = client.post("/join/join-1", json=body)

    assert joined.status_code == 200
    assert joined.json()["pseudonym"].startswith("Analyst ")
    assert client.post("/join/join-1", json=body).status_code == 409


def test_settings_never_return_email(client):
    response = client.get("/q/tok-a/settings")
    assert "@example.org" not in response.text

    updated = client.patch("/q/tok-a/settings", json={"anonymity_level": "anonymous"})
    assert updated.json()["anonymity_level"] == "anonymous"


def test_anonymous_experts_not_ranked(client):
    client.post("/q/tok-a/responses", json=ANSWER)
    client.post("/moderator/questions/Q001/resolve", json={"outcome": 1}, headers=MOD)

    # Below the 3-question minimum, so nobody is ranked yet, but the route must work
    board = client.get("/moderator/leaderboard", headers=MOD).json()
    assert all(row["anonymity_level"] != "anonymous" for row in board["experts"])

def test_parse_countries():
    assert parse_countries("Chad, Niger, Cameroon") == {"chad", "niger", "cameroon"}
    assert parse_countries("Chad") == {"chad"}


def test_multi_country_risk_reaches_experts(client):
    # Add a risk covering several countries, plus an alert for it
    override = app.dependency_overrides[get_db]
    db = next(override())
    db.add(Risk(id="R2", title="Lake Chad risk", country="Chad, Niger, Nigeria", iso="TCD, NER, NGA"))
    db.add(Alert(id="A9", risk_id="R2", report_title="Test report"))
    for country in ("Niger", "Nigeria", "Mali"):
        db.add(Expert(id=f"expert-{country}", pseudonym=f"Analyst {country}", anonymity_level="pseudonymous",
                      country=country, topics="conflict"))
    db.commit()
    db.close()

    body = {
        "status": "approved",
        "question_text": "Test multi-country question?",
        "resolution_criteria": "Test criteria",
        "deadline": "2030-01-01",
    }
    result = client.post("/alerts/A9/decision", json=body, headers=MOD).json()
    assert result["experts_invited"] == 5  # 3 in Chad, 1 in Niger, 1 in Nigeria; not the one in Mali

def test_anonymous_answers_stay_anonymous(client):
    # Answer anonymously, then switch to the least private level
    client.patch("/q/tok-a/settings", json={"anonymity_level": "anonymous"})
    client.post("/q/tok-a/responses", json=ANSWER)
    client.patch("/q/tok-a/settings", json={"anonymity_level": "known_to_acaps"})

    labels = [r["label"] for r in client.get("/moderator/questions/Q001", headers=MOD).json()["responses"]]
    assert "Analyst A" not in labels


def test_alert_detail(client):
    assert client.get("/alerts/missing", headers=MOD).status_code == 404


def test_risk_decision_saved(client):
    body = {"decision": "raise", "question_id": "Q001", "note": "Experts expect escalation"}
    assert client.post("/risks/R1/decide", json=body, headers=MOD).status_code == 200

    history = client.get("/risks/R1/decisions", headers=MOD).json()
    assert history[0]["decision"] == "raise"

    # Trigger changes need a note
    bad = client.post("/risks/R1/decide", json={"decision": "add_trigger"}, headers=MOD)
    assert bad.status_code == 422


def test_public_question_detail(client):
    assert client.get("/public/questions/Q001").status_code == 404  # Still open
    client.post("/moderator/questions/Q001/resolve", json={"outcome": 1}, headers=MOD)
    assert client.get("/public/questions/Q001").status_code == 200

def add_answers(letters: str):
    """Adds experts who already answered Q001, so the group reaches the minimum size."""
    db = app.state.session_factory()
    for letter in letters:
        db.add(Expert(id=f"expert-{letter}", pseudonym=f"Analyst {letter.upper()}",
                      anonymity_level="pseudonymous", country="Chad", topics="conflict"))
        db.add(Response(question_id="Q001", expert_id=f"expert-{letter}",
                        probability=0.5, reason=f"{letter.upper()} reason", round=1))
    db.commit()
    db.close()


def test_themes_summarised_once_group_is_big_enough(client, monkeypatch):
    calls = []

    def fake_summary(reasons):
        calls.append(reasons)
        return {"agreement": ["Most expect fighting to continue"], "disagreement": [], "new_information": []}

    monkeypatch.setattr(ml_outputs, "summarise_reasons", fake_summary)
    add_answers("de")
    client.post("/q/tok-a/responses", json=ANSWER)  # 5th answer

    assert len(calls) == 1 and len(calls[0]) == 5
    themes = client.get("/q/tok-a/group").json()["themes"]
    assert themes["agreement"] == ["Most expect fighting to continue"]


def test_no_themes_stored_when_summary_fails(client, monkeypatch):
    monkeypatch.setattr(ml_outputs, "summarise_reasons", lambda reasons: ml_outputs.empty_themes())
    add_answers("de")
    client.post("/q/tok-a/responses", json=ANSWER)
    assert client.get("/q/tok-a/group").json()["themes"] == ml_outputs.empty_themes()


def test_no_summary_for_small_groups(client, monkeypatch):
    calls = []
    monkeypatch.setattr(ml_outputs, "summarise_reasons", lambda reasons: calls.append(reasons) or {})
    client.post("/q/tok-a/responses", json=ANSWER)  # Only 3 answers
    assert calls == []


def test_public_contexts(client, monkeypatch):
    monkeypatch.setattr(ml_outputs, "ranked_risks", lambda: [
        {"risk_id": "R1", "priority_score": 0.7, "p_materialise": 0.4},
        {"risk_id": "R-missing", "priority_score": 0.9},
    ])
    anonymous = client.get("/public/contexts").json()
    chad = anonymous["contexts"][0]
    assert len(anonymous["contexts"]) == 1
    assert chad["iso3"] == "TCD" and chad["has_question"] is False
    assert chad["risks"] == [{"id": "R1", "title": "Test risk", "risk_level": None, "priority_score": 0.7}]
    assert "p_materialise" not in str(anonymous)

    mine = client.get("/public/contexts", params={"token": "tok-a"}).json()
    assert mine["contexts"][0]["has_question"] is True
    assert client.get("/public/contexts", params={"token": "nope"}).json()["contexts"][0]["has_question"] is False


# ---------------------------------------------------------------- routing: every expert in the region

def approve(client, alert_id: str, text: str = "Test routed question?"):
    body = {
        "status": "approved",
        "question_text": text,
        "resolution_criteria": "Test criteria",
        "deadline": "2030-01-01",
    }
    return client.post(f"/alerts/{alert_id}/decision", json=body, headers=MOD).json()


def test_experts_over_their_limit_are_still_invited(client):
    db = app.state.session_factory()
    db.get(Expert, "expert-a").max_open_questions = 1  # Already has Q001 open
    db.add(Alert(id="A10", risk_id="R1", report_title="Test report"))
    db.commit()
    db.close()

    result = approve(client, "A10")
    assert result["experts_invited"] == 3
    assert result["experts_notified"] == 2  # expert-a is invited but not pinged


def test_no_panel_cap(client):
    db = app.state.session_factory()
    for n in range(12):
        db.add(Expert(id=f"expert-x{n}", pseudonym=f"Analyst X{n}", anonymity_level="pseudonymous",
                      country="Chad", topics="conflict"))
    db.add(Alert(id="A11", risk_id="R1", report_title="Test report"))
    db.commit()
    db.close()
    assert approve(client, "A11")["experts_invited"] == 15


# ---------------------------------------------------------------- personal links

def test_personal_link_without_question_is_up_to_date(client):
    db = app.state.session_factory()
    db.add(Expert(id="expert-z", pseudonym="Analyst Z", anonymity_level="pseudonymous",
                  country="Sudan", topics="conflict", link_token="demo-expert-z"))
    db.commit()
    db.close()

    assert client.get("/q/demo-expert-z").status_code == 404  # No question yet
    assert client.get("/q/demo-expert-z/settings").json()["pseudonym"] == "Analyst Z"
    assert client.get("/q/demo-expert-z/track-record").json()["resolved"] == 0
    assert client.get("/q/unknown-link/settings").status_code == 404


def test_personal_link_follows_newest_open_question(client):
    db = app.state.session_factory()
    db.get(Expert, "expert-a").link_token = "demo-expert-a"
    db.commit()
    db.close()

    assert client.get("/q/demo-expert-a").json()["question"]["id"] == "Q001"
    assert client.post("/q/demo-expert-a/responses", json=ANSWER).status_code == 200
    assert client.get("/q/tok-a").json()["answered"] is True  # Same invite behind both links


# ---------------------------------------------------------------- no Brier for experts

def test_expert_endpoints_never_return_brier_or_weights(client):
    client.post("/q/tok-a/responses", json=ANSWER)
    client.post("/moderator/questions/Q001/resolve", json={"outcome": 1}, headers=MOD)

    record = client.get("/q/tok-a/track-record")
    assert record.json()["resolved"] == 1
    assert record.json()["history"][0]["outcome"] == 1
    for text in (record.text, client.get("/q/tok-a/settings").text, client.get("/public/questions").text):
        assert "brier" not in text.lower()
        assert "weight" not in text.lower()
        assert "baseline" not in text.lower()


# ---------------------------------------------------------------- nickname

def test_nickname_can_be_changed(client):
    response = client.patch("/q/tok-a/settings", json={"pseudonym": "  Kordofan   Watcher "})
    assert response.status_code == 200
    assert response.json()["pseudonym"] == "Kordofan Watcher"


@pytest.mark.parametrize("bad", [
    "ab",                       # Too short
    "x" * 31,                   # Too long
    "me@example.org",           # Email
    "+249 912 345 678",         # Phone number
    "0912345678",               # Phone number
    "Hello!",                   # Not allowed character
    "Anonymous expert 1",       # Reserved label
])
def test_nickname_validation(client, bad):
    assert client.patch("/q/tok-a/settings", json={"pseudonym": bad}).status_code == 422


def test_nickname_must_be_unique(client):
    response = client.patch("/q/tok-a/settings", json={"pseudonym": "analyst c"})  # Case-insensitive
    assert response.status_code == 409
    assert "already taken" in response.json()["detail"]
    # Keeping your own name is fine
    assert client.patch("/q/tok-c/settings", json={"pseudonym": "Analyst C"}).status_code == 200


def test_rename_keeps_past_answer_labels(client):
    client.post("/q/tok-a/responses", json=ANSWER)  # Answered as "Analyst A"
    client.patch("/q/tok-a/settings", json={"pseudonym": "New Name"})

    labels = [r["label"] for r in client.get("/moderator/questions/Q001", headers=MOD).json()["responses"]]
    assert "Analyst A" in labels
    assert "New Name" not in labels


def test_leaderboard_uses_new_nickname_and_skips_anonymous(client):
    resolved_history(client)
    client.patch("/q/tok-c/settings", json={"pseudonym": "Kordofan Watcher"})
    board = client.get("/moderator/leaderboard", headers=MOD).json()
    labels = [row["label"] for row in board["experts"]]
    assert "Kordofan Watcher" in labels
    assert all(row["anonymity_level"] != "anonymous" for row in board["experts"])


# ---------------------------------------------------------------- Brier weighting

def test_expert_weight_formula():
    assert expert_weight([]) == NEUTRAL_WEIGHT
    assert expert_weight([0.0, 0.0]) == NEUTRAL_WEIGHT  # Fewer than 3 resolved: neutral
    assert expert_weight([0.0, 0.0, 0.0]) == pytest.approx(1.2)  # Perfect: 0.2 + 1
    assert expert_weight([0.25, 0.25, 0.25]) == pytest.approx(0.2)  # Always 50%: floor
    assert expert_weight([0.81, 0.64, 0.49]) == pytest.approx(0.2)  # Worse than 50%: still the floor
    assert expert_weight([0.125, 0.125, 0.125]) == pytest.approx(0.7)


def test_weighted_estimate():
    assert weighted_estimate([]) is None
    equal = weighted_estimate([(0.2, 1), (0.4, 1), (0.9, 1)])
    assert equal["mean"] == pytest.approx(0.5) and equal["median"] == pytest.approx(0.4)
    skewed = weighted_estimate([(0.2, 0.2), (0.4, 0.2), (0.9, 1.2)])
    assert skewed["mean"] == pytest.approx(0.75) and skewed["median"] == pytest.approx(0.9)


def resolved_history(client):
    """Three resolved questions: expert-c (known) is always right, expert-b (anonymous) always 50%."""
    db = app.state.session_factory()
    for n in range(3):
        qid = f"H00{n + 1}"
        db.add(Question(id=qid, risk_id="R1", text="Past?", resolution_criteria="x",
                        deadline=date(2025, 1, 1), status="resolved", outcome=1))
        db.add(Response(question_id=qid, expert_id="expert-c", probability=1.0, reason="r", round=1,
                        anonymity_level="known_to_acaps"))
        db.add(Response(question_id=qid, expert_id="expert-b", probability=0.5, reason="r", round=1,
                        anonymity_level="anonymous"))
    db.commit()
    db.close()


def test_moderator_sees_weighted_estimate(client):
    resolved_history(client)
    detail = client.get("/moderator/questions/Q001", headers=MOD).json()

    # Q001: expert-b 0.8 (weight 0.2), expert-c 0.4 (weight 1.2)
    weighted = detail["weighted"]
    assert weighted["label"] == "Weighted by past accuracy (Brier)"
    assert weighted["mean"] == pytest.approx(round((0.8 * 0.2 + 0.4 * 1.2) / 1.4, 2))
    assert weighted["median"] == pytest.approx(0.4)
    assert detail["latest"]["median"] == pytest.approx(0.6)  # Plain median still there

    by_label = {r["label"]: r for r in detail["responses"]}
    assert by_label["Analyst C"]["weight"] == pytest.approx(1.2)
    assert by_label["Anonymous expert 1"]["weight"] is None  # Never next to an identity

    listed = {q["id"]: q for q in client.get("/moderator/questions", headers=MOD).json()}
    assert listed["Q001"]["weighted_mean"] == weighted["mean"]


# ---------------------------------------------------------------- alerts: impact filter and sort

def test_alerts_sorted_and_filtered_by_impact(client):
    db = app.state.session_factory()
    db.add(Alert(id="A-low", risk_id="R1", report_title="Low", impact_score=3, published_at="2026-05-01"))
    db.add(Alert(id="A-old", risk_id="R1", report_title="Old", impact_score=5, published_at="2026-01-01"))
    db.add(Alert(id="A-new", risk_id="R1", report_title="New", impact_score=5, published_at="2026-03-01",
                 intensity_score=5, exposure_score=4, country="Chad", region_match=False))
    db.commit()
    db.close()

    ids = [a["id"] for a in client.get("/alerts", params={"min_impact": 4}, headers=MOD).json()]
    assert ids == ["A-new", "A-old"]
    everything = client.get("/alerts", headers=MOD).json()
    assert [a["id"] for a in everything] == ["A-new", "A-old", "A-low"]
    assert everything[0]["intensity_score"] == 5 and everything[0]["region_match"] is False


def test_alert_import_keeps_scores(client):
    from app.services.alert_import import import_alert_items

    db = app.state.session_factory()
    added, skipped = import_alert_items(db, [{
        "id": "A-imp", "risk_id": "R1", "report_title": "Report", "impact_score": 4,
        "intensity_score": 4, "exposure_score": 5, "region_match": True, "matched_place": "Bara (North Kordofan)",
    }, {"id": "A-bad", "risk_id": "R1", "report_title": "Report", "impact_score": 9}])
    assert [a.id for a in added] == ["A-imp"] and skipped[0]["id"] == "A-bad"
    assert added[0].matched_place == "Bara (North Kordofan)"
    db.close()


# ---------------------------------------------------------------- demo helper

def test_demo_answers_refuses_missing_question(client):
    db = app.state.session_factory()
    with pytest.raises(DemoError):
        add_demo_answers(db, "Q999")
    db.close()
