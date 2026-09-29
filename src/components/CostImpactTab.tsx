import React, { useState, useEffect } from 'react';
import { Search, Sliders, RefreshCw, AlertCircle, ArrowRightLeft } from 'lucide-react';
import { AnalysisResponse, SimulationResult } from '../types';
import { formatINR, formatINRMonthly, formatINRAnnual } from '../utils/currency';
import { api } from '../services/api';

interface CostImpactTabProps {
  analysis: AnalysisResponse | null;
}

const COMMON_AZURE_SKUS = [
  'Standard_B1s',
  'Standard_B2s',
  'Standard_B4ms',
  'Standard_D2s_v3',
  'Standard_D4s_v3',
  'Standard_D8s_v3',
  'Standard_E2s_v3',
  'Standard_F2s_v2',
];

export const CostImpactTab: React.FC<CostImpactTabProps> = ({ analysis }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentSku, setCurrentSku] = useState('Standard_D4s_v3');
  const [alternativeSku, setAlternativeSku] = useState('Standard_D2s_v3');
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Run initial simulation
  useEffect(() => {
    async function sim() {
      setIsSimulating(true);
      try {
        const res = await api.simulate(currentSku, alternativeSku, 'eastus', 'INR');
        setSimResult(res);
      } catch {
        // ignore
      } finally {
        setIsSimulating(false);
      }
    }
    sim();
  }, [currentSku, alternativeSku]);

  if (!analysis) {
    return (
      <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-400">
        Run an analysis to inspect cost impact.
      </div>
    );
  }

  const { resource_details } = analysis;

  const filtered = resource_details.filter((r) => {
    const s = searchTerm.toLowerCase();
    return (
      r.address.toLowerCase().includes(s) ||
      r.sku.toLowerCase().includes(s) ||
      r.region.toLowerCase().includes(s) ||
      r.action.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Search Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-white">Cost Impact Table</h2>
          <p className="text-xs text-slate-400">
            {filtered.length} resources analyzed &bull; 730 hours/month calculation
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Filter resource, SKU, region..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Main Single Clean Table */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-mono border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Resource</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">SKU</th>
                <th className="py-2.5 px-3">Region</th>
                <th className="py-2.5 px-3 text-right">Current</th>
                <th className="py-2.5 px-3 text-right">Projected</th>
                <th className="py-2.5 px-3 text-right">Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filtered.map((r, i) => {
                const isSkipped = r.status === 'SKIPPED';
                const shortName = r.address.split('.').pop() || r.address;
                return (
                  <tr key={i} className="hover:bg-slate-800/30 transition">
                    <td className="py-2.5 px-3 font-medium text-slate-200 truncate max-w-xs font-sans">
                      {shortName}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.action === 'CREATE'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : r.action === 'DELETE'
                            ? 'bg-red-500/10 text-red-400'
                            : r.action === 'UPDATE'
                            ? 'bg-amber-500/10 text-amber-400'
                            : r.action === 'REPLACEMENT'
                            ? 'bg-purple-500/10 text-purple-400'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {r.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-semibold">{r.sku}</td>
                    <td className="py-2.5 px-3 text-slate-400">{r.region}</td>
                    <td className="py-2.5 px-3 text-right text-slate-400">
                      {isSkipped ? '—' : formatINR(r.old_monthly_cost)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-200">
                      {isSkipped ? '—' : formatINR(r.new_monthly_cost)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold ${
                        isSkipped
                          ? 'text-slate-500'
                          : r.delta_monthly_cost > 0
                          ? 'text-amber-400'
                          : r.delta_monthly_cost < 0
                          ? 'text-emerald-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {isSkipped
                        ? 'SKIPPED'
                        : formatINR(r.delta_monthly_cost, { showSign: true })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* What-If Pricing Comparison Section */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-2 mb-3">
          <ArrowRightLeft className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-white">What-If Pricing Comparison</h3>
        </div>

        <p className="text-xs text-slate-400 mb-4">
          Compare Azure retail prices between current and alternative instance sizes.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-slate-400 font-mono block mb-1">Current SKU:</label>
            <select
              value={currentSku}
              onChange={(e) => setCurrentSku(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs font-mono rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {COMMON_AZURE_SKUS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 font-mono block mb-1">Alternative SKU:</label>
            <select
              value={alternativeSku}
              onChange={(e) => setAlternativeSku(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs font-mono rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {COMMON_AZURE_SKUS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Comparison Result Box */}
        {isSimulating ? (
          <div className="p-6 text-center text-xs text-slate-500">
            <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-indigo-400" />
            Comparing prices...
          </div>
        ) : simResult ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs">
            <div>
              <span className="text-slate-500 text-[10px] uppercase block">Current</span>
              <span className="text-sm font-bold text-white block mt-0.5">
                {formatINRMonthly(simResult.current_monthly)}
              </span>
            </div>

            <div>
              <span className="text-slate-500 text-[10px] uppercase block">Alternative</span>
              <span className="text-sm font-bold text-indigo-400 block mt-0.5">
                {formatINRMonthly(simResult.alternative_monthly)}
              </span>
            </div>

            <div>
              <span className="text-slate-500 text-[10px] uppercase block">Difference</span>
              <span
                className={`text-sm font-bold block mt-0.5 ${
                  simResult.is_saving ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {formatINRMonthly(simResult.monthly_difference, { showSign: true })}
              </span>
            </div>

            <div>
              <span className="text-slate-500 text-[10px] uppercase block">Annual Difference</span>
              <span
                className={`text-sm font-bold block mt-0.5 ${
                  simResult.is_saving ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {formatINRAnnual(simResult.annualized_difference, { showSign: true })}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
