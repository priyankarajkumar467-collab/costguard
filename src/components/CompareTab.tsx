import React, { useState, useEffect } from 'react';
import {
  ArrowRightLeft,
  Scale,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Equal,
  RotateCcw,
  Layers,
  Filter,
  Download,
  Copy,
  Check,
  Info,
} from 'lucide-react';
import { api } from '../services/api';
import { SamplePlanItem, AnalysisResponse, ResourceCostDetail } from '../types';
import { formatINR, formatINRMonthly, formatINRAnnual } from '../utils/currency';

interface CompareTabProps {
  samplePlans: SamplePlanItem[];
  currentPlanFilename: string;
  currentAnalysis: AnalysisResponse | null;
  maxIncrease: number;
}

export const CompareTab: React.FC<CompareTabProps> = ({
  samplePlans,
  currentPlanFilename,
  currentAnalysis,
  maxIncrease,
}) => {
  // Plan A (Baseline) and Plan B (Comparison)
  const [planAFile, setPlanAFile] = useState<string>(currentPlanFilename || 'plan_create.json');
  const [planBFile, setPlanBFile] = useState<string>('plan_update.json');

  const [analysisA, setAnalysisA] = useState<AnalysisResponse | null>(currentAnalysis);
  const [analysisB, setAnalysisB] = useState<AnalysisResponse | null>(null);

  const [isLoadingA, setIsLoadingA] = useState<boolean>(false);
  const [isLoadingB, setIsLoadingB] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [filterMode, setFilterMode] = useState<'all' | 'variance' | 'unique'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedMarkdown, setCopiedMarkdown] = useState<boolean>(false);

  // Initialize comparison when mounting or when files change
  useEffect(() => {
    // If current analysis matches planAFile, reuse it
    if (currentAnalysis && planAFile === currentPlanFilename) {
      setAnalysisA(currentAnalysis);
    } else {
      loadAndAnalyzePlan(planAFile, 'A');
    }
  }, [planAFile, currentPlanFilename, currentAnalysis, maxIncrease]);

  useEffect(() => {
    loadAndAnalyzePlan(planBFile, 'B');
  }, [planBFile, maxIncrease]);

  const loadAndAnalyzePlan = async (filename: string, target: 'A' | 'B') => {
    if (!filename) return;
    setErrorMsg(null);
    if (target === 'A') setIsLoadingA(true);
    else setIsLoadingB(true);

    try {
      const planData = await api.getPlanContent(filename);
      const res = await api.analyzePlan(planData.content, maxIncrease, 'INR', false);
      if (target === 'A') setAnalysisA(res);
      else setAnalysisB(res);
    } catch (err: any) {
      setErrorMsg(`Failed analyzing ${filename}: ${err.message}`);
    } finally {
      if (target === 'A') setIsLoadingA(false);
      else setIsLoadingB(false);
    }
  };

  // Swap Plans A and B
  const handleSwapPlans = () => {
    const tempFile = planAFile;
    const tempAnalysis = analysisA;

    setPlanAFile(planBFile);
    setAnalysisA(analysisB);

    setPlanBFile(tempFile);
    setAnalysisB(tempAnalysis);
  };

  // Quick preset comparisons
  const applyPreset = (fileA: string, fileB: string) => {
    setPlanAFile(fileA);
    setPlanBFile(fileB);
  };

  // Calculate comparison deltas
  const netImpactA = analysisA?.financial_summary.net_monthly_impact ?? 0;
  const netImpactB = analysisB?.financial_summary.net_monthly_impact ?? 0;
  const netDeltaBvsA = netImpactB - netImpactA;

  const annualizedImpactA = analysisA?.financial_summary.annualized_impact ?? 0;
  const annualizedImpactB = analysisB?.financial_summary.annualized_impact ?? 0;
  const annualizedDeltaBvsA = annualizedImpactB - annualizedImpactA;

  const projectedA = analysisA?.financial_summary.projected_monthly_total ?? 0;
  const projectedB = analysisB?.financial_summary.projected_monthly_total ?? 0;
  const projectedDeltaBvsA = projectedB - projectedA;

  const isSaving = netDeltaBvsA < 0;
  const isNeutral = Math.abs(netDeltaBvsA) < 0.01;

  // Percentage variance relative to Plan A
  const relativePercent =
    Math.abs(netImpactA) > 0 ? (netDeltaBvsA / Math.abs(netImpactA)) * 100 : 0;

  // Combine resource items from both plans
  interface MergedResource {
    address: string;
    resourceType: string;
    resA?: ResourceCostDetail;
    resB?: ResourceCostDetail;
    impactA: number;
    impactB: number;
    variance: number;
    status: 'both' | 'only_a' | 'only_b';
  }

  const mergedMap = new Map<string, MergedResource>();

  if (analysisA) {
    for (const r of analysisA.resource_details) {
      mergedMap.set(r.address, {
        address: r.address,
        resourceType: r.resource_type,
        resA: r,
        impactA: r.delta_monthly_cost,
        impactB: 0,
        variance: -r.delta_monthly_cost,
        status: 'only_a',
      });
    }
  }

  if (analysisB) {
    for (const r of analysisB.resource_details) {
      if (mergedMap.has(r.address)) {
        const item = mergedMap.get(r.address)!;
        item.resB = r;
        item.impactB = r.delta_monthly_cost;
        item.variance = item.impactB - item.impactA;
        item.status = 'both';
      } else {
        mergedMap.set(r.address, {
          address: r.address,
          resourceType: r.resource_type,
          resB: r,
          impactA: 0,
          impactB: r.delta_monthly_cost,
          variance: r.delta_monthly_cost,
          status: 'only_b',
        });
      }
    }
  }

  const allMergedResources = Array.from(mergedMap.values());

  // Filter resources
  const filteredResources = allMergedResources.filter((item) => {
    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchAddr = item.address.toLowerCase().includes(q);
      const matchType = item.resourceType.toLowerCase().includes(q);
      const matchSkuA = (item.resA?.sku || '').toLowerCase().includes(q);
      const matchSkuB = (item.resB?.sku || '').toLowerCase().includes(q);
      if (!matchAddr && !matchType && !matchSkuA && !matchSkuB) return false;
    }

    if (filterMode === 'variance') {
      return Math.abs(item.variance) > 0.01;
    }
    if (filterMode === 'unique') {
      return item.status === 'only_a' || item.status === 'only_b';
    }
    return true;
  });

  // Generate Markdown comparison export
  const exportMarkdown = () => {
    const titleA = samplePlans.find((p) => p.filename === planAFile)?.title || planAFile;
    const titleB = samplePlans.find((p) => p.filename === planBFile)?.title || planBFile;

    const md = [
      `# ⚖️ CostGuard Plan Comparison: ${titleA} vs ${titleB}`,
      ``,
      `### Summary Overview`,
      `| Metric | Plan A (${titleA}) | Plan B (${titleB}) | Variance (B - A) |`,
      `| :--- | ---: | ---: | ---: |`,
      `| **Net Monthly Impact** | \`${formatINRMonthly(netImpactA, { showSign: true })}\` | \`${formatINRMonthly(netImpactB, { showSign: true })}\` | **\`${formatINRMonthly(netDeltaBvsA, { showSign: true })}\`** |`,
      `| **Annualized Spend** | \`${formatINRAnnual(annualizedImpactA, { showSign: true })}\` | \`${formatINRAnnual(annualizedImpactB, { showSign: true })}\` | **\`${formatINRAnnual(annualizedDeltaBvsA, { showSign: true })}\`** |`,
      `| **Projected Monthly** | \`${formatINRMonthly(projectedA)}\` | \`${formatINRMonthly(projectedB)}\` | **\`${formatINRMonthly(projectedDeltaBvsA, { showSign: true })}\`** |`,
      `| **Policy Verdict** | ${analysisA?.policy_verdict.status} (Exit ${analysisA?.policy_verdict.exit_code}) | ${analysisB?.policy_verdict.status} (Exit ${analysisB?.policy_verdict.exit_code}) | ${analysisB?.policy_verdict.is_breached ? 'Plan B Breaches' : 'Plan B Within Budget'} |`,
      ``,
      `### Resource-by-Resource Cost Variance`,
      `| Resource | Plan A SKU / Action | Plan B SKU / Action | Plan A Impact | Plan B Impact | Variance |`,
      `| :--- | :--- | :--- | ---: | ---: | ---: |`,
      ...allMergedResources.map((r) => {
        const descA = r.resA ? `${r.resA.action} (${r.resA.sku})` : '—';
        const descB = r.resB ? `${r.resB.action} (${r.resB.sku})` : '—';
        const impA = r.resA ? formatINRMonthly(r.impactA, { showSign: true }) : '—';
        const impB = r.resB ? formatINRMonthly(r.impactB, { showSign: true }) : '—';
        const varStr = formatINRMonthly(r.variance, { showSign: true });
        return `| \`${r.address.split('.').pop()}\` | ${descA} | ${descB} | ${impA} | ${impB} | **${varStr}** |`;
      }),
      ``,
      `*Generated by CostGuard FinOps Plan Comparison Engine*`,
    ].join('\n');

    navigator.clipboard.writeText(md);
    setCopiedMarkdown(true);
    setTimeout(() => setCopiedMarkdown(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">Plan Cost Comparison</h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono border border-indigo-500/30">
                Side-by-Side FinOps
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Evaluate financial trade-offs between two Terraform execution plans before applying infrastructure changes.
            </p>
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400 font-mono mr-1">Presets:</span>
            <button
              onClick={() => applyPreset('plan_create.json', 'plan_update.json')}
              className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            >
              CREATE vs UPDATE
            </button>
            <button
              onClick={() => applyPreset('plan_update.json', 'plan_replacement.json')}
              className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            >
              UPDATE vs REPLACEMENT
            </button>
            <button
              onClick={() => applyPreset('plan_create.json', 'plan_delete.json')}
              className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            >
              CREATE vs DELETE
            </button>
          </div>
        </div>

        {/* Plan Selectors Bar */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-11 gap-3 items-center">
          {/* Plan A Selector */}
          <div className="md:col-span-5 p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider font-mono">
                Baseline — Plan A
              </span>
              {analysisA && (
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                    analysisA.policy_verdict.is_breached
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {analysisA.policy_verdict.status} (Exit {analysisA.policy_verdict.exit_code})
                </span>
              )}
            </div>
            <select
              value={planAFile}
              onChange={(e) => setPlanAFile(e.target.value)}
              disabled={isLoadingA}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {samplePlans.map((p) => (
                <option key={p.filename} value={p.filename}>
                  {p.title} — {p.description}
                </option>
              ))}
            </select>
          </div>

          {/* Swap Button */}
          <div className="md:col-span-1 flex justify-center">
            <button
              onClick={handleSwapPlans}
              title="Swap Plan A and Plan B"
              className="p-2 rounded-full bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white transition shadow border border-slate-700 active:scale-95"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Plan B Selector */}
          <div className="md:col-span-5 p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider font-mono">
                Proposed — Plan B
              </span>
              {analysisB && (
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                    analysisB.policy_verdict.is_breached
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {analysisB.policy_verdict.status} (Exit {analysisB.policy_verdict.exit_code})
                </span>
              )}
            </div>
            <select
              value={planBFile}
              onChange={(e) => setPlanBFile(e.target.value)}
              disabled={isLoadingB}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {samplePlans.map((p) => (
                <option key={p.filename} value={p.filename}>
                  {p.title} — {p.description}
                </option>
              ))}
            </select>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-3 p-2.5 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-300">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Primary Financial Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Plan A Metrics */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-indigo-400">PLAN A (BASELINE)</span>
            <span className="text-[11px] text-slate-400 font-mono truncate max-w-[140px]">
              {samplePlans.find((p) => p.filename === planAFile)?.title || planAFile}
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white font-mono">
              {isLoadingA ? '...' : formatINRMonthly(netImpactA, { showSign: true })}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Net Monthly Impact</p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 gap-2 text-xs font-mono">
            <div>
              <span className="text-slate-400 text-[10px] block">Projected Total:</span>
              <span className="text-slate-200 font-bold">{formatINRMonthly(projectedA)}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">Annualized:</span>
              <span className="text-slate-200 font-bold">{formatINRAnnual(annualizedImpactA, { showSign: true })}</span>
            </div>
          </div>
        </div>

        {/* Plan B Metrics */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-emerald-400">PLAN B (PROPOSED)</span>
            <span className="text-[11px] text-slate-400 font-mono truncate max-w-[140px]">
              {samplePlans.find((p) => p.filename === planBFile)?.title || planBFile}
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white font-mono">
              {isLoadingB ? '...' : formatINRMonthly(netImpactB, { showSign: true })}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Net Monthly Impact</p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 gap-2 text-xs font-mono">
            <div>
              <span className="text-slate-400 text-[10px] block">Projected Total:</span>
              <span className="text-slate-200 font-bold">{formatINRMonthly(projectedB)}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">Annualized:</span>
              <span className="text-slate-200 font-bold">{formatINRAnnual(annualizedImpactB, { showSign: true })}</span>
            </div>
          </div>
        </div>

        {/* Delta Card (Plan B vs Plan A) */}
        <div
          className={`rounded-xl border p-4 shadow-md transition ${
            isSaving
              ? 'border-emerald-500/40 bg-emerald-950/20'
              : isNeutral
              ? 'border-slate-800 bg-slate-900/60'
              : 'border-rose-500/40 bg-rose-950/20'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-slate-300">VARIANCE (B vs A)</span>
            <div className="flex items-center gap-1 text-[11px] font-mono font-bold">
              {isSaving ? (
                <span className="text-emerald-400 flex items-center gap-0.5">
                  <TrendingDown className="w-3.5 h-3.5" /> SAVINGS
                </span>
              ) : isNeutral ? (
                <span className="text-slate-400 flex items-center gap-0.5">
                  <Equal className="w-3.5 h-3.5" /> NEUTRAL
                </span>
              ) : (
                <span className="text-rose-400 flex items-center gap-0.5">
                  <TrendingUp className="w-3.5 h-3.5" /> HIGHER COST
                </span>
              )}
            </div>
          </div>
          <div className="mt-3">
            <div
              className={`text-2xl font-bold font-mono ${
                isSaving ? 'text-emerald-400' : isNeutral ? 'text-slate-300' : 'text-rose-400'
              }`}
            >
              {formatINRMonthly(netDeltaBvsA, { showSign: true })}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isSaving
                ? `Plan B saves ${formatINR(Math.abs(netDeltaBvsA))} every month`
                : isNeutral
                ? 'Both plans result in identical cost impact'
                : `Plan B adds ${formatINR(netDeltaBvsA)} more spend per month`}
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs font-mono">
            <div>
              <span className="text-slate-400 text-[10px] block">Annualized Shift:</span>
              <span
                className={`font-bold ${
                  isSaving ? 'text-emerald-400' : isNeutral ? 'text-slate-300' : 'text-rose-400'
                }`}
              >
                {formatINRAnnual(annualizedDeltaBvsA, { showSign: true })}
              </span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">Relative Shift:</span>
              <span
                className={`font-bold ${
                  isSaving ? 'text-emerald-400' : isNeutral ? 'text-slate-300' : 'text-rose-400'
                }`}
              >
                {relativePercent > 0 ? `+${relativePercent.toFixed(1)}%` : `${relativePercent.toFixed(1)}%`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Decision / FinOps Verdict Banner */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-lg ${
                isSaving
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : isNeutral
                  ? 'bg-slate-800 text-slate-300'
                  : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">FinOps Deployment Recommendation</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isSaving
                  ? `Plan B provides financial efficiency, reducing ongoing run-rate by ${formatINR(
                      Math.abs(netDeltaBvsA)
                    )}/month (${formatINR(Math.abs(annualizedDeltaBvsA))}/year).`
                  : isNeutral
                  ? 'Both plans have the exact same net cost impact. Evaluate based on technical requirements.'
                  : `Plan B increases monthly infrastructure spend by ${formatINR(
                      netDeltaBvsA
                    )}/month. Verify if extra capacity is needed before applying.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={exportMarkdown}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-medium border border-slate-700 transition"
            >
              {copiedMarkdown ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied Markdown!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Report</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Resource Variance Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-lg">
        {/* Table Controls */}
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-white">Resource Cost Comparison Matrix</h3>
            <span className="text-xs text-slate-400 font-mono">
              ({filteredResources.length} of {allMergedResources.length} resources)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Filter Toggle */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded transition ${
                  filterMode === 'all' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterMode('variance')}
                className={`px-2.5 py-1 rounded transition ${
                  filterMode === 'variance'
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Cost Variance Only
              </button>
              <button
                onClick={() => setFilterMode('unique')}
                className={`px-2.5 py-1 rounded transition ${
                  filterMode === 'unique'
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Plan-Unique
              </button>
            </div>

            {/* Quick Search */}
            <input
              type="text"
              placeholder="Search resource or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44 font-mono"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                <th className="py-2.5 px-4 font-semibold">Resource</th>
                <th className="py-2.5 px-3 font-semibold">Plan A (Baseline)</th>
                <th className="py-2.5 px-3 font-semibold">Plan B (Proposed)</th>
                <th className="py-2.5 px-3 font-semibold text-right">Plan A Impact</th>
                <th className="py-2.5 px-3 font-semibold text-right">Plan B Impact</th>
                <th className="py-2.5 px-4 font-semibold text-right">Variance (B - A)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredResources.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No resources matching filter criteria.
                  </td>
                </tr>
              ) : (
                filteredResources.map((item) => {
                  const shortName = item.address.split('.').pop() || item.address;
                  const isCostDiff = Math.abs(item.variance) > 0.01;
                  const isVarSaving = item.variance < 0;

                  return (
                    <tr
                      key={item.address}
                      className="hover:bg-slate-800/40 transition group"
                    >
                      {/* Resource Name & Type */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-200">{shortName}</div>
                        <div className="text-[10px] text-slate-500 font-sans truncate max-w-[220px]">
                          {item.resourceType}
                        </div>
                      </td>

                      {/* Plan A Info */}
                      <td className="py-3 px-3">
                        {item.resA ? (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                  item.resA.action === 'CREATE'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : item.resA.action === 'DELETE'
                                    ? 'bg-rose-500/10 text-rose-400'
                                    : item.resA.action === 'UPDATE'
                                    ? 'bg-amber-500/10 text-amber-400'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {item.resA.action}
                              </span>
                              <span className="text-slate-300 font-medium">{item.resA.sku}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-sans block mt-0.5">
                              {item.resA.region}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-600 text-xs italic">— Not in Plan A —</span>
                        )}
                      </td>

                      {/* Plan B Info */}
                      <td className="py-3 px-3">
                        {item.resB ? (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                  item.resB.action === 'CREATE'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : item.resB.action === 'DELETE'
                                    ? 'bg-rose-500/10 text-rose-400'
                                    : item.resB.action === 'UPDATE'
                                    ? 'bg-amber-500/10 text-amber-400'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {item.resB.action}
                              </span>
                              <span className="text-slate-300 font-medium">{item.resB.sku}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-sans block mt-0.5">
                              {item.resB.region}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-600 text-xs italic">— Not in Plan B —</span>
                        )}
                      </td>

                      {/* Plan A Cost Impact */}
                      <td className="py-3 px-3 text-right">
                        {item.resA ? (
                          <span className="text-slate-300">
                            {formatINR(item.impactA, { showSign: true })}/mo
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Plan B Cost Impact */}
                      <td className="py-3 px-3 text-right">
                        {item.resB ? (
                          <span className="text-slate-300">
                            {formatINR(item.impactB, { showSign: true })}/mo
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Variance */}
                      <td className="py-3 px-4 text-right">
                        {!isCostDiff ? (
                          <span className="text-slate-500 font-medium">₹0 (Equal)</span>
                        ) : (
                          <span
                            className={`font-bold px-2 py-0.5 rounded ${
                              isVarSaving
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {formatINR(item.variance, { showSign: true })}/mo
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
