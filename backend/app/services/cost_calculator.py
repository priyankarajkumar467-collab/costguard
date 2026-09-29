"""
CostGuard Cost Calculator & Impact Analyzer
Deterministic 730-hours/month monthly and annualized calculations,
tag attribution breakdowns, and human-readable explanation engine.
"""
from typing import List, Dict, Any, Tuple
from backend.app.config import HOURS_PER_MONTH, DEFAULT_CURRENCY, format_inr
from backend.app.schemas.plan import ParsedResourceChange
from backend.app.schemas.report import (
    ResourceCostDetail,
    FinancialSummary,
    CacheSummary,
)
from backend.app.services.pricing_service import AzureRetailPricingProvider


class CostCalculator:
    """
    Computes exact monthly and annualized cost deltas for Terraform plan changes.
    """

    def __init__(self, pricing_provider: AzureRetailPricingProvider):
        self.pricing_provider = pricing_provider

    def calculate_plan_cost(
        self,
        parsed_changes: List[ParsedResourceChange],
        currency: str = "INR",
        include_spot: bool = False,
    ) -> Tuple[List[ResourceCostDetail], FinancialSummary, CacheSummary, List[str], Dict[str, List[Dict[str, Any]]]]:
        details: List[ResourceCostDetail] = []
        prior_monthly_total = 0.0
        projected_monthly_total = 0.0
        explanations: List[str] = []

        # Tag attribution maps: tag_key -> tag_val -> {prior, projected, delta}
        tag_attribution_data: Dict[str, Dict[str, Dict[str, float]]] = {
            "Environment": {},
            "Team": {},
            "Application": {},
            "Owner": {},
        }

        for change in parsed_changes:
            # Handle non-billable resources
            if not change.is_billable:
                details.append(
                    ResourceCostDetail(
                        address=change.address,
                        resource_type=change.resource_type,
                        action=change.action_type.upper(),
                        region=change.after_region or change.before_region or "global",
                        sku="N/A",
                        meter="Non-billable",
                        old_hourly_cost=0.0,
                        new_hourly_cost=0.0,
                        old_monthly_cost=0.0,
                        new_monthly_cost=0.0,
                        delta_monthly_cost=0.0,
                        status="SKIPPED",
                        note=change.skip_reason or "Skipped non-billable resource",
                        tags=change.tags.raw_tags,
                    )
                )
                continue

            old_hourly = 0.0
            new_hourly = 0.0
            meter_name = "Azure Retail Meter"
            is_unpriced = False
            unpriced_note = ""

            # Check pricing for before state (if update, delete, replacement)
            if change.action_type in ("delete", "update", "replacement"):
                if change.before_sku:
                    region = change.before_region or "eastus"
                    lookup = self.pricing_provider.get_hourly_price(
                        sku=change.before_sku,
                        region=region,
                        resource_type=change.resource_type,
                        currency=currency,
                        include_spot=include_spot,
                    )
                    if lookup.found and lookup.hourly_rate is not None:
                        old_hourly = lookup.hourly_rate
                        meter_name = lookup.meter_name
                    else:
                        is_unpriced = True
                        unpriced_note = f"Before SKU '{change.before_sku}' unpriced"

            # Check pricing for after state (if create, update, replacement)
            if change.action_type in ("create", "update", "replacement"):
                if change.after_sku:
                    region = change.after_region or "eastus"
                    lookup = self.pricing_provider.get_hourly_price(
                        sku=change.after_sku,
                        region=region,
                        resource_type=change.resource_type,
                        currency=currency,
                        include_spot=include_spot,
                    )
                    if lookup.found and lookup.hourly_rate is not None:
                        new_hourly = lookup.hourly_rate
                        meter_name = lookup.meter_name
                    else:
                        is_unpriced = True
                        unpriced_note = f"After SKU '{change.after_sku}' unpriced"

            # Check metadata-only change (same SKU, same region, update action)
            if change.action_type == "update" and change.before_sku == change.after_sku and change.before_region == change.after_region:
                old_hourly = new_hourly
                unpriced_note = "Metadata or tag change only (₹0 delta)"

            old_monthly = round(old_hourly * HOURS_PER_MONTH, 2)
            new_monthly = round(new_hourly * HOURS_PER_MONTH, 2)
            delta_monthly = round(new_monthly - old_monthly, 2)

            prior_monthly_total += old_monthly
            projected_monthly_total += new_monthly

            status = "UNPRICED" if is_unpriced else "SUCCESS"
            sku_label = change.after_sku or change.before_sku or "Standard"

            details.append(
                ResourceCostDetail(
                    address=change.address,
                    resource_type=change.resource_type,
                    action=change.action_type.upper(),
                    region=change.after_region or change.before_region or "eastus",
                    sku=sku_label,
                    meter=meter_name,
                    old_hourly_cost=old_hourly,
                    new_hourly_cost=new_hourly,
                    old_monthly_cost=old_monthly,
                    new_monthly_cost=new_monthly,
                    delta_monthly_cost=delta_monthly,
                    status=status,
                    note=unpriced_note,
                    tags=change.tags.raw_tags,
                )
            )

            # Record explanation line if there is cost impact
            if abs(delta_monthly) > 0.001:
                short_name = change.address.split(".")[-1]
                if currency.upper() == "INR":
                    formatted_delta = format_inr(delta_monthly, precision=0, show_sign=True)
                else:
                    sign = "+" if delta_monthly > 0 else ""
                    formatted_delta = f"{sign}${delta_monthly:.2f}"

                friendly_type = (
                    "VM" if "virtual_machine" in change.resource_type
                    else "Managed disk" if "managed_disk" in change.resource_type
                    else change.resource_type.replace("azurerm_", "").replace("_", " ")
                )

                if change.action_type == "create":
                    explanations.append(f"New {friendly_type} '{short_name}' ({sku_label}): {formatted_delta}/month")
                elif change.action_type == "delete":
                    explanations.append(f"{friendly_type} '{short_name}' deleted: {formatted_delta}/month")
                elif change.action_type == "update":
                    explanations.append(f"{friendly_type} '{short_name}' upgrade ({change.before_sku} → {change.after_sku}): {formatted_delta}/month")
                elif change.action_type == "replacement":
                    explanations.append(f"{friendly_type} '{short_name}' replacement: {formatted_delta}/month")

            # Accumulate tag attribution
            tags_to_track = {
                "Environment": change.tags.environment,
                "Team": change.tags.team,
                "Application": change.tags.application,
                "Owner": change.tags.owner,
            }
            for tag_k, tag_v in tags_to_track.items():
                if tag_v not in tag_attribution_data[tag_k]:
                    tag_attribution_data[tag_k][tag_v] = {
                        "prior": 0.0,
                        "projected": 0.0,
                        "delta": 0.0,
                    }
                tag_attribution_data[tag_k][tag_v]["prior"] += old_monthly
                tag_attribution_data[tag_k][tag_v]["projected"] += new_monthly
                tag_attribution_data[tag_k][tag_v]["delta"] += delta_monthly

        prior_monthly_total = round(prior_monthly_total, 2)
        projected_monthly_total = round(projected_monthly_total, 2)
        net_monthly_impact = round(projected_monthly_total - prior_monthly_total, 2)
        annualized_impact = round(net_monthly_impact * 12.0, 2)
        quarterly_impact = round(net_monthly_impact * 3.0, 2)

        fin_summary = FinancialSummary(
            currency=currency.upper(),
            prior_monthly_total=prior_monthly_total,
            projected_monthly_total=projected_monthly_total,
            net_monthly_impact=net_monthly_impact,
            annualized_impact=annualized_impact,
            quarterly_impact=quarterly_impact,
        )

        total_lookups = self.pricing_provider.cache_hits + self.pricing_provider.cache_misses
        hit_rate = round((self.pricing_provider.cache_hits / total_lookups * 100.0), 1) if total_lookups > 0 else 0.0

        cache_summary = CacheSummary(
            cache_hits=self.pricing_provider.cache_hits,
            cache_misses=self.pricing_provider.cache_misses,
            api_calls=self.pricing_provider.api_calls,
            cache_hit_rate_pct=hit_rate,
        )

        # Format tag attribution lists
        formatted_tags: Dict[str, List[Dict[str, Any]]] = {}
        for category, items in tag_attribution_data.items():
            formatted_tags[category] = [
                {
                    "category": category,
                    "value": val,
                    "prior_monthly_cost": round(data["prior"], 2),
                    "projected_monthly_cost": round(data["projected"], 2),
                    "delta_monthly_cost": round(data["delta"], 2),
                }
                for val, data in sorted(items.items(), key=lambda x: abs(x[1]["delta"]), reverse=True)
            ]

        return details, fin_summary, cache_summary, explanations, formatted_tags
