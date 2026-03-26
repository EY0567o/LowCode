from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta
from math import pow
from pathlib import Path
from typing import Any
import xml.etree.ElementTree as ET

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
APP_TITLE = "MFLB Kreditprozess Demo"

app = FastAPI(title=APP_TITLE, docs_url="/docs", redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ApplicationInput(BaseModel):
    firstName: str = Field(min_length=1)
    lastName: str = Field(min_length=1)
    email: str = Field(min_length=1)
    address: str = Field(min_length=1)
    postalCode: str = Field(min_length=1)
    city: str = Field(min_length=1)
    employer: str = Field(min_length=1)
    employerVatId: str = ""
    monthlyNetIncome: float = Field(gt=0)
    employedSince: str = Field(min_length=1)
    iban: str = Field(min_length=1)
    loanType: str = Field(min_length=1)
    loanAmount: float = Field(gt=0)
    termMonths: int = Field(gt=0)
    purpose: str = Field(min_length=1)


STATE: dict[str, Any] = {
    "sequence": 0,
    "applications": [],
    "logs": [],
}


def now_iso() -> str:
    return datetime.now().replace(microsecond=0).isoformat()


def parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value)


def build_inquiry_id(sequence: int, created_at: str) -> str:
    date_value = parse_dt(created_at)
    return f"{date_value.year:04d}-{date_value.month:02d}-{date_value.day:02d}-{sequence:04d}"


def split_address(value: str) -> tuple[str, str]:
    compact = " ".join(str(value).split())
    if " " not in compact:
        return compact, ""
    street, house_number = compact.rsplit(" ", 1)
    return street, house_number


def format_contract_date(value: str) -> str:
    if not value:
        return ""
    if "." in value:
        return value
    return datetime.fromisoformat(value).strftime("%d.%m.%Y")


def parse_contract_date(value: str) -> str:
    if not value:
        return ""
    if "." in value:
        return datetime.strptime(value, "%d.%m.%Y").date().isoformat()
    return datetime.fromisoformat(value).date().isoformat()


def normalize_iban(value: str) -> str:
    return "".join(str(value).split())


def format_contract_iban(value: str) -> str:
    compact = normalize_iban(value)
    return " ".join(compact[index : index + 4] for index in range(0, len(compact), 4))


def resolve_loan_type(source_fields: dict[str, Any], loan_amount: float) -> str:
    if source_fields.get("loanType"):
        return str(source_fields["loanType"])
    if loan_amount >= 100000:
        return "Großkredit"
    return "Konsumentenkredit"


def months_since(date_string: str) -> int:
    start_date = datetime.fromisoformat(date_string)
    now = datetime(2026, 3, 25, 12, 0, 0)
    months = (now.year - start_date.year) * 12 + (now.month - start_date.month)
    return max(0, months)


def escape_xml(value: Any) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def requires_teamlead_approval(record: dict[str, Any]) -> bool:
    return float(record["loanAmount"]) >= 10000


def determine_department(record: dict[str, Any]) -> dict[str, Any]:
    loan_type = record["loanType"]
    loan_amount = float(record["loanAmount"])

    if loan_type == "Baufinanzierung" and loan_amount > 20000:
        return {
            "department": "Baufinanzierung",
            "routeMessage": "Baufinanzierungen werden fachlich angenommen, in die Spezialabteilung Baufinanzierung geroutet und als spätere Projektphase markiert.",
            "supportedInPhaseOne": False,
            "futurePhase": True,
            "invalidProductRange": False,
        }

    if loan_type == "Großkredit" or loan_amount >= 100000:
        return {
            "department": "Großkredite",
            "routeMessage": "Großkredite ab 100.000 € werden fachlich angenommen, in eine Spezialabteilung geroutet und als spätere Projektphase markiert.",
            "supportedInPhaseOne": False,
            "futurePhase": True,
            "invalidProductRange": False,
        }

    if loan_type == "Konsumentenkredit" and 5000 <= loan_amount <= 20000:
        return {
            "department": "Konsumentenkredite",
            "routeMessage": "Der Antrag liegt im Zielkorridor der ersten Projektphase und wird an die Abteilung Konsumentenkredite geroutet.",
            "supportedInPhaseOne": True,
            "futurePhase": False,
            "invalidProductRange": False,
        }

    if loan_type == "Konsumentenkredit" and 20000 < loan_amount < 100000:
        return {
            "department": "Produktgrenze / Rückfrage",
            "routeMessage": "Konsumentenkredite über 20.000 € und unter 100.000 € gibt es fachlich nicht. Der Antrag wird angenommen, aber als Produktgrenze markiert.",
            "supportedInPhaseOne": False,
            "futurePhase": False,
            "invalidProductRange": True,
        }

    if loan_type == "Konsumentenkredit" and loan_amount < 5000:
        return {
            "department": "Produktgrenze / Rückfrage",
            "routeMessage": "Konsumentenkredite unter 5.000 € liegen außerhalb des definierten Produktkorridors. Der Antrag wird angenommen, aber fachlich markiert.",
            "supportedInPhaseOne": False,
            "futurePhase": False,
            "invalidProductRange": True,
        }

    if loan_type == "Baufinanzierung":
        return {
            "department": "Baufinanzierung / Rückfrage",
            "routeMessage": "Baufinanzierungen beginnen fachlich erst oberhalb von 20.000 €. Der Antrag wird angenommen, aber als Produktgrenze markiert.",
            "supportedInPhaseOne": False,
            "futurePhase": False,
            "invalidProductRange": True,
        }

    if loan_type == "Großkredit":
        return {
            "department": "Großkredit / Rückfrage",
            "routeMessage": "Großkredite beginnen fachlich erst ab 100.000 €. Der Antrag wird angenommen, aber als Produktgrenze markiert.",
            "supportedInPhaseOne": False,
            "futurePhase": False,
            "invalidProductRange": True,
        }

    return {
        "department": "Vorprüfung",
        "routeMessage": "Der Antrag liegt außerhalb des aktuell definierten Zielkorridors und muss fachlich geklärt werden.",
        "supportedInPhaseOne": False,
        "futurePhase": False,
        "invalidProductRange": True,
    }


