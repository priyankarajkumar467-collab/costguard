"""
CostGuard Report Generator
Produces standard CLI terminal tables, GitHub PR Markdown summaries, and structured JSON outputs.
"""
from typing import List, Dict, Any
from backend.app.config import format_inr
from backend.app.schemas.report import (
    CostGuardAnalysisReport,
    ResourceCostDetail,
    FinancialSummary,
    CacheSummary,
    PolicyVerdict,
)


class ReportService:
    """Generates formatted reports for CLI and CI/CD pipelines."""

    @staticmethod
    def _fmt(val: float, currency: str = "INR", precision: int = 0, show_sign: bool = False) -> str:
        if currency.upper() == "INR":
            return format_inr(val, precision=precision, show_sign=show_sign)
        sign = "+" if show_sign and val > 0 else ""
        return f"{sign}${val:,.{precision}f}"

    @classmethod
    def generate_cli_text(
        cls,
        details: List[ResourceCostDetail],
        fin: FinancialSummary,
        cache: CacheSummary,
        verdict: PolicyVerdict,
        logs: List[str] = None,
    ) -> str:
        lines: List[str] = []
        curr = fin.currency

        if logs:
            for log in logs:
                lines.append(log)
            if logs:
                lines.append("")

        border = "=" * 60
        lines.append(border)
        lines.append("COSTGUARD — COST IMPACT REPORT")
        lines.append(border)

        # Header
        col_res = 20
        col_act = 10
        col_old = 12
        col_new = 12
        col_del = 14

        header = (
            f"{'Resource':<{col_res}} "
            f"{'Action':<{col_act}} "
            f"{'Current':>{col_old}} "
            f"{'Projected':>{col_new}} "
            f"{'Impact':>{col_del}}"
        )
        lines.append(header)
        lines.append("-" * len(header))

        for r in details:
            addr = r.address.split(".")[-1]
            if len(addr) > col_res - 2:
                addr = addr[: col_res - 4] + ".."

            if r.status == "SKIPPED":
                delta_str = "SKIPPED"
                old_str = "—"
                new_str = "—"
            elif r.status == "UNPRICED":
                delta_str = "UNPRICED"
                old_str = cls._fmt(r.old_monthly_cost, curr)
                new_str = cls._fmt(r.new_monthly_cost, curr)
            else:
                old_str = cls._fmt(r.old_monthly_cost, curr)
                new_str = cls._fmt(r.new_monthly_cost, curr)
                delta_str = cls._fmt(r.delta_monthly_cost, curr, show_sign=True)

            line = (
                f"{addr:<{col_res}} "
                f"{r.action:<{col_act}} "
                f"{old_str:>{col_old}} "
                f"{new_str:>{col_new}} "
                f"{delta_str:>{col_del}}"
            )
            lines.append(line)

        lines.append("-" * len(header))
        lines.append("")

        prior_fmt = cls._fmt(fin.prior_monthly_total, curr)
        proj_fmt = cls._fmt(fin.projected_monthly_total, curr)
        impact_fmt = cls._fmt(fin.net_monthly_impact, curr, show_sign=True)
        annual_fmt = cls._fmt(fin.annualized_impact, curr, show_sign=True)
        budget_fmt = cls._fmt(verdict.budget_threshold, curr)

        lines.append(f"CURRENT COST       {prior_fmt}/month")
        lines.append(f"PROJECTED COST     {proj_fmt}/month")
        lines.append(f"MONTHLY IMPACT     {impact_fmt}/month")
        lines.append(f"ANNUAL IMPACT      {annual_fmt}/year")
        lines.append("")
        lines.append(f"BUDGET             {budget_fmt}/month")

        if verdict.is_breached:
            lines.append("STATUS             ✕ EXCEEDED")
            lines.append("")
            lines.append("DEPLOYMENT BLOCKED")
            lines.append(f"Exit Code: {verdict.exit_code}")
        else:
            lines.append("STATUS             ✓ WITHIN BUDGET")
            lines.append("")
            lines.append("DEPLOYMENT PERMITTED")
            lines.append(f"Exit Code: {verdict.exit_code}")

        lines.append("")
        lines.append(f"Cache: {cache.cache_hits} hits · {cache.api_calls} API lookups ({cache.cache_hit_rate_pct:.0f}% hit rate)")
        lines.append(border)
        return "\n".join(lines)

    @classmethod
    def generate_markdown(
        cls,
        details: List[ResourceCostDetail],
        fin: FinancialSummary,
        verdict: PolicyVerdict,
        cache: CacheSummary,
        explanations: List[str],
    ) -> str:
        lines: List[str] = []
        curr = fin.currency
        lines.append("## 🛡️ CostGuard — Infrastructure Cost Impact Report")
        lines.append("")

        status_badge = "❌ **BUDGET EXCEEDED (DEPLOYMENT BLOCKED)**" if verdict.is_breached else "✅ **WITHIN BUDGET (DEPLOYMENT PERMITTED)**"
        impact_fmt = cls._fmt(fin.net_monthly_impact, curr, show_sign=True)
        budget_fmt = cls._fmt(verdict.budget_threshold, curr)
        annual_fmt = cls._fmt(fin.annualized_impact, curr, show_sign=True)

        lines.append(f"> **Status:** {status_badge}  ")
        lines.append(f"> **Monthly Impact:** `{impact_fmt}/mo` | **Budget:** `{budget_fmt}/mo` | **Annualized:** `{annual_fmt}/yr`  ")
        lines.append(f"> **Cache:** {cache.cache_hits} hits · {cache.api_calls} API lookups ({cache.cache_hit_rate_pct:.0f}%)")
        lines.append("")

        lines.append("### Resource Breakdown")
        lines.append("")
        lines.append("| Resource | Action | Region | SKU | Current | Projected | Impact |")
        lines.append("| :--- | :--- | :--- | :--- | ---: | ---: | ---: |")

        for r in details:
            short_addr = r.address.split(".")[-1]
            if r.status == "SKIPPED":
                delta_str = "_Skipped_"
                old_str = "—"
                new_str = "—"
            elif r.status == "UNPRICED":
                delta_str = "_Unpriced_"
                old_str = cls._fmt(r.old_monthly_cost, curr)
                new_str = cls._fmt(r.new_monthly_cost, curr)
            else:
                old_str = cls._fmt(r.old_monthly_cost, curr)
                new_str = cls._fmt(r.new_monthly_cost, curr)
                delta_str = cls._fmt(r.delta_monthly_cost, curr, show_sign=True)

            lines.append(
                f"| `{short_addr}` | **{r.action}** | {r.region} | {r.sku} | {old_str} | {new_str} | **{delta_str}** |"
            )

        lines.append("")
        if explanations:
            lines.append("### Why did the cost change?")
            lines.append("")
            for exp in explanations:
                lines.append(f"• {exp}")
            lines.append("")

        lines.append("---")
        lines.append("*Generated by CostGuard Financial Guardrail*")
        return "\n".join(lines)
