import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  ArrowRightLeft,
  Building2,
  Tag,
  Tags,
  Filter,
  Info,
  X,
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  BarChart3,
  Layers,
  FileDown,
  FileSpreadsheet,
  Download,
  ChevronDown,
  Check,
  TrendingUp,
  Calendar,
  DollarSign,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
  ReferenceLine,
} from 'recharts';
import { AnalysisResponse, SimulationResult, ResourceCostDetail } from '../types';
import { formatINR, formatINRMonthly, formatINRAnnual } from '../utils/currency';
import { api } from '../services/api';
import { exportCostAnalysisToCSV, exportCostAnalysisToPDF } from '../utils/exportReport';

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

export interface CostCenterBadgeInfo {
  id: string;
  name: string;
  category: 'Cost Center' | 'Department' | 'Team' | 'Application' | 'Untagged';
  isUntagged: boolean;
  style: {
    bg: string;
    text: string;
    border: string;
    dot: string;
    activeRing: string;
  };
}

export type EnrichedResourceCostDetail = ResourceCostDetail & {
  costCenter: CostCenterBadgeInfo;
};

// Curated high-contrast, accessible WCAG AA palette for departments
const PALETTES = [
  {
    bg: 'bg-sky-500/10',
    text: 'text-sky-400',
    border: 'border-sky-500/30',
    dot: 'bg-sky-400',
    activeRing: 'ring-sky-500/50',
  },
  {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-400',
    border: 'border-indigo-500/30',
    dot: 'bg-indigo-400',
    activeRing: 'ring-indigo-500/50',
  },
  {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-400',
    activeRing: 'ring-emerald-500/50',
  },
  {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    dot: 'bg-amber-400',
    activeRing: 'ring-amber-500/50',
  },
  {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    dot: 'bg-purple-400',
    activeRing: 'ring-purple-500/50',
  },
  {
    bg: 'bg-teal-500/10',
    text: 'text-teal-400',
    border: 'border-teal-500/30',
    dot: 'bg-teal-400',
    activeRing: 'ring-teal-500/50',
  },
  {
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    dot: 'bg-rose-400',
    activeRing: 'ring-rose-500/50',
  },
  {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
    dot: 'bg-cyan-400',
    activeRing: 'ring-cyan-500/50',
  },
  {
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    dot: 'bg-orange-400',
    activeRing: 'ring-orange-500/50',
  },
];

const UNTAGGED_STYLE = {
  bg: 'bg-slate-800/80',
  text: 'text-slate-400',
  border: 'border-slate-700/80 border-dashed',
  dot: 'bg-slate-500',
  activeRing: 'ring-slate-500/50',
};

// Helper to format raw Terraform resource types into clean, human-readable labels
export function formatResourceType(type: string): string {
  if (!type) return 'Unknown';
  return type
    .replace(/^azurerm_/, '')
    .replace(/^aws_/, '')
    .replace(/^google_/, '')
    .split('_')
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === 'vm') return 'VM';
      if (lower === 'ip') return 'IP';
      if (lower === 'nsg') return 'NSG';
      if (lower === 'vnet') return 'VNet';
      if (lower === 'rg') return 'RG';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

// Deterministic string hasher for consistent color assignment
function getDeterministicPalette(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PALETTES.length;
  return PALETTES[index];
}

// Extractor for cost centers / departments from resource tags
export function resolveCostCenter(tags?: Record<string, string>): CostCenterBadgeInfo {
  if (!tags || Object.keys(tags).length === 0) {
    return {
      id: 'untagged',
      name: 'Untagged',
      category: 'Untagged',
      isUntagged: true,
      style: UNTAGGED_STYLE,
    };
  }

  const entries = Object.entries(tags);
  const findVal = (keywords: string[]): [string, string] | null => {
    for (const [key, val] of entries) {
      const cleanKey = key.toLowerCase().replace(/[-_\s]/g, '');
      if (keywords.includes(cleanKey) && val && String(val).trim() !== '') {
        return [key, String(val).trim()];
      }
    }
    return null;
  };

  // 1. Explicit Cost Center tags (CostCenter, cost_center, cc, costcode)
  const ccMatch = findVal(['costcenter', 'costcentre', 'cc', 'costcode', 'costid']);
  if (ccMatch) {
    const val = ccMatch[1];
    const name = val.toUpperCase().startsWith('CC') ? val : `CC: ${val}`;
    return {
      id: `cc-${val.toLowerCase()}`,
      name,
      category: 'Cost Center',
      isUntagged: false,
      style: getDeterministicPalette(name),
    };
  }

  // 2. Department / Division tags
  const deptMatch = findVal(['department', 'dept', 'division', 'businessunit', 'bu']);
  if (deptMatch) {
    const name = deptMatch[1];
    return {
      id: `dept-${name.toLowerCase()}`,
      name,
      category: 'Department',
      isUntagged: false,
      style: getDeterministicPalette(name),
    };
  }

  // 3. Team / Squad tags
  const teamMatch = findVal(['team', 'squad', 'group', 'crew']);
  if (teamMatch) {
    const name = teamMatch[1];
    return {
      id: `team-${name.toLowerCase()}`,
      name,
      category: 'Team',
      isUntagged: false,
      style: getDeterministicPalette(name),
    };
  }

  // 4. Application / Service tags
  const appMatch = findVal(['application', 'app', 'service', 'project', 'workload']);
  if (appMatch) {
    const name = appMatch[1];
    return {
      id: `app-${name.toLowerCase()}`,
      name: `App: ${name}`,
      category: 'Application',
      isUntagged: false,
      style: getDeterministicPalette(name),
    };
  }

  // 5. Fallback if tags exist but none of the above match
  const firstKey = entries[0][0];
  const firstVal = entries[0][1];
  const fallbackName = `${firstKey}: ${firstVal}`;
  return {
    id: `tag-${firstKey.toLowerCase()}-${String(firstVal).toLowerCase()}`,
    name: fallbackName,
    category: 'Department',
    isUntagged: false,
    style: getDeterministicPalette(fallbackName),
  };
}

