# CostGuard - Engineering & Architectural Report

**Hackathon Challenge:** "CostGuard on the Plan"  
**Product:** CostGuard - Intelligent Cloud Infrastructure Cost Impact Predictor & Financial Guardrail  
**Tagline:** "Predict infrastructure cost before you deploy."  
**Primary Currency:** ₹ Indian Rupee (INR)

---

## 1. What We Built

CostGuard is a developer-first financial firewall that analyzes a Terraform plan JSON prior to deployment. It computes precise monthly and annualized cost deltas in **Indian Rupees (₹)** using the official Microsoft Azure Retail Prices REST API, writes to a fast SQLite write-through cache, enforces organizational budget policies via circuit breaker exit codes (0, 1, 2), and provides transparent FinOps cost insights grounded in deterministic pricing calculations.

### Core Value Delivered:
1. **Pre-Deployment Financial Predictability:** Informs engineers of the exact monthly cost delta in ₹ before running `terraform apply`.
2. **Deterministic Source of Truth:** 730 hours/month calculation without invented pricing.
3. **Automated Pipeline Circuit Breaker:** Blocks merging or applying PRs that breach budget thresholds with exit code 1.
4. **Resilient Local Caching:** SQLite write-through cache prevents API rate limits and enables instant repeat runs.
5. **Focused, Minimalistic UI:** Answers all key financial questions in 5 seconds with zero clutter.

---

## 2. System Architecture

```text
Terraform Plan JSON (or stdin pipe)
               │
               ▼
┌──────────────────────────────┐
│   Terraform Parser Engine    │  --> Extracts resource_changes[]
│                              │  --> Classifies action (create, delete, update, replacement)
│                              │  --> Filters non-billable noise (vnet, subnet, nsg, etc.)
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  SKU & Region Normalization  │  --> "East US" -> "eastus"
│                              │  --> Disks, App Service, VMs
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│   SQLite Write-Through Cache │  <── (sku, region, currency) Primary Key
│      (pricing_cache.db)      │  ──> Cache HIT (0ms, 0 API calls)
└──────────────┬───────────────┘
               │ (Cache MISS)
               ▼
┌──────────────────────────────┐
│ Official Azure Retail API    │  ──> https://prices.azure.com/api/retail/prices
│ (OData Filter & Spot Filter) │  ──> Consumption pricing & Spot exclusion
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ 730-Hour Cost Calculator     │  ──> Delta = New Monthly - Old Monthly (in ₹ INR)
│                              │  ──> Indian digit formatting (e.g. ₹12,500, ₹1,25,000)
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Policy Guardrail Circuit     │  ──> Delta <= Max Increase ? PASS (0) : BLOCKED (1)
│ Breaker                      │  ──> Clear visual status & standardized exit codes
└──────────────┬───────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
┌──────────────┐┌──────────────┐
│ CostGuard    ││  Minimal     │
│ CLI Terminal ││ Full-Stack   │
│ & PR Markdown││ Web Console  │
└──────────────┘└──────────────┘
```

---

## 3. Detection & Extraction Logic

- **Input:** Standard output of `terraform show -json tfplan.binary` or any valid Terraform plan JSON.
- **Resource Processing:** Loops over `resource_changes[]`.
- **Action Classification:**
  - `["create"]` $\rightarrow$ CREATE
  - `["delete"]` $\rightarrow$ DELETE
  - `["update"]` $\rightarrow$ UPDATE
  - `["delete", "create"]` or `["create", "delete"]` $\rightarrow$ REPLACEMENT
  - `["no-op"]` $\rightarrow$ Ignored gracefully
- **SKU Extraction:**
  - Virtual Machines: Inspects `after.size`, `after.vm_size`, `before.size`, `before.vm_size`.
  - Managed Disks: Inspects `storage_account_type` and `disk_size_gb` (e.g., `Premium_LRS_128GB`).
  - App Service Plans: Inspects `sku_name` or `sku.size`.
- **Region Normalization:**
  - Converts to lowercase and removes spaces/hyphens (e.g. `"East US"` $\rightarrow$ `"eastus"`, `"West Europe"` $\rightarrow$ `"westeurope"`).
- **Graceful Non-Billable Handling:**
  - Resources such as `azurerm_resource_group`, `azurerm_virtual_network`, `azurerm_subnet`, `azurerm_network_security_group`, `azurerm_route_table`, `azurerm_network_interface` are logged as `[INFO] Skipping non-billable resource: <address>` with status `SKIPPED` and `₹0.00` delta. The application **never crashes**.
- **Unknown SKU Resilience:**
  - If a resource contains a custom or unpriced SKU, CostGuard outputs `[WARN] SKU '<sku>' not found in Azure Retail API. Skipping.` and marks the resource as `UNPRICED`, continuing execution without crashing.

---

## 4. Azure Retail Prices API Integration

- **Endpoint:** `https://prices.azure.com/api/retail/prices`
- **Authentication:** Unauthenticated public REST API.
- **OData Filtering:**
  ```http
  $filter=serviceName eq 'Virtual Machines' and armRegionName eq '{region}' and armSkuName eq '{sku}' and priceType eq 'Consumption' and currencyCode eq 'INR'
  ```
- **Spot & Low Priority Filtering:**
  - Filters out meters containing `"Spot"` or `"Low Priority"` unless explicitly requested via `--include-spot`.

---

## 5. SQLite Write-Through Cache Strategy

