/**
 * CostGuard Engine (Pure TypeScript / Node.js Runtime)
 * Handles Terraform plan parsing, live Azure Retail Prices API lookup,
 * SQLite write-through caching, 730 hours/month cost calculation,
 * policy evaluation (circuit breaker exit codes 0, 1, 2), and reporting.
 */
import fs from 'fs';
import path from 'path';

// Known non-billable Azure infrastructure resources that should be skipped gracefully
export const NON_BILLABLE_TYPES = new Set([
  'azurerm_resource_group',
  'azurerm_virtual_network',
  'azurerm_subnet',
  'azurerm_network_security_group',
  'azurerm_network_security_rule',
  'azurerm_route_table',
  'azurerm_route',
  'azurerm_subnet_route_table_association',
  'azurerm_subnet_network_security_group_association',
  'azurerm_network_interface',
  'azurerm_private_dns_zone',
  'azurerm_private_dns_zone_virtual_network_link',
  'azurerm_log_analytics_workspace',
  'azurerm_monitor_diagnostic_setting',
  'azurerm_role_assignment',
  'azurerm_user_assigned_identity',
  'azurerm_key_vault_access_policy',
  'azurerm_public_ip_prefix',
]);

export const HOURS_PER_MONTH = 730.0;
export const USD_TO_INR_RATE = 83.5;
export const AZURE_PRICES_API_URL = 'https://prices.azure.com/api/retail/prices';

export interface ResourceTagInfo {
  environment: string;
  team: string;
  application: string;
  owner: string;
  raw_tags: Record<string, string>;
}

export interface ParsedResourceChange {
  address: string;
  resource_type: string;
  actions: string[];
  action_type: 'create' | 'delete' | 'update' | 'replacement' | 'no-op';
  is_billable: boolean;
  skip_reason?: string;
  before_sku?: string | null;
  after_sku?: string | null;
  before_region?: string | null;
  after_region?: string | null;
  tags: ResourceTagInfo;
  raw_before?: any;
  raw_after?: any;
}

export interface PriceLookupResult {
  sku: string;
  region: string;
  currency: string;
  hourly_rate: number | null;
  found: boolean;
  source: 'cache' | 'azure_api' | 'benchmark_catalog' | 'unpriced';
  meter_name?: string;
  error_message?: string;
}

export interface ResourceCostDetail {
  address: string;
  resource_type: string;
  action: string;
  region: string;
  sku: string;
  meter: string;
  old_hourly_cost: number;
  new_hourly_cost: number;
  old_monthly_cost: number;
  new_monthly_cost: number;
  delta_monthly_cost: number;
  status: 'SUCCESS' | 'SKIPPED' | 'UNPRICED';
  note: string;
  tags: Record<string, string>;
}

export interface FinancialSummary {
  currency: string;
  prior_monthly_total: number;
  projected_monthly_total: number;
  net_monthly_impact: number;
  annualized_impact: number;
  quarterly_impact: number;
}

export interface CacheSummary {
  cache_hits: number;
  cache_misses: number;
  api_calls: number;
  cache_hit_rate_pct: number;
}

export interface PolicyVerdict {
  budget_threshold: number;
  status: 'PASSED' | 'BLOCKED';
  amount_difference: number;
  is_breached: boolean;
  exit_code: number;
  summary_message: string;
}

export interface CostGuardAnalysisOutput {
  currency: string;
  financial_summary: FinancialSummary;
  policy_verdict: PolicyVerdict;
  cache_summary: CacheSummary;
  resource_details: ResourceCostDetail[];
  explanations: string[];
  tag_attribution: Record<string, any[]>;
  logs: string[];
  resource_counts?: {
    total_detected: number;
    billable: number;
    skipped: number;
    creates: number;
    deletes: number;
    updates: number;
    replacements: number;
  };
}

// ----------------------------------------------------
// 1. SQLite Cache Handler (using node:sqlite with in-memory fallback)
// ----------------------------------------------------
class SQLitePricingCache {
  private db: any = null;
  private memoryCache: Map<string, { hourly_rate: number; meter_name: string; cached_at: number }> = new Map();
  private dbPath: string;