def get_collateral_note(record: dict[str, Any]) -> str:
    if record["loanType"] == "Konsumentenkredit" and float(record["loanAmount"]) <= 20000:
        return "Keine Sicherheiten erforderlich."

    if record["loanType"] == "Baufinanzierung" or float(record["loanAmount"]) >= 100000:
        return "Sicherheiten-Workflow für spätere Projektphase vorgesehen."

    return "Sicherheiten-Handling wird für spätere Produktvarianten ergänzt."


def create_default_documents(record: dict[str, Any]) -> list[dict[str, str]]:
    collateral_status = (
        "Nicht erforderlich"
        if record["loanType"] == "Konsumentenkredit" and float(record["loanAmount"]) <= 20000
        else "Spätere Phase"
        if record["loanType"] == "Baufinanzierung" or float(record["loanAmount"]) >= 100000
        else "Ausstehend"
    )

    return [
        {
            "name": "Online-Antrag",
            "status": "Empfangen",
            "detail": "Website liefert ein vollständiges JSON-Objekt.",
        },
        {
            "name": "Identitätsnachweis",
            "status": "Vorhanden",
            "detail": "Pflichtdokument für die Vorprüfung.",
        },
        {
            "name": "Einkommensnachweis",
            "status": "Vorhanden",
            "detail": "Pflichtdokument für die Bonitätsprüfung.",
        },
        {
            "name": "Sicherheiten",
            "status": collateral_status,
            "detail": get_collateral_note(record),
        },
        {
            "name": "Angebotsdokument",
            "status": "Nicht gestartet",
            "detail": "Wird nach erfolgreicher Konditionsberechnung erzeugt.",
        },
        {
            "name": "Signaturprotokoll",
            "status": "Nicht gestartet",
            "detail": "Wird nach der Signaturstrecke aktualisiert.",
        },
    ]


def set_document_status(record: dict[str, Any], name: str, status: str, detail: str) -> None:
    for document in record["documents"]:
        if document["name"] == name:
            document["status"] = status
            document["detail"] = detail
            return

    record["documents"].append({"name": name, "status": status, "detail": detail})


def compute_overall_status(record: dict[str, Any]) -> str:
    if record["teamleadDecision"] == "Abgelehnt":
        return "Abgelehnt"

    if record["integration"]["errorMessage"]:
        return "Fehler"

    if record["invalidProductRange"] or record["teamleadDecision"] == "Rückfrage":
        return "Rückfrage"

    if record["archiveStatus"] == "Archiviert" or record["mailStatus"] == "Versendet":
        return "Abgeschlossen"

    if record["signatureStatus"] in {"Zur Signatur gesendet", "Signiert"}:
        return "Signatur"

    if (
        record["offerStatus"] == "Angebot erstellt"
        or record["documentStatus"] == "Dokument erstellt"
        or record["rateCalculationStatus"] == "Abgeschlossen"
    ):
        return "Angebot"

    if record["teamleadRequired"] and record["teamleadDecision"] == "Ausstehend":
        return "Teamleitung"

    if record["scoringStatus"] in {"Abgeschlossen", "In Bearbeitung"}:
        return "In Prüfung"

    if record["department"] != "Vorprüfung":
        return "Routing"

    return "Eingang"


def build_website_payload(payload: ApplicationInput, created_at: str | None = None, inquiry_id: str | None = None) -> dict[str, Any]:
    street, house_number = split_address(payload.address)
    return {
        "origin": "MFLB-Website LA",
        "version": "1.2.0",
        "loanapplication": {
            "vorname": payload.firstName,
            "nachname": payload.lastName,
            "strasse": street,
            "hausnummer": house_number,
            "plz": payload.postalCode,
            "ort": payload.city,
            "arbeitgeber": payload.employer,
            "arbeitgeberustid": payload.employerVatId,
            "beschaeftigt-seit": format_contract_date(payload.employedSince),
            "ibanhausbank": format_contract_iban(payload.iban),
            "kredithoehe": payload.loanAmount,
            "laufzeitmonate": payload.termMonths,
            "kreditzweck": payload.purpose,
        },
    }


def normalize_record(record: dict[str, Any]) -> dict[str, Any]:
    record.update(determine_department(record))
    record["teamleadRequired"] = requires_teamlead_approval(record)

    if record["teamleadRequired"]:
        if record["teamleadDecision"] == "Nicht erforderlich":
            record["teamleadDecision"] = "Nicht gestartet"
    else:
        record["teamleadDecision"] = "Nicht erforderlich"

    if not record["documents"]:
        record["documents"] = create_default_documents(record)

    set_document_status(
        record,
        "Sicherheiten",
        "Nicht erforderlich"
        if record["loanType"] == "Konsumentenkredit" and float(record["loanAmount"]) <= 20000
        else "Spätere Phase"
        if record["loanType"] == "Baufinanzierung" or float(record["loanAmount"]) >= 100000
        else "Ausstehend",
        get_collateral_note(record),
    )
    set_document_status(
        record,
        "Angebotsdokument",
        "Dokument erstellt" if record["documentStatus"] == "Dokument erstellt" else "Nicht gestartet",
        "Angebotsdokument wurde erzeugt."
        if record["documentStatus"] == "Dokument erstellt"
        else "Wird nach erfolgreicher Konditionsberechnung erzeugt.",
    )
    set_document_status(
        record,
        "Signaturprotokoll",
        "Signiert"
        if record["signatureStatus"] == "Signiert"
        else "Zur Signatur gesendet"
        if record["signatureStatus"] == "Zur Signatur gesendet"
        else "Nicht gestartet",
        "Digitale Signatur erfolgreich abgeschlossen."
        if record["signatureStatus"] == "Signiert"
        else "Vorgang liegt beim Signaturdienst."
        if record["signatureStatus"] == "Zur Signatur gesendet"
        else "Wird nach Dokumentenerstellung gefüllt.",
    )

    mandatory_docs = [
        document
        for document in record["documents"]
        if document["name"] in {"Identitätsnachweis", "Einkommensnachweis"}
    ]
    record["completenessStatus"] = (
        "Vollständig"
        if all(document["status"] == "Vorhanden" for document in mandatory_docs)
        else "Unvollständig"
    )

    record["integration"]["technicalStatus"] = (
        "Fehler"
        if record["integration"]["errorMessage"]
        else "Aktiv"
        if record["integration"]["scoringResponseXml"] or record["integration"]["rateResponseJson"]
        else "Bereit"
    )
    record["overallStatus"] = compute_overall_status(record)

    if record["overallStatus"] == "Abgeschlossen":
        record["currentOwner"] = "Archiv"
    elif record["overallStatus"] == "Teamleitung":
        record["currentOwner"] = "Teamleitung"
    else:
        record["currentOwner"] = "Sachbearbeitung"

    return record


