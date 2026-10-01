/**
 * CostGuard Core Engine (Universal TypeScript - Browser & Node.js Compatible)
 * Evaluates Terraform execution plans, queries Azure Retail Prices API,
 * maintains client-side & server-side caching, enforces 730 hours/month run-rates,
 * calculates financial impact in INR (₹), and enforces policy circuit breakers.
 */

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
  hourly_rate: number;
  found: boolean;
  source: 'cache' | 'azure_api' | 'fallback' | 'unpriced';
  meter_name: string;
  note?: string;
}

export interface ResourceCostItem {
  address: string;
  resource_type: string;
  action: 'CREATE' | 'DELETE' | 'UPDATE' | 'REPLACEMENT' | 'SKIPPED';
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

export interface FinancialImpactSummary {
  currency: string;
  prior_monthly_total: number;
  projected_monthly_total: number;
  net_monthly_impact: number;
  annualized_impact: number;
  quarterly_impact: number;
}

export interface PolicyVerdictResult {
  budget_threshold: number;
  status: 'PASSED' | 'BLOCKED';
  amount_difference: number;
  is_breached: boolean;
  exit_code: 0 | 1 | 2;
  summary_message: string;
}

export interface CostGuardAnalysisResult {
  currency: string;
  financial_summary: FinancialImpactSummary;
  policy_verdict: PolicyVerdictResult;
  cache_summary: {
    cache_hits: number;
    cache_misses: number;
    api_calls: number;
    cache_hit_rate_pct: number;
  };
  resource_details: ResourceCostItem[];
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
// Universal Pricing Cache (localStorage + in-memory store)
// ----------------------------------------------------
const CACHE_STORAGE_KEY = 'costguard_pricing_cache_v1';

export class UniversalPricingCache {
  private memoryCache: Map<string, { hourly_rate: number; meter_name: string; cached_at: number }> = new Map();

  constructor() {
    this.hydrateFromStorage();
  }

  private hydrateFromStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(CACHE_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          for (const [k, v] of Object.entries(parsed)) {
            this.memoryCache.set(k, v as any);
          }
        }
      } catch {
        // ignore storage errors
      }
    }
  }

  private persistToStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const obj: Record<string, any> = {};
        for (const [k, v] of this.memoryCache.entries()) {
          obj[k] = v;
        }
        window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(obj));
      } catch {
        // ignore storage errors
      }
    }
  }

  get(sku: string, region: string, currency: string = 'INR'): { hourly_rate: number; meter_name: string } | null {
    currency = currency.toUpperCase();
    const key = `${sku}:${region}:${currency}`;
    const mem = this.memoryCache.get(key);
    return mem ? { hourly_rate: mem.hourly_rate, meter_name: mem.meter_name } : null;
  }

  set(
    sku: string,
    region: string,
    hourly_rate: number,
    currency: string = 'INR',
    meter_name: string = 'Azure Retail Meter'
  ): void {
    currency = currency.toUpperCase();
    const now = Math.floor(Date.now() / 1000);
    const key = `${sku}:${region}:${currency}`;
    this.memoryCache.set(key, { hourly_rate, meter_name, cached_at: now });
    this.persistToStorage();
  }

  clear(): number {
    const deletedCount = this.memoryCache.size;
    this.memoryCache.clear();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(CACHE_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    return deletedCount;
  }

  getStats(): {
    total_entries: number;
    oldest_timestamp: number | null;
    newest_timestamp: number | null;
    entries: any[];
  } {
    const entries = Array.from(this.memoryCache.entries()).map(([k, v]) => {
      const [sku, region, currency] = k.split(':');
      return { sku, region, currency, ...v };
    });

    return {
      total_entries: this.memoryCache.size,
      oldest_timestamp: entries.length > 0 ? entries[entries.length - 1].cached_at : null,
      newest_timestamp: entries.length > 0 ? entries[0].cached_at : null,
      entries: entries.slice(0, 50),
    };
  }
}