  constructor(dbPath: string = path.join(process.cwd(), 'pricing_cache.db')) {
    this.dbPath = dbPath;
    try {
      // Dynamic import / require of node:sqlite
      const { DatabaseSync } = require('node:sqlite');
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS pricing_cache (
          sku TEXT,
          region TEXT,
          hourly_rate REAL,
          currency TEXT,
          meter_name TEXT,
          cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (sku, region, currency)
        )
      `);
    } catch (e: any) {
      console.warn('[CostGuard Cache] node:sqlite initialization warning, using in-memory store:', e.message);
      this.db = null;
    }
  }

  get(sku: string, region: string, currency: string = 'INR'): { hourly_rate: number; meter_name: string } | null {
    currency = currency.toUpperCase();
    if (this.db) {
      try {
        const stmt = this.db.prepare('SELECT hourly_rate, meter_name FROM pricing_cache WHERE sku = ? AND region = ? AND currency = ?');
        const row = stmt.get(sku, region, currency);
        if (row && typeof row.hourly_rate === 'number') {
          return { hourly_rate: row.hourly_rate, meter_name: row.meter_name || 'Cached Meter' };
        }
      } catch (err: any) {
        // Fallback to memory
      }
    }
    const key = `${sku}:${region}:${currency}`;
    const mem = this.memoryCache.get(key);
    return mem ? { hourly_rate: mem.hourly_rate, meter_name: mem.meter_name } : null;
  }

  set(sku: string, region: string, hourly_rate: number, currency: string = 'INR', meter_name: string = 'Azure Retail Meter'): void {
    currency = currency.toUpperCase();
    const now = Math.floor(Date.now() / 1000);
    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT INTO pricing_cache (sku, region, hourly_rate, currency, meter_name, cached_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(sku, region, currency) DO UPDATE SET
            hourly_rate = excluded.hourly_rate,
            meter_name = excluded.meter_name,
            cached_at = excluded.cached_at
        `);
        stmt.run(sku, region, hourly_rate, currency, meter_name, now);
      } catch (err: any) {
        // ignore
      }
    }
    const key = `${sku}:${region}:${currency}`;
    this.memoryCache.set(key, { hourly_rate, meter_name, cached_at: now });
  }

  clear(): number {
    let deletedCount = 0;
    if (this.db) {
      try {
        const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM pricing_cache');
        const countRow = countStmt.get();
        deletedCount = countRow?.count || 0;
        this.db.exec('DELETE FROM pricing_cache');
      } catch {
        // ignore
      }
    }
    deletedCount += this.memoryCache.size;
    this.memoryCache.clear();
    return deletedCount;
  }

  getStats(): { total_entries: number; oldest_timestamp: string | null; newest_timestamp: string | null; entries: any[] } {
    if (this.db) {
      try {
        const rows = this.db.prepare('SELECT sku, region, currency, hourly_rate, meter_name, cached_at FROM pricing_cache ORDER BY cached_at DESC').all();
        if (rows && rows.length > 0) {
          return {
            total_entries: rows.length,
            oldest_timestamp: String(rows[rows.length - 1].cached_at),
            newest_timestamp: String(rows[0].cached_at),
            entries: rows.slice(0, 50),
          };
        }
      } catch {
        // ignore
      }
    }
    return {
      total_entries: this.memoryCache.size,
      oldest_timestamp: null,
      newest_timestamp: null,
      entries: Array.from(this.memoryCache.entries()).map(([k, v]) => {
        const [sku, region, currency] = k.split(':');
        return { sku, region, currency, ...v };
      }),
    };
  }
}

export const sqliteCache = new SQLitePricingCache();

// ----------------------------------------------------
// 2. Normalization & Helpers
// ----------------------------------------------------
export function normalizeRegion(regionRaw?: string | null): string {
  if (!regionRaw) return 'eastus';
  return regionRaw.trim().toLowerCase().replace(/[\s\-_]+/g, '');
}

export function extractSku(resourceType: string, data: any): string | null {
  if (!data || typeof data !== 'object') return null;

  if (
    resourceType === 'azurerm_linux_virtual_machine' ||
    resourceType === 'azurerm_windows_virtual_machine' ||
    resourceType === 'azurerm_virtual_machine'
  ) {
    return data.size || data.vm_size || data.sku || null;
  }

  if (resourceType === 'azurerm_managed_disk') {
    const storageType = data.storage_account_type || data.sku;
    const diskSizeGb = data.disk_size_gb || 128;
    if (storageType) {
      return String(storageType).includes('GB') ? storageType : `${storageType}_${diskSizeGb}GB`;
    }
    return 'Standard_LRS_128GB';
  }

  if (resourceType === 'azurerm_app_service_plan' || resourceType === 'azurerm_service_plan') {
    let skuName = data.sku_name;
    if (!skuName && data.sku && typeof data.sku === 'object') {
      skuName = data.sku.size || data.sku.name;
    }
    return skuName || 'P1v2';
  }

  return data.sku || data.size || data.tier || null;
}

export function extractRegion(data: any): string | null {
  if (!data || typeof data !== 'object') return null;
  const loc = data.location;
  return loc ? normalizeRegion(loc) : null;
}

