"""
CostGuard Pricing Schemas
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class PriceLookupResult:
    sku: str
    region: str
    currency: str
    hourly_rate: Optional[float]
    found: bool
    source: str  # "cache" | "azure_api" | "unpriced" | "fallback"
    meter_name: str = ""
    error_message: Optional[str] = None
