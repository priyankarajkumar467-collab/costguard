import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FileCode,
  Layers,
  Scale,
  Settings,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { Header } from './components/Header';
import { OverviewTab } from './components/OverviewTab';
import { PlanAnalyzerTab } from './components/PlanAnalyzerTab';
import { CostImpactTab } from './components/CostImpactTab';
import { CompareTab } from './components/CompareTab';
import { SettingsTab } from './components/SettingsTab';
import {
  TabType,
  AnalysisResponse,
  SamplePlanItem,
  BudgetThresholdConfig,
} from './types';
import { api } from './services/api';

const DEFAULT_BUDGET_CONFIG: BudgetThresholdConfig = {
  maxIncrease: 4000.0,
  warningThreshold: 2500.0,
  warningEnabled: true,
  totalSpendCap: 15000.0,
  totalSpendCapEnabled: false,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [samplePlans, setSamplePlans] = useState<SamplePlanItem[]>([]);
  const [selectedPlanFilename, setSelectedPlanFilename] = useState<string>('plan_create.json');
  const [rawPlanJson, setRawPlanJson] = useState<string>('');
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Budget threshold configuration persisted in localStorage
  const [budgetConfig, setBudgetConfig] = useState<BudgetThresholdConfig>(() => {
    try {
      const saved = localStorage.getItem('costguard_budget_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          maxIncrease: typeof parsed.maxIncrease === 'number' ? parsed.maxIncrease : DEFAULT_BUDGET_CONFIG.maxIncrease,
          warningThreshold: typeof parsed.warningThreshold === 'number' ? parsed.warningThreshold : DEFAULT_BUDGET_CONFIG.warningThreshold,
          warningEnabled: typeof parsed.warningEnabled === 'boolean' ? parsed.warningEnabled : DEFAULT_BUDGET_CONFIG.warningEnabled,
          totalSpendCap: typeof parsed.totalSpendCap === 'number' ? parsed.totalSpendCap : DEFAULT_BUDGET_CONFIG.totalSpendCap,
          totalSpendCapEnabled: typeof parsed.totalSpendCapEnabled === 'boolean' ? parsed.totalSpendCapEnabled : DEFAULT_BUDGET_CONFIG.totalSpendCapEnabled,
        };
      }
    } catch {
      // fallback
    }
    return DEFAULT_BUDGET_CONFIG;
  });

  // Load sample plans list on mount
  useEffect(() => {
    async function init() {
      try {
        const plans = await api.getSamplePlans();
        setSamplePlans(plans);
        if (plans.length > 0) {
          const defaultPlan = plans.find((p) => p.filename === 'plan_create.json') || plans[0];
          setSelectedPlanFilename(defaultPlan.filename);
          const contentObj = await api.getPlanContent(defaultPlan.filename);
          const jsonText =
            typeof contentObj.content === 'string'
              ? contentObj.content
              : JSON.stringify(contentObj.content, null, 2);
          setRawPlanJson(jsonText);

          // Run initial analysis automatically in INR
          runPlanAnalysis(jsonText, budgetConfig.maxIncrease);
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to initialize plans');
      }
    }
    init();
  }, []);

  const handleSelectPlan = async (filename: string) => {
    setSelectedPlanFilename(filename);
    try {
      const contentObj = await api.getPlanContent(filename);
      const jsonText =
        typeof contentObj.content === 'string'
          ? contentObj.content
          : JSON.stringify(contentObj.content, null, 2);
      setRawPlanJson(jsonText);
      runPlanAnalysis(jsonText, budgetConfig.maxIncrease);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load plan');
    }
  };

  const runPlanAnalysis = async (planString: string, budget: number) => {
    setIsAnalyzing(true);
    setErrorMessage(null);
    try {
      let parsed: any;
      try {
        parsed = JSON.parse(planString);
      } catch (jsonErr: any) {
        throw new Error(`Invalid JSON syntax in Terraform plan: ${jsonErr.message}`);
      }
      const result = await api.analyzePlan(parsed, budget, 'INR', false);
      setAnalysis(result);
    } catch (err: any) {
      setErrorMessage(err.message || 'Plan analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleBudgetConfigChange = (newConfig: BudgetThresholdConfig) => {
    setBudgetConfig(newConfig);
    try {
      localStorage.setItem('costguard_budget_config', JSON.stringify(newConfig));
    } catch {
      // ignore
    }
    if (newConfig.maxIncrease !== budgetConfig.maxIncrease && rawPlanJson) {
      runPlanAnalysis(rawPlanJson, newConfig.maxIncrease);
    }
  };

  // Visual warning status calculation
  const netMonthly = analysis?.financial_summary.net_monthly_impact ?? 0;
  const isHardBreached = analysis ? analysis.policy_verdict.is_breached || netMonthly > budgetConfig.maxIncrease : false;
  const isWarningBreached = Boolean(
    analysis &&
    budgetConfig.warningEnabled &&
    netMonthly >= budgetConfig.warningThreshold &&
    !isHardBreached
  );

  const navItems = [
    {
      id: 'overview',
      label: 'Overview',
      icon: LayoutDashboard,
      warningDot: isWarningBreached,
      breachDot: isHardBreached,
    },
    { id: 'analyzer', label: 'Plan Analysis', icon: FileCode },
    { id: 'impact', label: 'Cost Impact', icon: Layers },
    { id: 'compare', label: 'Compare', icon: Scale },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Minimal Header */}
      <Header
        plans={samplePlans}
        currentPlanFilename={selectedPlanFilename}
        onSelectPlan={handleSelectPlan}
        maxIncrease={budgetConfig.maxIncrease}
        onChangeMaxIncrease={(val) => handleBudgetConfigChange({ ...budgetConfig, maxIncrease: val })}
        onRunQuickDemo={() => runPlanAnalysis(rawPlanJson, budgetConfig.maxIncrease)}
        isAnalyzing={isAnalyzing}
        cacheHits={analysis?.cache_summary.cache_hits ?? 0}
        apiCalls={analysis?.cache_summary.api_calls ?? 0}
      />

      {/* Navigation Sub-Bar */}
      <div className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-2">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as TabType)}
                  className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    isActive
                      ? 'bg-indigo-600 text-white font-semibold shadow'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>

                  {/* Warning / Breach Dot Indicator */}
                  {item.breachDot && (
                    <span className="w-2 h-2 rounded-full bg-red-400 ring-2 ring-red-500/30" title="Policy Blocked" />
                  )}
                  {item.warningDot && !item.breachDot && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-500/30 animate-pulse" title="Budget Warning Active" />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span>Active Plan:</span>
            <span className="text-white font-semibold truncate max-w-xs">{selectedPlanFilename}</span>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="mx-4 sm:mx-6 lg:mx-8 mt-4 max-w-7xl lg:mx-auto p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Main Workspace */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        {activeTab === 'overview' && (
          <OverviewTab
            analysis={analysis}
            onNavigateTab={(tab) => setActiveTab(tab)}
            budgetConfig={budgetConfig}
          />
        )}

        {activeTab === 'analyzer' && (
          <PlanAnalyzerTab
            samplePlans={samplePlans}
            selectedFilename={selectedPlanFilename}
            onSelectPlan={handleSelectPlan}
            rawJson={rawPlanJson}
            onChangeRawJson={setRawPlanJson}
            onRunAnalysis={() => runPlanAnalysis(rawPlanJson, budgetConfig.maxIncrease)}
            isAnalyzing={isAnalyzing}
            analysis={analysis}
          />
        )}

        {activeTab === 'impact' && (
          <CostImpactTab
            analysis={analysis}
          />
        )}

        {activeTab === 'compare' && (
          <CompareTab
            samplePlans={samplePlans}
            currentPlanFilename={selectedPlanFilename}
            currentAnalysis={analysis}
            maxIncrease={budgetConfig.maxIncrease}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            budgetConfig={budgetConfig}
            onChangeBudgetConfig={handleBudgetConfigChange}
            analysis={analysis}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}
      </main>

      {/* Clean Minimal Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 px-4 sm:px-6 lg:px-8 py-3 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2 font-mono">
          <span className="font-bold text-slate-300">COSTGUARD</span>
          <span>&bull;</span>
          <span>Predict cloud infrastructure spend prior to Terraform apply.</span>
        </div>
        <div className="text-slate-400 font-mono text-[11px]">
          Official Azure Retail Prices API &bull; 730 hrs/month
        </div>
      </footer>
    </div>
  );
}
