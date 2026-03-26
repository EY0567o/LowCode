from __future__ import annotations
from typing import Any
from copy import deepcopy
import xml.etree.ElementTree as ET
from models import ApplicationInput
from utils import (
    split_address, format_contract_date, format_contract_iban,
    normalize_iban, resolve_loan_type, months_since, escape_xml,
    parse_contract_date, calculate_annuity
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