export const universalCache = new UniversalPricingCache();

// ----------------------------------------------------
// Terraform Plan JSON Parser
// ----------------------------------------------------
export function parseTerraformPlan(planData: any): ParsedResourceChange[] {
  let root = planData;
  if (typeof planData === 'string') {
    root = JSON.parse(planData);
  }

  if (!root || typeof root !== 'object') {
    throw new Error('Terraform plan content must be a valid JSON object');
  }

  const resourceChanges: any[] = root.resource_changes || [];
  const parsedList: ParsedResourceChange[] = [];

  for (const rc of resourceChanges) {
    const address: string = rc.address || rc.name || 'unnamed_resource';
    const resourceType: string = rc.type || 'unknown_type';
    const change = rc.change || {};
    const actions: string[] = change.actions || [];

    const actionType = determineActionType(actions);
    if (actionType === 'no-op') continue;

    const isNonBillable = NON_BILLABLE_TYPES.has(resourceType);
    const beforeObj = change.before || {};
    const afterObj = change.after || {};

    const tags = extractResourceTags(afterObj.tags ? afterObj : beforeObj);
    const beforeSku = extractSkuFromResource(resourceType, beforeObj);
    const afterSku = extractSkuFromResource(resourceType, afterObj);

    const beforeRegion = extractRegionFromResource(beforeObj);
    const afterRegion = extractRegionFromResource(afterObj);

    parsedList.push({
      address,
      resource_type: resourceType,
      actions,
      action_type: actionType,
      is_billable: !isNonBillable,
      skip_reason: isNonBillable ? 'Non-billable infrastructure resource' : undefined,
      before_sku: beforeSku,
      after_sku: afterSku,
      before_region: beforeRegion,
      after_region: afterRegion,
      tags,
      raw_before: beforeObj,
      raw_after: afterObj,
    });
  }

  return parsedList;
}

export function extractSkuFromResource(resourceType: string, data: any): string | null {
  if (!data || typeof data !== 'object') return null;

  if (resourceType.includes('virtual_machine')) {
    return data.size || data.vm_size || data.sku || null;
  }
  if (resourceType.includes('managed_disk')) {
    const st = data.storage_account_type || data.sku || '';
    const gb = data.disk_size_gb || 128;
    return st ? `${st}_${gb}GB` : 'Standard_LRS_128GB';
  }
  if (resourceType.includes('app_service')) {
    const sku = data.sku || {};
    return sku.size || sku.name || data.size || 'P1v2';
  }
  if (resourceType.includes('storage_account')) {
    const tier = data.account_tier || 'Standard';
    const rep = data.account_replication_type || 'LRS';
    return `${tier}_${rep}`;
  }
  return data.sku || data.size || null;
}

export function extractRegionFromResource(data: any): string | null {
  if (!data || typeof data !== 'object') return null;
  const loc = data.location || data.region;
  if (!loc) return null;
  return loc.toLowerCase().replace(/[\s_]/g, '');
}

