from typing import Any
from copy import deepcopy
from fastapi import HTTPException
from utils import now_iso

STATE: dict[str, Any] = {
    "sequence": 0,
    "applications": [],
    "logs": [],
}

def append_log(
    record: dict[str, Any],
    interface_name: str,
    message: str,
    status: str = "OK",
    level: str = "info",
) -> None:
    entry = {
        "id": f"{record['id']}-{interface_name}-{len(record['logs']) + 1}",
        "recordId": record["id"],
        "inquiryId": record["inquiryId"],
        "interfaceName": interface_name,
        "message": message,
        "status": status,
        "level": level,
        "timestamp": now_iso(),
    }
    record["logs"].insert(0, entry)
    record["logs"] = record["logs"][:12]


def sync_global_logs() -> None:
    all_logs: list[dict[str, Any]] = []
    for record in STATE["applications"]:
        all_logs.extend(record["logs"])
    STATE["logs"] = sorted(all_logs, key=lambda item: item["timestamp"], reverse=True)[:30]


def bootstrap_payload() -> dict[str, Any]:
    return {
        "applications": deepcopy(STATE["applications"]),
        "logs": deepcopy(STATE["logs"]),
    }


def get_record_or_404(record_id: str) -> dict[str, Any]:
    for record in STATE["applications"]:
        if record["id"] == record_id:
            return record
    raise HTTPException(status_code=404, detail="Fall wurde nicht gefunden.")
