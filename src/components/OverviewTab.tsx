import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Info,
  Scale,
  ArrowRight,
  AlertTriangle,
  Bell,
  Sliders,
  ShieldAlert,
  Layers,
  PlusCircle,
  RefreshCw,
  Trash2,
  Cpu,
  Zap,
} from 'lucide-react';
import { AnalysisResponse, TabType, BudgetThresholdConfig } from '../types';
import { formatINR } from '../utils/currency';
import { formatResourceType } from './CostImpactTab';

interface OverviewTabProps {
  analysis: AnalysisResponse | null;
  onNavigateTab: (tab: TabType) => void;
  budgetConfig: BudgetThresholdConfig;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  analysis,
  onNavigateTab,
  budgetConfig,
}) => {
  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-slate-900 border border-slate-800">
        <Info className="w-10 h-10 text-slate-500 mb-3" />
        <h3 className="text-base font-semibold text-slate-200">No Terraform Plan Analyzed</h3>
        <p className="text-xs text-slate-400 max-w-sm mt-1">
          Select a sample plan above or switch to Plan Analysis to paste your Terraform plan JSON.
        </p>
        <button
          onClick={() => onNavigateTab('analyzer')}
          className="mt-4 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
        >
          Open Plan Analysis
        </button>
      </div>
    );
  }

  const { financial_summary, policy_verdict, resource_counts, resource_details } = analysis;
  const netDelta = financial_summary.net_monthly_impact;
  const projectedTotal = financial_summary.projected_monthly_total;

  // Threshold evaluations
  const isHardBreached = policy_verdict.is_breached || netDelta > budgetConfig.maxIncrease;
  const isWarningBreached =
    budgetConfig.warningEnabled &&
    netDelta >= budgetConfig.warningThreshold &&
    !isHardBreached;
  const isSpendCapBreached =
    budgetConfig.totalSpendCapEnabled &&
    projectedTotal >= budgetConfig.totalSpendCap;

  const warningOverAmount = Math.max(0, netDelta - budgetConfig.warningThreshold);
  const warningUtilizationPct =
    budgetConfig.warningThreshold > 0
      ? Math.round((netDelta / budgetConfig.warningThreshold) * 100)
      : 0;

  // Top 3 impact drivers
  const topCostDrivers = [...resource_details]
    .sort((a, b) => Math.abs(b.delta_monthly_cost) - Math.abs(a.delta_monthly_cost))
    .slice(0, 3);

  return (
    <div className="space-y-6 max-w-7xl mx-auto py-2">
      {/* ---------------------------------------------------- */}
      {/* Visual Warning Alert Banner (Triggered by threshold) */}
      {/* ---------------------------------------------------- */}
      {isWarningBreached && (
        <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/50 shadow-lg shadow-amber-950/20 flex flex-col md:flex-row md:items-center justify-between gap-4 transition animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <div className="relative p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-amber-300">
                  Budget Warning Threshold Exceeded
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {warningUtilizationPct}% OF WARNING LIMIT
                </span>
              </div>
              <p className="text-xs text-amber-200/90 mt-1">
                Net monthly impact of{' '}
                <strong className="text-white font-mono">{formatINR(netDelta, { showSign: true })}/mo</strong>{' '}
                exceeds your configured warning threshold of{' '}
                <strong className="text-white font-mono">{formatINR(budgetConfig.warningThreshold)}/mo</strong>{' '}
                by{' '}
                <strong className="text-amber-300 font-mono">+{formatINR(warningOverAmount)}/mo</strong>.
                {` Hard deployment block triggers at ${formatINR(budgetConfig.maxIncrease)}/mo.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
            <button
              onClick={() => onNavigateTab('impact')}
              className="px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-amber-500/30 text-amber-200 text-xs font-semibold transition cursor-pointer"
            >
              Cost Breakdown
            </button>
            <button
              onClick={() => onNavigateTab('settings')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md transition cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Configure Threshold</span>
            </button>
          </div>
        </div>
      )}

      {/* Spend Cap Alert Banner if total spend exceeds absolute cap */}
      {isSpendCapBreached && !isWarningBreached && !isHardBreached && (
        <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/50 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 shrink-0 mt-0.5">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-indigo-300">
                Total Monthly Spend Cap Warning
              </h4>
              <p className="text-xs text-slate-300 mt-1">
                Projected total run-rate of{' '}
                <strong className="text-white font-mono">{formatINR(projectedTotal)}/mo</strong>{' '}
                exceeds your configured cap of{' '}
                <strong className="text-white font-mono">{formatINR(budgetConfig.totalSpendCap)}/mo</strong>.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('settings')}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shrink-0 self-end md:self-center cursor-pointer"
          >
            Adjust Spend Cap
          </button>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* Four Executive Summary KPI Cards                     */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Current Cost */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between transition hover:border-slate-700">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Current Cost
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                Baseline
              </span>
            </div>
            <div className="mt-3 mb-1">
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white tracking-tight">
                {formatINR(financial_summary.prior_monthly_total, { unit: '/mo' })}
              </div>
            </div>
          </div>
          <div className="pt-3 border-t border-slate-800/80 mt-3">
            <span className="text-xs text-slate-500 block">
              Existing infrastructure run-rate
            </span>
          </div>
        </div>

        {/* 2. Projected Cost */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between transition hover:border-slate-700">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Projected Cost
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                Post-Apply
              </span>
            </div>
            <div className="mt-3 mb-1">
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white tracking-tight">
                {formatINR(financial_summary.projected_monthly_total, { unit: '/mo' })}
              </div>
            </div>
          </div>
          <div className="pt-3 border-t border-slate-800/80 mt-3">
            <span className="text-xs text-slate-500 block">
              730 hours / month standard run-rate
            </span>
          </div>
        </div>

        {/* 3. Monthly Impact */}
        <div
          className={`p-5 rounded-2xl border shadow-sm flex flex-col justify-between transition ${
            netDelta > 0
              ? 'bg-slate-900 border-amber-500/30 hover:border-amber-500/50'
              : netDelta < 0
              ? 'bg-slate-900 border-emerald-500/30 hover:border-emerald-500/50'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Monthly Impact
              </span>
              {netDelta > 0 ? (
                <div className="flex items-center gap-1 text-[11px] text-amber-400 font-medium">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Increase</span>
                </div>
              ) : netDelta < 0 ? (
                <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>Savings</span>
                </div>
              ) : (
                <span className="text-[10px] text-slate-500 font-mono">No Delta</span>
              )}
            </div>
            <div className="mt-3 mb-1">
              <div
                className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight ${
                  netDelta > 0
                    ? 'text-amber-400'
                    : netDelta < 0
                    ? 'text-emerald-400'
                    : 'text-slate-200'
                }`}
              >
                {formatINR(netDelta, { showSign: true, unit: '/mo' })}
              </div>
            </div>
          </div>
          <div className="pt-3 border-t border-slate-800/80 mt-3 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-500">Annualized:</span>
            <span
              className={
                netDelta > 0
                  ? 'text-amber-400 font-bold'
                  : netDelta < 0
                  ? 'text-emerald-400 font-bold'
                  : 'text-slate-400'
              }
            >
              {formatINR(financial_summary.annualized_impact, { showSign: true, unit: '/yr' })}
            </span>
          </div>
        </div>

        {/* 4. Budget Status (With Visual Warning State) */}
        <div
          className={`p-5 rounded-2xl border shadow-sm flex flex-col justify-between transition ${
            isHardBreached
              ? 'bg-red-950/20 border-red-500/40 hover:border-red-500/60 ring-1 ring-red-500/30'
              : isWarningBreached
              ? 'bg-amber-950/20 border-amber-500/50 hover:border-amber-500/70 ring-1 ring-amber-500/40'
              : 'bg-emerald-950/20 border-emerald-500/40 hover:border-emerald-500/60'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Budget Status
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase ${
                  isHardBreached
                    ? 'bg-red-500 text-white'
                    : isWarningBreached
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-emerald-500 text-white'
                }`}
              >
                {isHardBreached
                  ? `Exit ${policy_verdict.exit_code}`
                  : isWarningBreached
                  ? 'Warning'
                  : `Exit ${policy_verdict.exit_code}`}
              </span>
            </div>
            <div className="mt-3 mb-1 flex items-center gap-3">
              {isHardBreached ? (
                <XCircle className="w-7 h-7 text-red-400 shrink-0" />
              ) : isWarningBreached ? (
                <AlertTriangle className="w-7 h-7 text-amber-400 shrink-0 animate-pulse" />
              ) : (
                <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0" />
              )}
              <span
                className={`text-2xl font-black font-mono tracking-wide uppercase ${
                  isHardBreached
                    ? 'text-red-400'
                    : isWarningBreached
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {isHardBreached ? 'BLOCKED' : isWarningBreached ? 'WARNING' : 'PASS'}
              </span>
            </div>
          </div>
          <div className="pt-3 border-t border-slate-800/80 mt-3 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">
              {isHardBreached
                ? 'Over limit:'
                : isWarningBreached
                ? 'Over warning:'
                : 'Headroom:'}
            </span>
            <span
              className={
                isHardBreached
                  ? 'text-red-400 font-bold'
                  : isWarningBreached
                  ? 'text-amber-400 font-bold'
                  : 'text-emerald-400 font-bold'
              }
            >
              {isHardBreached
                ? formatINR(policy_verdict.amount_difference, { unit: '/mo' })
                : isWarningBreached
                ? `+${formatINR(warningOverAmount, { unit: '/mo' })}`
                : formatINR(policy_verdict.amount_difference, { unit: '/mo' })}
            </span>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* Governance Threshold Utilization Progress Meter      */}
      {/* ---------------------------------------------------- */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-indigo-400" />
            <span className="font-semibold text-white">Budget Guardrail Utilization</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
            <span>
              Warning: <strong className="text-amber-400">{formatINR(budgetConfig.warningThreshold)}</strong>
            </span>
            <span>&bull;</span>
            <span>
              Hard Limit: <strong className="text-red-400">{formatINR(budgetConfig.maxIncrease)}</strong>
            </span>
          </div>
        </div>

        {/* Visual Multi-Segment Bar */}
        <div className="relative w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          {/* Progress fill */}
          {budgetConfig.maxIncrease > 0 && (
            <div
              style={{
                width: `${Math.min(100, Math.max(0, (netDelta / budgetConfig.maxIncrease) * 100))}%`,
              }}
              className={`h-full rounded-full transition-all duration-500 ${
                isHardBreached
                  ? 'bg-red-500'
                  : isWarningBreached
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
            />
          )}

          {/* Warning Threshold Marker Line */}
          {budgetConfig.maxIncrease > 0 && budgetConfig.warningThreshold < budgetConfig.maxIncrease && (
            <div
              style={{
                left: `${(budgetConfig.warningThreshold / budgetConfig.maxIncrease) * 100}%`,
              }}
              className="absolute top-0 bottom-0 w-0.5 bg-amber-400 shadow-xs"
              title={`Warning Marker: ${formatINR(budgetConfig.warningThreshold)}`}
            />
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span>₹0</span>
          <span>
            Current Delta: {formatINR(netDelta, { showSign: true })}/mo (
            {budgetConfig.maxIncrease > 0 ? Math.round((netDelta / budgetConfig.maxIncrease) * 100) : 0}% of budget)
          </span>
          <span>Limit: {formatINR(budgetConfig.maxIncrease)}</span>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* Infrastructure Velocity & Top Cost Drivers Grid      */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Cols: Top Cost Drivers */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">Top Cost Drivers</h3>
              </div>
              <button
                onClick={() => onNavigateTab('impact')}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1 transition cursor-pointer"
              >
                <span>View all {resource_details.length}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2">
              {topCostDrivers.map((r, i) => {
                const shortName = r.address.split('.').pop() || r.address;
                const isPositive = r.delta_monthly_cost > 0;
                const isNegative = r.delta_monthly_cost < 0;

                return (
                  <div
                    key={i}
                    className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="truncate">
                      <div className="font-semibold text-slate-200 truncate" title={r.address}>
                        {shortName}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {formatResourceType(r.resource_type)} &bull; {r.sku} &bull; {r.region}
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-mono">
                      <div
                        className={`font-bold ${
                          isPositive
                            ? 'text-amber-400'
                            : isNegative
                            ? 'text-emerald-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {formatINR(r.delta_monthly_cost, { showSign: true })}/mo
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Proj: {formatINR(r.new_monthly_cost)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Official Azure Retail Pricing &bull; 730 hrs/mo standard</span>
            <button
              onClick={() => onNavigateTab('impact')}
              className="text-indigo-400 hover:underline"
            >
              Inspect Resource Table &rarr;
            </button>
          </div>
        </div>

        {/* Right Col: Resource Action Velocity */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-white">Plan Change Velocity</h3>
            </div>

            <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block uppercase font-sans">Creates</span>
                <span className="text-base font-bold text-emerald-400 block mt-0.5">
                  +{resource_counts.creates}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block uppercase font-sans">Updates</span>
                <span className="text-base font-bold text-amber-400 block mt-0.5">
                  ~{resource_counts.updates}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block uppercase font-sans">Deletes</span>
                <span className="text-base font-bold text-red-400 block mt-0.5">
                  -{resource_counts.deletes}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block uppercase font-sans">Billable</span>
                <span className="text-base font-bold text-white block mt-0.5">
                  {resource_counts.billable}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Total: {resource_counts.total_detected} resources</span>
            <span className="text-emerald-400 font-mono font-semibold">100% Priced</span>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* Quick Compare Action Banner                          */}
      {/* ---------------------------------------------------- */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Compare Alternative Architecture Plans</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Evaluate side-by-side cost variance and policy compliance across different execution plans.
            </p>
          </div>
        </div>
        <button
          onClick={() => onNavigateTab('compare')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition active:scale-95 whitespace-nowrap self-end sm:self-center cursor-pointer"
        >
          <span>Open Plan Compare</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