export function extractResourceTags(data: any): ResourceTagInfo {
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
// Indian Rupee Currency Formatter Text Helper
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
// Known Azure Benchmark Rates (USD hourly)
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

// ----------------------------------------------------
// Azure Retail Prices API Client
// ----------------------------------------------------
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

    // 1. Check Cache
    const cached = universalCache.get(sku, region, currency);
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
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(fullUrl, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();
        const items: any[] = data.Items || [];

        const validItems = items.filter((it) => {
          if (it.type !== 'Consumption') return false;
          if (!includeSpot) {
            const meter = (it.meterName || '').toLowerCase();
            const skuName = (it.skuName || '').toLowerCase();
            const prod = (it.productName || '').toLowerCase();
            if (meter.includes('spot') || skuName.includes('spot') || prod.includes('spot')) return false;
            if (meter.includes('low priority') || skuName.includes('low priority')) return false;
          }
          return typeof it.retailPrice === 'number' && it.retailPrice > 0;
        });

        if (validItems.length > 0) {
          const matched = validItems[0];
          const retailPrice = matched.retailPrice;
          const meterName = matched.meterName || 'Standard Consumption';

          universalCache.set(sku, region, retailPrice, currency, meterName);
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
      }
    } catch {
      // Network/CORS/timeout -> proceed to fallback benchmark
    }

    // 3. Fallback to Verified Benchmark
    const fallbackRate = this.getOfflineBenchmarkRate(sku, currency);
    if (fallbackRate !== null) {
      universalCache.set(sku, region, fallbackRate, currency, 'Standard Consumption');
      this.logs.push(`[INFO] Using verified benchmark pricing for ${sku} (${formatINRText(fallbackRate, { precision: 2 })}/hr).`);
      return {
        sku,
        region,
        currency,
        hourly_rate: fallbackRate,
        found: true,
        source: 'fallback',
        meter_name: 'Standard Consumption',
      };
    }

    // 4. Truly Unknown SKU
    this.logs.push(`[WARN] SKU '${sku}' not found in Azure Retail API. Skipping.`);
    return {
      sku,
      region,
      currency,
      hourly_rate: 0,
      found: false,
      source: 'unpriced',
      meter_name: 'Azure Retail Meter',
      note: `After SKU '${sku}' unpriced`,
    };
  }
}

