import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Info,
  Scale,
  ArrowRight,
} from 'lucide-react';
import { AnalysisResponse, TabType } from '../types';
import { formatINR } from '../utils/currency';

interface OverviewTabProps {
  analysis: AnalysisResponse | null;
  onNavigateTab: (tab: TabType) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  analysis,
  onNavigateTab,
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
          className="mt-4 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition"
        >
          Open Plan Analysis
        </button>
      </div>
    );
  }

  const { financial_summary, policy_verdict } = analysis;
  const isBreached = policy_verdict.is_breached;
  const netDelta = financial_summary.net_monthly_impact;

  return (
    <div className="max-w-5xl mx-auto py-2">
      {/* Strictly Four Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* 1. Current Cost */}
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg shadow-black/20 flex flex-col justify-between transition hover:border-slate-700">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Current Cost
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                Baseline
              </span>
            </div>
            <div className="mt-4 mb-2">
              <div className="text-3xl lg:text-4xl font-extrabold font-mono text-white tracking-tight">
                {formatINR(financial_summary.prior_monthly_total, { unit: '/mo' })}
              </div>
            </div>
          </div>
          <div className="pt-3 border-t border-slate-800/80 mt-4">
            <span className="text-xs text-slate-500 block">
              Existing infrastructure run-rate
            </span>
          </div>
        </div>

        {/* 2. Projected Cost */}
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg shadow-black/20 flex flex-col justify-between transition hover:border-slate-700">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Projected Cost
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                Post-Apply
              </span>
            </div>
            <div className="mt-4 mb-2">
              <div className="text-3xl lg:text-4xl font-extrabold font-mono text-white tracking-tight">
                {formatINR(financial_summary.projected_monthly_total, { unit: '/mo' })}
              </div>
            </div>
          </div>
          <div className="pt-3 border-t border-slate-800/80 mt-4">
            <span className="text-xs text-slate-500 block">
              730 hours / month run-rate
            </span>
          </div>
        </div>

        {/* 3. Monthly Impact */}
        <div
          className={`p-6 rounded-2xl border shadow-lg shadow-black/20 flex flex-col justify-between transition ${
            netDelta > 0
              ? 'bg-slate-900/90 border-amber-500/30 hover:border-amber-500/50'
              : netDelta < 0
              ? 'bg-slate-900/90 border-emerald-500/30 hover:border-emerald-500/50'
              : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
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
            <div className="mt-4 mb-2">
              <div
                className={`text-3xl lg:text-4xl font-extrabold font-mono tracking-tight ${
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
          <div className="pt-3 border-t border-slate-800/80 mt-4 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-500">Annualized:</span>
            <span className={netDelta > 0 ? 'text-amber-400/90 font-bold' : netDelta < 0 ? 'text-emerald-400/90 font-bold' : 'text-slate-400'}>
              {formatINR(financial_summary.annualized_impact, { showSign: true, unit: '/yr' })}
            </span>
          </div>
        </div>

        {/* 4. Budget Status */}
        <div
          className={`p-6 rounded-2xl border shadow-lg shadow-black/20 flex flex-col justify-between transition ${
            isBreached
              ? 'bg-red-950/30 border-red-500/40 hover:border-red-500/60'
              : 'bg-emerald-950/30 border-emerald-500/40 hover:border-emerald-500/60'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Budget Status
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase ${
                  isBreached ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'
                }`}
              >
                Exit {policy_verdict.exit_code}
              </span>
            </div>
            <div className="mt-4 mb-2 flex items-center gap-3">
              {isBreached ? (
                <XCircle className="w-8 h-8 text-red-400 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="w-8 h-8 text-emerald-400 flex-shrink-0" />
              )}
              <span
                className={`text-2xl lg:text-3xl font-black font-mono tracking-wide uppercase ${
                  isBreached ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {isBreached ? 'BLOCKED' : 'PASS'}
              </span>
            </div>
          </div>
          <div className="pt-3 border-t border-slate-800/80 mt-4 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">
              {isBreached ? 'Over limit:' : 'Headroom:'}
            </span>
            <span className={isBreached ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
              {formatINR(policy_verdict.amount_difference, { unit: '/mo' })}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Compare Action Banner */}
      <div className="mt-5 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg shadow-black/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Compare Alternative Execution Plans</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Evaluate side-by-side cost variance and policy compliance across different architecture plans.
            </p>
          </div>
        </div>
        <button
          onClick={() => onNavigateTab('compare')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition active:scale-95 whitespace-nowrap self-end sm:self-center"
        >
          <span>Open Plan Compare</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
