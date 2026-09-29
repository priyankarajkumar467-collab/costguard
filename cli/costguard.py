#!/usr/bin/env python3
"""
CostGuard CLI
Intelligent Cloud Infrastructure Cost Impact Predictor & Financial Guardrail.
Usage:
    costguard --plan test-plans/plan_create.json --max-increase 50
    terraform show -json tfplan.binary | costguard --max-increase 50
"""
import sys
import os
import argparse
import json
from pathlib import Path

# Add project root to sys.path so backend imports work reliably
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.database import clear_cache, init_db
from backend.app.services.terraform_parser import parse_terraform_plan
from backend.app.services.pricing_service import AzureRetailPricingProvider
from backend.app.services.cost_calculator import CostCalculator
from backend.app.services.policy_engine import PolicyEngine
from backend.app.services.report_service import ReportService


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="costguard",
        description="CostGuard: FinOps Financial Firewall for Terraform Plans",
        add_help=True,
    )
    parser.add_argument(
        "--plan",
        "-p",
        type=str,
        default=None,
        help="Path to Terraform plan JSON file (or '-' for stdin)",
    )
    parser.add_argument(
        "--max-increase",
        "-m",
        type=float,
        default=4000.0,
        help="Maximum allowed net monthly cost increase in specified currency (default: 4000.0)",
    )
    parser.add_argument(
        "--currency",
        "-c",
        type=str,
        default="INR",
        choices=["INR", "USD", "EUR", "GBP"],
        help="Currency code (INR, USD, EUR, GBP; default: INR)",
    )
    parser.add_argument(
        "--markdown",
        action="store_true",
        help="Output GitHub PR markdown summary instead of terminal table",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output full machine-readable JSON analysis report",
    )
    parser.add_argument(
        "--clear-cache",
        action="store_true",
        help="Clear SQLite pricing cache and exit",
    )
    parser.add_argument(
        "--include-spot",
        action="store_true",
        help="Include Azure Spot / Low Priority meters in pricing evaluation",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    # Clear cache command
    if args.clear_cache:
        deleted = clear_cache()
        print(f"[INFO] Cleared {deleted} entries from CostGuard SQLite pricing cache.")
        return 0

    # Read plan from file or stdin
    plan_raw = ""
    if args.plan and args.plan != "-":
        plan_path = Path(args.plan)
        if not plan_path.exists():
            sys.stderr.write(f"Error: Terraform plan file '{args.plan}' not found.\n")
            return 2
        try:
            with open(plan_path, "r", encoding="utf-8") as f:
                plan_raw = f.read()
        except Exception as e:
            sys.stderr.write(f"Error reading plan file '{args.plan}': {str(e)}\n")
            return 2
    else:
        # Check if stdin is available
        if not sys.stdin.isatty():
            try:
                plan_raw = sys.stdin.read()
            except Exception as e:
                sys.stderr.write(f"Error reading plan from stdin: {str(e)}\n")
                return 2
        else:
            sys.stderr.write("Error: No plan provided. Specify --plan <file> or pipe Terraform JSON to stdin.\n")
            parser.print_help(sys.stderr)
            return 2

    if not plan_raw.strip():
        sys.stderr.write("Error: Empty Terraform plan received.\n")
        return 2

    # Parse Terraform plan
    try:
        parsed_changes, parse_logs = parse_terraform_plan(plan_raw)
    except Exception as e:
        sys.stderr.write(f"Error parsing Terraform plan: {str(e)}\n")
        return 2

    # Run pricing and cost calculations
    pricing_provider = AzureRetailPricingProvider()
    cost_calculator = CostCalculator(pricing_provider)

    try:
        details, fin_summary, cache_summary, explanations, tag_attribution = cost_calculator.calculate_plan_cost(
            parsed_changes=parsed_changes,
            currency=args.currency,
            include_spot=args.include_spot,
        )
    except Exception as e:
        sys.stderr.write(f"Error calculating costs: {str(e)}\n")
        return 2

    # Policy evaluation
    verdict = PolicyEngine.evaluate(fin_summary, max_increase=args.max_increase)

    # Output formatting
    all_logs = parse_logs + pricing_provider.logs

    if args.json:
        output_obj = {
            "currency": fin_summary.currency,
            "financial_summary": fin_summary.__dict__,
            "policy_verdict": verdict.__dict__,
            "cache_summary": cache_summary.__dict__,
            "resource_details": [d.__dict__ for d in details],
            "explanations": explanations,
            "tag_attribution": tag_attribution,
            "logs": all_logs,
        }
        print(json.dumps(output_obj, indent=2))
    elif args.markdown:
        md_text = ReportService.generate_markdown(
            details=details,
            fin=fin_summary,
            verdict=verdict,
            cache=cache_summary,
            explanations=explanations,
        )
        print(md_text)
    else:
        cli_text = ReportService.generate_cli_text(
            details=details,
            fin=fin_summary,
            cache=cache_summary,
            verdict=verdict,
            logs=all_logs,
        )
        print(cli_text)

    return verdict.exit_code


if __name__ == "__main__":
    sys.exit(main())
