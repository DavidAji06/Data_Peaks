"""Turn the ML team's scored access events into the files the API reads."""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
EVENTS = PROCESSED / "access_events_scored_v7.csv"
RISKS = ROOT / "data" / "risk-radar-export.csv"

RECENT_DAYS = 180         # Many countries report quarterly, so 90 days misses them
MIN_ALERT_IMPACT = 4      # Only high-impact events become alerts
MAX_ALERTS_PER_RISK = 3
SCALE = 5                 # Impact scores run from 1 to 5
WEIGHTS = {"signal_strength": 0.4, "uncertainty": 0.3, "impact": 0.3}


def isos(value) -> set[str]:
    return {code.strip().upper() for code in str(value).split(",") if code.strip()}


def observed_rates(risks: pd.DataFrame) -> dict[str, float]:
    """How often each ACAPS probability rating actually materialised."""
    resolved = risks[risks["Status"].isin(["Materialised", "Not materialised"])]
    happened = resolved["Status"] == "Materialised"
    rates = happened.groupby(resolved["Probability"]).mean()
    overall = happened.mean()
    print("Observed materialisation rate by ACAPS rating:")
    print(rates.round(2).to_string(), f"\n(overall {overall:.2f})\n")
    return {**rates.to_dict(), "_overall": overall}


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
    rates = observed_rates(risks)
    active = risks[risks["Status"] == "Active"]

    candidates, ranked = [], []
    for _, risk in active.iterrows():
        matches = recent[recent["iso3"].isin(isos(risk["ISO"]))]
        # One report can appear once per access indicator, so count each report once
        matches = matches.drop_duplicates(subset=["date", "description"])

        # Signal: average impact of recent events in the risk's countries, scaled 0-1
        signal = round(float(matches["impact_score"].mean()) / SCALE, 2) if len(matches) else 0.0

        p = float(rates.get(risk["Probability"], rates["_overall"]))
        uncertainty = round(4 * p * (1 - p), 2)  # 1 at 50%, 0 at 0% or 100%
        impact = round(float(risk["Impact"]) / SCALE, 2) if pd.notna(risk["Impact"]) else 0.5

        breakdown = {"signal_strength": signal, "uncertainty": uncertainty, "impact": impact}
        priority = round(sum(WEIGHTS[key] * breakdown[key] for key in WEIGHTS), 2)

        ranked.append({
            "risk_id": risk["Risk ID"],
            "title": risk["Risk Title"],
            "country": risk["Country"],
            "p_materialise": round(p, 2),
            "priority_score": priority,
            "score_breakdown": {**breakdown, "review_age": None},  # Not computed yet
        })

        strong = (
            matches[matches["impact_score"] >= MIN_ALERT_IMPACT]
            .sort_values(["impact_score", "date"], ascending=False)
            .head(MAX_ALERTS_PER_RISK)
        )
        for _, event in strong.iterrows():
            description = str(event["description"])
            candidates.append((priority, event["event_id"], {
                "id": f"A-{risk['Risk ID']}-{event['event_id']}",
                "risk_id": risk["Risk ID"],
                "trigger_id": None,  # Trigger matching not built yet
                "report_title": description[:140] + ("..." if len(description) > 140 else ""),
                "report_source": None if pd.isna(event["source"]) else str(event["source"]),
                "report_url": None,
                "published_at": event["date"].date().isoformat(),
                "direction": "escalating",
                "strength": round(min(float(event["impact_score"]) / SCALE, 1.0), 2),
                "evidence": None if pd.isna(event["brief_reasoning"]) else str(event["brief_reasoning"]),
            }))

    # Each report appears once, under the highest-priority risk it matches
    candidates.sort(key=lambda candidate: candidate[0], reverse=True)
    seen_events, alerts = set(), []
    for _, event_id, alert in candidates:
        if event_id not in seen_events:
            seen_events.add(event_id)
            alerts.append(alert)

    ranked.sort(key=lambda row: row["priority_score"], reverse=True)

    (PROCESSED / "ranked_risks.json").write_text(json.dumps(ranked, indent=2), encoding="utf-8")
    (PROCESSED / "alerts.json").write_text(json.dumps(alerts, indent=2), encoding="utf-8")
    print(f"Wrote {len(ranked)} ranked risks and {len(alerts)} alerts")
    print("Top 5:", [(r["risk_id"], r["priority_score"]) for r in ranked[:5]])


if __name__ == "__main__":
    main()