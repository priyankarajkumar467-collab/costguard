"""
CostGuard Analysis & Simulation API
"""
from typing import Dict, Any, List
from backend.app.services.terraform_parser import parse_terraform_plan
from backend.app.services.pricing_service import AzureRetailPricingProvider
from backend.app.services.cost_calculator import CostCalculator
from backend.app.services.policy_engine import PolicyEngine
from backend.app.services.advisor import AICostAdvisor, RiskAnalyzer


def run_plan_analysis(
    plan_data: Any,
    max_increase: float = 50.0,
    currency: str = "USD",
    include_spot: bool = False,
) -> Dict[str, Any]:
    parsed_changes, parse_logs = parse_terraform_plan(plan_data)
    provider = AzureRetailPricingProvider()
    calculator = CostCalculator(provider)

    details, fin_summary, cache_summary, explanations, tags = calculator.calculate_plan_cost(
        parsed_changes=parsed_changes,
        currency=currency,
        include_spot=include_spot,
    )

    verdict = PolicyEngine.evaluate(fin_summary, max_increase=max_increase)
    advice = AICostAdvisor.generate_advice(details, fin_summary, verdict, explanations)
    risk = RiskAnalyzer.assess_risk(fin_summary, verdict, details)

    # Resource counts
    counts = {
        "total_detected": len(parsed_changes),
        "billable": len([p for p in parsed_changes if p.is_billable]),
        "skipped": len([p for p in parsed_changes if not p.is_billable]),
        "creates": len([p for p in parsed_changes if p.action_type == "create"]),
        "deletes": len([p for p in parsed_changes if p.action_type == "delete"]),
        "updates": len([p for p in parsed_changes if p.action_type == "update"]),
        "replacements": len([p for p in parsed_changes if p.action_type == "replacement"]),
    }

    return {
        "financial_summary": fin_summary.__dict__,
        "policy_verdict": verdict.__dict__,
        "cache_summary": cache_summary.__dict__,
        "resource_counts": counts,
        "resource_details": [d.__dict__ for d in details],
        "explanations": explanations,
        "tag_attribution": tags,
        "ai_advisor": advice,
        "risk_assessment": risk,
        "logs": parse_logs + provider.logs,
    }


def simulate_sku_switch(
    current_sku: str,
    alternative_sku: str,
    region: str = "eastus",
    currency: str = "USD",
) -> Dict[str, Any]:
    provider = AzureRetailPricingProvider()
    curr_lookup = provider.get_hourly_price(current_sku, region, "azurerm_virtual_machine", currency=currency)
    alt_lookup = provider.get_hourly_price(alternative_sku, region, "azurerm_virtual_machine", currency=currency)

    curr_hourly = curr_lookup.hourly_rate or 0.0
    alt_hourly = alt_lookup.hourly_rate or 0.0

    curr_monthly = round(curr_hourly * 730, 2)
    alt_monthly = round(alt_hourly * 730, 2)
    delta_monthly = round(alt_monthly - curr_monthly, 2)
    annualized = round(delta_monthly * 12, 2)

    return {
        "current_sku": current_sku,
        "current_hourly": curr_hourly,
        "current_monthly": curr_monthly,
        "alternative_sku": alternative_sku,
        "alternative_hourly": alt_hourly,
        "alternative_monthly": alt_monthly,
        "monthly_difference": delta_monthly,
        "annualized_difference": annualized,
        "is_saving": delta_monthly < 0,
        "currency": currency,
        "region": region,
    }
