"""
CostGuard Pricing Cache Model Schema
Compatible with SQLAlchemy ORM and plain dict serialization.
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class PricingCacheRecord:
    sku: str
    region: str
    currency: str
    hourly_rate: float
    cached_at: int
    meter_name: Optional[str] = ""

    def to_dict(self):
        return {
            "sku": self.sku,
            "region": self.region,
            "currency": self.currency,
            "hourly_rate": self.hourly_rate,
            "cached_at": self.cached_at,
            "meter_name": self.meter_name,
        }
