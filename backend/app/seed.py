"""
Loads the real risks from the CSV, adds 6 fake experts and asks 1 question
5 experts have already answered, then expert-a can show the blind-answer
(for the demo)
"""
import random
import secrets
from datetime import date
from pathlib import Path

import pandas as pd

from .db import Base, SessionLocal, engine
from .models import Alert, Expert, Invite, Question, Response, Risk

CSV = Path(__file__).resolve().parents[2] / "data" / "risk-radar-export.csv"

# Simulated forecasting skill for each synthetic expert (1 = perfect, 0 = always 50%)
SKILLS = {"a": 0.8, "b": 0.6, "c": 0.4, "d": 0.7, "e": 0.3, "f": 0.5}

LEVEL_ORDER = ["pseudonymous", "anonymous", "known_to_acaps"]
LEVELS = {letter: LEVEL_ORDER[i % 3] for i, letter in enumerate("abcdef")}


def clean(value):
    return None if pd.isna(value) else value


def seed():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = SessionLocal()
    rng = random.Random(42)  # Fixed seed so the demo data is the same every time

    # Real risks from the ACAPS Risk Radar
    df = pd.read_csv(CSV)
    for _, row in df.iterrows():
        impact = clean(row["Impact"])
        db.add(Risk(
            id=row["Risk ID"],
            title=row["Risk Title"],
            country=row["Country"],
            iso=row["ISO"],
            risk_type=clean(row["Risk Type"]),
            probability=clean(row["Probability"]),
            impact=int(impact) if impact is not None else None,
            risk_level=clean(row["Risk Level"]),
            status=clean(row["Status"]),
            expected_exposure=clean(row["Expected exposure"]),
            rationale=clean(row["Rationale"]),
            triggers=clean(row["Triggers"]),
        ))

    # Synthetic experts
    for letter in "abcdef":
        db.add(Expert(
            id=f"expert-{letter}",
            pseudonym=f"Analyst {letter.upper()}",
            anonymity_level=LEVELS[letter],
            country="Chad",
            topics="conflict,displacement",
        ))

    # Sample alerts linked to R1043's real triggers (the report text is made up)
    db.add(Alert(
        id="A001",
        risk_id="R1043",
        trigger_id="T0618",  # Expansion of cross-border attacks and insecurity
        report_title="Sample report on clashes near the Chad-Sudan border",
        report_source="Sample source",
        report_url="https://example.org/sample-report",
        published_at="2026-11-05",
        direction="escalating",
        strength=0.82,
        evidence="Sample sentence explaining why the report matches the trigger.",
        status="approved",
    ))
    db.add(Alert(
        id="A002",
        risk_id="R1043",
        trigger_id="T0620",  # Renewed proxy mobilisation and cross-border armed group activity
        report_title="Sample report on armed group mobilisation near the Chad-Sudan border",
        report_source="Sample source",
        report_url="https://example.org/sample-report-2",
        published_at="2026-11-06",
        direction="escalating",
        strength=0.71,
        evidence="Sample sentence explaining why the report matches the trigger.",
        status="pending",
    ))

    # Sample open question created from A001
    db.add(Question(
        id="Q001",
        risk_id="R1043",
        alert_id="A001",
        text="Sample: Will a defined cross-border event occur in eastern Chad by 6 May 2027?",
        resolution_criteria="Sample: resolves yes if the agreed source reports the defined event by the deadline.",
        deadline=date(2027, 5, 6),
    ))

    # Fixed links for the seeded demo only; real links are random
    for letter in "abcdef":
        db.add(Invite(
            token=f"demo-expert-{letter}",
            question_id="Q001",
            expert_id=f"expert-{letter}",
        ))

    # Five experts have already answered, so expert-a can demo the blind-answer lock
    sample_answers = [
        ("b", 0.70, "Sample: armed group movement reported near the border."),
        ("c", 0.55, "Sample: rainy season may slow movement."),
        ("d", 0.80, "Sample: refugee arrivals are rising again."),
        ("e", 0.45, "Sample: recent local mediation may reduce clashes."),
        ("f", 0.65, "Sample: humanitarian access is already limited."),
    ]
    for letter, probability, reason in sample_answers:
        db.add(Response(
            question_id="Q001",
            expert_id=f"expert-{letter}",
            probability=probability,
            reason=reason,
            round=1,
            anonymity_level=LEVELS[letter],
        ))

    # Past questions: REAL resolved ACAPS outcomes, SIMULATED expert forecasts
    resolved = (
        df[df["Status"].isin(["Materialised", "Not materialised"])]
        .sort_values("Risk ID")
        .head(8)
    )
    for n, (_, row) in enumerate(resolved.iterrows(), start=1):
        question_id = f"H{n:03d}"
        outcome = 1 if row["Status"] == "Materialised" else 0
        db.add(Question(
            id=question_id,
            risk_id=row["Risk ID"],
            alert_id=None,
            text=f"Simulated past question: will this risk materialise? {row['Risk Title']}",
            resolution_criteria="Resolved using the real ACAPS outcome.",
            deadline=date(2026, 1, 1),
            status="resolved",
            outcome=outcome,
        ))

        for letter, skill in SKILLS.items():
            # Skilled experts lean towards the real outcome; others stay near 50%
            probability = skill * outcome + (1 - skill) * 0.5 + rng.gauss(0, 0.1)
            probability = round(min(max(probability, 0.02), 0.98), 2)

            db.add(Invite(
                token=secrets.token_urlsafe(16),
                question_id=question_id,
                expert_id=f"expert-{letter}",
            ))
            db.add(Response(
                question_id=question_id,
                expert_id=f"expert-{letter}",
                probability=probability,
                reason="Simulated forecast for testing scores.",
                round=1,
                anonymity_level=LEVELS[letter],
            ))

    db.commit()
    db.close()
    print(f"Seeded {len(df)} risks, 6 experts, 2 alerts, 1 open question and {len(resolved)} past questions")


if __name__ == "__main__":
    seed()