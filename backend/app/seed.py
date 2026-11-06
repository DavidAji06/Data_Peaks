"""
Loads the real risks from the CSV, adds 6 fake experts and asks 1 question
5 experts have already answered, then expert-a can show the blind-answer
(for the demo)
"""
from datetime import date
from pathlib import Path

import pandas as pd

from .db import Base, SessionLocal, engine
from .models import Alert, Expert, Invite, Question, Response, Risk

CSV = Path(__file__).resolve().parents[2] / "data" / "risk-radar-export.csv"


def clean(value):
    return None if pd.isna(value) else value


def seed():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = SessionLocal()

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
    levels = ["pseudonymous", "anonymous", "known_to_acaps"]
    for i, letter in enumerate("abcdef"):
        db.add(Expert(
            id=f"expert-{letter}",
            pseudonym=f"Analyst {letter.upper()}",
            anonymity_level=levels[i % 3],
            country="Chad",
            topics="conflict,displacement",
        ))

    # Sample alerts: A001 is already approved, A002 is waiting for a moderator
    db.add(Alert(
        id="A001",
        risk_id="R1043",
        trigger_id="T0001",
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
        trigger_id="T0001",
        report_title="Sample report on new refugee arrivals in eastern Chad",
        report_source="Sample source",
        report_url="https://example.org/sample-report-2",
        published_at="2026-11-06",
        direction="escalating",
        strength=0.71,
        evidence="Sample sentence explaining why the report matches the trigger.",
        status="pending",
    ))

    # Sample question created from A001
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
        ("expert-b", 0.70, "Sample: armed group movement reported near the border."),
        ("expert-c", 0.55, "Sample: rainy season may slow movement."),
        ("expert-d", 0.80, "Sample: refugee arrivals are rising again."),
        ("expert-e", 0.45, "Sample: recent local mediation may reduce clashes."),
        ("expert-f", 0.65, "Sample: humanitarian access is already limited."),
    ]
    for expert_id, probability, reason in sample_answers:
        db.add(Response(
            question_id="Q001",
            expert_id=expert_id,
            probability=probability,
            reason=reason,
            round=1,
        ))

    db.commit()
    db.close()
    print(f"Seeded {len(df)} risks, 6 experts, 2 alerts and 1 question")


if __name__ == "__main__":
    seed()