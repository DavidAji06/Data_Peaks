import json
import re
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PROCESSED = ROOT / "data" / "processed"
CONTRACTS = ROOT / "contracts"
THEME_KEYS = ("agreement", "disagreement", "new_information")


def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def sample(name: str) -> list:
    data = read_json(CONTRACTS / f"{name}.json")
    return [data] if data else []


def ranked_risks() -> list:
    data = read_json(PROCESSED / "ranked_risks.json")
    return data if isinstance(data, list) else sample("ranked_risk")


RISK_RADAR_CSV = ROOT / "data" / "risk-radar-export.csv"
URL = re.compile(r"https?://[^\s)\]]+")


@lru_cache(maxsize=1)
def past_case_details() -> dict:
    """Full 'what happened' text and source links per risk, from the Risk Radar CSV."""
    import pandas as pd

    try:
        df = pd.read_csv(RISK_RADAR_CSV)
    except FileNotFoundError:
        return {}

    def text(value):
        return "" if pd.isna(value) else str(value).strip()

    details = {}
    for _, row in df.iterrows():
        full = text(row.get("Impact materialisation description")) or text(row.get("Hazard materialisation"))
        urls = list(dict.fromkeys(URL.findall(text(row.get("Materialisation sources")))))
        details[str(row["Risk ID"])] = {
            "what_happened_full": full,
            "sources": urls,
            "evolution": {
                "trend": text(row.get("Risk trend")),
                "what_materialised": text(row.get("What materialised?")),
                "hazard_materialisation": text(row.get("Hazard materialisation")),
                "impact_materialisation": text(row.get("Impact materialisation description")),
                "rationale_update": text(row.get("Rationale update")),
            },
        }
    return details


def similar_risks(risk_id: str) -> list:
    data = read_json(PROCESSED / "similar_risks.json")
    if not isinstance(data, dict):
        return sample("similar_risk")
    details = past_case_details()
    return [
        {**details.get(str(match.get("risk_id")), {"what_happened_full": "", "sources": [], "evolution": {}}), **match}
        for match in data.get(risk_id, [])[:3]
    ]


def alerts_from_file() -> list:
    data = read_json(PROCESSED / "alerts.json")
    return data if isinstance(data, list) else []


def empty_themes() -> dict:
    return {key: [] for key in THEME_KEYS}


def stored_themes(question) -> dict:
    if question is None or not question.themes:
        return empty_themes()
    try:
        return json.loads(question.themes)
    except json.JSONDecodeError:
        return empty_themes()


def summarise_reasons(reasons: list[str]) -> dict:
    if not reasons:
        return empty_themes()
    try:
        if str(ROOT) not in sys.path:
            sys.path.append(str(ROOT))
        from ml.pipeline.llm import summarise_reasons as ml_summarise
        result = ml_summarise(reasons)
    except Exception as error:  # Missing, unfinished or failing ML code
        print(f"[ml] Theme summary unavailable: {error}")
        return empty_themes()

    if not isinstance(result, dict):
        return empty_themes()
    return {
        key: [str(point) for point in result.get(key, [])][:3]
        if isinstance(result.get(key), list) else []
        for key in THEME_KEYS
    }