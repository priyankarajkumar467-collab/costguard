"""
CostGuard AI Cost Advisor & Transparent Risk Engine
Provides deterministic FinOps intelligence, cost driver concentration analysis,
optimization suggestions, and transparent risk scoring.
"""
from typing import List, Dict, Any, Optional
from backend.app.config import format_inr
from backend.app.schemas.report import (
    ResourceCostDetail,
    FinancialSummary,
    PolicyVerdict,
)


class AICostAdvisor:
    """
    Synthesizes deterministic cost data into actionable FinOps insights.
    Guaranteed never to fabricate prices.
    """

    @staticmethod
    def generate_advice(
        details: List[ResourceCostDetail],
        fin_summary: FinancialSummary,
        verdict: PolicyVerdict,
        explanations: List[str],
    ) -> Dict[str, Any]:
        curr = fin_summary.currency
        is_inr = curr.upper() == "INR"

        def _c(val: float, sign: bool = False) -> str:
            if is_inr:
                return format_inr(val, precision=0, show_sign=sign)
            s = "+" if sign and val > 0 else ""
            return f"{s}${val:,.2f}"

        increasing_resources = [r for r in details if r.delta_monthly_cost > 0]
        primary_driver = None
        if increasing_resources:
            sorted_inc = sorted(increasing_resources, key=lambda x: x.delta_monthly_cost, reverse=True)
            primary_driver = sorted_inc[0]

        driver_desc = "No cost increases detected."
        driver_impact = 0.0
        if primary_driver:
            driver_desc = f"{primary_driver.sku} ({primary_driver.address.split('.')[-1]})"
            driver_impact = primary_driver.delta_monthly_cost

        total_increase = sum(r.delta_monthly_cost for r in increasing_resources)
        concentration_pct = (
            round((driver_impact / total_increase) * 100.0, 1) if total_increase > 0 else 0.0
        )

        optimizations = []
        if primary_driver:
            short_sku = primary_driver.sku
            if "D4" in short_sku:
                optimizations.append({
                    "target_resource": primary_driver.address.split(".")[-1],
                    "suggestion": f"Check whether {short_sku} is required. Downsizing to Standard_D2s_v3 would save {_c(driver_impact * 0.5)}/month.",
                    "potential_monthly_savings": round(driver_impact * 0.5, 2),
                    "action_required": "Engineering validation of workload CPU/memory requirements.",
                })
            elif "D2" in short_sku:
                optimizations.append({
                    "target_resource": primary_driver.address.split(".")[-1],
                    "suggestion": f"Evaluate burstable Standard_B2s if workload is intermittent, saving up to {_c(driver_impact * 0.55)}/month.",
                    "potential_monthly_savings": round(driver_impact * 0.55, 2),
                    "action_required": "Benchmark CPU credit utilization profile.",
                })
            elif "Premium_LRS" in short_sku:
                optimizations.append({
                    "target_resource": primary_driver.address.split(".")[-1],
                    "suggestion": f"Evaluate StandardSSD_LRS storage tier if high IOPS is not required, saving {_c(driver_impact * 0.4)}/month.",
                    "potential_monthly_savings": round(driver_impact * 0.4, 2),
                    "action_required": "Verify disk throughput SLA.",
                })
            else:
                optimizations.append({
                    "target_resource": primary_driver.address.split(".")[-1],
                    "suggestion": f"Review provisioned capacity for {short_sku} or consider 1-year reserved commitment.",
                    "potential_monthly_savings": round(driver_impact * 0.35, 2),
                    "action_required": "Confirm workload lifetime.",
                })

        policy_remedy = []
        if verdict.is_breached:
            excess = verdict.amount_difference
            policy_remedy.append(
                f"Reduce planned monthly increase by at least {_c(excess)}/month to meet the {_c(verdict.budget_threshold)}/month budget."
            )
            if primary_driver and primary_driver.delta_monthly_cost >= excess:
                policy_remedy.append(
                    f"Downsizing {primary_driver.address.split('.')[-1]} would recover {_c(primary_driver.delta_monthly_cost)}/month, bringing the plan within budget."
                )
        else:
            policy_remedy.append(
                f"Deployment is within budget policy with {_c(verdict.amount_difference)}/month headroom remaining."
            )

        return {
            "title": "COST INSIGHT",
            "detected_cost_increase": f"{_c(fin_summary.net_monthly_impact, sign=True)}/month",
            "primary_driver": driver_desc,
            "driver_impact_monthly": driver_impact,
            "cost_concentration_percentage": concentration_pct,
            "why_did_cost_change": explanations,
            "where_cost_is_concentrated": f"{concentration_pct}% of the cost increase is concentrated in {driver_desc}.",
            "optimizations": optimizations,
            "how_to_satisfy_policy": policy_remedy,
            "disclaimer": "CostGuard insights are suggestions based on deterministic pricing data and require engineering validation.",
        }


