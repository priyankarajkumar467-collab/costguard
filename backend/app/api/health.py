"""
CostGuard Health & Status API
"""
from typing import Dict, Any


def get_health_status() -> Dict[str, Any]:
    return {
        "status": "healthy",
        "service": "CostGuard FinOps Engine",
        "version": "1.0.0",
        "supported_providers": ["Azure Retail Prices API"],
        "roadmap_providers": ["AWS Pricing API", "GCP Cloud Billing Catalog"],
    }