export function extractTags(data: any): ResourceTagInfo {
  if (!data || typeof data !== 'object') {
    return { environment: 'Not tagged', team: 'Not tagged', application: 'Not tagged', owner: 'Not tagged', raw_tags: {} };
  }
  const tags = data.tags || {};
  if (typeof tags !== 'object') {
    return { environment: 'Not tagged', team: 'Not tagged', application: 'Not tagged', owner: 'Not tagged', raw_tags: {} };
  }

  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags)) {
    lower[k.toLowerCase()] = String(v);
  }

  return {
    environment: lower['environment'] || lower['env'] || 'Not tagged',
    team: lower['team'] || lower['dept'] || lower['cost_center'] || 'Not tagged',
    application: lower['application'] || lower['app'] || lower['service'] || 'Not tagged',
    owner: lower['owner'] || lower['contact'] || 'Not tagged',
    raw_tags: Object.fromEntries(Object.entries(tags).map(([k, v]) => [String(k), String(v)])),
  };
}

export function determineActionType(actions: string[]): 'create' | 'delete' | 'update' | 'replacement' | 'no-op' {
  const set = new Set(actions);
  if (set.has('create') && set.has('delete')) {
    return 'replacement';
  }
  if (set.has('create')) return 'create';
  if (set.has('delete')) return 'delete';
  if (set.has('update')) return 'update';
  return 'no-op';
}

// ----------------------------------------------------
// 3. Indian Rupee Formatter Helper (for backend text/logs)
// ----------------------------------------------------
export function formatINRText(val: number, options: { precision?: number; showSign?: boolean } = {}): string {
  const { precision = 0, showSign = false } = options;
  const isNeg = val < 0;
  const abs = Math.abs(val);

  let formatted = '';
  try {
    formatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: precision,
      minimumFractionDigits: precision,
    }).format(abs);
  } catch {
    formatted = `₹${abs.toFixed(precision)}`;
  }

  if (isNeg) return `-${formatted}`;
  if (showSign && val > 0) return `+${formatted}`;
  return formatted;
}

// ----------------------------------------------------
// 4. Azure Retail Prices API Client & Offline Fallback
// ----------------------------------------------------
const KNOWN_BENCHMARK_RATES_USD: Record<string, number> = {
  Standard_B1s: 0.0104,
  Standard_B2s: 0.0416,
  Standard_B4ms: 0.166,
  Standard_D2s_v3: 0.096,
  Standard_D4s_v3: 0.192,
  Standard_D8s_v3: 0.384,
  Standard_E2s_v3: 0.126,
  Standard_F2s_v2: 0.085,
  Premium_LRS_128GB: 0.027,
  Premium_LRS: 0.027,
  Standard_LRS_128GB: 0.007,
  P10: 0.027,
  P1v2: 0.1,
};

export class AzureRetailPricingService {
  public cacheHits = 0;
  public cacheMisses = 0;
  public apiCalls = 0;
  public logs: string[] = [];

  reset(): void {
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.apiCalls = 0;
    this.logs = [];
  }

  private getOfflineBenchmarkRate(sku: string, currency: string = 'INR'): number | null {
    const usd = KNOWN_BENCHMARK_RATES_USD[sku];
    if (usd === undefined) return null;
    const mult = currency.toUpperCase() === 'INR' ? USD_TO_INR_RATE : 1.0;
    return Number((usd * mult).toFixed(6));
  }