class RiskAnalyzer:
    """
    Transparent, explainable infrastructure cost-risk indicator.
    Evaluates transparent factors without opaque ML scoring.
    """

    @staticmethod
    def assess_risk(
        fin_summary: FinancialSummary,
        verdict: PolicyVerdict,
        details: List[ResourceCostDetail],
    ) -> Dict[str, Any]:
        billable_resources = [r for r in details if r.status != "SKIPPED"]
        increasing_resources = [r for r in details if r.delta_monthly_cost > 0]

        total_changed = len(billable_resources)
        increasing_count = len(increasing_resources)
        pct_increasing = (increasing_count / total_changed * 100.0) if total_changed > 0 else 0.0

        risk_score = 0
        risk_factors: List[Dict[str, str]] = []

        # Factor 1: Budget Breach
        if verdict.is_breached:
            risk_score += 45
            risk_factors.append({
                "factor": "Budget Guardrail Breached",
                "severity": "HIGH",
                "description": f"Net increase of {_c(fin_summary.net_monthly_impact)}/mo exceeds limit of {_c(verdict.budget_threshold)}/mo.",
            })
        elif verdict.budget_threshold > 0:
            utilization = (fin_summary.net_monthly_impact / verdict.budget_threshold) * 100.0
            if utilization > 80:
                risk_score += 25
                risk_factors.append({
                    "factor": "Near Budget Limit",
                    "severity": "MEDIUM",
                    "description": f"Budget utilization is at {utilization:.1f}% of allowable threshold.",
                })

        # Factor 2: Absolute Monthly Impact
        if fin_summary.net_monthly_impact > 15000:
            risk_score += 30
            risk_factors.append({
                "factor": "High Monthly Commitment",
                "severity": "HIGH",
                "description": f"Substantial new spend addition of {_c(fin_summary.net_monthly_impact)}/mo.",
            })
        elif fin_summary.net_monthly_impact > 5000:
            risk_score += 15
            risk_factors.append({
                "factor": "Moderate Cost Addition",
                "severity": "MEDIUM",
                "description": f"Spend increase of {_c(fin_summary.net_monthly_impact)}/mo ({_c(fin_summary.annualized_impact)}/year).",
            })

        # Factor 3: Percentage of Resources Increasing
        if pct_increasing >= 75 and total_changed > 1:
            risk_score += 15
            risk_factors.append({
                "factor": "Widespread Infrastructure Upsizing",
                "severity": "LOW",
                "description": f"{increasing_count} of {total_changed} changed resources ({pct_increasing:.0f}%) increase spend.",
            })

        # Determine level
        if risk_score >= 60:
            level = "CRITICAL"
            badge_color = "red"
        elif risk_score >= 35:
            level = "HIGH"
            badge_color = "orange"
        elif risk_score >= 15:
            level = "MODERATE"
            badge_color = "yellow"
        else:
            level = "LOW"
            badge_color = "emerald"

        return {
            "risk_level": level,
            "risk_score": min(risk_score, 100),
            "badge_color": badge_color,
            "factors": risk_factors,
            "metrics": {
                "total_changed_resources": total_changed,
                "increasing_resources_count": increasing_count,
                "pct_resources_increasing": round(pct_increasing, 1),
                "annualized_impact": fin_summary.annualized_impact,
            },
        }
