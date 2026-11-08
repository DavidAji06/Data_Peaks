"""Turn the ML team's scored access events into the files the API reads.

Settings (environment variables): MIN_ALERT_IMPACT (default 4) and MAX_ALERTS_PER_RISK (default 3).
"""
import json
import os
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ml.pipeline.region_match import region_match, trigger_text  # noqa: E402

PROCESSED = ROOT / "data" / "processed"
EVENTS = PROCESSED / "access_events_scored_v7.csv"
RISKS = ROOT / "data" / "risk-radar-export.csv"

RECENT_DAYS = 180         # Many countries report quarterly, so 90 days misses them
MIN_ALERT_IMPACT = int(os.getenv("MIN_ALERT_IMPACT", "4"))        # Only high-impact events become alerts
MAX_ALERTS_PER_RISK = int(os.getenv("MAX_ALERTS_PER_RISK", "3"))
SCALE = 5                 # Impact scores run from 1 to 5
# Priority uses only ACAPS's own ratings and track record, so every number on a card traces back to ACAPS.
# Experts help most where the outcome is a toss-up and the stakes are high.
WEIGHTS = {"uncertainty": 0.5, "impact": 0.5}


def isos(value) -> set[str]:
    return {code.strip().upper() for code in str(value).split(",") if code.strip()}


def observed_history(risks: pd.DataFrame) -> dict[str, tuple[int, int]]:
    """How many past risks with each ACAPS probability rating materialised: (happened, resolved)."""
    resolved = risks[risks["Status"].isin(["Materialised", "Not materialised"])]
    happened = resolved["Status"] == "Materialised"
    counts = happened.groupby(resolved["Probability"]).agg(["sum", "count"])
    print("Past outcomes by ACAPS probability rating (happened, resolved):")
    print(counts.to_string(), "\n")
    history = {rating: (int(row["sum"]), int(row["count"])) for rating, row in counts.iterrows()}
    return {**history, "_overall": (int(happened.sum()), int(len(happened)))}


def optional_int(value):
    return None if pd.isna(value) else int(value)


def alert_from_event(risk, event, risk_text: str) -> dict:
    """One alerts.json item: the event, its LLM scores and the region-match heuristic."""
    description = str(event["description"])
    matched, place = region_match(description, risk_text)
    return {
        "id": f"A-{risk['Risk ID']}-{event['event_id']}",
        "risk_id": risk["Risk ID"],
        "trigger_id": None,  # Trigger matching not built yet: never claim a trigger fired
        "report_title": description[:140] + ("..." if len(description) > 140 else ""),
        "report_source": None if pd.isna(event["source"]) else str(event["source"]),
        "report_url": None,
        "published_at": event["date"].date().isoformat(),
        "direction": "escalating",
        "strength": round(min(float(event["impact_score"]) / SCALE, 1.0), 2),
        "evidence": None if pd.isna(event["brief_reasoning"]) else str(event["brief_reasoning"]),
        "country": None if pd.isna(event.get("country")) else str(event["country"]),
        "iso3": str(event["iso3"]),
        "impact_score": optional_int(event["impact_score"]),
        "intensity_score": optional_int(event.get("intensity_score")),
        "exposure_score": optional_int(event.get("exposure_score")),
        "description": description,
        "region_match": matched,  # Heuristic place-name match (ml/pipeline/region_match.py)
        "matched_place": place,
    }


def main():
    events = pd.read_csv(EVENTS, parse_dates=["date"])
    events = events.dropna(subset=["date", "impact_score", "iso3"])
    events["iso3"] = events["iso3"].str.upper()
    print("Impact scores in the events file:")
    print(events["impact_score"].describe().round(2).to_string(), "\n")

    latest = events["date"].max()
    recent = events[events["date"] >= latest - pd.Timedelta(days=RECENT_DAYS)]
    print(f"{len(recent)} events in the {RECENT_DAYS} days up to {latest.date()}\n")

    risks = pd.read_csv(RISKS)
    history = observed_history(risks)
    active = risks[risks["Status"] == "Active"]

    candidates, ranked = [], []
    for _, risk in active.iterrows():
        matches = recent[recent["iso3"].isin(isos(risk["ISO"]))]
        # One report can appear once per access indicator, so count each report once
        matches = matches.drop_duplicates(subset=["date", "description"])

        happened, resolved = history.get(risk["Probability"], history["_overall"])
        p = happened / resolved
        uncertainty = round(4 * p * (1 - p), 2)  # 1 at 50%, 0 at 0% or 100%
        impact = round(float(risk["Impact"]) / SCALE, 2) if pd.notna(risk["Impact"]) else 0.5

        breakdown = {"uncertainty": uncertainty, "impact": impact}
        priority = round(sum(WEIGHTS[key] * breakdown[key] for key in WEIGHTS), 2)

        ranked.append({
            "risk_id": risk["Risk ID"],
            "title": risk["Risk Title"],
            "country": risk["Country"],
            "risk_level": None if pd.isna(risk["Risk Level"]) else str(risk["Risk Level"]),
            "acaps_probability": None if pd.isna(risk["Probability"]) else str(risk["Probability"]),
            "p_materialise": round(p, 2),
            "history": {"happened": happened, "resolved": resolved},
            "priority_score": priority,
            "score_breakdown": breakdown,
        })

        # Risk title plus trigger titles and descriptions, for the region-match heuristic
        risk_text = f"{risk['Risk Title']} {trigger_text(risk['Triggers'])}"
        strong = [
            alert_from_event(risk, event, risk_text)
            for _, event in matches[matches["impact_score"] >= MIN_ALERT_IMPACT].iterrows()
        ]
        # Highest impact first; a region match breaks ties, then the newest report
        strong.sort(key=lambda a: (a["impact_score"], a["region_match"], a["published_at"]), reverse=True)
        for alert in strong[:MAX_ALERTS_PER_RISK]:
            candidates.append((priority, alert["id"].rsplit("-", 1)[1], alert))

    # Each report appears once, under the highest-priority risk it matches
    candidates.sort(key=lambda candidate: candidate[0], reverse=True)
    seen_events, alerts = set(), []
    for _, event_id, alert in candidates:
        if event_id not in seen_events:
            seen_events.add(event_id)
            alerts.append(alert)

    ranked.sort(key=lambda row: (row["priority_score"], row["score_breakdown"]["impact"]), reverse=True)

    (PROCESSED / "ranked_risks.json").write_text(json.dumps(ranked, indent=2), encoding="utf-8")
    (PROCESSED / "alerts.json").write_text(json.dumps(alerts, indent=2), encoding="utf-8")
    print(f"Wrote {len(ranked)} ranked risks and {len(alerts)} alerts "
          f"({sum(a['region_match'] for a in alerts)} with a region match)")
    print("Top 5:", [(r["risk_id"], r["priority_score"]) for r in ranked[:5]])


if __name__ == "__main__":
    main()