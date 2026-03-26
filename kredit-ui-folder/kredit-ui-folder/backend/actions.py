from typing import Any
from fastapi import HTTPException
from state import append_log
from logic import (
    normalize_record, map_internal_model_to_scoring_xml, escape_xml,
    create_mock_scoring_xml_response, parse_scoring_xml_response,
    map_internal_model_to_rate_calculator_payload, mock_rate_calculator_service,
    apply_rate_calculator_response
)

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
