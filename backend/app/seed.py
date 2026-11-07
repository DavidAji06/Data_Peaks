"""
Loads the real risks from the CSV and the real ML alerts, adds 6 fake experts and
opens 1 question on the top-ranked risk (R1049, Sudan).
5 experts have already answered, so expert-a can show the blind-answer lock (for the demo).
"""
import random
import secrets
from datetime import date
from pathlib import Path

import pandas as pd

from .db import Base, SessionLocal, engine
from .models import Expert, Invite, Question, Response, Risk
from .services import ml_outputs
from .services.alert_import import import_alert_items

CSV = Path(__file__).resolve().parents[2] / "data" / "risk-radar-export.csv"

# Simulated forecasting skill for each synthetic expert (1 = perfect, 0 = always 50%)
SKILLS = {"a": 0.8, "b": 0.6, "c": 0.4, "d": 0.7, "e": 0.3, "f": 0.5}

LEVEL_ORDER = ["pseudonymous", "anonymous", "known_to_acaps"]
LEVELS = {letter: LEVEL_ORDER[i % 3] for i, letter in enumerate("abcdef")}


# The demo question uses the top-ranked risk in data/processed/ranked_risks.json
DEMO_RISK = "R1049"  # RSF restoration of siege on Al Obeid, North Kordofan
DEMO_TRIGGER = "T0634"  # RSF encirclement of Al Obeid
DEMO_COUNTRY = "Sudan"
DEMO_DEADLINE = date(2027, 5, 7)  # About six months after the hackathon


def find_trigger(df: pd.DataFrame, risk_id: str, trigger_id: str) -> dict:
    """Reads one trigger's title and description from the Risk Radar Triggers column."""
    text = df.loc[df["Risk ID"] == risk_id, "Triggers"].iloc[0]
    block = text.split(f"Trigger ID: {risk_id} - {trigger_id}", 1)[1].split("Trigger ID:", 1)[0]
    title = block.split("Title:", 1)[1].splitlines()[0].strip()
    description = block.split("Description:", 1)[1].split("Sources:", 1)[0].strip()
    return {"title": title, "description": " ".join(description.split())}


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
        ))
    db.flush()  # Risks must exist before alerts are checked against them

    # Real ML alerts (ACAPS access events scored by the LLM), same validation as POST /alerts/import
    alerts, skipped = import_alert_items(db, ml_outputs.alerts_from_file())
    if skipped:
        print(f"Skipped {len(skipped)} alerts: {skipped}")

    # The open demo question is built on the top-ranked risk and its strongest alert.
    # Alerts are matched to risks by country only, so this report is related reporting
    # from Sudan, not evidence that trigger T0634 fired.
    risk_alerts = [a for a in alerts if a.risk_id == DEMO_RISK]
    linked = max(risk_alerts, key=lambda a: (a.strength or 0, a.published_at or ""), default=None)
    if linked is not None:
        linked.status = "approved"

    trigger = find_trigger(df, DEMO_RISK, DEMO_TRIGGER)
    db.add(Question(
        id="Q001",
        risk_id=DEMO_RISK,
        alert_id=linked.id if linked else None,
        # Only ACAPS wording: the trigger title and description from the Risk Radar CSV.
        # In the real flow a moderator writes the question when approving an alert.
        text=f"Will ACAPS trigger {DEMO_TRIGGER}, \"{trigger['title']}\", be met by {DEMO_DEADLINE.day} {DEMO_DEADLINE:%B %Y}?",
        resolution_criteria=f"ACAPS trigger description ({DEMO_RISK} - {DEMO_TRIGGER}): {trigger['description']}",
        deadline=DEMO_DEADLINE,
    ))

    # Fixed links for the seeded demo only; real links are random
    for letter in "abcdef":
        db.add(Invite(
            token=f"demo-expert-{letter}",
            question_id="Q001",
            expert_id=f"expert-{letter}",
        ))

    # Five experts have already answered, so expert-a can demo the blind-answer lock.
    # Synthetic reasons written for the demo; they are not real expert views.
    demo_answers = [
        ("b", 0.70, "RSF units have held positions on the roads west of Al Obeid before; a new push from Bara or the west seems likely before the rains."),
        ("c", 0.55, "SAF retook Bara in March, which widens the buffer north of Al Obeid. A full encirclement is harder now, but road attacks are still plausible."),
        ("d", 0.80, "Drone strikes and attacks on the El Obeid-Kosti road suggest the RSF is testing supply routes again. Interdiction of one route would count."),
        ("e", 0.45, "Fighting has shifted to South Kordofan and Darfur. The RSF may lack the forces to besiege Al Obeid again within six months."),
        ("f", 0.65, "Traders report fuel and market shortages in Al Obeid, an early sign that access routes are being squeezed."),
    ]
    for letter, probability, reason in demo_answers:
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
    print(f"Seeded {len(df)} risks, 6 experts, {len(alerts)} real alerts, open question Q001 on {DEMO_RISK} and {len(resolved)} past questions")


if __name__ == "__main__":
    seed()