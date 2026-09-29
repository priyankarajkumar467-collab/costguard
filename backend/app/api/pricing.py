"""
CostGuard Pricing & Cache API
"""
from typing import Dict, Any, Optional
from backend.app.database import get_cache_statistics, clear_cache
from backend.app.services.pricing_service import AzureRetailPricingProvider


def query_price(sku: str, region: str, currency: str = "USD") -> Dict[str, Any]:
    provider = AzureRetailPricingProvider()
    result = provider.get_hourly_price(sku, region, "azurerm_virtual_machine", currency=currency)
    return {
        "sku": result.sku,
        "region": result.region,
        "currency": result.currency,
        "hourly_rate": result.hourly_rate,
        "monthly_rate": round(result.hourly_rate * 730, 2) if result.hourly_rate else None,
        "found": result.found,
        "source": result.source,
        "meter_name": result.meter_name,
    }


def get_cache_stats() -> Dict[str, Any]:
    return get_cache_statistics()


def reset_cache() -> Dict[str, Any]:
    deleted = clear_cache()
    return {"status": "success", "deleted_entries": deleted}
