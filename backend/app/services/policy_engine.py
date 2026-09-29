"""
CostGuard Policy Guardrail Engine
Evaluates cost changes against organizational budget policies,
enforces FinOps circuit breaker, and issues pipeline exit codes.
"""
from backend.app.config import format_inr
from backend.app.schemas.report import FinancialSummary, PolicyVerdict


class PolicyEngine:
    """
    Evaluates net monthly cost delta against configured financial guardrails.
    """

    @staticmethod
    def evaluate(financial_summary: FinancialSummary, max_increase: float) -> PolicyVerdict:
        delta = financial_summary.net_monthly_impact
        currency = financial_summary.currency

        if delta <= max_increase:
            under_by = round(max_increase - delta, 2)
            amount_str = format_inr(under_by, precision=0) if currency == "INR" else f"${under_by:.2f}"
            msg = f"Within budget policy. Headroom: {amount_str}/month"
            return PolicyVerdict(
                budget_threshold=max_increase,
                status="PASSED",
                amount_difference=under_by,
                is_breached=False,
                exit_code=0,
                summary_message=msg,
            )
        else:
            over_by = round(delta - max_increase, 2)
            amount_str = format_inr(over_by, precision=0) if currency == "INR" else f"${over_by:.2f}"
            msg = f"Budget threshold exceeded by {amount_str}/month. Deployment blocked."
            return PolicyVerdict(
                budget_threshold=max_increase,
                status="FAILED",
                amount_difference=over_by,
                is_breached=True,
                exit_code=1,
                summary_message=msg,
            )