// ----------------------------------------------------
// Complete FinOps Analysis Pipeline
// ----------------------------------------------------
export async function analyzeCostGuardPlan(
  planData: any,
  options: {
    maxIncrease?: number;
    currency?: string;
    includeSpot?: boolean;
  } = {}
): Promise<CostGuardAnalysisResult> {
  const { maxIncrease = 4000.0, currency = 'INR', includeSpot = false } = options;

  const parsedChanges = parseTerraformPlan(planData);
  const pricingService = new AzureRetailPricingService();
  pricingService.reset();

  const resourceDetails: ResourceCostItem[] = [];
  const explanations: string[] = [];

  let priorMonthlyTotal = 0;
  let projectedMonthlyTotal = 0;

  let totalDetected = 0;
  let billableCount = 0;
  let skippedCount = 0;
  let createsCount = 0;
  let deletesCount = 0;
  let updatesCount = 0;
  let replacementsCount = 0;

  const tagAttributionMap: Record<string, Map<string, { prior: number; projected: number; delta: number }>> = {
    Environment: new Map(),
    Team: new Map(),
    Application: new Map(),
    Owner: new Map(),
  };

  for (const rc of parsedChanges) {
    totalDetected++;

    if (!rc.is_billable) {
      skippedCount++;
      createsCount += rc.action_type === 'create' ? 1 : 0;
      pricingService.logs.push(`[INFO] Skipping non-billable resource: ${rc.address}`);

      resourceDetails.push({
        address: rc.address,
        resource_type: rc.resource_type,
        action: (rc.action_type.toUpperCase() as any),
        region: rc.after_region || rc.before_region || 'global',
        sku: 'N/A',
        meter: 'Non-billable',
        old_hourly_cost: 0,
        new_hourly_cost: 0,
        old_monthly_cost: 0,
        new_monthly_cost: 0,
        delta_monthly_cost: 0,
        status: 'SKIPPED',
        note: rc.skip_reason || 'Non-billable infrastructure resource',
        tags: rc.tags.raw_tags,
      });
      continue;
    }

    billableCount++;
    const action = rc.action_type;

    if (action === 'create') createsCount++;
    else if (action === 'delete') deletesCount++;
    else if (action === 'update') updatesCount++;
    else if (action === 'replacement') replacementsCount++;

    const region = rc.after_region || rc.before_region || 'eastus';
    let oldHourly = 0;
    let newHourly = 0;
    let meterName = 'Standard Consumption';
    let lookupStatus: 'SUCCESS' | 'SKIPPED' | 'UNPRICED' = 'SUCCESS';
    let note = '';

    if (action === 'create') {
      const sku = rc.after_sku || 'Standard_B1s';
      const p = await pricingService.getHourlyPrice(sku, region, rc.resource_type, currency, includeSpot);
      newHourly = p.hourly_rate;
      meterName = p.meter_name;
      if (!p.found) {
        lookupStatus = 'UNPRICED';
        note = p.note || `SKU '${sku}' unpriced`;
      }
    } else if (action === 'delete') {
      const sku = rc.before_sku || 'Standard_B1s';
      const p = await pricingService.getHourlyPrice(sku, region, rc.resource_type, currency, includeSpot);
      oldHourly = p.hourly_rate;
      meterName = p.meter_name;
      if (!p.found) {
        lookupStatus = 'UNPRICED';
        note = p.note || `SKU '${sku}' unpriced`;
      }
    } else if (action === 'update' || action === 'replacement') {
      const beforeSku = rc.before_sku || 'Standard_B1s';
      const afterSku = rc.after_sku || beforeSku;

      const pBefore = await pricingService.getHourlyPrice(beforeSku, region, rc.resource_type, currency, includeSpot);
      const pAfter = await pricingService.getHourlyPrice(afterSku, region, rc.resource_type, currency, includeSpot);

      oldHourly = pBefore.hourly_rate;
      newHourly = pAfter.hourly_rate;
      meterName = pAfter.meter_name || pBefore.meter_name;

      if (!pAfter.found || !pBefore.found) {
        lookupStatus = 'UNPRICED';
        note = !pAfter.found ? pAfter.note || '' : pBefore.note || '';
      }
    }

    const oldMonthly = Number((oldHourly * HOURS_PER_MONTH).toFixed(2));
    const newMonthly = Number((newHourly * HOURS_PER_MONTH).toFixed(2));
    const deltaMonthly = Number((newMonthly - oldMonthly).toFixed(2));

    priorMonthlyTotal += oldMonthly;
    projectedMonthlyTotal += newMonthly;

    // Track tag attribution
    for (const cat of ['Environment', 'Team', 'Application', 'Owner'] as const) {
      const tagVal = (rc.tags as any)[cat.toLowerCase()] || 'Not tagged';
      const map = tagAttributionMap[cat];
      const cur = map.get(tagVal) || { prior: 0, projected: 0, delta: 0 };
      cur.prior += oldMonthly;
      cur.projected += newMonthly;
      cur.delta += deltaMonthly;
      map.set(tagVal, cur);
    }

    // Explanation item
    const friendlyName = rc.address.split('.').pop() || rc.address;
    const typeLabel = rc.resource_type.replace('azurerm_', '').replace(/_/g, ' ');
    const activeSku = rc.after_sku || rc.before_sku || 'Standard';

    if (Math.abs(deltaMonthly) > 0.01) {
      const formattedDelta = formatINRText(deltaMonthly, { precision: 0, showSign: true });
      if (action === 'create') {
        explanations.push(`New ${typeLabel} '${friendlyName}' (${activeSku}): ${formattedDelta}/month`);
      } else if (action === 'delete') {
        explanations.push(`Decommissioned ${typeLabel} '${friendlyName}' (${activeSku}): ${formattedDelta}/month`);
      } else if (action === 'update' || action === 'replacement') {
        explanations.push(`Resized ${friendlyName} (${rc.before_sku} → ${rc.after_sku}): ${formattedDelta}/month`);
      }
    }

    resourceDetails.push({
      address: rc.address,
      resource_type: rc.resource_type,
      action: (action.toUpperCase() as any),
      region,
      sku: rc.after_sku || rc.before_sku || 'N/A',
      meter: meterName,
      old_hourly_cost: oldHourly,
      new_hourly_cost: newHourly,
      old_monthly_cost: oldMonthly,
      new_monthly_cost: newMonthly,
      delta_monthly_cost: deltaMonthly,
      status: lookupStatus,
      note,
      tags: rc.tags.raw_tags,
    });
  }

  priorMonthlyTotal = Number(priorMonthlyTotal.toFixed(2));
  projectedMonthlyTotal = Number(projectedMonthlyTotal.toFixed(2));
  const netMonthlyImpact = Number((projectedMonthlyTotal - priorMonthlyTotal).toFixed(2));
  const annualizedImpact = Number((netMonthlyImpact * 12).toFixed(2));
  const quarterlyImpact = Number((netMonthlyImpact * 3).toFixed(2));

  // Policy Circuit Breaker Evaluation
  const isBreached = netMonthlyImpact > maxIncrease;
  const exitCode = isBreached ? 1 : 0;
  const amountDiff = Math.abs(netMonthlyImpact - maxIncrease);
  const diffStr = formatINRText(amountDiff, { precision: 0 });

  const summaryMessage = isBreached
    ? `Budget exceeded by ${diffStr} (increase: ${formatINRText(netMonthlyImpact, { showSign: true })}, limit: ${formatINRText(maxIncrease)})`
    : `Within budget with ${diffStr} headroom (increase: ${formatINRText(netMonthlyImpact, { showSign: true })}, limit: ${formatINRText(maxIncrease)})`;

  // Format tag attribution arrays
  const formattedTagAttribution: Record<string, any[]> = {};
  for (const [cat, map] of Object.entries(tagAttributionMap)) {
    formattedTagAttribution[cat] = Array.from(map.entries()).map(([value, vals]) => ({
      category: cat,
      value,
      prior_monthly_cost: Number(vals.prior.toFixed(2)),
      projected_monthly_cost: Number(vals.projected.toFixed(2)),
      delta_monthly_cost: Number(vals.delta.toFixed(2)),
    }));
  }

  const totalHits = pricingService.cacheHits;
  const totalCalls = pricingService.apiCalls;
  const hitRatePct = totalHits + totalCalls > 0 ? Math.round((totalHits / (totalHits + totalCalls)) * 100) : 0;

  return {
    currency,
    financial_summary: {
      currency,
      prior_monthly_total: priorMonthlyTotal,
      projected_monthly_total: projectedMonthlyTotal,
      net_monthly_impact: netMonthlyImpact,
      annualized_impact: annualizedImpact,
      quarterly_impact: quarterlyImpact,
    },
    policy_verdict: {
      budget_threshold: maxIncrease,
      status: isBreached ? 'BLOCKED' : 'PASSED',
      amount_difference: Number(amountDiff.toFixed(2)),
      is_breached: isBreached,
      exit_code: exitCode,
      summary_message: summaryMessage,
    },
    cache_summary: {
      cache_hits: totalHits,
      cache_misses: pricingService.cacheMisses,
      api_calls: totalCalls,
      cache_hit_rate_pct: hitRatePct,
    },
    resource_details: resourceDetails,
    explanations,
    tag_attribution: formattedTagAttribution,
    logs: pricingService.logs,
    resource_counts: {
      total_detected: totalDetected,
      billable: billableCount,
      skipped: skippedCount,
      creates: createsCount,
      deletes: deletesCount,
      updates: updatesCount,
      replacements: replacementsCount,
    },
  };
}