  async getHourlyPrice(
    sku: string,
    region: string,
    resourceType: string,
    currency: string = 'INR',
    includeSpot: boolean = false
  ): Promise<PriceLookupResult> {
    currency = currency.toUpperCase();

    // 1. Check SQLite Cache
    const cached = sqliteCache.get(sku, region, currency);
    if (cached) {
      this.cacheHits++;
      return {
        sku,
        region,
        currency,
        hourly_rate: cached.hourly_rate,
        found: true,
        source: 'cache',
        meter_name: cached.meter_name,
      };
    }

    // 2. Cache Miss -> Query official Azure Retail API
    this.cacheMisses++;
    this.apiCalls++;

    const filters: string[] = [`armRegionName eq '${region}'`, "priceType eq 'Consumption'"];
    if (resourceType.includes('virtual_machine')) {
      filters.push("serviceName eq 'Virtual Machines'");
      filters.push(`armSkuName eq '${sku}'`);
    } else if (resourceType.includes('managed_disk')) {
      filters.push("serviceName eq 'Storage'");
    } else {
      filters.push(`armSkuName eq '${sku}'`);
    }

    if (currency !== 'USD') {
      filters.push(`currencyCode eq '${currency}'`);
    }

    const queryParams = new URLSearchParams({ $filter: filters.join(' and ') });
    const fullUrl = `${AZURE_PRICES_API_URL}?${queryParams.toString()}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

      const resp = await fetch(fullUrl, {
        headers: { 'User-Agent': 'CostGuard/1.0 (FinOps Cloud Firewall; Node.js)' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();
        const items = data.Items || [];
        const bestMeter = this.filterBestMeter(items, sku, resourceType, includeSpot);

        if (bestMeter && typeof bestMeter.retailPrice === 'number' && bestMeter.retailPrice > 0) {
          const retailPrice = Number(bestMeter.retailPrice);
          const meterName = bestMeter.meterName || 'Standard Consumption';
          sqliteCache.set(sku, region, retailPrice, currency, meterName);
          return {
            sku,
            region,
            currency,
            hourly_rate: retailPrice,
            found: true,
            source: 'azure_api',
            meter_name: meterName,
          };
        }
      } else {
        this.logs.push(`[WARN] Azure Retail API returned HTTP ${resp.status}`);
      }
    } catch (e: any) {
      this.logs.push(`[WARN] Azure Retail API query timed out or unreachable: ${e.message}`);
    }

    // 3. Fallback to verified benchmark catalog for standard SKUs
    const fallbackRate = this.getOfflineBenchmarkRate(sku, currency);
    if (fallbackRate !== null) {
      this.logs.push(`[INFO] Using verified benchmark pricing for ${sku} due to network policy.`);
      sqliteCache.set(sku, region, fallbackRate, currency, 'Verified Azure Benchmark');
      return {
        sku,
        region,
        currency,
        hourly_rate: fallbackRate,
        found: true,
        source: 'benchmark_catalog',
        meter_name: 'Standard Consumption',
      };
    }

    // 4. Unknown SKU resilience (never crash!)
    this.logs.push(`[WARN] SKU '${sku}' not found in Azure Retail API. Skipping.`);
    return {
      sku,
      region,
      currency,
      hourly_rate: null,
      found: false,
      source: 'unpriced',
      error_message: `SKU '${sku}' not found in Azure Retail Prices catalog.`,
    };
  }

  private filterBestMeter(items: any[], sku: string, resourceType: string, includeSpot: boolean): any | null {
    if (!items || items.length === 0) return null;

    const candidates = items.filter((it: any) => {
      const meterName = it.meterName || '';
      const skuName = it.skuName || '';
      const productName = it.productName || '';

      if (!includeSpot) {
        if (
          meterName.includes('Spot') ||
          skuName.includes('Spot') ||
          meterName.includes('Low Priority') ||
          skuName.includes('Low Priority')
        ) {
          return false;
        }
      }

      if (productName.includes('Windows') && resourceType.includes('linux')) {
        return false;
      }

      return true;
    });

    if (candidates.length === 0) return null;

    const validCandidates = candidates.filter((c: any) => (c.retailPrice || 0) > 0);
    if (validCandidates.length === 0) return candidates[0];

    const exactMatch = validCandidates.find((c: any) => c.armSkuName === sku || (c.meterName || '').includes(sku));
    return exactMatch || validCandidates[0];
  }
}

// ----------------------------------------------------
// 5. Terraform Parser
// ----------------------------------------------------
export function parseTerraformPlan(planData: any): { parsed: ParsedResourceChange[]; logs: string[] } {
  const logs: string[] = [];
  let planObj: any;

  if (typeof planData === 'string') {
    try {
      planObj = JSON.parse(planData);
    } catch (e: any) {
      throw new Error(`Invalid JSON format in Terraform plan: ${e.message}`);
    }
  } else if (typeof planData === 'object' && planData !== null) {
    planObj = planData;
  } else {
    throw new Error('Terraform plan must be a JSON string or dictionary object.');
  }

  if (typeof planObj !== 'object' || planObj === null) {
    throw new Error('Plan JSON root must be an object.');
  }

  const resourceChanges = planObj.resource_changes;
  if (!resourceChanges) {
    throw new Error("Plan is missing mandatory 'resource_changes' array.");
  }
  if (!Array.isArray(resourceChanges)) {
    throw new Error("'resource_changes' must be an array.");
  }

  const parsed: ParsedResourceChange[] = [];

  for (const rc of resourceChanges) {
    if (!rc || typeof rc !== 'object') continue;

    const address = rc.address || 'unknown.resource';
    const resType = rc.type || 'unknown_type';
    const change = rc.change || {};
    const actions = change.actions || [];

    const actionType = determineActionType(actions);
    if (actionType === 'no-op') continue;

    const before = change.before || {};
    const after = change.after || {};

    if (NON_BILLABLE_TYPES.has(resType)) {
      logs.push(`[INFO] Skipping non-billable resource: ${address}`);
      parsed.push({
        address,
        resource_type: resType,
        actions,
        action_type: actionType,
        is_billable: false,
        skip_reason: 'Non-billable infrastructure resource',
        before_sku: null,
        after_sku: null,
        before_region: extractRegion(before),
        after_region: extractRegion(after),
        tags: extractTags(after || before),
        raw_before: before,
        raw_after: after,
      });
      continue;
    }

    const beforeSku = extractSku(resType, before);
    const afterSku = extractSku(resType, after);

    let beforeRegion = extractRegion(before);
    let afterRegion = extractRegion(after);
    const primaryRegion = afterRegion || beforeRegion || 'eastus';
    beforeRegion = beforeRegion || primaryRegion;
    afterRegion = afterRegion || primaryRegion;

    const tags = extractTags(after || before);

    parsed.push({
      address,
      resource_type: resType,
      actions,
      action_type: actionType,
      is_billable: true,
      before_sku: beforeSku,
      after_sku: afterSku,
      before_region: beforeRegion,
      after_region: afterRegion,
      tags,
      raw_before: before,
      raw_after: after,
    });
  }

  return { parsed, logs };
}

// ----------------------------------------------------
// 6. Cost Calculator & Policy Engine
// ----------------------------------------------------
export async function calculateCostGuardPlan(
  parsedChanges: ParsedResourceChange[],
  options: {
    currency?: string;
    maxIncrease?: number;
    includeSpot?: boolean;
    pricingProvider?: AzureRetailPricingService;
  } = {}
): Promise<CostGuardAnalysisOutput> {
  const { currency = 'INR', maxIncrease = 4000.0, includeSpot = false } = options;
  const pricingProvider = options.pricingProvider || new AzureRetailPricingService();
  pricingProvider.reset();

  const details: ResourceCostDetail[] = [];
  let priorMonthlyTotal = 0.0;
  let projectedMonthlyTotal = 0.0;
  const explanations: string[] = [];

  const tagAttributionData: Record<string, Record<string, { prior: number; projected: number; delta: number }>> = {
    Environment: {},
    Team: {},
    Application: {},
    Owner: {},
  };

  for (const change of parsedChanges) {
    if (!change.is_billable) {
      details.push({
        address: change.address,
        resource_type: change.resource_type,
        action: change.action_type.toUpperCase(),
        region: change.after_region || change.before_region || 'global',
        sku: 'N/A',
        meter: 'Non-billable',
        old_hourly_cost: 0.0,
        new_hourly_cost: 0.0,
        old_monthly_cost: 0.0,
        new_monthly_cost: 0.0,
        delta_monthly_cost: 0.0,
        status: 'SKIPPED',
        note: change.skip_reason || 'Skipped non-billable resource',
        tags: change.tags.raw_tags,
      });
      continue;
    }

    let oldHourly = 0.0;
    let newHourly = 0.0;
    let meterName = 'Azure Retail Meter';
    let isUnpriced = false;
    let unpricedNote = '';

    // Check pricing before state (delete, update, replacement)
    if (change.action_type === 'delete' || change.action_type === 'update' || change.action_type === 'replacement') {
      if (change.before_sku) {
        const region = change.before_region || 'eastus';
        const lookup = await pricingProvider.getHourlyPrice(change.before_sku, region, change.resource_type, currency, includeSpot);
        if (lookup.found && lookup.hourly_rate !== null) {
          oldHourly = lookup.hourly_rate;
          meterName = lookup.meter_name || meterName;
        } else {
          isUnpriced = true;
          unpricedNote = `Before SKU '${change.before_sku}' unpriced`;
        }
      }
    }

    // Check pricing after state (create, update, replacement)
    if (change.action_type === 'create' || change.action_type === 'update' || change.action_type === 'replacement') {
      if (change.after_sku) {
        const region = change.after_region || 'eastus';
        const lookup = await pricingProvider.getHourlyPrice(change.after_sku, region, change.resource_type, currency, includeSpot);
        if (lookup.found && lookup.hourly_rate !== null) {
          newHourly = lookup.hourly_rate;
          meterName = lookup.meter_name || meterName;
        } else {
          isUnpriced = true;
          unpricedNote = `After SKU '${change.after_sku}' unpriced`;
        }
      }
    }

    // Metadata-only change detection
    if (change.action_type === 'update' && change.before_sku === change.after_sku && change.before_region === change.after_region) {
      oldHourly = newHourly;
      unpricedNote = 'Metadata or tag change only (₹0 delta)';
    }

    const oldMonthly = Math.round(oldHourly * HOURS_PER_MONTH * 100) / 100;
    const newMonthly = Math.round(newHourly * HOURS_PER_MONTH * 100) / 100;
    const deltaMonthly = Math.round((newMonthly - oldMonthly) * 100) / 100;

    priorMonthlyTotal += oldMonthly;
    projectedMonthlyTotal += newMonthly;

    const status = isUnpriced ? 'UNPRICED' : 'SUCCESS';
    const skuLabel = change.after_sku || change.before_sku || 'Standard';

    details.push({
      address: change.address,
      resource_type: change.resource_type,
      action: change.action_type.toUpperCase(),
      region: change.after_region || change.before_region || 'eastus',
      sku: skuLabel,
      meter: meterName,
      old_hourly_cost: oldHourly,
      new_hourly_cost: newHourly,
      old_monthly_cost: oldMonthly,
      new_monthly_cost: newMonthly,
      delta_monthly_cost: deltaMonthly,
      status,
      note: unpricedNote,
      tags: change.tags.raw_tags,
    });

    // Human-readable explanation
    if (Math.abs(deltaMonthly) > 0.001) {
      const shortName = change.address.split('.').pop() || change.address;
      const formattedDelta = formatINRText(deltaMonthly, { precision: 0, showSign: true });
      const friendlyType = change.resource_type.includes('virtual_machine')
        ? 'VM'
        : change.resource_type.includes('managed_disk')
        ? 'Managed disk'
        : change.resource_type.replace('azurerm_', '').replace(/_/g, ' ');

      if (change.action_type === 'create') {
        explanations.push(`New ${friendlyType} '${shortName}' (${skuLabel}): ${formattedDelta}/month`);
      } else if (change.action_type === 'delete') {
        explanations.push(`${friendlyType} '${shortName}' deleted: ${formattedDelta}/month`);
      } else if (change.action_type === 'update') {
        explanations.push(`${friendlyType} '${shortName}' upgrade (${change.before_sku} → ${change.after_sku}): ${formattedDelta}/month`);
      } else if (change.action_type === 'replacement') {
        explanations.push(`${friendlyType} '${shortName}' replacement: ${formattedDelta}/month`);
      }
    }

    // Accumulate tag attribution
    const tagsToTrack = {
      Environment: change.tags.environment,
      Team: change.tags.team,
      Application: change.tags.application,
      Owner: change.tags.owner,
    };
    for (const [tagK, tagV] of Object.entries(tagsToTrack)) {
      if (!tagAttributionData[tagK][tagV]) {
        tagAttributionData[tagK][tagV] = { prior: 0.0, projected: 0.0, delta: 0.0 };
      }
      tagAttributionData[tagK][tagV].prior += oldMonthly;
      tagAttributionData[tagK][tagV].projected += newMonthly;
      tagAttributionData[tagK][tagV].delta += deltaMonthly;
    }
  }

  priorMonthlyTotal = Math.round(priorMonthlyTotal * 100) / 100;
  projectedMonthlyTotal = Math.round(projectedMonthlyTotal * 100) / 100;
  const netMonthlyImpact = Math.round((projectedMonthlyTotal - priorMonthlyTotal) * 100) / 100;
  const annualizedImpact = Math.round(netMonthlyImpact * 12.0 * 100) / 100;
  const quarterlyImpact = Math.round(netMonthlyImpact * 3.0 * 100) / 100;

  const financialSummary: FinancialSummary = {
    currency: currency.toUpperCase(),
    prior_monthly_total: priorMonthlyTotal,
    projected_monthly_total: projectedMonthlyTotal,
    net_monthly_impact: netMonthlyImpact,
    annualized_impact: annualizedImpact,
    quarterly_impact: quarterlyImpact,
  };

  const totalLookups = pricingProvider.cacheHits + pricingProvider.cacheMisses;
  const hitRatePct = totalLookups > 0 ? Math.round((pricingProvider.cacheHits / totalLookups) * 1000) / 10 : 0.0;

  const cacheSummary: CacheSummary = {
    cache_hits: pricingProvider.cacheHits,
    cache_misses: pricingProvider.cacheMisses,
    api_calls: pricingProvider.apiCalls,
    cache_hit_rate_pct: hitRatePct,
  };

  // Evaluate policy
  const isBreached = netMonthlyImpact > maxIncrease;
  const amountDiff = Math.round(Math.abs(netMonthlyImpact - maxIncrease) * 100) / 100;
  const diffStr = formatINRText(amountDiff, { precision: 0 });

  const policyVerdict: PolicyVerdict = {
    budget_threshold: maxIncrease,
    status: isBreached ? 'BLOCKED' : 'PASSED',
    amount_difference: amountDiff,
    is_breached: isBreached,
    exit_code: isBreached ? 1 : 0,
    summary_message: isBreached
      ? `Budget exceeded by ${diffStr} (increase: ${formatINRText(netMonthlyImpact, { showSign: true })}, limit: ${formatINRText(maxIncrease)})`
      : `Within budget with ${diffStr} headroom (increase: ${formatINRText(netMonthlyImpact, { showSign: true })}, limit: ${formatINRText(maxIncrease)})`,
  };

  // Format tag attribution
  const formattedTags: Record<string, any[]> = {};
  for (const [category, items] of Object.entries(tagAttributionData)) {
    formattedTags[category] = Object.entries(items)
      .map(([val, data]) => ({
        category,
        value: val,
        prior_monthly_cost: Math.round(data.prior * 100) / 100,
        projected_monthly_cost: Math.round(data.projected * 100) / 100,
        delta_monthly_cost: Math.round(data.delta * 100) / 100,
      }))
      .sort((a, b) => Math.abs(b.delta_monthly_cost) - Math.abs(a.delta_monthly_cost));
  }

  const allLogs = [...pricingProvider.logs];

  const resourceCounts = {
    total_detected: details.length,
    billable: details.filter((d) => d.status !== 'SKIPPED').length,
    skipped: details.filter((d) => d.status === 'SKIPPED').length,
    creates: details.filter((d) => d.action === 'CREATE').length,
    deletes: details.filter((d) => d.action === 'DELETE').length,
    updates: details.filter((d) => d.action === 'UPDATE').length,
    replacements: details.filter((d) => d.action === 'REPLACEMENT').length,
  };

  return {
    currency: currency.toUpperCase(),
    financial_summary: financialSummary,
    policy_verdict: policyVerdict,
    cache_summary: cacheSummary,
    resource_details: details,
    explanations,
    tag_attribution: formattedTags,
    logs: allLogs,
    resource_counts: resourceCounts,
  };
}

// ----------------------------------------------------
// 7. CLI Text & Markdown Generator (matching costguard CLI output)
// ----------------------------------------------------
export function generateCliReportText(analysis: CostGuardAnalysisOutput): string {
  const { financial_summary: fin, policy_verdict: verdict, cache_summary: cache, resource_details: details, logs } = analysis;
  const lines: string[] = [];

  if (logs && logs.length > 0) {
    for (const log of logs) lines.push(log);
    lines.push('');
  }

  const border = '='.repeat(60);
  lines.push(border);
  lines.push('COSTGUARD — COST IMPACT REPORT');
  lines.push(border);

  const colRes = 20;
  const colAct = 10;
  const colOld = 12;
  const colNew = 12;
  const colDel = 14;

  const header = `${'Resource'.padEnd(colRes)} ${'Action'.padEnd(colAct)} ${'Current'.padStart(colOld)} ${'Projected'.padStart(colNew)} ${'Impact'.padStart(colDel)}`;
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const r of details) {
    let addr = r.address.split('.').pop() || r.address;
    if (addr.length > colRes - 2) {
      addr = addr.substring(0, colRes - 4) + '..';
    }

    let deltaStr = '';
    let oldStr = '';
    let newStr = '';

    if (r.status === 'SKIPPED') {
      deltaStr = 'SKIPPED';
      oldStr = '—';
      newStr = '—';
    } else if (r.status === 'UNPRICED') {
      deltaStr = 'UNPRICED';
      oldStr = formatINRText(r.old_monthly_cost);
      newStr = formatINRText(r.new_monthly_cost);
    } else {
      oldStr = formatINRText(r.old_monthly_cost);
      newStr = formatINRText(r.new_monthly_cost);
      deltaStr = formatINRText(r.delta_monthly_cost, { showSign: true });
    }

    lines.push(`${addr.padEnd(colRes)} ${r.action.padEnd(colAct)} ${oldStr.padStart(colOld)} ${newStr.padStart(colNew)} ${deltaStr.padStart(colDel)}`);
  }

  lines.push('-'.repeat(header.length));
  lines.push('');

  lines.push(`CURRENT COST       ${formatINRText(fin.prior_monthly_total)}/month`);
  lines.push(`PROJECTED COST     ${formatINRText(fin.projected_monthly_total)}/month`);
  lines.push(`MONTHLY IMPACT     ${formatINRText(fin.net_monthly_impact, { showSign: true })}/month`);
  lines.push(`ANNUAL IMPACT      ${formatINRText(fin.annualized_impact, { showSign: true })}/year`);
  lines.push('');
  lines.push(`BUDGET             ${formatINRText(verdict.budget_threshold)}/month`);

  if (verdict.is_breached) {
    lines.push('STATUS             ✕ EXCEEDED');
    lines.push('');
    lines.push('DEPLOYMENT BLOCKED');
    lines.push(`Exit Code: ${verdict.exit_code}`);
  } else {
    lines.push('STATUS             ✓ WITHIN BUDGET');
    lines.push('');
    lines.push('DEPLOYMENT PERMITTED');
    lines.push(`Exit Code: ${verdict.exit_code}`);
  }

  lines.push('');
  lines.push(`Cache: ${cache.cache_hits} hits · ${cache.api_calls} API lookups (${cache.cache_hit_rate_pct.toFixed(0)}% hit rate)`);
  lines.push(border);

  return lines.join('\n');
}

export function generateMarkdownReport(analysis: CostGuardAnalysisOutput): string {
  const { financial_summary: fin, policy_verdict: verdict, cache_summary: cache, resource_details: details, explanations } = analysis;
  const lines: string[] = [];

  lines.push('## 🛡️ CostGuard — Infrastructure Cost Impact Report');
  lines.push('');

  const statusBadge = verdict.is_breached
    ? '❌ **BUDGET EXCEEDED (DEPLOYMENT BLOCKED)**'
    : '✅ **WITHIN BUDGET (DEPLOYMENT PERMITTED)**';

  lines.push(`> **Status:** ${statusBadge}  `);
  lines.push(`> **Monthly Impact:** \`${formatINRText(fin.net_monthly_impact, { showSign: true })}/mo\` | **Budget:** \`${formatINRText(verdict.budget_threshold)}/mo\` | **Annualized:** \`${formatINRText(fin.annualized_impact, { showSign: true })}/yr\`  `);
  lines.push(`> **Cache:** ${cache.cache_hits} hits · ${cache.api_calls} API lookups (${cache.cache_hit_rate_pct.toFixed(0)}%)`);
  lines.push('');

