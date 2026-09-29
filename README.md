# COSTGUARD 🛡️

### Intelligent Cloud Infrastructure Cost Impact Predictor & Financial Guardrail

> **"Predict infrastructure cost before you deploy."**

CostGuard is a developer-first financial firewall that analyzes Terraform infrastructure plans **before deployment**. It computes exact cost deltas in **Indian Rupees (₹)** using the official Microsoft Azure Retail Prices REST API, writes to a fast SQLite write-through cache, enforces organizational budget policies via automated circuit breaker exit codes, and provides explainable FinOps cost insights.

---

## ⚡ Quick Start

### 1. CLI Usage

Run directly via the included executable wrapper:

```bash
# Analyze a Terraform plan file with a ₹4,000/month budget threshold
./costguard --plan test-plans/plan_create.json --max-increase 4000

# Pipe from Terraform binary plan show
terraform show -json tfplan.binary | ./costguard --max-increase 5000

# Generate GitHub PR Markdown summary
./costguard --plan test-plans/plan_update.json --markdown

# Clear local SQLite pricing cache
./costguard --clear-cache
```

### 2. Full-Stack Web Console

Start the development server (runs on port 3000):

```bash
npm run dev
```

Open `http://localhost:3000` to launch the focused, minimalistic developer interface.

---

## 🎯 Hackathon Demo Flow (Understandable in 5 Seconds)

1. **Open CostGuard Dashboard:**
   Immediately answer: *"What will this Terraform change cost me?"*
   - **Current Cost:** ₹0/mo
   - **Projected Cost:** ₹7,497/mo
   - **Monthly Impact:** +₹7,497/mo
   - **Budget Status:** BLOCKED (or PASS)

2. **Inspect Budget Guardrail Status:**
   - Budget Limit: ₹4,000/month
   - Actual Increase: +₹7,497/month
   - Status: `✕ BUDGET EXCEEDED: Deployment Blocked` (Exit Code 1)

3. **Check the Clean Cost Impact Table:**
   | Resource | Action | SKU | Region | Current | Projected | Impact |
   | :--- | :--- | :--- | :--- | ---: | ---: | ---: |
   | `web_server` | CREATE | Standard_D2s_v3 | eastus | ₹0 | ₹5,852 | +₹5,852 |
   | `data_disk` | CREATE | Premium_LRS | eastus | ₹0 | ₹1,646 | +₹1,646 |
   | `rg_main` | CREATE | N/A | eastus | — | — | SKIPPED |

4. **Understand "Why Did Cost Change?":**
   Deterministic explanations derived directly from Azure calculations:
   - • New VM 'web_server' (Standard_D2s_v3): +₹5,852/month
   - • New Managed disk 'data_disk' (Premium_LRS): +₹1,646/month
   - Total impact: +₹7,497/month

5. **Review Cost Insight:**
   Actionable suggestions grounded in pricing truth:
   - *"Standard_D2s_v3 is the primary driver (78% of net increase). Evaluate burstable Standard_B2s if workload is intermittent, saving up to ₹3,218/month."*

6. **What-If Pricing Comparison:**
   In **Cost Impact**, compare instance sizes:
   - Current: Standard_D4s_v3 (₹11,703/mo)
   - Alternative: Standard_D2s_v3 (₹5,852/mo)
   - Difference: -₹5,852/month (-₹70,224/year)

7. **Adjust Budget in Settings:**
   Increase the budget threshold to ₹8,000/mo $\rightarrow$ Status immediately switches to `✓ WITHIN BUDGET: Deployment Permitted` (Exit Code 0).

8. **Test Cache Performance:**
   Notice the cache indicator: `Cache: 2 hits · 0 API lookups (100% hit rate)` in 0ms.

---

## 📋 Standardized Pipeline Exit Codes

| Exit Code | Status | Description |
| :---: | :---: | :--- |
| **`0`** | **PASS** | Net monthly increase $\le$ `--max-increase`. Deployment permitted. |
| **`1`** | **BLOCKED** | Net monthly increase exceeded the threshold. Financial circuit breaker triggered; deployment stopped. |
| **`2`** | **ERROR** | Malformed plan JSON, missing `resource_changes`, or invalid CLI parameters. |

---

## 🏗️ Architecture

CostGuard features a clean, modular architecture:

```text
├── cli/
│   └── costguard.py                 # Core CLI entrypoint (argparse, stdin pipes, INR tables)
├── backend/
│   ├── app/
│   │   ├── config.py                # Configuration (730 hrs/month, INR default, format_inr)
│   │   ├── database.py              # SQLite write-through cache management
│   │   ├── services/
│   │   │   ├── terraform_parser.py  # Resource & action extractor (skips non-billable)
│   │   │   ├── pricing_service.py   # Official Azure Retail Prices API client (Consumption & Spot filter)
│   │   │   ├── cost_calculator.py   # 730-hour math & INR delta calculations
│   │   │   ├── policy_engine.py     # FinOps budget guardrail & exit codes (0, 1, 2)
│   │   │   ├── advisor.py           # Grounded Cost Insight generator
│   │   │   └── report_service.py    # Clean terminal table & PR Markdown generator
│   │   └── api/                     # Health, plans, analysis, pricing endpoints
│   └── tests/
│       └── test_costguard.py        # Automated test suite (14 test cases)
├── src/                             # Minimal React + TypeScript + Tailwind CSS UI
│   ├── components/
│   │   ├── Header.tsx               # Minimal header with cache indicator & quick controls
│   │   ├── OverviewTab.tsx          # 4 headline cards, budget banner, clean table, cost insights
│   │   ├── PlanAnalyzerTab.tsx      # Upload, paste, and demo plan runner
│   │   ├── CostImpactTab.tsx        # Searchable impact table & What-If pricing comparison
│   │   └── SettingsTab.tsx          # Budget slider, cache controls, and CLI commands
│   ├── utils/format.ts              # Indian Rupee (₹) number formatting utility
│   ├── services/api.ts              # REST API client
│   └── App.tsx                      # 4-tab dashboard root
├── test-plans/                      # Benchmark test plan JSON files
├── costguard                        # Shell wrapper script
├── REPORT.md                        # Hackathon engineering report
└── requirements.txt                 # Python dependencies
```

---

## 🧪 Automated Testing

Run the automated test suite verifying all actions, cache hits/misses, non-billable skips, and exit codes:

```bash
python3 -m unittest backend/tests/test_costguard.py -v
```

Output:
```text
test_15_non_billable_resources_never_crash ... ok
test_malformed_plan_raises_syntax_error ... ok
test_markdown_report_generation ... ok
test_metadata_only_change_gives_zero_delta ... ok
test_plan_create_action ... ok
test_plan_delete_action ... ok
test_plan_replacement_action ... ok
test_plan_update_action ... ok
test_policy_engine_pass_and_circuit_breaker ... ok
test_region_normalization ... ok
test_spot_and_low_priority_filtering ... ok
test_sqlite_cache_write_through_and_hit ... ok
test_tag_attribution_breakdown ... ok
test_unknown_sku_resilience ... ok

Ran 14 tests in 0.19s - OK
```
