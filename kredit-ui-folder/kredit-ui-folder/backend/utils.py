from datetime import datetime
from math import pow
from typing import Any

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

def calculate_annuity(principal: float, annual_rate_percent: float, months: int) -> float:
    monthly_rate = annual_rate_percent / 100 / 12
    if monthly_rate == 0:
        return principal / max(1, months)
    return (principal * monthly_rate) / (1 - pow(1 + monthly_rate, -max(1, months)))
