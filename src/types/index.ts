export type TabType =
  | 'overview'
  | 'analyzer'
  | 'impact'
  | 'compare'
  | 'settings';

export interface ResourceCostDetail {
  address: string;
  resource_type: string;
  action: 'CREATE' | 'DELETE' | 'UPDATE' | 'REPLACEMENT' | 'SKIPPED' | string;
  region: string;
  sku: string;
  meter: string;
  old_hourly_cost: number;
  new_hourly_cost: number;
  old_monthly_cost: number;
  new_monthly_cost: number;
  delta_monthly_cost: number;
  status: 'SUCCESS' | 'SKIPPED' | 'UNPRICED' | string;
  note?: string;
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
  status: 'PASSED' | 'FAILED';
  amount_difference: number;
  is_breached: boolean;
  exit_code: number;
  summary_message: string;
}

export interface BudgetThresholdConfig {
  maxIncrease: number; // Hard policy limit (exit code 1)
  warningThreshold: number; // Soft warning alert limit (₹/mo)
  warningEnabled: boolean;
  totalSpendCap: number; // Maximum total monthly run-rate ceiling (₹/mo)
  totalSpendCapEnabled: boolean;
}

export interface ResourceCounts {
  total_detected: number;
  billable: number;
  skipped: number;
  creates: number;
  deletes: number;
  updates: number;
  replacements: number;
}

export interface TagAttributionItem {
  category: string;
  value: string;
  prior_monthly_cost: number;
  projected_monthly_cost: number;
  delta_monthly_cost: number;
}

export interface OptimizationSuggestion {
  target_resource: string;
  suggestion: string;
  potential_monthly_savings: number;
  action_required: string;
}

export interface AiAdvisorData {
  title: string;
  detected_cost_increase: string;
  primary_driver: string;
  driver_impact_monthly: number;
  cost_concentration_percentage: number;
  why_did_cost_change: string[];
  where_cost_is_concentrated: string;
  optimizations: OptimizationSuggestion[];
  how_to_satisfy_policy: string[];
  disclaimer: string;
  executive_commentary?: string;
}

export interface RiskFactor {
  factor: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
}

export interface RiskAssessment {
  risk_level: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  risk_score: number;
  badge_color: string;
  factors: RiskFactor[];
  metrics: {
    total_changed_resources: number;
    increasing_resources_count: number;
    pct_resources_increasing: number;
    annualized_impact: number;
  };
}

export interface AnalysisResponse {
  financial_summary: FinancialSummary;
  policy_verdict: PolicyVerdict;
  cache_summary: CacheSummary;
  resource_counts: ResourceCounts;
  resource_details: ResourceCostDetail[];
  explanations: string[];
  tag_attribution: Record<string, TagAttributionItem[]>;
  ai_advisor?: AiAdvisorData;
  risk_assessment?: RiskAssessment;
  logs: string[];
}

export interface CacheEntry {
  sku: string;
  region: string;
  currency: string;
  hourly_rate: number;
  cached_at: number;
  meter_name: string;
}

export interface CacheStatsResponse {
  total_entries: number;
  oldest_timestamp: number | null;
  newest_timestamp: number | null;
  entries: CacheEntry[];
}

export interface SamplePlanItem {
  filename: string;
  title: string;
  description: string;
}

export interface SimulationResult {
  current_sku: string;
  current_hourly: number;
  current_monthly: number;
  alternative_sku: string;
  alternative_hourly: number;
  alternative_monthly: number;
  monthly_difference: number;
  annualized_difference: number;
  is_saving: boolean;
  currency: string;
  region: string;
}