// ----------------------------------------------------
// SKU Simulation
// ----------------------------------------------------
export async function simulateSkuSwitch(
  currentSku: string,
  alternativeSku: string,
  region: string = 'eastus',
  currency: string = 'INR'
) {
  const pricingService = new AzureRetailPricingService();
  const curPrice = await pricingService.getHourlyPrice(currentSku, region, 'azurerm_linux_virtual_machine', currency);
  const altPrice = await pricingService.getHourlyPrice(alternativeSku, region, 'azurerm_linux_virtual_machine', currency);

  const curMonthly = Number((curPrice.hourly_rate * HOURS_PER_MONTH).toFixed(2));
  const altMonthly = Number((altPrice.hourly_rate * HOURS_PER_MONTH).toFixed(2));
  const monthlyDiff = Number((altMonthly - curMonthly).toFixed(2));
  const annualDiff = Number((monthlyDiff * 12).toFixed(2));

  return {
    current_sku: currentSku,
    current_hourly: curPrice.hourly_rate,
    current_monthly: curMonthly,
    alternative_sku: alternativeSku,
    alternative_hourly: altPrice.hourly_rate,
    alternative_monthly: altMonthly,
    monthly_difference: monthlyDiff,
    annualized_difference: annualDiff,
    is_saving: monthlyDiff < 0,
    currency,
    region,
  };
}

