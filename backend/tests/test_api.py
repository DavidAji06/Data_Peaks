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
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_group_view_locked_until_answered(client):
    assert client.get("/q/tok-a/group").status_code == 403
    assert client.post("/q/tok-a/responses", json=ANSWER).status_code == 200

    group = client.get("/q/tok-a/group").json()
    assert group["response_count"] == 3
    assert group["median"] == 0.6


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