export type TableSortKey = 'impact' | 'projectedCost' | 'currentCost' | 'name' | 'sku';
export type TableSortDirection = 'asc' | 'desc';

export const CostImpactTab: React.FC<CostImpactTabProps> = ({ analysis }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCostCenterId, setSelectedCostCenterId] = useState<string | null>(null);
  const [selectedResourceType, setSelectedResourceType] = useState<string | null>(null);
  const [chartMetric, setChartMetric] = useState<'comparison' | 'delta'>('comparison');
  const [activeTagModalResource, setActiveTagModalResource] = useState<EnrichedResourceCostDetail | null>(null);

  // Sorting state for table
  const [sortKey, setSortKey] = useState<TableSortKey>('impact');
  const [sortDirection, setSortDirection] = useState<TableSortDirection>('desc');

  // Line Chart 6-Month Trend States
  const [trendScenario, setTrendScenario] = useState<'flat' | 'moderate' | 'aggressive'>('moderate');
  const [trendMetricMode, setTrendMetricMode] = useState<'monthly' | 'cumulative'>('monthly');

  // Export State
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [exportFilterOnly, setExportFilterOnly] = useState(false);
  const [isExporting, setIsExporting] = useState<'pdf' | 'csv' | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

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

  // Enrich each resource with resolved Cost Center / Department badge data
  const enrichedResources = useMemo(() => {
    return resource_details.map((res) => {
      const cc = resolveCostCenter(res.tags);
      return {
        ...res,
        costCenter: cc,
      };
    });
  }, [resource_details]);

  // Aggregate cost metrics across resource types for Recharts
  const resourceTypeData = useMemo(() => {
    const map = new Map<
      string,
      {
        resourceType: string;
        label: string;
        resourceCount: number;
        currentMonthly: number;
        projectedMonthly: number;
        netDelta: number;
      }
    >();

    for (const r of enrichedResources) {
      const rawType = r.resource_type || 'Unknown';
      const label = formatResourceType(rawType);
      const existing = map.get(rawType) || {
        resourceType: rawType,
        label,
        resourceCount: 0,
        currentMonthly: 0,
        projectedMonthly: 0,
        netDelta: 0,
      };

      existing.resourceCount += 1;
      existing.currentMonthly += r.old_monthly_cost;
      existing.projectedMonthly += r.new_monthly_cost;
      existing.netDelta += r.delta_monthly_cost;

      map.set(rawType, existing);
    }

    return Array.from(map.values()).sort((a, b) => {
      return b.projectedMonthly - a.projectedMonthly || Math.abs(b.netDelta) - Math.abs(a.netDelta);
    });
  }, [enrichedResources]);

  // Compute 6-Month Projected Cost Trend based on resource scaling scenario
  const trendData = useMemo(() => {
    const fin = analysis.financial_summary;
    const verdict = analysis.policy_verdict;
    const prior = fin.prior_monthly_total || 0;
    const projected = fin.projected_monthly_total || 0;
    const budgetCeiling = prior + (verdict.budget_threshold || 0);

    const growthRate = trendScenario === 'flat' ? 0 : trendScenario === 'moderate' ? 0.03 : 0.06;
    const baseGrowthRate = trendScenario === 'flat' ? 0 : trendScenario === 'moderate' ? 0.015 : 0.03;

    const months = [];
    const now = new Date();

    let cumBaseline = 0;
    let cumProjected = 0;

    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthLabel = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
      const fullMonthLabel = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });

      const baselineMonthly = Math.round(prior * Math.pow(1 + baseGrowthRate, i));
      const projectedMonthly = Math.round(projected * Math.pow(1 + growthRate, i));
      const delta = projectedMonthly - baselineMonthly;

      cumBaseline += baselineMonthly;
      cumProjected += projectedMonthly;

      months.push({
        monthIndex: i + 1,
        monthLabel,
        fullMonthLabel,
        baselineMonthly,
        projectedMonthly,
        monthlyDelta: delta,
        budgetThreshold: budgetCeiling,
        cumulativeBaseline: cumBaseline,
        cumulativeProjected: cumProjected,
        cumulativeDelta: cumProjected - cumBaseline,
      });
    }

    return months;
  }, [analysis, trendScenario]);

  // Aggregate departmental / cost center breakdown metrics
  const departmentBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        badge: CostCenterBadgeInfo;
        resourceCount: number;
        priorMonthly: number;
        projectedMonthly: number;
        netImpact: number;
      }
    >();

    for (const r of enrichedResources) {
      const key = r.costCenter.id;
      const existing = map.get(key) || {
        badge: r.costCenter,
        resourceCount: 0,
        priorMonthly: 0,
        projectedMonthly: 0,
        netImpact: 0,
      };

      existing.resourceCount += 1;
      existing.priorMonthly += r.old_monthly_cost;
      existing.projectedMonthly += r.new_monthly_cost;
      existing.netImpact += r.delta_monthly_cost;

      map.set(key, existing);
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.badge.isUntagged) return 1;
      if (b.badge.isUntagged) return -1;
      return Math.abs(b.netImpact) - Math.abs(a.netImpact);
    });
  }, [enrichedResources]);

  // Filter resources based on search term, selected cost center, and selected resource type
  const filtered = useMemo(() => {
    return enrichedResources.filter((r) => {
      // 1. Department / Cost Center filter
      if (selectedCostCenterId && r.costCenter.id !== selectedCostCenterId) {
        return false;
      }

      // 2. Resource Type bar chart filter
      if (selectedResourceType && r.resource_type !== selectedResourceType) {
        return false;
      }

      // 3. Search query filter
      if (!searchTerm) return true;
      const s = searchTerm.toLowerCase();

      // Check resource attributes
      if (
        r.address.toLowerCase().includes(s) ||
        r.sku.toLowerCase().includes(s) ||
        r.region.toLowerCase().includes(s) ||
        r.action.toLowerCase().includes(s) ||
        r.resource_type.toLowerCase().includes(s) ||
        r.costCenter.name.toLowerCase().includes(s) ||
        r.costCenter.category.toLowerCase().includes(s)
      ) {
        return true;
      }

      // Check all raw tags
      if (r.tags) {
        for (const [k, v] of Object.entries(r.tags)) {
          if (k.toLowerCase().includes(s) || String(v).toLowerCase().includes(s)) {
            return true;
          }
        }
      }

      return false;
    });
  }, [enrichedResources, selectedCostCenterId, selectedResourceType, searchTerm]);

  // Sort filtered resources by user-selected criteria
  const sortedAndFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortKey) {
        case 'name': {
          const nameA = (a.address.split('.').pop() || a.address).toLowerCase();
          const nameB = (b.address.split('.').pop() || b.address).toLowerCase();
          comparison = nameA.localeCompare(nameB);
          break;
        }
        case 'currentCost': {
          comparison = a.old_monthly_cost - b.old_monthly_cost;
          break;
        }
        case 'projectedCost': {
          comparison = a.new_monthly_cost - b.new_monthly_cost;
          break;
        }
        case 'impact': {
          comparison = a.delta_monthly_cost - b.delta_monthly_cost;
          break;
        }
        case 'sku': {
          comparison = (a.sku || '').localeCompare(b.sku || '');
          break;
        }
        default:
          comparison = 0;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filtered, sortKey, sortDirection]);

  const hasActiveFilters = Boolean(selectedCostCenterId || selectedResourceType || searchTerm);

  // Column header sort click handler
  const handleSort = (key: TableSortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'name' || key === 'sku' ? 'asc' : 'desc');
    }
  };

  // Export handlers (using sorted and filtered resources)
  const handleExportPDF = (useFilter: boolean = exportFilterOnly) => {
    setIsExporting('pdf');
    setShowExportDropdown(false);
    try {
      let filterLabel: string | undefined;
      if (useFilter && hasActiveFilters) {
        const parts: string[] = [];
        if (selectedCostCenterId) {
          const dept = departmentBreakdown.find((d) => d.badge.id === selectedCostCenterId);
          parts.push(`Cost Center: ${dept?.badge.name || selectedCostCenterId}`);
        }
        if (selectedResourceType) {
          parts.push(`Type: ${formatResourceType(selectedResourceType)}`);
        }
        if (searchTerm) {
          parts.push(`Search: "${searchTerm}"`);
        }
        filterLabel = parts.join(' | ');
      }

      exportCostAnalysisToPDF(analysis, {
        customResources: useFilter && hasActiveFilters ? sortedAndFiltered : sortedAndFiltered,
        filterLabel,
      });

      setExportMessage('PDF report downloaded successfully');
      setTimeout(() => setExportMessage(null), 3500);
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportCSV = (useFilter: boolean = exportFilterOnly) => {
    setIsExporting('csv');
    setShowExportDropdown(false);
    try {
      let filterLabel: string | undefined;
      if (useFilter && hasActiveFilters) {
        const parts: string[] = [];
        if (selectedCostCenterId) {
          const dept = departmentBreakdown.find((d) => d.badge.id === selectedCostCenterId);
          parts.push(`Cost Center: ${dept?.badge.name || selectedCostCenterId}`);
        }
        if (selectedResourceType) {
          parts.push(`Type: ${formatResourceType(selectedResourceType)}`);
        }
        if (searchTerm) {
          parts.push(`Search: "${searchTerm}"`);
        }
        filterLabel = parts.join(' | ');
      }

      exportCostAnalysisToCSV(analysis, {
        customResources: useFilter && hasActiveFilters ? sortedAndFiltered : sortedAndFiltered,
        filterLabel,
      });

      setExportMessage('CSV report downloaded successfully');
      setTimeout(() => setExportMessage(null), 3500);
    } catch (err) {
      console.error('Failed to export CSV:', err);
    } finally {
      setIsExporting(null);
    }
  };

  // Custom high-fidelity tooltip for Recharts Bar Chart
  const CustomBarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-950/95 border border-slate-700/80 rounded-xl p-3.5 shadow-2xl text-xs font-mono space-y-1.5 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-1.5">
            <span className="font-sans font-bold text-white text-sm">
              {data.label}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 font-mono">
              {data.resourceCount} {data.resourceCount === 1 ? 'item' : 'items'}
            </span>
          </div>
          <div className="flex justify-between gap-4 text-slate-400 pt-0.5">
            <span>Current Monthly:</span>
            <span className="text-slate-200 font-medium">{formatINR(data.currentMonthly)}/mo</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-400">
            <span>Projected Monthly:</span>
            <span className="text-indigo-400 font-bold">{formatINR(data.projectedMonthly)}/mo</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-400 pt-1 border-t border-slate-800/80">
            <span>Net Impact:</span>
            <span
              className={`font-bold ${
                data.netDelta > 0
                  ? 'text-amber-400'
                  : data.netDelta < 0
                  ? 'text-emerald-400'
                  : 'text-slate-400'
              }`}
            >
              {formatINR(data.netDelta, { showSign: true })}/mo
            </span>
          </div>
          <div className="text-[10px] text-slate-500 italic pt-1 text-center">
            Click bar to filter table
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom high-fidelity tooltip for Recharts Line Chart (6-Month Trend)
  const CustomTrendTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isBreaching = data.budgetThreshold > 0 && data.projectedMonthly > data.budgetThreshold;

      return (
        <div className="bg-slate-950/95 border border-slate-700/80 rounded-xl p-3.5 shadow-2xl text-xs font-mono space-y-1.5 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-1.5">
            <span className="font-sans font-bold text-white text-sm">
              {data.fullMonthLabel}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-semibold font-sans">
              Month {data.monthIndex} of 6
            </span>
          </div>

          {trendMetricMode === 'monthly' ? (
            <>
              <div className="flex justify-between gap-4 text-slate-400 pt-0.5">
                <span>Baseline (Prior):</span>
                <span className="text-slate-300 font-medium">{formatINR(data.baselineMonthly)}/mo</span>
              </div>
              <div className="flex justify-between gap-4 text-slate-400">
                <span>Projected Run-rate:</span>
                <span className="text-indigo-400 font-bold">{formatINR(data.projectedMonthly)}/mo</span>
              </div>
              <div className="flex justify-between gap-4 text-slate-400 pt-1 border-t border-slate-800/80">
                <span>Monthly Delta:</span>
                <span
                  className={`font-bold ${
                    data.monthlyDelta > 0
                      ? 'text-amber-400'
                      : data.monthlyDelta < 0
                      ? 'text-emerald-400'
                      : 'text-slate-400'
                  }`}
                >
                  {formatINR(data.monthlyDelta, { showSign: true })}/mo
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between gap-4 text-slate-400 pt-0.5">
                <span>Cumulative Baseline:</span>
                <span className="text-slate-300 font-medium">{formatINR(data.cumulativeBaseline)}</span>
              </div>
              <div className="flex justify-between gap-4 text-slate-400">
                <span>Cumulative Projected:</span>
                <span className="text-indigo-400 font-bold">{formatINR(data.cumulativeProjected)}</span>
              </div>
              <div className="flex justify-between gap-4 text-slate-400 pt-1 border-t border-slate-800/80">
                <span>Cumulative Variance:</span>
                <span
                  className={`font-bold ${
                    data.cumulativeDelta > 0
                      ? 'text-amber-400'
                      : data.cumulativeDelta < 0
                      ? 'text-emerald-400'
                      : 'text-slate-400'
                  }`}
                >
                  {formatINR(data.cumulativeDelta, { showSign: true })}
                </span>
              </div>
            </>
          )}

          {data.budgetThreshold > 0 && trendMetricMode === 'monthly' && (
            <div className="flex justify-between gap-4 text-[11px] pt-1 border-t border-slate-800/60">
              <span className="text-slate-500">Budget Limit:</span>
              <span className={isBreaching ? 'text-red-400 font-bold' : 'text-slate-400'}>
                {formatINR(data.budgetThreshold)}/mo {isBreaching && '(BREACHED)'}
              </span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const finalMonth = trendData[5] || trendData[0];
  const isBreachedIn6Months = trendData.some((m) => m.budgetThreshold > 0 && m.projectedMonthly > m.budgetThreshold);
  const firstBreachMonth = trendData.find((m) => m.budgetThreshold > 0 && m.projectedMonthly > m.budgetThreshold);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ---------------------------------------------------- */}
      {/* Export Success Notification Toast */}
      {/* ---------------------------------------------------- */}
      {exportMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{exportMessage}</span>
          </div>
          <button
            onClick={() => setExportMessage(null)}
            className="text-emerald-400 hover:text-emerald-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* Visual Departmental & Cost Center Attribution Section */}
      {/* ---------------------------------------------------- */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white tracking-tight">
                Departmental & Cost Center Impact
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Cost changes categorized by resource tags. Click any badge to isolate departmental changes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selectedCostCenterId && (
              <button
                onClick={() => setSelectedCostCenterId(null)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              >
                <X className="w-3.5 h-3.5 text-slate-400" />
                <span>Reset filter</span>
              </button>
            )}

            {/* Quick Export Trigger in Header */}
            <div className="relative">
              <button
                onClick={() => setShowExportDropdown((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-xs transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Report</span>
                <ChevronDown className="w-3 h-3 text-indigo-200" />
              </button>

              {/* Export Dropdown Menu */}
              {showExportDropdown && (
                <div className="absolute right-0 mt-1.5 w-64 rounded-xl bg-slate-950 border border-slate-800 shadow-2xl p-2 z-30 space-y-1.5">
                  <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-800">
                    Export Analysis Report
                  </div>

                  {hasActiveFilters && (
                    <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-900 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={exportFilterOnly}
                        onChange={(e) => setExportFilterOnly(e.target.checked)}
                        className="rounded border-slate-700 text-indigo-500 focus:ring-0"
                      />
                      <span>Only export filtered view ({sortedAndFiltered.length} items)</span>
                    </label>
                  )}

                  <button
                    onClick={() => handleExportPDF()}
                    disabled={isExporting !== null}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-900 text-slate-200 hover:text-white text-xs transition text-left"
                  >
                    <FileDown className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div>
                      <div className="font-medium">Export as PDF (.pdf)</div>
                      <div className="text-[10px] text-slate-500">Executive summary & styled tables</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleExportCSV()}
                    disabled={isExporting !== null}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-900 text-slate-200 hover:text-white text-xs transition text-left"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="font-medium">Export as CSV (.csv)</div>
                      <div className="text-[10px] text-slate-500">Raw data for Excel & Sheets</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Visual Badge Cards for Each Department / Cost Center */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {departmentBreakdown.map((dept) => {
            const isSelected = selectedCostCenterId === dept.badge.id;
            const isPositive = dept.netImpact > 0.01;
            const isNegative = dept.netImpact < -0.01;

            return (
              <button
                key={dept.badge.id}
                onClick={() =>
                  setSelectedCostCenterId((prev) => (prev === dept.badge.id ? null : dept.badge.id))
                }
                className={`relative text-left p-3.5 rounded-xl border transition-all duration-150 flex flex-col justify-between ${
                  isSelected
                    ? `bg-slate-800/90 ${dept.badge.style.border} ring-2 ${dept.badge.style.activeRing} shadow-md`
                    : `bg-slate-950/60 hover:bg-slate-950/90 border-slate-800/90 hover:border-slate-700`
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${dept.badge.style.bg} ${dept.badge.style.text} ${dept.badge.style.border}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${dept.badge.style.dot}`} />
                      {dept.badge.name}
                    </span>

                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                      {dept.badge.category}
                    </span>
                  </div>

                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="text-xs text-slate-400">Monthly delta:</span>
                    <span
                      className={`font-mono text-xs font-bold ${
                        isPositive
                          ? 'text-amber-400'
                          : isNegative
                          ? 'text-emerald-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {formatINR(dept.netImpact, { showSign: true, decimals: 0 })}
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    {dept.resourceCount} {dept.resourceCount === 1 ? 'resource' : 'resources'}
                  </span>
                  <span className="font-mono text-slate-500 text-[10px]">
                    Proj: {formatINR(dept.projectedMonthly, { decimals: 0 })}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Untagged Governance Notice if untagged resources exist */}
        {departmentBreakdown.some((d) => d.badge.isUntagged && d.resourceCount > 0) && (
          <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3 text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>FinOps Tagging Alert:</strong> Some infrastructure resources are missing cost center or department tags.
              </span>
            </div>
            <button
              onClick={() => setSelectedCostCenterId('untagged')}
              className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold text-[11px] transition shrink-0"
            >
              Filter Untagged
            </button>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* 6-Month Projected Cost Trend (Recharts Line Chart)   */}
      {/* ---------------------------------------------------- */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white tracking-tight">
                6-Month Projected Cost Trend & Scaling Forecast
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Trajectory of infrastructure expenses based on post-plan resource run-rate and organic cloud growth.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-[11px]">
              <button
                onClick={() => setTrendMetricMode('monthly')}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  trendMetricMode === 'monthly'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Monthly Run-Rate
              </button>
              <button
                onClick={() => setTrendMetricMode('cumulative')}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  trendMetricMode === 'cumulative'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Cumulative Spend
              </button>
            </div>

            {/* Growth Scenario Selector */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px]">
              <span className="text-slate-400">Scaling:</span>
              <select
                value={trendScenario}
                onChange={(e) => setTrendScenario(e.target.value as any)}
                className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer"
              >
                <option value="flat" className="bg-slate-900 text-slate-200">
                  Flat Run-Rate (0%/mo)
                </option>
                <option value="moderate" className="bg-slate-900 text-slate-200">
                  Organic Growth (+3%/mo)
                </option>
                <option value="aggressive" className="bg-slate-900 text-slate-200">
                  Workload Surge (+6%/mo)
                </option>
              </select>
            </div>
          </div>
        </div>

        {/* Executive KPI summary ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 mb-4 rounded-xl bg-slate-950/70 border border-slate-800/80 font-mono text-xs">
          <div>
            <span className="text-slate-500 text-[10px] uppercase tracking-wider block font-sans">
              Month 6 Run-Rate
            </span>
            <span className="text-sm font-bold text-white block mt-0.5">
              {formatINR(finalMonth.projectedMonthly)}/mo
            </span>
          </div>

          <div>
            <span className="text-slate-500 text-[10px] uppercase tracking-wider block font-sans">
              6-Month Total Spend
            </span>
            <span className="text-sm font-bold text-indigo-400 block mt-0.5">
              {formatINR(finalMonth.cumulativeProjected)}
            </span>
          </div>

          <div>
            <span className="text-slate-500 text-[10px] uppercase tracking-wider block font-sans">
              6-Month Net Delta
            </span>
            <span
              className={`text-sm font-bold block mt-0.5 ${
                finalMonth.cumulativeDelta > 0
                  ? 'text-amber-400'
                  : finalMonth.cumulativeDelta < 0
                  ? 'text-emerald-400'
                  : 'text-slate-400'
              }`}
            >
              {formatINR(finalMonth.cumulativeDelta, { showSign: true })}
            </span>
          </div>

          <div>
            <span className="text-slate-500 text-[10px] uppercase tracking-wider block font-sans">
              Policy Forecast
            </span>
            <span
              className={`text-xs font-bold block mt-1 font-sans ${
                isBreachedIn6Months ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {isBreachedIn6Months
                ? `Breach in ${firstBreachMonth?.monthLabel}`
                : 'Within Budget Limit'}
            </span>
          </div>
        </div>

        {/* Recharts Line Chart */}
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={trendData}
              margin={{ top: 15, right: 25, left: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="monthLabel"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickLine={{ stroke: '#334155' }}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickLine={{ stroke: '#334155' }}
                tickFormatter={(val) => {
                  if (val === 0) return '₹0';
                  if (Math.abs(val) >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
                  if (Math.abs(val) >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
                  return `₹${val}`;
                }}
              />
              <Tooltip content={<CustomTrendTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: '12px', fontSize: '11px', fontFamily: 'monospace' }}
              />

              {trendMetricMode === 'monthly' ? (
                <>
                  <Line
                    type="monotone"
                    dataKey="baselineMonthly"
                    name="Baseline (Prior Run-rate)"
                    stroke="#64748b"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 3.5, fill: '#64748b' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="projectedMonthly"
                    name="Projected Trend (Post-Plan)"
                    stroke="#818cf8"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#1e1b4b' }}
                    activeDot={{ r: 6, fill: '#a5b4fc', stroke: '#312e81', strokeWidth: 2 }}
                  />
                  {finalMonth.budgetThreshold > 0 && (
                    <ReferenceLine
                      y={finalMonth.budgetThreshold}
                      stroke="#ef4444"
                      strokeDasharray="3 3"
                      label={{
                        value: 'Budget Limit',
                        fill: '#f87171',
                        fontSize: 10,
                        position: 'insideTopRight',
                      }}
                    />
                  )}
                </>
              ) : (
                <>
                  <Line
                    type="monotone"
                    dataKey="cumulativeBaseline"
                    name="Cumulative Baseline (₹)"
                    stroke="#64748b"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 3.5, fill: '#64748b' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulativeProjected"
                    name="Cumulative Projected (₹)"
                    stroke="#818cf8"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#1e1b4b' }}
                    activeDot={{ r: 6, fill: '#a5b4fc', stroke: '#312e81', strokeWidth: 2 }}
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* Recharts Bar Chart: Resource Type Cost Distribution */}
      {/* ---------------------------------------------------- */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white tracking-tight">
                Resource Type Cost Distribution
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Cost allocation by resource type. Click any bar to isolate corresponding items.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Toggle metric */}
            <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-[11px]">
              <button
                onClick={() => setChartMetric('comparison')}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  chartMetric === 'comparison'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Current vs Projected
              </button>
              <button
                onClick={() => setChartMetric('delta')}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  chartMetric === 'delta'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Net Impact (Delta)
              </button>
            </div>

            {selectedResourceType && (
              <button
                onClick={() => setSelectedResourceType(null)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition"
              >
                <X className="w-3.5 h-3.5 text-slate-400" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Selected Resource Type Filter Indicator */}
        {selectedResourceType && (
          <div className="mb-3 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-medium">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>
                Chart Filter Active: <strong>{formatResourceType(selectedResourceType)}</strong>
              </span>
            </div>
            <button
              onClick={() => setSelectedResourceType(null)}
              className="text-[11px] text-indigo-400 hover:underline"
            >
              Show all types
            </button>
          </div>
        )}

        {/* Recharts Bar Chart Container */}
        {resourceTypeData.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No resource type cost data available for this plan.
          </div>
        ) : (
          <div className="h-72 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={resourceTypeData}
                margin={{ top: 15, right: 20, left: 10, bottom: 25 }}
                onClick={(e: any) => {
                  if (e && e.activePayload && e.activePayload.length) {
                    const clickedType = e.activePayload[0].payload.resourceType;
                    setSelectedResourceType((prev) => (prev === clickedType ? null : clickedType));
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={{ stroke: '#334155' }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={45}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={{ stroke: '#334155' }}
                  tickFormatter={(val) => {
                    if (val === 0) return '₹0';
                    if (Math.abs(val) >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
                    if (Math.abs(val) >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
                    return `₹${val}`;
                  }}
                />
                <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: '12px', fontSize: '11px', fontFamily: 'monospace' }}
                />

                {chartMetric === 'comparison' ? (
                  <>
                    <Bar
                      dataKey="currentMonthly"
                      name="Current Cost (₹/mo)"
                      fill="#475569"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={38}
                    >
                      {resourceTypeData.map((entry) => (
                        <Cell
                          key={`curr-${entry.resourceType}`}
                          fill={selectedResourceType === entry.resourceType ? '#94a3b8' : '#475569'}
                          opacity={selectedResourceType && selectedResourceType !== entry.resourceType ? 0.35 : 1}
                        />
                      ))}
                    </Bar>
                    <Bar
                      dataKey="projectedMonthly"
                      name="Projected Cost (₹/mo)"
                      fill="#6366f1"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={38}
                    >
                      {resourceTypeData.map((entry) => (
                        <Cell
                          key={`proj-${entry.resourceType}`}
                          fill={selectedResourceType === entry.resourceType ? '#818cf8' : '#6366f1'}
                          opacity={selectedResourceType && selectedResourceType !== entry.resourceType ? 0.35 : 1}
                        />
                      ))}
                    </Bar>
                  </>
                ) : (
                  <Bar
                    dataKey="netDelta"
                    name="Net Monthly Delta (₹/mo)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  >
                    {resourceTypeData.map((entry) => {
                      const isSelected = selectedResourceType === entry.resourceType;
                      let color = '#64748b';
                      if (entry.netDelta > 0) color = isSelected ? '#fbbf24' : '#f59e0b';
                      else if (entry.netDelta < 0) color = isSelected ? '#34d399' : '#10b981';
                      return (
                        <Cell
                          key={`delta-${entry.resourceType}`}
                          fill={color}
                          opacity={selectedResourceType && !isSelected ? 0.35 : 1}
                        />
                      );
                    })}
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* Search Header & Interactive Filters & Sorting & Export Actions */}
      {/* ---------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-white">Cost Impact Table</h2>
            {selectedCostCenterId && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Dept:{' '}
                {departmentBreakdown.find((d) => d.badge.id === selectedCostCenterId)?.badge.name ||
                  selectedCostCenterId}
              </span>
            )}
            {selectedResourceType && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                Type: {formatResourceType(selectedResourceType)}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Showing {sortedAndFiltered.length} of {enrichedResources.length} resources &bull; Sorted by{' '}
            <span className="text-indigo-400 font-mono">
              {sortKey === 'impact'
                ? `Impact (${sortDirection.toUpperCase()})`
                : sortKey === 'projectedCost'
                ? `Projected Cost (${sortDirection.toUpperCase()})`
                : sortKey === 'currentCost'
                ? `Current Cost (${sortDirection.toUpperCase()})`
                : sortKey === 'name'
                ? `Name (${sortDirection.toUpperCase()})`
                : `SKU (${sortDirection.toUpperCase()})`}
            </span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Quick Sort Dropdown */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-400 text-[11px]">Sort:</span>
            <select
              value={`${sortKey}-${sortDirection}`}
              onChange={(e) => {
                const [key, dir] = e.target.value.split('-');
                setSortKey(key as TableSortKey);
                setSortDirection(dir as TableSortDirection);
              }}
              className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer"
            >
              <option value="impact-desc" className="bg-slate-900 text-slate-200">
                Impact: High to Low
              </option>
              <option value="impact-asc" className="bg-slate-900 text-slate-200">
                Impact: Low to High
              </option>
              <option value="projectedCost-desc" className="bg-slate-900 text-slate-200">
                Projected Cost: High to Low
              </option>
              <option value="projectedCost-asc" className="bg-slate-900 text-slate-200">
                Projected Cost: Low to High
              </option>
              <option value="currentCost-desc" className="bg-slate-900 text-slate-200">
                Current Cost: High to Low
              </option>
              <option value="currentCost-asc" className="bg-slate-900 text-slate-200">
                Current Cost: Low to High
              </option>
              <option value="name-asc" className="bg-slate-900 text-slate-200">
                Name: A to Z
              </option>
              <option value="name-desc" className="bg-slate-900 text-slate-200">
                Name: Z to A
              </option>
            </select>
          </div>

          {/* Quick Export Button Bar */}
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-1 gap-1">
            <button
              onClick={() => handleExportPDF(hasActiveFilters)}
              title={hasActiveFilters ? `Export ${sortedAndFiltered.length} filtered items to PDF` : 'Export all items to PDF'}
              disabled={isExporting !== null}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition"
            >
              <FileDown className="w-3.5 h-3.5 text-indigo-400" />
              <span>PDF</span>
            </button>
            <button
              onClick={() => handleExportCSV(hasActiveFilters)}
              title={hasActiveFilters ? `Export ${sortedAndFiltered.length} filtered items to CSV` : 'Export all items to CSV'}
              disabled={isExporting !== null}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>CSV</span>
            </button>
          </div>

          {/* Search Field */}
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search SKU, tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-8 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* Main Single Clean Table with Cost Center Badges & Clickable Column Sort */}
      {/* ---------------------------------------------------- */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-mono border-b border-slate-800 select-none">
              <tr>
                {/* 1. Resource Name Sort */}
                <th className="py-2.5 px-3">
                  <button
                    onClick={() => handleSort('name')}
                    className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase transition cursor-pointer group ${
                      sortKey === 'name' ? 'text-indigo-300 font-bold' : 'hover:text-slate-200'
                    }`}
                  >
                    <span>Resource</span>
                    {sortKey === 'name' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-indigo-400" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-indigo-400" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition" />
                    )}
                  </button>
                </th>

                {/* 2. Cost Center */}
                <th className="py-2.5 px-3">Cost Center / Dept</th>

                {/* 3. Action */}
                <th className="py-2.5 px-3">Action</th>

                {/* 4. SKU Sort */}
                <th className="py-2.5 px-3">
                  <button
                    onClick={() => handleSort('sku')}
                    className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase transition cursor-pointer group ${
                      sortKey === 'sku' ? 'text-indigo-300 font-bold' : 'hover:text-slate-200'
                    }`}
                  >
                    <span>SKU</span>
                    {sortKey === 'sku' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-indigo-400" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-indigo-400" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition" />
                    )}
                  </button>
                </th>

                {/* 5. Region */}
                <th className="py-2.5 px-3">Region</th>

                {/* 6. Current Cost Sort */}
                <th className="py-2.5 px-3 text-right">
                  <button
                    onClick={() => handleSort('currentCost')}
                    className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase transition cursor-pointer group justify-end w-full ${
                      sortKey === 'currentCost' ? 'text-indigo-300 font-bold' : 'hover:text-slate-200'
                    }`}
                  >
                    <span>Current</span>
                    {sortKey === 'currentCost' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-indigo-400" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-indigo-400" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition" />
                    )}
                  </button>
                </th>

                {/* 7. Projected Cost Sort */}
                <th className="py-2.5 px-3 text-right">
                  <button
                    onClick={() => handleSort('projectedCost')}
                    className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase transition cursor-pointer group justify-end w-full ${
                      sortKey === 'projectedCost' ? 'text-indigo-300 font-bold' : 'hover:text-slate-200'
                    }`}
                  >
                    <span>Projected</span>
                    {sortKey === 'projectedCost' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-indigo-400" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-indigo-400" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition" />
                    )}
                  </button>
                </th>

                {/* 8. Impact / Delta Sort */}
                <th className="py-2.5 px-3 text-right">
                  <button
                    onClick={() => handleSort('impact')}
                    className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase transition cursor-pointer group justify-end w-full ${
                      sortKey === 'impact' ? 'text-indigo-300 font-bold' : 'hover:text-slate-200'
                    }`}
                  >
                    <span>Impact</span>
                    {sortKey === 'impact' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-indigo-400" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-indigo-400" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition" />
                    )}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {sortedAndFiltered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-sans">
                    No resources matched the filter criteria.
                  </td>
                </tr>
              ) : (
                sortedAndFiltered.map((r, i) => {
                  const isSkipped = r.status === 'SKIPPED';
                  const shortName = r.address.split('.').pop() || r.address;
                  const tagCount = r.tags ? Object.keys(r.tags).length : 0;

                  return (
                    <tr key={i} className="hover:bg-slate-800/30 transition">
                      {/* 1. Resource Address & Type */}
                      <td className="py-2.5 px-3 font-sans">
                        <div className="font-medium text-slate-200 truncate max-w-xs" title={r.address}>
                          {shortName}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 truncate max-w-xs">
                          {formatResourceType(r.resource_type)}
                        </div>
                      </td>

                      {/* 2. Visual Cost Center / Department Badge */}
                      <td className="py-2.5 px-3 font-sans">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() =>
                              setSelectedCostCenterId((prev) =>
                                prev === r.costCenter.id ? null : r.costCenter.id
                              )
                            }
                            title={`Filter by ${r.costCenter.name} (${r.costCenter.category})`}
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border transition cursor-pointer hover:opacity-90 ${r.costCenter.style.bg} ${r.costCenter.style.text} ${r.costCenter.style.border}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${r.costCenter.style.dot}`} />
                            <span className="truncate max-w-[120px]">{r.costCenter.name}</span>
                          </button>

                          {/* Quick Tag Details Popover Trigger */}
                          {tagCount > 0 && (
                            <button
                              onClick={() => setActiveTagModalResource(r)}
                              title={`View all ${tagCount} tags for this resource`}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition font-mono"
                            >
                              🏷️ {tagCount}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* 3. Action */}
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

                      {/* 4. SKU */}
                      <td className="py-2.5 px-3 text-slate-300 font-semibold">{r.sku}</td>

                      {/* 5. Region */}
                      <td className="py-2.5 px-3 text-slate-400">{r.region}</td>

                      {/* 6. Current Cost */}
                      <td className="py-2.5 px-3 text-right text-slate-400">
                        {isSkipped ? '—' : formatINR(r.old_monthly_cost)}
                      </td>

                      {/* 7. Projected Cost */}
                      <td className="py-2.5 px-3 text-right text-slate-200">
                        {isSkipped ? '—' : formatINR(r.new_monthly_cost)}
                      </td>

                      {/* 8. Net Impact */}
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
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* Resource Tag Inspector Modal / Drawer */}
      {/* ---------------------------------------------------- */}
      {activeTagModalResource && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Tags className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white">Resource Tag Metadata</h3>
                </div>
                <p className="text-xs font-mono text-slate-400 mt-1 truncate max-w-sm">
                  {activeTagModalResource.address}
                </p>
              </div>
              <button
                onClick={() => setActiveTagModalResource(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Resolved Cost Center attribution highlight */}
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400">Assigned Department / Cost Center:</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold border ${activeTagModalResource.costCenter.style.bg} ${activeTagModalResource.costCenter.style.text} ${activeTagModalResource.costCenter.style.border}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${activeTagModalResource.costCenter.style.dot}`} />
                {activeTagModalResource.costCenter.name}
              </span>
            </div>

            {/* Key-Value Tag List */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {activeTagModalResource.tags && Object.keys(activeTagModalResource.tags).length > 0 ? (
                Object.entries(activeTagModalResource.tags).map(([key, value]) => (
                  <div
                    key={key}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs font-mono"
                  >
                    <span className="text-indigo-400 font-semibold">{key}:</span>
                    <span className="text-slate-200">{String(value)}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500 text-center py-4">No tags defined for this resource.</p>
              )}
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setActiveTagModalResource(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* What-If Pricing Comparison Section */}
      {/* ---------------------------------------------------- */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
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
                <option key={s} value={s}>
                  {s}
                </option>
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
                <option key={s} value={s}>
                  {s}
                </option>
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
