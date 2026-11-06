import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Mock API for Tripwire. This is a temporary solution until the real API is available.

CONTRACTS = Path(__file__).resolve().parents[2] / "contracts"

app = FastAPI(title="Data Peaks API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_sample(name: str):
    path = CONTRACTS / f"{name}.json"
    if not path.exists():
        raise HTTPException(status_code=500, detail=f"Missing {path.name}")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/alerts")
def list_alerts():
    return [load_sample("alert")]


@app.post("/alerts/{alert_id}/decision")
def decide_alert(alert_id: str, decision: dict):
    return {"alert_id": alert_id, "status": decision.get("status", "approved")}


@app.get("/risks/ranked")
def ranked_risks():
    return [load_sample("ranked_risk")]


@app.get("/risks/{risk_id}")
def get_risk(risk_id: str):
    return load_sample("risk")


@app.get("/risks/{risk_id}/similar")
def similar_risks(risk_id: str):
    return [load_sample("similar_risk")]


@app.get("/questions/{question_id}")
def get_question(question_id: str):
    return load_sample("question")


@app.post("/questions/{question_id}/responses")
def submit_response(question_id: str, response: dict):
    return {"question_id": question_id, "status": "received"}


@app.get("/questions/{question_id}/group")
def group_view(question_id: str):
    return load_sample("group_view")