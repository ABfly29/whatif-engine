from fastapi import APIRouter

from whatif_engine.api import service
from whatif_engine.api.schemas import (
    CareerRequest,
    CareerResponse,
    SensitivityRequest,
    SensitivityResponse,
)

router = APIRouter(prefix="/career", tags=["career"])


@router.post("/compare", response_model=CareerResponse)
def compare(req: CareerRequest) -> CareerResponse:
    return service.compare(req)


@router.post("/sensitivity", response_model=SensitivityResponse)
def sensitivity(req: SensitivityRequest) -> SensitivityResponse:
    return service.sensitivity(req)
