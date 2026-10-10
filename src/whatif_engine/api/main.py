from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from whatif_engine.api.routes import career

app = FastAPI(
    title="WhatIf Engine API",
    version="0.1.0",
    description="HTTP interface to the deterministic financial decision engine.",
)

# Dev-only origins; the Vite dev server also proxies /api, so CORS is a fallback.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(ValueError)
async def engine_value_error(_: Request, exc: ValueError) -> JSONResponse:
    """Engine validation failures are problems with the caller's input."""
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(career.router, prefix="/api/v1")
