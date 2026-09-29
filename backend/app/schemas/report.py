"""
CostGuard Report & Policy Schemas
"""
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional


@dataclass
class ResourceCostDetail:
    address: str
    resource_type: str
    action: str  # CREATE, DELETE, UPDATE, REPLACEMENT, SKIP
    region: str
    sku: str
    meter: str
    old_hourly_cost: float
    new_hourly_cost: float
    old_monthly_cost: float
    new_monthly_cost: float
    delta_monthly_cost: float
    status: str  # SUCCESS, SKIPPED, UNPRICED
    note: str = ""
    tags: Dict[str, str] = field(default_factory=dict)


@dataclass
class CacheSummary:
    cache_hits: int = 0
    cache_misses: int = 0
    api_calls: int = 0
    cache_hit_rate_pct: float = 0.0


@dataclass
class FinancialSummary:
    currency: str
    prior_monthly_total: float
    projected_monthly_total: float
    net_monthly_impact: float
    annualized_impact: float
    quarterly_impact: float


@dataclass
class PolicyVerdict:
    budget_threshold: float
    status: str  # "PASSED" | "FAILED"
    amount_difference: float  # abs(net_monthly_impact - budget_threshold)
    is_breached: bool
    exit_code: int  # 0 = pass, 1 = fail, 2 = error
    summary_message: str


@dataclass
class TagBreakdownItem:
    tag_name: str
    tag_value: str
    prior_monthly_cost: float
    projected_monthly_cost: float
    delta_monthly_cost: float


@dataclass
class CostGuardAnalysisReport:
    timestamp: str
    currency: str
    resource_details: List[ResourceCostDetail]
    financial_summary: FinancialSummary
    cache_summary: CacheSummary
    policy_verdict: PolicyVerdict
    tag_attribution: Dict[str, List[Dict[str, Any]]]
    deterministic_explanation: List[str]
    ai_advisor_analysis: Optional[Dict[str, Any]] = None
    risk_assessment: Optional[Dict[str, Any]] = None