// ----------------------------------------------------
// CLI & Markdown Report Generator
// ----------------------------------------------------
export function generateCostGuardCliReport(analysis: CostGuardAnalysisResult, budgetThreshold: number, currency: string = 'INR'): string {
  const fin = analysis.financial_summary;
  const verdict = analysis.policy_verdict;
  const lines: string[] = [];

  for (const log of analysis.logs) {
    if (log.startsWith('[INFO] Skipping') || log.startsWith('[WARN]')) {
      lines.push(log);
    }
  }

  lines.push('');
  lines.push('============================================================');
  lines.push('COSTGUARD — COST IMPACT REPORT');
  lines.push('============================================================');
  lines.push(
    `${'Resource'.padEnd(20)} ${'Action'.padEnd(15)} ${'Current'.padStart(8)} ${'Projected'.padStart(12)} ${'Impact'.padStart(14)}`
  );
  lines.push('-'.repeat(72));

  for (const r of analysis.resource_details) {
    const shortAddr = r.address.split('.').pop() || r.address;
    const isSkipped = r.status === 'SKIPPED';
    let oldStr = '—';
    let newStr = '—';
    let deltaStr = 'SKIPPED';

    if (!isSkipped) {
      oldStr = formatINRText(r.old_monthly_cost);
      newStr = formatINRText(r.new_monthly_cost);
      deltaStr = formatINRText(r.delta_monthly_cost, { showSign: true });
    }

    lines.push(
      `${shortAddr.slice(0, 19).padEnd(20)} ${r.action.padEnd(15)} ${oldStr.padStart(8)} ${newStr.padStart(12)} ${deltaStr.padStart(14)}`
    );
  }

  lines.push('-'.repeat(72));
  lines.push('');
  lines.push(`CURRENT COST       ${formatINRText(fin.prior_monthly_total)}/month`);
  lines.push(`PROJECTED COST     ${formatINRText(fin.projected_monthly_total)}/month`);
  lines.push(`MONTHLY IMPACT     ${formatINRText(fin.net_monthly_impact, { showSign: true })}/month`);
  lines.push(`ANNUAL IMPACT      ${formatINRText(fin.annualized_impact, { showSign: true })}/year`);
  lines.push('');
  lines.push(`BUDGET             ${formatINRText(budgetThreshold)}/month`);
  lines.push(`STATUS             ${verdict.is_breached ? '✕ EXCEEDED' : '✓ WITHIN BUDGET'}`);
  lines.push('');
  lines.push(verdict.is_breached ? 'DEPLOYMENT BLOCKED' : 'DEPLOYMENT PERMITTED');
  lines.push(`Exit Code: ${verdict.exit_code}`);
  lines.push('');

  const hits = analysis.cache_summary.cache_hits;
  const calls = analysis.cache_summary.api_calls;
  const hitRate = hits + calls > 0 ? Math.round((hits / (hits + calls)) * 100) : 0;
  lines.push(`Cache: ${hits} hits · ${calls} API lookups (${hitRate}% hit rate)`);
  lines.push('============================================================');

  return lines.join('\n');
}

