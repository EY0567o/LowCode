from __future__ import annotations
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import urllib.request
import json

N8N_WEBHOOK_URL = "https://fast-automation.de/webhook/0d467980-64c6-45ed-9054-7f911ceaffcc"

from models import ApplicationInput
from utils import now_iso, build_inquiry_id
from logic import build_website_payload, map_website_json_to_internal_model
from state import (
    STATE, sync_global_logs, bootstrap_payload, get_record_or_404, append_log
)
from actions import (
    run_scoring, run_rate_calculation, send_to_teamlead, team_approve,
    team_reject, generate_offer, send_signature, customer_sign, send_mail
)
from seeds import create_seed_applications

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"
APP_TITLE = "MFLB Kreditprozess Demo"

app = FastAPI(title=APP_TITLE, docs_url="/docs", redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def serve_index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/styles.css")
def serve_styles() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "styles.css")


@app.get("/script.js")
def serve_script() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "script.js")


@app.get("/api/bootstrap")
def api_bootstrap() -> dict[str, Any]:
    return bootstrap_payload()


def trigger_n8n_webhook(data: dict[str, Any]) -> None:
    if not N8N_WEBHOOK_URL or N8N_WEBHOOK_URL == "HIER_DEINE_N8N_WEBHOOK_URL_EINTRAGEN":
        return
    try:
        req = urllib.request.Request(
            N8N_WEBHOOK_URL,
            data=json.dumps(data).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req) as response:
            pass
    except Exception as e:
        print(f"Error triggering n8n webhook: {e}")


@app.post("/api/applications")
def api_create_application(payload: ApplicationInput, background_tasks: BackgroundTasks) -> dict[str, Any]:
    STATE["sequence"] += 1
    created_at = now_iso()
    inquiry_id = build_inquiry_id(STATE["sequence"], created_at)
    website_payload = build_website_payload(payload, created_at, inquiry_id)
    record = map_website_json_to_internal_model(
        website_payload,
        f"case-{STATE['sequence']}",
        inquiry_id,
        created_at,
        payload.model_dump(),
    )
    append_log(record, "Website", "Neuer Online-Antrag wurde als JSON aus der Website übernommen.")
    STATE["applications"].insert(0, record)
    sync_global_logs()

    # n8n Trigger in den BackgroundTasks ausführen
    background_tasks.add_task(trigger_n8n_webhook, record)

    return bootstrap_payload()


@app.post("/api/applications/{record_id}/actions/{action}")
def api_record_action(record_id: str, action: str) -> dict[str, Any]:
    record = get_record_or_404(record_id)

    actions = {
        "run_scoring": lambda: run_scoring(record),
        "run_rate": lambda: run_rate_calculation(record),
        "send_teamlead": lambda: send_to_teamlead(record),
        "team_approve": lambda: team_approve(record),
        "team_reject": lambda: team_reject(record),
        "generate_offer": lambda: generate_offer(record),
        "send_signature": lambda: send_signature(record),
        "customer_sign": lambda: customer_sign(record),
        "send_mail": lambda: send_mail(record),
    }

    if action not in actions:
        raise HTTPException(status_code=404, detail="Aktion ist nicht bekannt.")

    actions[action]()
    sync_global_logs()
    return bootstrap_payload()


@app.get("/api/health")
def api_health() -> dict[str, str]:
    return {"status": "ok"}


def initialize_state() -> None:
    STATE["applications"] = create_seed_applications()
    STATE["sequence"] = len(STATE["applications"])
    sync_global_logs()


initialize_state()
