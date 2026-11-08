"""
Loads the real risks from the CSV and the real ML alerts (all pending), adds 6 fake experts
in Sudan and the practice questions H001-H008.

No open question is created here: the moderator writes it in the dashboard (/mod/alerts/[id])
when approving an alert. Then `python -m app.demo_answers Q001` adds 5 synthetic answers,
so expert A can demo the blind-answer lock.

Each synthetic expert has a fixed personal link, demo-expert-a ... demo-expert-f, which opens
the expert app before and after the moderator creates a question.
"""
import json
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

    # --- OPEN QUESTION 1 (STAGE 2: Delphi Consensus Round) ---
    # Risk R1049 (Sudan - Al Obeid)
    # Experts A-F have answered Round 1 with varied estimates and rationale.
    # Group themes and median are available. Awaiting Stage 2 Delphi revision/decision.
    q1_alert = "A-R1049-22992" if "A-R1049-22992" in alerts else None
    if q1_alert and q1_alert in alerts:
        alerts[q1_alert].status = "approved"

    themes_q1 = {
        "agreement": [
            "RSF units continue to position along primary road networks surrounding Al Obeid",
            "Severe market shortages and fuel price spikes in Al Obeid indicate active access constraints"
        ],
        "disagreement": [
            "Whether SAF defensive reinforcement around Bara can prevent a sustained encirclement",
            "Whether troop redeployments toward South Kordofan divert offensive capacity away from North Kordofan"
        ],
        "new_information": [
            "Commercial transport reports localized drone interdictions on the Kosti-El Obeid logistical axis"
        ]
    }
    db.add(Question(
        id="Q001",
        risk_id="R1049",
        alert_id=q1_alert,
        text="By 30 November 2026, will armed group assaults cut off primary humanitarian supply corridors into Al Obeid, North Kordofan for more than 14 consecutive days?",
        resolution_criteria="Trigger T0634: Sustained interdiction or blockade of transit corridors connecting Kosti/Bara to Al Obeid for more than 14 consecutive days.",
        deadline=date(2026, 11, 30),
        status="open",
        delphi_round=2,
        outcome=None,
        themes=json.dumps(themes_q1),
    ))

    for letter in "abcdef":
        db.add(Invite(
            token=f"invite-q001-{letter}",
            question_id="Q001",
            expert_id=f"expert-{letter}",
        ))

    # Round 1 answers for Q001 (all 6 experts completed Round 1; Stage 2 Delphi Consensus is active):
    q1_answers = [
        ("expert-a", 0.75, "Heavy troop concentrations near western access corridors; contacts report increasing interdictions on commercial transit."),
        ("expert-b", 0.70, "RSF units have held positions on the roads west of Al Obeid before; a new push from Bara or the west seems likely before the rains."),
        ("expert-c", 0.55, "SAF retook Bara in March, which widens the buffer north of Al Obeid. A full encirclement is harder now, but road attacks are still plausible."),
        ("expert-d", 0.80, "Drone strikes and attacks on the El Obeid-Kosti road suggest the RSF is testing supply routes again. Interdiction of one route would count."),
        ("expert-e", 0.45, "Fighting has shifted to South Kordofan and Darfur. The RSF may lack the forces to besiege Al Obeid again within six months."),
        ("expert-f", 0.65, "Traders report fuel and market shortages in Al Obeid, an early sign that access routes are being squeezed."),
    ]
    for exp_id, prob, rsn in q1_answers:
        letter = exp_id.split("-")[1]
        db.add(Response(
            question_id="Q001",
            expert_id=exp_id,
            probability=prob,
            reason=rsn,
            round=1,
            anonymity_level=LEVELS[letter],
            pseudonym=f"Analyst {letter.upper()}",
        ))

    # Round 2 finalised responses for Q001 (Experts B and C finalised; Expert A is open to test):
    q1_revisions = [
        ("expert-b", 0.70, "Maintained at 70%. Peer consensus at 68% aligns with my assessment; troop deployments along western axes remain active."),
        ("expert-c", 0.60, "Adjusted upward from 55% to 60%. While SAF control of Bara provides a northern buffer, peer reports of market fuel shortages and drone interdictions indicate supply disruption is more probable."),
    ]
    for exp_id, prob, rsn in q1_revisions:
        letter = exp_id.split("-")[1]
        db.add(Response(
            question_id="Q001",
            expert_id=exp_id,
            probability=prob,
            reason=rsn,
            round=2,
            anonymity_level=LEVELS[letter],
            pseudonym=f"Analyst {letter.upper()}",
        ))

    # --- OPEN QUESTION 2 (STAGE 1: Single-Expert Elicitation & Delphi Transition Test) ---
    # Risk R1048 (Sudan - Blue Nile State)
    # Exactly 1 regional expert invited (Expert A) to test the 80% Delphi progression:
    # Round 1 submission -> auto-advance to Round 2 (1/1 >= 80%) -> Round 2 submission -> auto-close (1/1 >= 80%)
    db.add(Question(
        id="Q002",
        risk_id="R1048",
        alert_id=None,
        text="By 15 December 2026, will conflict expansion in Blue Nile state trigger verified displacement exceeding 50,000 individuals and halt humanitarian transit along the Sennar-Damazine corridor?",
        resolution_criteria="Verified displacement exceeding 50,000 individuals reported by OCHA/IOM and suspension of aid convoys along the Sennar-Damazine corridor for more than 10 consecutive days.",
        deadline=date(2026, 12, 15),
        status="open",
        delphi_round=1,
        outcome=None,
        themes=None,
    ))

    db.add(Invite(
        token="invite-q002-a",
        question_id="Q002",
        expert_id="expert-a",
    ))

    # --- OPEN QUESTION 3 (STAGE 1: Single-Expert Elicitation & Delphi Transition Test) ---
    # Risk R1053 (Sudan - Eastern Supply Corridor / Port Sudan)
    # Exactly 1 regional expert invited (Expert A) to test the 80% Delphi progression:
    # Round 1 submission -> auto-advance to Round 2 (1/1 >= 80%) -> Round 2 submission -> auto-close (1/1 >= 80%)
    db.add(Question(
        id="Q003",
        risk_id="R1053",
        alert_id=None,
        text="By 31 January 2027, will long-range drone strikes or interdictions on the eastern supply corridor disrupt Port Sudan terminal operations or fuel distribution for more than 7 consecutive days?",
        resolution_criteria="Trigger T0643: Verified disruption of port terminal operations, fuel depot closures, or convoy route halts exceeding 7 consecutive days reported by port authorities, UN OCHA, or verified maritime alerts.",
        deadline=date(2027, 1, 31),
        status="open",
        delphi_round=1,
        outcome=None,
        themes=None,
    ))

    db.add(Invite(
        token="invite-q003-a",
        question_id="Q003",
        expert_id="expert-a",
    ))

    db.commit()
    db.close()
    print(f"Seeded {len(df)} risks, 6 experts, {len(alerts)} alerts, and practice questions H001-H008.")
    print("Seeded open test questions:")
    print("  - Q001: OPEN in Stage 2 (Delphi Consensus Round) with 6 peer Round 1 answers & synthesized themes")
    print("  - Q002: OPEN in Stage 1 (Initial Independent Assessment Round) awaiting Expert A's initial response")
    print("  - Q003: OPEN in Stage 1 (Initial Independent Assessment Round) for single-expert Delphi test")


def is_empty() -> bool:
    """True when there is no risks table yet, or it has no rows (a brand-new database)."""
    from sqlalchemy import func, inspect, select

    if not inspect(engine).has_table(Risk.__tablename__):
        return True
    with SessionLocal() as db:
        return not db.scalar(select(func.count()).select_from(Risk))


if __name__ == "__main__":
    import sys

    # --if-empty: seed only a brand-new database (used on container start, keeps real data)
    if "--if-empty" in sys.argv[1:] and not is_empty():
        print("Database already has data: not seeding.")
    else:
        seed()