export function generateCostGuardMarkdownReport(analysis: CostGuardAnalysisResult, budgetThreshold: number, currency: string = 'INR'): string {
  const fin = analysis.financial_summary;
  const verdict = analysis.policy_verdict;
  const lines: string[] = [];

  lines.push(`## 🛡️ CostGuard FinOps Guardrail Report`);
  lines.push('');
  if (verdict.is_breached) {
    lines.push(`### ❌ Deployment Blocked: Monthly Cost Threshold Breached`);
  } else {
    lines.push(`### ✅ Deployment Permitted: Changes Within Budget`);
  }
  lines.push('');
  lines.push(
    `> **Monthly Impact:** \`${formatINRText(fin.net_monthly_impact, { showSign: true })}/mo\` | **Budget:** \`${formatINRText(budgetThreshold)}/mo\` | **Annualized:** \`${formatINRText(fin.annualized_impact, { showSign: true })}/yr\`  `
  );
  lines.push(`> **Status:** \`${verdict.status}\` | **Exit Code:** \`${verdict.exit_code}\`  `);
  lines.push('');
  lines.push(`| Resource | Action | Region | SKU | Baseline | Projected | Delta/Mo |`);
  lines.push(`| :--- | :--- | :--- | :--- | ---: | ---: | ---: |`);

  for (const r of analysis.resource_details) {
    const shortAddr = r.address.split('.').pop() || r.address;
    const isSkipped = r.status === 'SKIPPED';
    let oldStr = '—';
    let newStr = '—';
    let deltaStr = 'SKIPPED';

    if (!isSkipped) {
      oldStr = formatINRText(r.old_monthly_cost);
      newStr = formatINRText(r.new_monthly_cost);
      deltaStr = formatINRText(r.delta_monthly_cost, { showSign: true });
    }

    lines.push(`| \`${shortAddr}\` | ${r.action} | ${r.region} | ${r.sku} | ${oldStr} | ${newStr} | **${deltaStr}** |`);
  }

  lines.push('');
  lines.push(`*Generated by CostGuard FinOps Cloud Infrastructure Guardrail*`);
  return lines.join('\n');
}

// ----------------------------------------------------
// In-Process CLI Runner
// ----------------------------------------------------
export async function runCostGuardCli(
  command: string,
  planContent?: any
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const parts = command.trim().split(/\s+/);
  let maxIncrease = 4000.0;
  let currency = 'INR';
  let isMarkdown = false;
  let isJson = false;

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === '--max-increase' || p === '-m') {
      maxIncrease = parseFloat(parts[++i]) || 4000.0;
    } else if (p === '--currency' || p === '-c') {
      currency = parts[++i] || 'INR';
    } else if (p === '--markdown') {
      isMarkdown = true;
    } else if (p === '--json') {
      isJson = true;
    }
  }

  try {
    let rawObj = planContent;
    if (typeof planContent === 'string') {
      rawObj = JSON.parse(planContent);
    }
    const result = await analyzeCostGuardPlan(rawObj, { maxIncrease, currency });

    if (isJson) {
      return {
        stdout: JSON.stringify(result, null, 2),
        stderr: '',
        exitCode: result.policy_verdict.exit_code,
      };
    }
    if (isMarkdown) {
      return {
        stdout: generateCostGuardMarkdownReport(result, maxIncrease, currency),
        stderr: '',
        exitCode: result.policy_verdict.exit_code,
      };
    }
    return {
      stdout: generateCostGuardCliReport(result, maxIncrease, currency),
      stderr: '',
      exitCode: result.policy_verdict.exit_code,
    };
  } catch (err: any) {
    return {
      stdout: '',
      stderr: `Error running CostGuard: ${err.message}`,
      exitCode: 2,
    };
  }
}
