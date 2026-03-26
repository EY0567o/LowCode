from pydantic import BaseModel, Field

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
