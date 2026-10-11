from fastapi import APIRouter

from whatif_engine.api import service
from whatif_engine.api.schemas import ExpenseRequest, ExpenseResponse

router = APIRouter(prefix="/expenses", tags=["expenses"])


@router.post("/simulate", response_model=ExpenseResponse)
def simulate(req: ExpenseRequest) -> ExpenseResponse:
    return service.expense(req)
