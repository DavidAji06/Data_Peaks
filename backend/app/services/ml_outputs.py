import json
import sys
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


def similar_risks(risk_id: str) -> list:
    data = read_json(PROCESSED / "similar_risks.json")
    if isinstance(data, dict):
        return data.get(risk_id, [])[:3]
    return sample("similar_risk")


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