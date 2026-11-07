"""
Turns the ML alerts file (data/processed/alerts.json) into Alert rows.
Used by the moderator import route and by the demo seed, so both validate the same way.
"""
from pydantic import ValidationError
from sqlalchemy.orm import Session

from ..models import Alert, Risk
from ..schemas import AlertImport

# The ML pipeline writes its prompt version (e.g. "llm_v5") as the source; show where the report came from instead
ACCESS_EVENTS_SOURCE = "ACAPS humanitarian access events (scored by LLM)"


def source_label(source: str | None) -> str | None:
    if source and source.startswith("llm_"):
        return ACCESS_EVENTS_SOURCE
    return source


def import_alert_items(db: Session, items: list) -> tuple[list[Alert], list[dict]]:
    """Adds valid, new alerts as pending. Returns (added alerts, skipped items with reasons)."""
    added = []
    skipped = []
    seen = set()

    for item in items:
        try:
            alert = AlertImport.model_validate(item)
        except ValidationError:
            item_id = item.get("id") if isinstance(item, dict) else None
            skipped.append({"id": item_id, "reason": "Invalid or missing fields"})
            continue

        if alert.id in seen or db.get(Alert, alert.id):
            skipped.append({"id": alert.id, "reason": "Already exists"})
            continue
        if db.get(Risk, alert.risk_id) is None:
            skipped.append({"id": alert.id, "reason": "Unknown risk"})
            continue

        fields = alert.model_dump()
        fields["report_source"] = source_label(fields["report_source"])
        row = Alert(**fields, status="pending")
        db.add(row)
        added.append(row)
        seen.add(alert.id)

    return added, skipped
