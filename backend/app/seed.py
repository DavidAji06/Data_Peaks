"""
Loads the real risks from the CSV and the real ML alerts (all pending), adds 6 fake experts
in Sudan and the practice questions H001-H008.

No open question is created here: the moderator writes it in the dashboard (/mod/alerts/[id])
when approving an alert. Then `python -m app.demo_answers Q001` adds 5 synthetic answers,
so expert A can demo the blind-answer lock.

Each synthetic expert has a fixed personal link, demo-expert-a ... demo-expert-f, which opens
the expert app before and after the moderator creates a question.
"""
import random
import secrets
from datetime import date
from pathlib import Path

import pandas as pd

from .db import Base, SessionLocal, engine
from .models import Expert, Invite, PanelMembership, Question, Response, Risk
from .services import ml_outputs
from .services.alert_import import import_alert_items

CSV = Path(__file__).resolve().parents[2] / "data" / "risk-radar-export.csv"

# Simulated forecasting skill for each synthetic expert (1 = perfect, 0 = always 50%)
SKILLS = {"a": 0.8, "b": 0.6, "c": 0.4, "d": 0.7, "e": 0.3, "f": 0.5}

LEVEL_ORDER = ["pseudonymous", "anonymous", "known_to_acaps"]
LEVELS = {letter: LEVEL_ORDER[i % 3] for i, letter in enumerate("abcdef")}


DEMO_COUNTRY = "Sudan"  # The top-ranked risk, R1049 (Al Obeid), is in Sudan


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

    # Synthetic experts (fake people, never real names or contacts)
    for letter in "abcdef":
        db.add(Expert(
            id=f"expert-{letter}",
            pseudonym=f"Analyst {letter.upper()}",
            anonymity_level=LEVELS[letter],
            country=DEMO_COUNTRY,
            topics="conflict,displacement",
            link_token=f"demo-expert-{letter}",  # Fixed personal link for the demo only
        ))
        db.add(PanelMembership(expert_id=f"expert-{letter}", country=DEMO_COUNTRY, status="member"))
    db.flush()  # Risks must exist before alerts are checked against them

    # Real ML alerts (ACAPS access events scored by the LLM), same validation as POST /alerts/import
    alerts, skipped = import_alert_items(db, ml_outputs.alerts_from_file())
    if skipped:
        print(f"Skipped {len(skipped)} alerts: {skipped}")

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
                pseudonym=f"Analyst {letter.upper()}",
            ))

    db.commit()
    db.close()
    print(f"Seeded {len(df)} risks, 6 experts, {len(alerts)} real pending alerts and {len(resolved)} practice questions. "
          "No open question yet: approve an alert at http://localhost:3000/mod")


if __name__ == "__main__":
    seed()