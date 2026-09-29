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
} from 'lucide-react';
import { AnalysisResponse, CacheStatsResponse } from '../types';
import { formatINR, formatINRMonthly } from '../utils/currency';
import { api } from '../services/api';

interface SettingsTabProps {
  maxIncrease: number;
  onChangeMaxIncrease: (value: number) => void;
  analysis: AnalysisResponse | null;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  maxIncrease,
  onChangeMaxIncrease,
  analysis,
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

  const commands = [
    {
      title: 'Analyze Terraform Plan file:',
      cmd: 'costguard --plan plan.json --max-increase 4000',
    },
    {
      title: 'Pipe directly from Terraform output:',
      cmd: 'terraform show -json tfplan.binary | costguard --max-increase 4000',
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
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Budget Guardrail Configuration */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-2 mb-2">
          <Sliders className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Budget Guardrail Threshold</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          CostGuard blocks deployment (exit code 1) if the net monthly cost increase exceeds this limit.
        </p>

        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-xs font-mono mb-2">
              <span className="text-slate-400">Monthly Budget Threshold:</span>
              <span className="text-indigo-400 font-bold text-sm">{formatINRMonthly(maxIncrease, { fullUnit: true })}</span>
            </div>
            <input
              type="range"
              min="0"
              max="20000"
              step="500"
              value={maxIncrease}
              onChange={(e) => onChangeMaxIncrease(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1.5 font-mono text-xs">
            <span className="text-slate-400">₹</span>
            <input
              type="number"
              min="0"
              step="500"
              value={maxIncrease}
              onChange={(e) => onChangeMaxIncrease(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-24 bg-slate-900 border border-slate-700 text-slate-200 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:outline-none"
            />
            <span className="text-slate-500">/mo</span>
          </div>
        </div>
      </div>

      {/* SQLite Cache Overview */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
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

      {/* CLI & Pipeline Reference */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
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

      {/* Standardized Exit Codes */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono mb-2">
          Pipeline Exit Codes
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-xs">
          <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
            <span className="text-emerald-400 font-bold block">Exit Code 0 (PASS)</span>
            <span className="text-slate-400 text-[11px] block mt-0.5 font-sans">
              Within budget. Deployment continues.
            </span>
          </div>
          <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
            <span className="text-red-400 font-bold block">Exit Code 1 (BLOCKED)</span>
            <span className="text-slate-400 text-[11px] block mt-0.5 font-sans">
              Budget exceeded. Circuit breaker stops deployment.
            </span>
          </div>
          <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
            <span className="text-amber-400 font-bold block">Exit Code 2 (ERROR)</span>
            <span className="text-slate-400 text-[11px] block mt-0.5 font-sans">
              Invalid plan JSON or syntax error.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
