import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Database,
  Trash2,
  Terminal,
  CheckCircle2,
  Lock,
  Copy,
  Check,
  AlertTriangle,
  Bell,
  ShieldAlert,
  Percent,
  TrendingUp,
  ArrowRight,
  Info,
} from 'lucide-react';
import { AnalysisResponse, CacheStatsResponse, BudgetThresholdConfig, TabType } from '../types';
import { formatINR, formatINRMonthly } from '../utils/currency';
import { api } from '../services/api';

interface SettingsTabProps {
  budgetConfig: BudgetThresholdConfig;
  onChangeBudgetConfig: (newConfig: BudgetThresholdConfig) => void;
  analysis: AnalysisResponse | null;
  onNavigateTab?: (tab: TabType) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  budgetConfig,
  onChangeBudgetConfig,
  analysis,
  onNavigateTab,
}) => {
  const [cacheStats, setCacheStats] = useState<CacheStatsResponse | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const fetchCache = async () => {
    try {
      const stats = await api.getCacheStats();
      setCacheStats(stats);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchCache();
  }, []);

  const handleClearCache = async () => {
    if (!window.confirm('Clear the CostGuard local SQLite pricing cache?')) return;
    setClearing(true);
    try {
      const res = await api.clearCache();
      setClearMessage(`Cleared ${res.deleted} entries from SQLite cache.`);
      await fetchCache();
      setTimeout(() => setClearMessage(null), 3000);
    } catch (e: any) {
      setClearMessage(`Failed: ${e.message}`);
    } finally {
      setClearing(false);
    }
  };

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const updateConfig = (patch: Partial<BudgetThresholdConfig>) => {
    const updated: BudgetThresholdConfig = {
      ...budgetConfig,
      ...patch,
    };
    onChangeBudgetConfig(updated);
  };

  // Quick preset handlers
  const setPercentageOfMax = (pct: number) => {
    const val = Math.round((budgetConfig.maxIncrease * pct) / 100);
    updateConfig({ warningThreshold: Math.max(100, val) });
  };

  // Evaluate current analysis against thresholds
  const netMonthly = analysis?.financial_summary.net_monthly_impact ?? 0;
  const projectedTotal = analysis?.financial_summary.projected_monthly_total ?? 0;
  const isHardBreached = netMonthly > budgetConfig.maxIncrease;
  const isWarningBreached =
    budgetConfig.warningEnabled &&
    netMonthly >= budgetConfig.warningThreshold &&
    !isHardBreached;
  const isSpendCapBreached =
    budgetConfig.totalSpendCapEnabled &&
    projectedTotal >= budgetConfig.totalSpendCap;

  const commands = [
    {
      title: 'Analyze Terraform Plan file with budget limit:',
      cmd: `costguard --plan plan.json --max-increase ${budgetConfig.maxIncrease}`,
    },
    {
      title: 'Pipe directly from Terraform output:',
      cmd: `terraform show -json tfplan.binary | costguard --max-increase ${budgetConfig.maxIncrease}`,
    },
    {
      title: 'Generate GitHub PR Markdown comment:',
      cmd: 'costguard --plan plan.json --markdown',
    },
    {
      title: 'Clear SQLite pricing cache:',
      cmd: 'costguard --clear-cache',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ---------------------------------------------------- */}
      {/* Budget Guardrail & Custom Warning Thresholds Card    */}
      {/* ---------------------------------------------------- */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white tracking-tight">
              Budget Thresholds & Governance Alerts
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Configure multi-tier cost guardrails. Soft warning thresholds trigger visual indicators in the Overview tab, while the hard limit blocks deployment via exit code 1.
          </p>
        </div>

        {/* 1. Custom Warning Threshold (Soft Alert Limit) */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 mt-0.5">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Visual Warning Threshold (Soft Alert)
                  </h3>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                    Overview Alert
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Triggers visual warning indicator and amber badge in the Overview tab when net cost increase reaches this limit.
                </p>
              </div>
            </div>

            {/* Toggle switch */}
            <label className="flex items-center gap-2 cursor-pointer self-start sm:self-center shrink-0">
              <span className="text-xs text-slate-400 font-medium">Warning Alert</span>
              <input
                type="checkbox"
                checked={budgetConfig.warningEnabled}
                onChange={(e) => updateConfig({ warningEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500 relative" />
            </label>
          </div>

          {budgetConfig.warningEnabled && (
            <div className="pt-2 border-t border-slate-800/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex justify-between text-xs font-mono mb-2">
                    <span className="text-slate-400">Warning Trigger Amount:</span>
                    <span className="text-amber-400 font-bold text-sm">
                      {formatINRMonthly(budgetConfig.warningThreshold, { fullUnit: true })}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="250"
                    max={Math.max(budgetConfig.maxIncrease, 15000)}
                    step="250"
                    value={budgetConfig.warningThreshold}
                    onChange={(e) =>
                      updateConfig({ warningThreshold: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                <div className="flex items-center gap-1.5 font-mono text-xs">
                  <span className="text-slate-400">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="250"
                    value={budgetConfig.warningThreshold}
                    onChange={(e) =>
                      updateConfig({
                        warningThreshold: Math.max(0, parseFloat(e.target.value) || 0),
                      })
                    }
                    className="w-24 bg-slate-900 border border-slate-700 text-amber-300 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <span className="text-slate-500">/mo</span>
                </div>
              </div>

              {/* Quick % and Amount Presets */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] text-slate-500 font-mono">Quick Presets:</span>
                {[
                  { label: '50% of budget', pct: 50 },
                  { label: '70% of budget', pct: 70 },
                  { label: '80% of budget', pct: 80 },
                  { label: '90% of budget', pct: 90 },
                ].map((item) => (
                  <button
                    key={item.pct}
                    onClick={() => setPercentageOfMax(item.pct)}
                    className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition"
                  >
                    {item.label}
                  </button>
                ))}

                {[1000, 2500, 5000].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => updateConfig({ warningThreshold: amt })}
                    className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 transition"
                  >
                    ₹{amt.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 2. Hard Circuit Breaker (Pipeline Block Limit) */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
          <div className="flex items-start gap-2.5">
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 mt-0.5">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Hard Policy Budget Limit (Circuit Breaker)
                </h3>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
                  CI/CD Exit Code 1
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                CostGuard hard blocks automated deployment pipelines if net monthly cost increase exceeds this amount.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-xs font-mono mb-2">
                  <span className="text-slate-400">Hard Block Limit:</span>
                  <span className="text-indigo-400 font-bold text-sm">
                    {formatINRMonthly(budgetConfig.maxIncrease, { fullUnit: true })}
                  </span>
                </div>
                <input
                  type="range"
                  min="500"
                  max="30000"
                  step="500"
                  value={budgetConfig.maxIncrease}
                  onChange={(e) =>
                    updateConfig({ maxIncrease: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <div className="flex items-center gap-1.5 font-mono text-xs">
                <span className="text-slate-400">₹</span>
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={budgetConfig.maxIncrease}
                  onChange={(e) =>
                    updateConfig({
                      maxIncrease: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-24 bg-slate-900 border border-slate-700 text-slate-200 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <span className="text-slate-500">/mo</span>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] text-slate-500 font-mono">Limit Presets:</span>
              {[2000, 4000, 8000, 15000].map((amt) => (
                <button
                  key={amt}
                  onClick={() => updateConfig({ maxIncrease: amt })}
                  className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-900 hover:bg-slate-800 border border-slate-700 text-indigo-300 transition"
                >
                  ₹{amt.toLocaleString('en-IN')}/mo
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Total Projected Monthly Spend Ceiling */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Absolute Monthly Run-Rate Cap
                </h3>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 font-medium">
                  Total Spend Limit
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Warns if total post-apply monthly cloud spend (existing + new) crosses this absolute threshold.
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer self-start sm:self-center shrink-0">
              <span className="text-xs text-slate-400 font-medium">Spend Cap</span>
              <input
                type="checkbox"
                checked={budgetConfig.totalSpendCapEnabled}
                onChange={(e) => updateConfig({ totalSpendCapEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500 relative" />
            </label>
          </div>

          {budgetConfig.totalSpendCapEnabled && (
            <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-xs font-mono mb-2">
                  <span className="text-slate-400">Total Run-Rate Ceiling:</span>
                  <span className="text-indigo-400 font-bold text-sm">
                    {formatINRMonthly(budgetConfig.totalSpendCap, { fullUnit: true })}
                  </span>
                </div>
                <input
                  type="range"
                  min="5000"
                  max="100000"
                  step="1000"
                  value={budgetConfig.totalSpendCap}
                  onChange={(e) =>
                    updateConfig({ totalSpendCap: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <div className="flex items-center gap-1.5 font-mono text-xs">
                <span className="text-slate-400">₹</span>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={budgetConfig.totalSpendCap}
                  onChange={(e) =>
                    updateConfig({
                      totalSpendCap: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-24 bg-slate-900 border border-slate-700 text-slate-200 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <span className="text-slate-500">/mo</span>
              </div>
            </div>
          )}
        </div>

        {/* 4. Real-Time Governance Preview Banner */}
        {analysis && (
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              isHardBreached
                ? 'bg-red-950/20 border-red-500/30'
                : isWarningBreached || isSpendCapBreached
                ? 'bg-amber-950/20 border-amber-500/30'
                : 'bg-emerald-950/20 border-emerald-500/30'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-lg mt-0.5 ${
                  isHardBreached
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : isWarningBreached || isSpendCapBreached
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}
              >
                {isHardBreached ? (
                  <ShieldAlert className="w-5 h-5" />
                ) : isWarningBreached || isSpendCapBreached ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold uppercase tracking-wider font-mono ${
                      isHardBreached
                        ? 'text-red-400'
                        : isWarningBreached || isSpendCapBreached
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {isHardBreached
                      ? 'Live Status: Policy Blocked'
                      : isWarningBreached
                      ? 'Live Status: Visual Warning Active'
                      : isSpendCapBreached
                      ? 'Live Status: Spend Cap Alert'
                      : 'Live Status: Within All Thresholds'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Net: {formatINR(netMonthly, { showSign: true })}/mo
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  {isHardBreached
                    ? `Net increase exceeds hard budget limit of ${formatINR(budgetConfig.maxIncrease)}/mo by ${formatINR(netMonthly - budgetConfig.maxIncrease)}/mo.`
                    : isWarningBreached
                    ? `Net increase exceeds warning threshold of ${formatINR(budgetConfig.warningThreshold)}/mo by ${formatINR(netMonthly - budgetConfig.warningThreshold)}/mo. Visual warning indicator is active in Overview.`
                    : isSpendCapBreached
                    ? `Total projected monthly run-rate (${formatINR(projectedTotal)}/mo) exceeds total spend cap of ${formatINR(budgetConfig.totalSpendCap)}/mo.`
                    : `Current plan increase (${formatINR(netMonthly, { showSign: true })}/mo) complies with all budget thresholds.`}
                </p>
              </div>
            </div>

            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('overview')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold transition shrink-0 self-end sm:self-center"
              >
                <span>View in Overview</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* SQLite Pricing Cache Card                            */}
      {/* ---------------------------------------------------- */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">SQLite Pricing Cache</h3>
          </div>
          <button
            onClick={handleClearCache}
            disabled={clearing}
            className="px-2.5 py-1 rounded bg-red-950/40 border border-red-500/30 text-red-300 text-xs hover:bg-red-950/70 flex items-center gap-1 transition disabled:opacity-50"
          >
            <Trash2 className="w-3 h-3" />
            <span>{clearing ? 'Clearing...' : 'Clear Cache'}</span>
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-3">
          Local write-through cache storing Azure Retail pricing to ensure fast offline performance.
        </p>

        {clearMessage && (
          <div className="p-2.5 rounded bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 text-xs mb-3 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{clearMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
            <span className="text-[10px] text-slate-500 block uppercase">Total Cached SKUs</span>
            <span className="text-base font-bold text-white block mt-0.5">{cacheStats?.total_entries ?? 0}</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
            <span className="text-[10px] text-slate-500 block uppercase">Plan Cache Hits</span>
            <span className="text-base font-bold text-emerald-400 block mt-0.5">{analysis?.cache_summary.cache_hits ?? 0}</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
            <span className="text-[10px] text-slate-500 block uppercase">API Lookups</span>
            <span className="text-base font-bold text-cyan-400 block mt-0.5">{analysis?.cache_summary.api_calls ?? 0}</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
            <span className="text-[10px] text-slate-500 block uppercase">Hit Rate</span>
            <span className="text-base font-bold text-white block mt-0.5">{analysis?.cache_summary.cache_hit_rate_pct ?? 0}%</span>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* CLI & CI/CD Pipeline Commands Card                   */}
      {/* ---------------------------------------------------- */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Terminal className="w-4 h-4 text-slate-300" />
          <h3 className="text-sm font-semibold text-white">CLI & CI/CD Pipeline Commands</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          CostGuard CLI integrates seamlessly into developer workstations and GitHub Actions / GitLab CI.
        </p>

        <div className="space-y-2.5">
          {commands.map((c, i) => (
            <div key={i} className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px] mb-0.5">{c.title}</span>
                <code className="font-mono text-indigo-300">{c.cmd}</code>
              </div>
              <button
                onClick={() => copyCommand(c.cmd)}
                className="text-slate-400 hover:text-white p-1.5 rounded bg-slate-900 border border-slate-800"
              >
                {copiedCmd === c.cmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* Pipeline Exit Codes Reference                        */}
      {/* ---------------------------------------------------- */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono mb-2">
          Pipeline Exit Codes
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-xs">
          <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
            <span className="text-emerald-400 font-bold block">Exit Code 0 (PASS)</span>
            <span className="text-slate-400 text-[11px] block mt-0.5 font-sans">
              Within budget limits. Deployment continues.
            </span>
          </div>
          <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
            <span className="text-red-400 font-bold block">Exit Code 1 (BLOCKED)</span>
            <span className="text-slate-400 text-[11px] block mt-0.5 font-sans">
              Hard budget exceeded. Circuit breaker stops deployment.
            </span>
          </div>
          <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
            <span className="text-amber-400 font-bold block">Exit Code 2 (ERROR)</span>
            <span className="text-slate-400 text-[11px] block mt-0.5 font-sans">
              Invalid plan JSON syntax or pricing lookup error.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
