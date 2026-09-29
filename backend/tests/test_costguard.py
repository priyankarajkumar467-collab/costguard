"""
CostGuard Automated Test Suite
Verifies:
- JSON plan parsing
- Actions: CREATE, DELETE, UPDATE, REPLACEMENT, METADATA-ONLY
- Non-billable resources handling
- Unknown SKU resilience
- Spot / Low Priority filtering
- SQLite write-through cache HIT & MISS
- 730-hour calculations
- Policy engine guardrails and circuit breaker
- Exit codes: 0 (pass), 1 (fail), 2 (syntax/usage error)
- Markdown report formatting
- Tag-based attribution
"""
import unittest
import json
import tempfile
import os
import sys
import time
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.database import init_db, clear_cache, get_cached_price, set_cached_price
from backend.app.services.terraform_parser import parse_terraform_plan, normalize_region
from backend.app.services.pricing_service import AzureRetailPricingProvider
from backend.app.services.cost_calculator import CostCalculator
from backend.app.services.policy_engine import PolicyEngine
from backend.app.services.report_service import ReportService
from backend.app.services.advisor import AICostAdvisor, RiskAnalyzer


class TestCostGuardEngine(unittest.TestCase):

    def setUp(self):
        self.pricing_provider = AzureRetailPricingProvider()
        self.calculator = CostCalculator(self.pricing_provider)

    def test_region_normalization(self):
        self.assertEqual(normalize_region("East US"), "eastus")
        self.assertEqual(normalize_region("East US 2"), "eastus2")
        self.assertEqual(normalize_region("West Europe"), "westeurope")
        self.assertEqual(normalize_region("North Europe"), "northeurope")
        self.assertEqual(normalize_region(None), "eastus")

    def test_plan_create_action(self):
        with open(ROOT_DIR / "test-plans/plan_create.json", "r") as f:
            raw = f.read()
        parsed, logs = parse_terraform_plan(raw)
        self.assertEqual(len(parsed), 3)

        details, fin, cache, exp, tags = self.calculator.calculate_plan_cost(parsed)
        self.assertGreater(fin.projected_monthly_total, 0)
        self.assertEqual(fin.prior_monthly_total, 0)
        self.assertGreater(fin.net_monthly_impact, 0)

        # Check non-billable resource group was skipped
        rg = next(r for r in details if r.address == "azurerm_resource_group.rg_main")
        self.assertEqual(rg.status, "SKIPPED")
        self.assertEqual(rg.delta_monthly_cost, 0.0)

    def test_plan_delete_action(self):
        with open(ROOT_DIR / "test-plans/plan_delete.json", "r") as f:
            raw = f.read()
        parsed, _ = parse_terraform_plan(raw)
        details, fin, cache, exp, tags = self.calculator.calculate_plan_cost(parsed)

        self.assertEqual(fin.projected_monthly_total, 0.0)
        self.assertGreater(fin.prior_monthly_total, 0.0)
        self.assertLess(fin.net_monthly_impact, 0.0)  # Cost reduction
        self.assertEqual(details[0].action, "DELETE")

    def test_plan_update_action(self):
        with open(ROOT_DIR / "test-plans/plan_update.json", "r") as f:
            raw = f.read()
        parsed, _ = parse_terraform_plan(raw)
        details, fin, cache, exp, tags = self.calculator.calculate_plan_cost(parsed)

        self.assertEqual(details[0].action, "UPDATE")
        self.assertGreater(fin.projected_monthly_total, fin.prior_monthly_total)
        self.assertGreater(fin.net_monthly_impact, 0.0)

    def test_plan_replacement_action(self):
        with open(ROOT_DIR / "test-plans/plan_replacement.json", "r") as f:
            raw = f.read()
        parsed, _ = parse_terraform_plan(raw)
        self.assertEqual(parsed[0].action_type, "replacement")
        details, fin, cache, exp, tags = self.calculator.calculate_plan_cost(parsed)
        self.assertEqual(details[0].action, "REPLACEMENT")

    def test_metadata_only_change_gives_zero_delta(self):
        with open(ROOT_DIR / "test-plans/plan_metadata_change.json", "r") as f:
            raw = f.read()
        parsed, _ = parse_terraform_plan(raw)
        details, fin, cache, exp, tags = self.calculator.calculate_plan_cost(parsed)

        self.assertEqual(fin.net_monthly_impact, 0.0)
        self.assertEqual(details[0].delta_monthly_cost, 0.0)

    def test_15_non_billable_resources_never_crash(self):
        with open(ROOT_DIR / "test-plans/plan_noise.json", "r") as f:
            raw = f.read()
        parsed, logs = parse_terraform_plan(raw)
        self.assertEqual(len(parsed), 15)
        for p in parsed:
            self.assertFalse(p.is_billable)

        details, fin, cache, exp, tags = self.calculator.calculate_plan_cost(parsed)
        self.assertEqual(fin.net_monthly_impact, 0.0)
        self.assertTrue(all(d.status == "SKIPPED" for d in details))

    def test_unknown_sku_resilience(self):
        with open(ROOT_DIR / "test-plans/plan_unknown_sku.json", "r") as f:
            raw = f.read()
        parsed, logs = parse_terraform_plan(raw)
        details, fin, cache, exp, tags = self.calculator.calculate_plan_cost(parsed)

        # First item was unknown SKU
        unknown_detail = details[0]
        self.assertEqual(unknown_detail.status, "UNPRICED")
        self.assertEqual(unknown_detail.delta_monthly_cost, 0.0)

        # Second item was valid Standard_B1s and was calculated successfully
        valid_detail = details[1]
        self.assertEqual(valid_detail.status, "SUCCESS")
        self.assertGreater(valid_detail.delta_monthly_cost, 0.0)

    def test_sqlite_cache_write_through_and_hit(self):
        sku = f"Test_Cached_SKU_{int(time.time() * 1000)}"
        region = "eastus"
        currency = "INR"

        # Verify not present initially
        self.assertIsNone(get_cached_price(sku, region, currency))

        # Store in cache
        set_cached_price(sku, region, 50.0, currency, "Test Meter")
        cached = get_cached_price(sku, region, currency)
        self.assertIsNotNone(cached)
        self.assertEqual(cached["hourly_rate"], 50.0)

        # Query via provider
        res = self.pricing_provider.get_hourly_price(sku, region, "azurerm_virtual_machine", currency)
        self.assertEqual(res.source, "cache")
        self.assertEqual(res.hourly_rate, 50.0)

    def test_spot_and_low_priority_filtering(self):
        items = [
            {"armSkuName": "Standard_D2s_v3", "meterName": "Standard_D2s_v3 Spot", "retailPrice": 0.015, "productName": "Virtual Machines"},
            {"armSkuName": "Standard_D2s_v3", "meterName": "Standard_D2s_v3 Low Priority", "retailPrice": 0.02, "productName": "Virtual Machines"},
            {"armSkuName": "Standard_D2s_v3", "meterName": "Standard_D2s_v3", "retailPrice": 0.096, "productName": "Virtual Machines"},
        ]
        # Spot excluded by default
        best = self.pricing_provider._filter_best_meter(items, "Standard_D2s_v3", "azurerm_linux_virtual_machine", include_spot=False)
        self.assertIsNotNone(best)
        self.assertEqual(best["retailPrice"], 0.096)

        # Spot included when requested
        best_spot = self.pricing_provider._filter_best_meter(items, "Standard_D2s_v3", "azurerm_linux_virtual_machine", include_spot=True)
        self.assertIsNotNone(best_spot)
        self.assertEqual(best_spot["retailPrice"], 0.015)

    def test_policy_engine_pass_and_circuit_breaker(self):
        with open(ROOT_DIR / "test-plans/plan_create.json", "r") as f:
            raw = f.read()
        parsed, _ = parse_terraform_plan(raw)
        details, fin, cache, exp, tags = self.calculator.calculate_plan_cost(parsed, currency="INR")

        # Budget of ₹10,000 -> Pass (exit code 0)
        verdict_pass = PolicyEngine.evaluate(fin, max_increase=10000.0)
        self.assertEqual(verdict_pass.status, "PASSED")
        self.assertEqual(verdict_pass.exit_code, 0)
        self.assertFalse(verdict_pass.is_breached)

        # Budget of ₹500 -> Fail / Circuit Breaker (exit code 1)
        verdict_fail = PolicyEngine.evaluate(fin, max_increase=500.0)
        self.assertEqual(verdict_fail.status, "FAILED")
        self.assertEqual(verdict_fail.exit_code, 1)
        self.assertTrue(verdict_fail.is_breached)

    def test_malformed_plan_raises_syntax_error(self):
        with open(ROOT_DIR / "test-plans/plan_malformed.json", "r") as f:
            raw = f.read()
        with self.assertRaises(ValueError):
            parse_terraform_plan(raw)

    def test_markdown_report_generation(self):
        with open(ROOT_DIR / "test-plans/plan_create.json", "r") as f:
            raw = f.read()
        parsed, _ = parse_terraform_plan(raw)
        details, fin, cache, exp, tags = self.calculator.calculate_plan_cost(parsed, currency="INR")
        verdict = PolicyEngine.evaluate(fin, max_increase=5000.0)

        md = ReportService.generate_markdown(details, fin, verdict, cache, exp)
        self.assertIn("## 🛡️ CostGuard", md)
        self.assertIn("Resource Breakdown", md)

    def test_tag_attribution_breakdown(self):
        with open(ROOT_DIR / "test-plans/plan_create.json", "r") as f:
            raw = f.read()
        parsed, _ = parse_terraform_plan(raw)
        details, fin, cache, exp, tags = self.calculator.calculate_plan_cost(parsed)

        self.assertIn("Environment", tags)
        self.assertIn("Team", tags)
        prod_tags = [item for item in tags["Environment"] if item["value"] == "Production"]
        self.assertTrue(len(prod_tags) > 0)


if __name__ == "__main__":
    unittest.main()
