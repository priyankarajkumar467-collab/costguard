import React from 'react';
import { Shield, RefreshCw, Zap, Database } from 'lucide-react';
import { SamplePlanItem } from '../types';

interface HeaderProps {
  plans: SamplePlanItem[];
  currentPlanFilename: string;
  onSelectPlan: (filename: string) => void;
  maxIncrease: number;
  onChangeMaxIncrease: (value: number) => void;
  onRunQuickDemo: () => void;
  isAnalyzing: boolean;
  cacheHits: number;
  apiCalls: number;
}

export const Header: React.FC<HeaderProps> = ({
  plans,
  currentPlanFilename,
  onSelectPlan,
  maxIncrease,
  onChangeMaxIncrease,
  onRunQuickDemo,
  isAnalyzing,
  cacheHits,
  apiCalls,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/95 sticky top-0 z-40 px-4 lg:px-8 py-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-white font-mono">COSTGUARD</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono font-medium">
                ₹ INR
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Predict infrastructure cost before you deploy.
            </p>
          </div>
        </div>

        {/* Minimal Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Simple Cache Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-400 font-mono">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span>Cache: <strong className="text-slate-200">{cacheHits} hits</strong> · <strong className="text-slate-200">{apiCalls} API lookups</strong></span>
          </div>

          {/* Quick Plan Selector */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-400 font-medium">Plan:</label>
            <select
              value={currentPlanFilename}
              onChange={(e) => onSelectPlan(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {plans.map((p) => (
                <option key={p.filename} value={p.filename}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          {/* Budget Quick Input (₹) */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono">
            <span className="text-slate-400">Budget:</span>
            <span className="text-indigo-400 font-bold">₹</span>
            <input
              type="number"
              min="0"
              step="500"
              value={maxIncrease}
              onChange={(e) => onChangeMaxIncrease(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-20 bg-transparent text-slate-200 font-bold focus:outline-none"
            />
            <span className="text-slate-500">/mo</span>
          </div>

          {/* Analyze Plan Button */}
          <button
            onClick={onRunQuickDemo}
            disabled={isAnalyzing}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow transition active:scale-95 disabled:opacity-50"
          >
            {isAnalyzing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-amber-300" />
            )}
            <span>Analyze Plan</span>
          </button>
        </div>
      </div>
    </header>
  );
};