- **Database:** `pricing_cache.db`
- **Table:** `pricing_cache` (Primary Key: `(sku, region, currency)`)
- **Write-Through Workflow:**
  1. Check SQLite for `(sku, region, currency)`.
  2. If found $\rightarrow$ **Cache HIT**: Record hit, return cached rate.
  3. If not found $\rightarrow$ **Cache MISS**: Query Azure Retail API, filter meter, write record to SQLite with current timestamp, return rate.
  4. Instant zero-latency repeat executions.
- **Cache Management:**
  - CLI flag: `--clear-cache`
  - Web console with real-time hit/miss metrics and clean clear button.

---

## 6. Cost Calculation Methodology

- **Standard Hours Per Month:** Exactly `730.0` hours (FinOps standard).
- **Monthly Cost:** $\text{Hourly Price} \times 730$
- **Delta Formulations:**
  - **CREATE:** $\text{Old} = ₹0$, $\text{New} = \text{calculated cost}$, $\text{Delta} = \text{New}$
  - **DELETE:** $\text{Old} = \text{calculated cost}$, $\text{New} = ₹0$, $\text{Delta} = -\text{Old}$
  - **UPDATE:** $\text{Old} = \text{old SKU cost}$, $\text{New} = \text{new SKU cost}$, $\text{Delta} = \text{New} - \text{Old}$
  - **REPLACEMENT:** $\text{Delta} = \text{New} - \text{Old}$
  - **METADATA-ONLY:** If SKU and region are unchanged, $\text{Delta} = ₹0.00$.

---

## 7. Policy Guardrails & Circuit Breaker

- **Parameter:** `--max-increase <number>` (default: `₹4,000/mo`)
- **Evaluation:**
  - If $\text{Net Monthly Delta} \le \text{Max Increase}$:
    - Verdict: **PASS**
    - Exit Code: **0**
    - Status: `✓ WITHIN BUDGET`
  - If $\text{Net Monthly Delta} > \text{Max Increase}$:
    - Verdict: **BLOCKED**
    - Exit Code: **1**
    - Status: `✕ BUDGET EXCEEDED: Deployment Blocked`
  - Invalid Input / CLI syntax error:
    - Exit Code: **2**

---

## 8. Test Results Matrix

Automated verification suite executed with `backend/tests/test_costguard.py` (14/14 tests passing):

| Test Case | Input Plan | Detected Change | Calculated Cost Delta (₹) | Verdict | Exit Code | Cache Behavior |
| :--- | :--- | :--- | ---: | :--- | :---: | :--- |
| **Plan 1: New VM + Disk** | `plan_create.json` | Create Standard_D2s_v3 + Managed Disk | +₹7,497/mo | BLOCKED (> ₹4,000 limit) | `1` | 1st run: 2 lookups; 2nd run: 2 hits (100%) |
| **Plan 2: VM Deletion** | `plan_delete.json` | Delete Standard_B1s | -₹634/mo | PASS (< ₹4,000 limit) | `0` | Cache hit on repeat |
| **Plan 3: VM Upgrade** | `plan_update.json` | Upgrade Standard_B2s -> Standard_D4s_v3 | +₹9,168/mo | BLOCKED (> ₹4,000 limit) | `1` | Evaluates old vs new SKUs |
| **Plan 4: Hostile Non-Billable** | `plan_noise.json` | 15 resources (vnet, subnet, nsg, route) | ₹0/mo | PASS | `0` | 15 resources skipped gracefully |
| **Plan 5: VM Replacement** | `plan_replacement.json` | Delete Standard_D2s_v3, Create D4s_v3 | +₹5,852/mo | BLOCKED (> ₹4,000 limit) | `1` | Calculates destroy & create |
| **Plan 6: Metadata Only** | `plan_metadata_change.json` | Tag change on Standard_B2s | ₹0/mo | PASS | `0` | Delta exactly ₹0.00 |
| **Plan 7: Unknown SKU** | `plan_unknown_sku.json` | Custom_Unknown_SKU + Standard_B1s | +₹634/mo | PASS | `0` | Unpriced warning logged; no crash |
| **Plan 8: Malformed Plan** | `plan_malformed.json` | Invalid JSON syntax | N/A | ERROR | `2` | Clean error message; exit code 2 |

---

## 9. Limitations & Next Steps

1. **Multi-Cloud Expansion:** Current live retail pricing queries Azure Retail Prices API; expanding parser mappings to AWS Price List API and Google Cloud Billing Catalog would unlock multi-cloud parity.
2. **Variable/Usage-Based Meters:** Resources with dynamic consumption tiers (such as Azure Functions per-execution invocations or egress network bandwidth) depend on runtime traffic patterns; integrating historical telemetry can refine estimates.
3. **Reserved Instances & Savings Plans:** Current calculations utilize on-demand retail consumption; future iterations can ingest Azure Enterprise Agreement / MCA rate cards for 1-year and 3-year RI comparisons.

---

## 10. Verification & Run Commands

### Standalone CLI Execution:
```bash
# Display help and usage instructions
costguard --help

# Analyze a Terraform plan file
costguard --plan plan.json

# Analyze via stdin pipeline
terraform show -json tfplan | costguard

# Custom budget threshold (e.g. ₹10,000/month)
costguard --plan test-plans/plan_create.json --max-increase 10000

# Output GitHub PR Markdown summary
costguard --plan test-plans/plan_update.json --markdown

# Output full machine-readable JSON
costguard --plan test-plans/plan_replacement.json --json

# Clear local SQLite pricing cache
costguard --clear-cache
```

### Run Automated Unit Test Suite:
```bash
python3 -m unittest backend/tests/test_costguard.py -v
```

### Run Full-Stack Web Application:
```bash
npm run dev
# Server running at http://localhost:3000
```