def map_website_json_to_internal_model(
    payload: dict[str, Any],
    record_id: str,
    inquiry_id: str,
    created_at: str,
    source_fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    source = source_fields or {}
    application = payload["loanapplication"]
    street = application["strasse"]
    house_number = application["hausnummer"]
    loan_amount = float(application["kredithoehe"])

    record = {
        "id": record_id,
        "inquiryId": inquiry_id,
        "createdAt": created_at,
        "firstName": application["vorname"],
        "lastName": application["nachname"],
        "email": source.get("email") or "–",
        "street": street,
        "houseNumber": house_number,
        "address": " ".join(part for part in [street, house_number] if part).strip(),
        "postalCode": application["plz"],
        "city": application["ort"],
        "employer": application["arbeitgeber"],
        "employerVatId": application.get("arbeitgeberustid") or "–",
        "employedSince": parse_contract_date(application["beschaeftigt-seit"]),
        "monthlyNetIncome": float(source.get("monthlyNetIncome") or 0),
        "iban": normalize_iban(application["ibanhausbank"]),
        "loanType": resolve_loan_type(source, loan_amount),
        "loanAmount": loan_amount,
        "termMonths": int(application["laufzeitmonate"]),
        "purpose": application["kreditzweck"],
        "department": "Vorprüfung",
        "routeMessage": "",
        "supportedInPhaseOne": False,
        "futurePhase": False,
        "invalidProductRange": False,
        "documents": [],
        "completenessStatus": "Vollständig",
        "scoringStatus": "Nicht gestartet",
        "score": None,
        "riskClass": "–",
        "teamleadRequired": False,
        "teamleadDecision": "Nicht erforderlich",
        "rateCalculationStatus": "Nicht gestartet",
        "interestRate": None,
        "monthlyRate": None,
        "offerStatus": "Nicht gestartet",
        "documentStatus": "Nicht gestartet",
        "signatureStatus": "Nicht gestartet",
        "mailStatus": "Nicht gestartet",
        "archiveStatus": "Nicht gestartet",
        "overallStatus": "Eingang",
        "currentOwner": "Website",
        "logs": [],
        "integration": {
            "technicalStatus": "Bereit",
            "errorMessage": "",
            "websiteJson": payload,
            "scoringRequestXml": "",
            "scoringResponseXml": "",
            "rateRequestJson": None,
            "rateResponseJson": None,
        },
    }

    record["documents"] = create_default_documents(record)
    return normalize_record(record)


def calculate_mock_score(record: dict[str, Any]) -> int:
    employment_factor = min(15, months_since(record["employedSince"]) / 24)
    income_factor = min(20, float(record["monthlyNetIncome"]) / 250)
    amount_penalty = min(15, float(record["loanAmount"]) / 3000)
    term_penalty = min(10, int(record["termMonths"]) / 24)
    vat_bonus = 4 if record["employerVatId"] != "–" else 0
    iban_bonus = 3 if str(record["iban"]).startswith("DE") else 0
    raw_score = 55 + employment_factor + income_factor + vat_bonus + iban_bonus - amount_penalty - term_penalty
    return max(1, min(100, round(raw_score)))


def risk_class(score: int) -> str:
    if score >= 85:
        return "A"
    if score >= 70:
        return "B"
    if score >= 55:
        return "C"
    return "D"


def map_internal_model_to_scoring_xml(record: dict[str, Any]) -> str:
    lines = [
        "<ScoringRequest>",
        f"  <AnfrageID>{escape_xml(record['inquiryId'])}</AnfrageID>",
        f"  <Vorname>{escape_xml(record['firstName'])}</Vorname>",
        f"  <Nachname>{escape_xml(record['lastName'])}</Nachname>",
        f"  <Strasse>{escape_xml(record.get('street') or split_address(record['address'])[0])}</Strasse>",
        f"  <Hausnummer>{escape_xml(record.get('houseNumber') or split_address(record['address'])[1])}</Hausnummer>",
        f"  <PLZ>{escape_xml(record['postalCode'])}</PLZ>",
        f"  <Ort>{escape_xml(record['city'])}</Ort>",
        f"  <Arbeitgeber>{escape_xml(record['employer'])}</Arbeitgeber>",
        f"  <ArbeitgeberUstID>{escape_xml(record['employerVatId'])}</ArbeitgeberUstID>",
        f"  <BeschaeftigtSeit>{escape_xml(format_contract_date(record['employedSince']))}</BeschaeftigtSeit>",
        f"  <IBANHausbank>{escape_xml(format_contract_iban(record['iban']))}</IBANHausbank>",
        "</ScoringRequest>",
    ]
    return "\n".join(lines)


def create_mock_scoring_xml_response(record: dict[str, Any]) -> str:
    score = calculate_mock_score(record)
    lines = [
        "<ScoringResponse>",
        f"  <AnfrageID>{escape_xml(record['inquiryId'])}</AnfrageID>",
        f"  <Vorname>{escape_xml(record['firstName'])}</Vorname>",
        f"  <Nachname>{escape_xml(record['lastName'])}</Nachname>",
        f"  <Score>{score}</Score>",
        "</ScoringResponse>",
    ]
    return "\n".join(lines)


def parse_scoring_xml_response(xml_response: str) -> dict[str, Any]:
    root = ET.fromstring(xml_response)
    score = int(root.findtext("Score", "0"))
    return {
        "score": score,
        "riskClass": risk_class(score),
        "firstName": root.findtext("Vorname", ""),
        "lastName": root.findtext("Nachname", ""),
        "inquiryId": root.findtext("AnfrageID", ""),
    }


def map_internal_model_to_rate_calculator_payload(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "target": "MFLB-RateCalculator",
        "version": "2.5.0",
        "loanapplication": {
            "name": record["firstName"],
            "surname": record["lastName"],
            "street": record.get("street") or split_address(record["address"])[0],
            "adress1": record.get("houseNumber") or split_address(record["address"])[1],
            "postalcode": record["postalCode"],
            "adress2": record["city"],
            "loan_amount": record["loanAmount"],
            "term_in_months": record["termMonths"],
            "collaterals": not (
                record["loanType"] == "Konsumentenkredit" and float(record["loanAmount"]) <= 20000
            ),
            "rate": 0,
        },
    }


def calculate_annuity(principal: float, annual_rate_percent: float, months: int) -> float:
    monthly_rate = annual_rate_percent / 100 / 12
    if monthly_rate == 0:
        return principal / max(1, months)
    return (principal * monthly_rate) / (1 - pow(1 + monthly_rate, -max(1, months)))


def mock_rate_calculator_service(payload: dict[str, Any], risk_class_code: str) -> tuple[dict[str, Any], float]:
    risk_markup = {"A": 0.35, "B": 0.65, "C": 1.1, "D": 1.65}
    base_rate = 4.05
    amount_factor = min(0.7, float(payload["loanapplication"]["loan_amount"]) / 25000)
    duration_factor = min(0.5, int(payload["loanapplication"]["term_in_months"]) / 120)
    risk_factor = risk_markup.get(risk_class_code, 1.25)
    annual_interest_rate = round(base_rate + amount_factor + duration_factor + risk_factor, 1)
    monthly_installment = round(
        calculate_annuity(
            float(payload["loanapplication"]["loan_amount"]),
            annual_interest_rate,
            int(payload["loanapplication"]["term_in_months"]),
        ),
        2,
    )
    response = deepcopy(payload)
    response["loanapplication"]["rate"] = monthly_installment
    return response, annual_interest_rate


def apply_rate_calculator_response(record: dict[str, Any], response: dict[str, Any], annual_interest_rate: float) -> None:
    record["rateCalculationStatus"] = "Abgeschlossen"
    record["interestRate"] = annual_interest_rate
    record["monthlyRate"] = response["loanapplication"]["rate"]
    normalize_record(record)


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


def run_scoring(record: dict[str, Any], force_error: bool = False) -> None:
    if not record["supportedInPhaseOne"] or record["invalidProductRange"]:
        raise HTTPException(status_code=400, detail="Scoring ist für diesen Produkttyp in Phase 1 nicht vorgesehen.")

    record["scoringStatus"] = "In Bearbeitung"
    record["integration"]["scoringRequestXml"] = map_internal_model_to_scoring_xml(record)
    record["integration"]["errorMessage"] = ""

    if force_error:
        record["scoringStatus"] = "Fehler"
        record["integration"]["scoringResponseXml"] = "\n".join(
            [
                "<ScoringResponse>",
                f"  <AnfrageID>{escape_xml(record['inquiryId'])}</AnfrageID>",
                f"  <Vorname>{escape_xml(record['firstName'])}</Vorname>",
                f"  <Nachname>{escape_xml(record['lastName'])}</Nachname>",
                "  <Result>ERROR</Result>",
                "  <Message>Timeout in downstream scoring module</Message>",
                "</ScoringResponse>",
            ]
        )
        record["integration"]["errorMessage"] = (
            "Scoring-REST-Schnittstelle meldet einen Fehler. XML-Response konnte nicht fachlich verarbeitet werden."
        )
        append_log(record, "Scoring REST", record["integration"]["errorMessage"], "Fehler", "error")
        normalize_record(record)
        return

    xml_response = create_mock_scoring_xml_response(record)
    parsed = parse_scoring_xml_response(xml_response)
    record["integration"]["scoringResponseXml"] = xml_response
    record["score"] = parsed["score"]
    record["riskClass"] = parsed["riskClass"]
    record["scoringStatus"] = "Abgeschlossen"
    append_log(record, "Scoring REST", "Scoring-XML wurde transformiert und in das interne Modell zurückgeführt.")
    normalize_record(record)


def run_rate_calculation(record: dict[str, Any]) -> None:
    if record["scoringStatus"] != "Abgeschlossen":
        raise HTTPException(status_code=400, detail="Vor der Zinsberechnung muss das Scoring abgeschlossen sein.")

    if record["teamleadRequired"] and record["teamleadDecision"] != "Freigegeben":
        raise HTTPException(status_code=400, detail="Vor der Zinsberechnung ist eine Teamleiterfreigabe notwendig.")

    payload = map_internal_model_to_rate_calculator_payload(record)
    response, annual_interest_rate = mock_rate_calculator_service(payload, record["riskClass"])
    record["integration"]["rateRequestJson"] = payload
    record["integration"]["rateResponseJson"] = response
    apply_rate_calculator_response(record, response, annual_interest_rate)
    append_log(record, "RateCalculator REST", "Zinsrechner wurde mit JSON-Payload aufgerufen und Monatsrate übernommen.")


def send_to_teamlead(record: dict[str, Any]) -> None:
    if not record["teamleadRequired"]:
        raise HTTPException(status_code=400, detail="Für diesen Antrag ist keine Teamleiterfreigabe erforderlich.")

    if record["scoringStatus"] != "Abgeschlossen":
        raise HTTPException(status_code=400, detail="Vor der Teamleiterfreigabe muss das Scoring abgeschlossen sein.")

    record["teamleadDecision"] = "Ausstehend"
    append_log(record, "Workflow", "Vorgang wurde an die Teamleitung zur Freigabe übergeben.")
    normalize_record(record)


def team_approve(record: dict[str, Any]) -> None:
    record["teamleadDecision"] = "Freigegeben"
    append_log(record, "Teamleitung", "Teamleitung hat den Antrag freigegeben.")
    normalize_record(record)

def team_reject(record: dict[str, Any]) -> None:
    record["teamleadDecision"] = "Abgelehnt"
    append_log(record, "Teamleitung", "Antrag wurde durch die Teamleitung abgelehnt.", "Fehler", "error")
    normalize_record(record)


def generate_offer(record: dict[str, Any]) -> None:
    if record["teamleadRequired"] and record["teamleadDecision"] != "Freigegeben":
        raise HTTPException(status_code=400, detail="Vor dem Angebot ist eine Teamleiterfreigabe notwendig.")

    if record["scoringStatus"] != "Abgeschlossen":
        raise HTTPException(status_code=400, detail="Vor dem Angebot muss das Scoring abgeschlossen sein.")

    if record["rateCalculationStatus"] != "Abgeschlossen":
        run_rate_calculation(record)

    record["offerStatus"] = "Angebot erstellt"
    record["documentStatus"] = "Dokument erstellt"
    append_log(record, "Dokumentenservice", "Angebotsdokument wurde erzeugt.")
    normalize_record(record)


def send_signature(record: dict[str, Any]) -> None:
    if record["offerStatus"] != "Angebot erstellt":
        raise HTTPException(status_code=400, detail="Vor der Signatur muss ein Angebot erzeugt werden.")

    record["signatureStatus"] = "Zur Signatur gesendet"
    append_log(record, "Signaturdienst", "Angebot wurde an den Signaturdienst übergeben.")
    normalize_record(record)


def customer_sign(record: dict[str, Any]) -> None:
    if record["signatureStatus"] != "Zur Signatur gesendet":
        raise HTTPException(status_code=400, detail="Der Fall liegt noch nicht beim Kunden zur Signatur.")

    record["signatureStatus"] = "Signiert"
    append_log(record, "Kundenportal", "Digitale Signatur wurde durch den Kunden abgeschlossen.")
    normalize_record(record)


def send_mail(record: dict[str, Any]) -> None:
    if record["signatureStatus"] != "Signiert":
        raise HTTPException(
            status_code=400,
            detail="Vor dem Mailversand muss die digitale Signatur abgeschlossen sein.",
        )

    record["mailStatus"] = "Versendet"
    record["archiveStatus"] = "Archiviert"
    append_log(record, "Mailservice", "Signiertes Dokument wurde per Mail versendet und archiviert.")
    normalize_record(record)


def create_seed_applications() -> list[dict[str, Any]]:
    base_time = datetime(2026, 3, 25, 8, 15, 0)
    seed_definitions = [
        {
            "firstName": "Erika",
            "lastName": "Sommer",
            "email": "erika.sommer@mflb-demo.de",
            "address": "Rosenweg 3",
            "postalCode": "80331",
            "city": "München",
            "employer": "Lumen Handels GmbH",
            "employerVatId": "DE214567890",
            "monthlyNetIncome": 3400,
            "employedSince": "2019-04-01",
            "iban": "DE10500105170648489890",
            "loanType": "Konsumentenkredit",
            "loanAmount": 12000,
            "termMonths": 48,
            "purpose": "Einrichtung Wohnung",
            "pipeline": ["score", "teamlead"],
        },
        {
            "firstName": "Leon",
            "lastName": "Meier",
            "email": "leon.meier@mflb-demo.de",
            "address": "Marktstraße 12",
            "postalCode": "20095",
            "city": "Hamburg",
            "employer": "Dockline AG",
            "employerVatId": "DE198765432",
            "monthlyNetIncome": 4100,
            "employedSince": "2017-09-01",
            "iban": "DE74500105175407324931",
            "loanType": "Konsumentenkredit",
            "loanAmount": 8500,
            "termMonths": 36,
            "purpose": "Fahrzeugkauf",
            "pipeline": ["score", "rate", "generate", "signature"],
        },
        {
            "firstName": "Sarah",
            "lastName": "Beck",
            "email": "sarah.beck@mflb-demo.de",
            "address": "Alte Gasse 8",
            "postalCode": "70173",
            "city": "Stuttgart",
            "employer": "Beck Design Studio",
            "employerVatId": "DE345672198",
            "monthlyNetIncome": 2850,
            "employedSince": "2022-02-01",
            "iban": "DE08500105179858451595",
            "loanType": "Konsumentenkredit",
            "loanAmount": 6500,
            "termMonths": 24,
            "purpose": "Küchenmodernisierung",
            "pipeline": [],
        },
        {
            "firstName": "David",
            "lastName": "Krüger",
            "email": "david.krueger@mflb-demo.de",
            "address": "Parkallee 91",
            "postalCode": "28195",
            "city": "Bremen",
            "employer": "Krüger Eventtechnik",
            "employerVatId": "DE987654321",
            "monthlyNetIncome": 4700,
            "employedSince": "2016-01-01",
            "iban": "DE98500105172429448490",
            "loanType": "Konsumentenkredit",
            "loanAmount": 30000,
            "termMonths": 72,
            "purpose": "Freie Verwendung",
            "pipeline": [],
        },
        {
            "firstName": "Miriam",
            "lastName": "Yilmaz",
            "email": "miriam.yilmaz@mflb-demo.de",
            "address": "Schillerplatz 22",
            "postalCode": "50667",
            "city": "Köln",
            "employer": "Urban Habitat GmbH",
            "employerVatId": "DE147258369",
            "monthlyNetIncome": 5600,
            "employedSince": "2015-03-01",
            "iban": "DE69500105173648295054",
            "loanType": "Baufinanzierung",
            "loanAmount": 180000,
            "termMonths": 240,
            "purpose": "Eigentumswohnung",
            "pipeline": [],
        },
        {
            "firstName": "Robert",
            "lastName": "Engel",
            "email": "robert.engel@mflb-demo.de",
            "address": "Industrieweg 44",
            "postalCode": "60311",
            "city": "Frankfurt am Main",
            "employer": "Engel Maschinenbau SE",
            "employerVatId": "DE111222333",
            "monthlyNetIncome": 7200,
            "employedSince": "2012-11-01",
            "iban": "DE97500105170648489810",
            "loanType": "Großkredit",
            "loanAmount": 250000,
            "termMonths": 84,
            "purpose": "Expansion Betrieb",
            "pipeline": [],
        },
        {
            "firstName": "Lisa",
            "lastName": "Hoffmann",
            "email": "lisa.hoffmann@mflb-demo.de",
            "address": "Auenweg 27",
            "postalCode": "01067",
            "city": "Dresden",
            "employer": "Hoffmann Consulting",
            "employerVatId": "DE444555666",
            "monthlyNetIncome": 3900,
            "employedSince": "2018-06-01",
            "iban": "DE17500105173648295014",
            "loanType": "Konsumentenkredit",
            "loanAmount": 19800,
            "termMonths": 72,
            "purpose": "Modernisierung Wohnung",
            "pipeline": ["score", "teamlead", "approve", "rate", "generate"],
        },
        {
            "firstName": "Jonas",
            "lastName": "Adler",
            "email": "jonas.adler@mflb-demo.de",
            "address": "Bachstraße 17",
            "postalCode": "90402",
            "city": "Nürnberg",
            "employer": "Adler Systems GmbH",
            "employerVatId": "DE333444555",
            "monthlyNetIncome": 3600,
            "employedSince": "2020-07-01",
            "iban": "DE51500105170648555370",
            "loanType": "Konsumentenkredit",
            "loanAmount": 7200,
            "termMonths": 48,
            "purpose": "Umschuldung",
            "pipeline": ["score", "rate", "generate", "signature", "customer-sign", "mail"],
        },
        {
            "firstName": "Cem",
            "lastName": "Arslan",
            "email": "cem.arslan@mflb-demo.de",
            "address": "Turmring 9",
            "postalCode": "68159",
            "city": "Mannheim",
            "employer": "LogiChain Europe",
            "employerVatId": "DE777888999",
            "monthlyNetIncome": 3000,
            "employedSince": "2023-01-01",
            "iban": "DE28500105170000202051",
            "loanType": "Konsumentenkredit",
            "loanAmount": 10400,
            "termMonths": 48,
            "purpose": "Elektronik",
            "pipeline": ["score", "teamlead"],
        },
        {
            "firstName": "Pia",
            "lastName": "Weber",
            "email": "pia.weber@mflb-demo.de",
            "address": "Bahnhofstraße 6",
            "postalCode": "04109",
            "city": "Leipzig",
            "employer": "Weber Media OHG",
            "employerVatId": "DE666777888",
            "monthlyNetIncome": 3250,
            "employedSince": "2021-10-01",
            "iban": "DE75500105170648489850",
            "loanType": "Konsumentenkredit",
            "loanAmount": 9400,
            "termMonths": 36,
            "purpose": "Freie Verwendung",
            "pipeline": ["score", "rate"],
        },
        {
            "firstName": "Nora",
            "lastName": "Klein",
            "email": "nora.klein@mflb-demo.de",
            "address": "Rathausgasse 5",
            "postalCode": "89073",
            "city": "Ulm",
            "employer": "Klein Concept Store",
            "employerVatId": "DE812345670",
            "monthlyNetIncome": 2800,
            "employedSince": "2022-06-01",
            "iban": "DE91500105170648489910",
            "loanType": "Konsumentenkredit",
            "loanAmount": 5400,
            "termMonths": 24,
            "purpose": "Möbelkauf",
            "pipeline": [],
        },
        {
            "firstName": "Tim",
            "lastName": "Richter",
            "email": "tim.richter@mflb-demo.de",
            "address": "Mühlenweg 18",
            "postalCode": "44135",
            "city": "Dortmund",
            "employer": "Richter Elektrotechnik",
            "employerVatId": "DE923456781",
            "monthlyNetIncome": 3500,
            "employedSince": "2019-08-01",
            "iban": "DE22500105170648489920",
            "loanType": "Konsumentenkredit",
            "loanAmount": 15000,
            "termMonths": 60,
            "purpose": "Renovierung",
            "pipeline": ["score", "teamlead"],
        },
        {
            "firstName": "Aylin",
            "lastName": "Demir",
            "email": "aylin.demir@mflb-demo.de",
            "address": "Gartenstraße 28",
            "postalCode": "30159",
            "city": "Hannover",
            "employer": "Demir Services GmbH",
            "employerVatId": "DE834567892",
            "monthlyNetIncome": 3300,
            "employedSince": "2021-01-01",
            "iban": "DE33500105170648489930",
            "loanType": "Konsumentenkredit",
            "loanAmount": 9900,
            "termMonths": 48,
            "purpose": "Umschuldung",
            "pipeline": ["score", "rate"],
        },
        {
            "firstName": "Marcel",
            "lastName": "Vogt",
            "email": "marcel.vogt@mflb-demo.de",
            "address": "Bergstraße 44",
            "postalCode": "53111",
            "city": "Bonn",
            "employer": "Vogt Logistik AG",
            "employerVatId": "DE845678903",
            "monthlyNetIncome": 4300,
            "employedSince": "2016-04-01",
            "iban": "DE44500105170648489940",
            "loanType": "Konsumentenkredit",
            "loanAmount": 18500,
            "termMonths": 72,
            "purpose": "Sanierung Hausrat",
            "pipeline": ["score", "teamlead", "approve", "rate", "generate"],
        },
        {
            "firstName": "Helena",
            "lastName": "Fuchs",
            "email": "helena.fuchs@mflb-demo.de",
            "address": "Marktplatz 9",
            "postalCode": "39104",
            "city": "Magdeburg",
            "employer": "Fuchs Interior GmbH",
            "employerVatId": "DE856789014",
            "monthlyNetIncome": 3900,
            "employedSince": "2018-11-01",
            "iban": "DE55500105170648489950",
            "loanType": "Konsumentenkredit",
            "loanAmount": 11200,
            "termMonths": 48,
            "purpose": "Freie Verwendung",
            "pipeline": ["score", "teamlead", "approve"],
        },
        {
            "firstName": "Paul",
            "lastName": "Steiner",
            "email": "paul.steiner@mflb-demo.de",
            "address": "Lindenring 16",
            "postalCode": "54290",
            "city": "Trier",
            "employer": "Steiner IT Solutions",
            "employerVatId": "DE867890125",
            "monthlyNetIncome": 4100,
            "employedSince": "2017-02-01",
            "iban": "DE66500105170648489960",
            "loanType": "Konsumentenkredit",
            "loanAmount": 7800,
            "termMonths": 36,
            "purpose": "Elektronik",
            "pipeline": ["score", "rate", "generate", "signature", "customer-sign", "mail"],
        },
        {
            "firstName": "Farah",
            "lastName": "Özdemir",
            "email": "farah.oezdemir@mflb-demo.de",
            "address": "Kanalweg 2",
            "postalCode": "28199",
            "city": "Bremen",
            "employer": "Özdemir Immobilien",
            "employerVatId": "DE878901236",
            "monthlyNetIncome": 6800,
            "employedSince": "2014-09-01",
            "iban": "DE77500105170648489970",
            "loanType": "Baufinanzierung",
            "loanAmount": 240000,
            "termMonths": 300,
            "purpose": "Neubau",
            "pipeline": [],
        },
        {
            "firstName": "Martin",
            "lastName": "Schade",
            "email": "martin.schade@mflb-demo.de",
            "address": "Gewerbepark 11",
            "postalCode": "97070",
            "city": "Würzburg",
            "employer": "Schade Produktions GmbH",
            "employerVatId": "DE889012347",
            "monthlyNetIncome": 7600,
            "employedSince": "2013-05-01",
            "iban": "DE88500105170648489980",
            "loanType": "Großkredit",
            "loanAmount": 130000,
            "termMonths": 96,
            "purpose": "Maschinenpark",
            "pipeline": [],
        },
        {
            "firstName": "Clara",
            "lastName": "Neumann",
            "email": "clara.neumann@mflb-demo.de",
            "address": "Sonnenweg 31",
            "postalCode": "18055",
            "city": "Rostock",
            "employer": "Neumann Healthcare",
            "employerVatId": "DE890123458",
            "monthlyNetIncome": 4400,
            "employedSince": "2019-01-01",
            "iban": "DE99500105170648489990",
            "loanType": "Konsumentenkredit",
            "loanAmount": 22000,
            "termMonths": 60,
            "purpose": "Freie Verwendung",
            "pipeline": [],
        },
        {
            "firstName": "Deniz",
            "lastName": "Kara",
            "email": "deniz.kara@mflb-demo.de",
            "address": "Fliederweg 14",
            "postalCode": "34117",
            "city": "Kassel",
            "employer": "Kara Media House",
            "employerVatId": "DE901234569",
            "monthlyNetIncome": 3100,
            "employedSince": "2022-09-01",
            "iban": "DE11500105170648489001",
            "loanType": "Konsumentenkredit",
            "loanAmount": 10100,
            "termMonths": 48,
            "purpose": "Fahrzeugkauf",
            "pipeline": ["score"],
        },
        {
            "firstName": "Jana",
            "lastName": "Lorenz",
            "email": "jana.lorenz@mflb-demo.de",
            "address": "Hafenweg 21",
            "postalCode": "10115",
            "city": "Berlin",
            "employer": "Lorenz Office Services",
            "employerVatId": "DE912340001",
            "monthlyNetIncome": 2950,
            "employedSince": "2021-05-01",
            "iban": "DE12500105170648489011",
            "loanType": "Konsumentenkredit",
            "loanAmount": 5800,
            "termMonths": 24,
            "purpose": "Möblierung",
            "pipeline": [],
        },
        {
            "firstName": "Felix",
            "lastName": "Brandt",
            "email": "felix.brandt@mflb-demo.de",
            "address": "Westend 13",
            "postalCode": "45127",
            "city": "Essen",
            "employer": "Brandt Facility Solutions",
            "employerVatId": "DE912340002",
            "monthlyNetIncome": 3450,
            "employedSince": "2018-02-01",
            "iban": "DE13500105170648489012",
            "loanType": "Konsumentenkredit",
            "loanAmount": 9900,
            "termMonths": 36,
            "purpose": "Fahrzeugreparatur",
            "pipeline": ["score", "rate"],
        },
        {
            "firstName": "Sophie",
            "lastName": "Albrecht",
            "email": "sophie.albrecht@mflb-demo.de",
            "address": "Lechufer 7",
            "postalCode": "86150",
            "city": "Augsburg",
            "employer": "Albrecht Medien GmbH",
            "employerVatId": "DE912340003",
            "monthlyNetIncome": 3800,
            "employedSince": "2017-11-01",
            "iban": "DE14500105170648489013",
            "loanType": "Konsumentenkredit",
            "loanAmount": 12500,
            "termMonths": 60,
            "purpose": "Badsanierung",
            "pipeline": ["score", "teamlead"],
        },
        {
            "firstName": "Lukas",
            "lastName": "Werner",
            "email": "lukas.werner@mflb-demo.de",
            "address": "Fördeblick 4",
            "postalCode": "24103",
            "city": "Kiel",
            "employer": "Werner Maritim GmbH",
            "employerVatId": "DE912340004",
            "monthlyNetIncome": 4200,
            "employedSince": "2016-09-01",
            "iban": "DE15500105170648489014",
            "loanType": "Konsumentenkredit",
            "loanAmount": 17800,
            "termMonths": 72,
            "purpose": "Umschuldung",
            "pipeline": ["score", "teamlead", "approve", "rate", "generate"],
        },
        {
            "firstName": "Yasmin",
            "lastName": "Celik",
            "email": "yasmin.celik@mflb-demo.de",
            "address": "Rheinbogen 12",
            "postalCode": "40213",
            "city": "Düsseldorf",
            "employer": "Celik Retail Solutions",
            "employerVatId": "DE912340005",
            "monthlyNetIncome": 3550,
            "employedSince": "2020-03-01",
            "iban": "DE16500105170648489015",
            "loanType": "Konsumentenkredit",
            "loanAmount": 8400,
            "termMonths": 48,
            "purpose": "Hausrat",
            "pipeline": ["score", "rate", "generate", "signature", "customer-sign", "mail"],
        },
        {
            "firstName": "Hannes",
            "lastName": "Berger",
            "email": "hannes.berger@mflb-demo.de",
            "address": "Schlossberg 19",
            "postalCode": "79098",
            "city": "Freiburg",
            "employer": "Berger Planungsgesellschaft",
            "employerVatId": "DE912340006",
            "monthlyNetIncome": 4050,
            "employedSince": "2015-10-01",
            "iban": "DE17500105170648489016",
            "loanType": "Konsumentenkredit",
            "loanAmount": 19900,
            "termMonths": 84,
            "purpose": "Modernisierung",
            "pipeline": ["score", "teamlead"],
        },
        {
            "firstName": "Bianca",
            "lastName": "Roth",
            "email": "bianca.roth@mflb-demo.de",
            "address": "Südwall 3",
            "postalCode": "04103",
            "city": "Leipzig",
            "employer": "Roth Industrieholding",
            "employerVatId": "DE912340007",
            "monthlyNetIncome": 8900,
            "employedSince": "2011-01-01",
            "iban": "DE18500105170648489017",
            "loanType": "Großkredit",
            "loanAmount": 320000,
            "termMonths": 96,
            "purpose": "Expansion Filiale",
            "pipeline": [],
        },
        {
            "firstName": "Ole",
            "lastName": "Hartmann",
            "email": "ole.hartmann@mflb-demo.de",
            "address": "Havelpark 8",
            "postalCode": "14467",
            "city": "Potsdam",
            "employer": "Hartmann Architektur PartG",
            "employerVatId": "DE912340008",
            "monthlyNetIncome": 7600,
            "employedSince": "2014-07-01",
            "iban": "DE19500105170648489018",
            "loanType": "Baufinanzierung",
            "loanAmount": 280000,
            "termMonths": 300,
            "purpose": "Neubau Einfamilienhaus",
            "pipeline": [],
        },
        {
            "firstName": "Greta",
            "lastName": "König",
            "email": "greta.koenig@mflb-demo.de",
            "address": "Seeblick 27",
            "postalCode": "18055",
            "city": "Rostock",
            "employer": "König Eventservice",
            "employerVatId": "DE912340009",
            "monthlyNetIncome": 3700,
            "employedSince": "2019-12-01",
            "iban": "DE20500105170648489019",
            "loanType": "Konsumentenkredit",
            "loanAmount": 22000,
            "termMonths": 84,
            "purpose": "Freie Verwendung",
            "pipeline": [],
        },
        {
            "firstName": "Sami",
            "lastName": "Rahman",
            "email": "sami.rahman@mflb-demo.de",
            "address": "Europaallee 15",
            "postalCode": "66111",
            "city": "Saarbrücken",
            "employer": "Rahman IT Services",
            "employerVatId": "DE912340010",
            "monthlyNetIncome": 3150,
            "employedSince": "2022-04-01",
            "iban": "DE21500105170648489020",
            "loanType": "Konsumentenkredit",
            "loanAmount": 10100,
            "termMonths": 48,
            "purpose": "Weiterbildung",
            "pipeline": ["score", "teamlead", "approve", "rate"],
        },
        {
            "firstName": "Carina",
            "lastName": "Wolf",
            "email": "carina.wolf@mflb-demo.de",
            "address": "Messeplatz 6",
            "postalCode": "50670",
            "city": "Köln",
            "employer": "Wolf Projektservice",
            "employerVatId": "DE912340011",
            "monthlyNetIncome": 3275,
            "employedSince": "2020-08-01",
            "iban": "DE22500105170648489021",
            "loanType": "Konsumentenkredit",
            "loanAmount": 7600,
            "termMonths": 36,
            "purpose": "Haushaltsgeräte",
            "pipeline": ["score-error"],
        },
        {
            "firstName": "Mehmet",
            "lastName": "Acar",
            "email": "mehmet.acar@mflb-demo.de",
            "address": "Nordring 42",
            "postalCode": "48143",
            "city": "Münster",
            "employer": "Acar Mobility Services",
            "employerVatId": "DE912340012",
            "monthlyNetIncome": 3480,
            "employedSince": "2018-05-01",
            "iban": "DE23500105170648489022",
            "loanType": "Konsumentenkredit",
            "loanAmount": 6900,
            "termMonths": 30,
            "purpose": "Motorradkauf",
            "pipeline": ["score", "rate", "generate"],
        },
    ]

    applications: list[dict[str, Any]] = []

    for index, definition in enumerate(seed_definitions, start=1):
        created_at = (base_time + timedelta(minutes=index * 19)).replace(microsecond=0).isoformat()
        inquiry_id = build_inquiry_id(index, created_at)
        application_input = ApplicationInput(
            **{key: value for key, value in definition.items() if key != "pipeline"}
        )
        payload = build_website_payload(application_input, created_at, inquiry_id)
        record = map_website_json_to_internal_model(
            payload,
            f"seed-{index}",
            inquiry_id,
            created_at,
            application_input.model_dump(),
        )
        append_log(record, "Website", "Seed-Fall wurde als JSON aus dem Online-Kanal übernommen.")

        for step in definition["pipeline"]:
            if step == "score":
                run_scoring(record)
            elif step == "score-error":
                run_scoring(record, force_error=True)
            elif step == "teamlead":
                send_to_teamlead(record)
            elif step == "approve":
                team_approve(record)
            elif step == "rate":
                run_rate_calculation(record)
            elif step == "generate":
                generate_offer(record)
            elif step == "signature":
                send_signature(record)
            elif step == "customer-sign":
                customer_sign(record)
            elif step == "mail":
                send_mail(record)

        applications.append(record)

    applications.sort(key=lambda item: item["createdAt"], reverse=True)
    return applications


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


@app.get("/")
def serve_index() -> FileResponse:
    return FileResponse(BASE_DIR / "index.html")


@app.get("/styles.css")
def serve_styles() -> FileResponse:
    return FileResponse(BASE_DIR / "styles.css")


@app.get("/script.js")
def serve_script() -> FileResponse:
    return FileResponse(BASE_DIR / "script.js")


@app.get("/api/bootstrap")
def api_bootstrap() -> dict[str, Any]:
    return bootstrap_payload()


@app.post("/api/applications")
def api_create_application(payload: ApplicationInput) -> dict[str, Any]:
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
