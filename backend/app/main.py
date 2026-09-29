"""
CostGuard FastAPI Backend Application Entrypoint
"""
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.database import init_db
from backend.app.api.health import get_health_status
from backend.app.api.pricing import query_price, get_cache_stats, reset_cache
from backend.app.api.analysis import run_plan_analysis, simulate_sku_switch
from backend.app.api.plans import list_sample_plans, read_sample_plan

try:
    from fastapi import FastAPI, HTTPException, Body
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False

init_db()

if HAS_FASTAPI:
    app = FastAPI(
        title="CostGuard API",
        description="Intelligent Cloud Infrastructure Cost Impact Predictor & Financial Guardrail",
        version="1.0.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health():
        return get_health_status()

    @app.get("/api/pricing/{sku}/{region}")
    def get_pricing(sku: str, region: str, currency: str = "USD"):
        return query_price(sku, region, currency)

    @app.get("/api/cache/stats")
    def cache_stats():
        return get_cache_stats()

    @app.delete("/api/cache")
    def clear_pricing_cache():
        return reset_cache()

    @app.post("/api/analyze")
    def analyze_plan(payload: dict = Body(...)):
        plan_data = payload.get("plan")
        max_increase = float(payload.get("max_increase", 50.0))
        currency = payload.get("currency", "USD")
        include_spot = bool(payload.get("include_spot", False))
        try:
            return run_plan_analysis(plan_data, max_increase, currency, include_spot)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.post("/api/simulate")
    def simulate(payload: dict = Body(...)):
        current_sku = payload.get("current_sku", "Standard_D4s_v3")
        alternative_sku = payload.get("alternative_sku", "Standard_D2s_v3")
        region = payload.get("region", "eastus")
        currency = payload.get("currency", "USD")
        return simulate_sku_switch(current_sku, alternative_sku, region, currency)

    @app.get("/api/plans")
    def get_plans():
        return list_sample_plans()

    @app.get("/api/plans/{filename}")
    def get_plan_content(filename: str):
        try:
            return {"filename": filename, "content": read_sample_plan(filename)}
        except Exception as e:
            raise HTTPException(status_code=404, detail=str(e))

else:
    # Fallback placeholder app object
    app = None
    if __name__ == "__main__":
        print("CostGuard Backend services initialized. Ready with SQLite database.")