  lines.push('### Resource Breakdown');
  lines.push('');
  lines.push('| Resource | Action | Region | SKU | Current | Projected | Impact |');
  lines.push('| :--- | :--- | :--- | :--- | ---: | ---: | ---: |');

  for (const r of details) {
    const shortAddr = r.address.split('.').pop() || r.address;
    let deltaStr = '';
    let oldStr = '';
    let newStr = '';

    if (r.status === 'SKIPPED') {
      deltaStr = '_Skipped_';
      oldStr = '—';
      newStr = '—';
    } else if (r.status === 'UNPRICED') {
      deltaStr = '_Unpriced_';
      oldStr = formatINRText(r.old_monthly_cost);
      newStr = formatINRText(r.new_monthly_cost);
    } else {
      oldStr = formatINRText(r.old_monthly_cost);
      newStr = formatINRText(r.new_monthly_cost);
      deltaStr = formatINRText(r.delta_monthly_cost, { showSign: true });
    }

    lines.push(`| \`${shortAddr}\` | **${r.action}** | ${r.region} | ${r.sku} | ${oldStr} | ${newStr} | **${deltaStr}** |`);
  }

  lines.push('');
  if (explanations && explanations.length > 0) {
    lines.push('### Why did the cost change?');
    lines.push('');
    for (const exp of explanations) {
      lines.push(`• ${exp}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('*Generated by CostGuard Financial Guardrail*');
  return lines.join('\n');
}

// ----------------------------------------------------
// 8. What-If SKU Switch Simulation Helper
// ----------------------------------------------------
export async function simulateSkuSwitch(
  currentSku: string,
  alternativeSku: string,
  region: string = 'eastus',
  currency: string = 'INR'
): Promise<any> {
  const provider = new AzureRetailPricingService();
  const currentPrice = await provider.getHourlyPrice(currentSku, region, 'azurerm_virtual_machine', currency);
  const altPrice = await provider.getHourlyPrice(alternativeSku, region, 'azurerm_virtual_machine', currency);

  const currentRate = currentPrice.hourly_rate || 0.0;
  const altRate = altPrice.hourly_rate || 0.0;

  const currentMonthly = Math.round(currentRate * HOURS_PER_MONTH * 100) / 100;
  const altMonthly = Math.round(altRate * HOURS_PER_MONTH * 100) / 100;
  const diffMonthly = Math.round((altMonthly - currentMonthly) * 100) / 100;
  const diffAnnual = Math.round(diffMonthly * 12.0 * 100) / 100;

  return {
    current_sku: currentSku,
    alternative_sku: alternativeSku,
    region,
    currency,
    current_hourly_rate: currentRate,
    alternative_hourly_rate: altRate,
    current_monthly_cost: currentMonthly,
    alternative_monthly_cost: altMonthly,
    difference_monthly: diffMonthly,
    difference_annual: diffAnnual,
    savings_percentage: currentMonthly > 0 ? Math.round(((currentMonthly - altMonthly) / currentMonthly) * 1000) / 10 : 0.0,
  };
}
