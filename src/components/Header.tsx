import React from 'react';
import { Shield, RefreshCw, Zap, Database, ChevronDown } from 'lucide-react';
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
    <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 lg:px-8 py-3 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-7xl mx-auto w-full">
        {/* Brand Zone */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-white/10 shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold tracking-tight text-white font-sans">
                COSTGUARD
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700">
                INR (₹)
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Predict infrastructure cost before you deploy
            </p>
          </div>
        </div>

        {/* Minimal Actions & Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Cache Status Badge */}
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400 font-mono">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>
              Cache: <strong className="text-slate-200">{cacheHits}</strong> hits &bull; <strong className="text-slate-200">{apiCalls}</strong> lookups
            </span>
          </div>

          {/* Quick Plan Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs">
            <span className="text-slate-400 font-medium">Plan:</span>
            <select
              value={currentPlanFilename}
              onChange={(e) => onSelectPlan(e.target.value)}
              className="bg-transparent text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer"
            >
              {plans.map((p) => (
                <option key={p.filename} value={p.filename} className="bg-slate-900 text-slate-200">
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          {/* Budget Quick Input */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono">
            <span className="text-slate-400">Limit:</span>
            <span className="text-indigo-400 font-bold">₹</span>
            <input
              type="number"
              min="0"
              step="500"
              value={maxIncrease}
              onChange={(e) => onChangeMaxIncrease(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-16 bg-transparent text-slate-200 font-bold focus:outline-none text-right"
            />
            <span className="text-slate-500">/mo</span>
          </div>

          {/* Analyze Plan CTA Button */}
          <button
            onClick={onRunQuickDemo}
            disabled={isAnalyzing}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition active:scale-95 disabled:opacity-50 cursor-pointer"
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
