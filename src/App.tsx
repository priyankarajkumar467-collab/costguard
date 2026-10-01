import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FileCode,
  Layers,
  Scale,
  Settings,
  AlertCircle,
} from 'lucide-react';
import { api } from './services/api';
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
} from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [samplePlans, setSamplePlans] = useState<SamplePlanItem[]>([]);
  const [selectedPlanFilename, setSelectedPlanFilename] = useState<string>('plan_create.json');
  const [rawPlanJson, setRawPlanJson] = useState<string>('');
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [maxIncrease, setMaxIncrease] = useState<number>(4000.0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
          const jsonText = JSON.stringify(contentObj.content, null, 2);
          setRawPlanJson(jsonText);

          // Run initial analysis automatically in INR
          runPlanAnalysis(jsonText, maxIncrease);
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
      const jsonText = JSON.stringify(contentObj.content, null, 2);
      setRawPlanJson(jsonText);
      runPlanAnalysis(jsonText, maxIncrease);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load plan');
    }
  };

  const runPlanAnalysis = async (planString: string, budget: number) => {
    setIsAnalyzing(true);
    setErrorMessage(null);
    try {
      const parsed = JSON.parse(planString);
      const result = await api.analyzePlan(parsed, budget, 'INR', false);
      setAnalysis(result);
    } catch (err: any) {
      setErrorMessage(err.message || 'Plan analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleMaxIncreaseChange = (newMax: number) => {
    setMaxIncrease(newMax);
    if (rawPlanJson) {
      runPlanAnalysis(rawPlanJson, newMax);
    }
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
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
        maxIncrease={maxIncrease}
        onChangeMaxIncrease={handleMaxIncreaseChange}
        onRunQuickDemo={() => runPlanAnalysis(rawPlanJson, maxIncrease)}
        isAnalyzing={isAnalyzing}
        cacheHits={analysis?.cache_summary.cache_hits ?? 0}
        apiCalls={analysis?.cache_summary.api_calls ?? 0}
      />

      {/* Navigation Sub-Bar */}
      <div className="border-b border-slate-800 bg-slate-900/60 px-4 lg:px-8 py-2">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as TabType)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    isActive
                      ? 'bg-indigo-600 text-white font-semibold shadow'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
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
        <div className="mx-4 lg:mx-8 mt-4 max-w-5xl lg:mx-auto p-3 rounded-lg bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Main Workspace */}
      <main className="flex-1 p-4 lg:p-8 max-w-5xl mx-auto w-full">
        {activeTab === 'overview' && (
          <OverviewTab
            analysis={analysis}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'analyzer' && (
          <PlanAnalyzerTab
            samplePlans={samplePlans}
            selectedFilename={selectedPlanFilename}
            onSelectPlan={handleSelectPlan}
            rawJson={rawPlanJson}
            onChangeRawJson={setRawPlanJson}
            onRunAnalysis={() => runPlanAnalysis(rawPlanJson, maxIncrease)}
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
            maxIncrease={maxIncrease}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            maxIncrease={maxIncrease}
            onChangeMaxIncrease={handleMaxIncreaseChange}
            analysis={analysis}
          />
        )}
      </main>

      {/* Clean Minimal Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 px-4 lg:px-8 py-3 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2 font-mono">
          <span className="font-bold text-slate-400">COSTGUARD</span>
          <span>&bull;</span>
          <span>Predict infrastructure cost before you deploy.</span>
        </div>
        <div className="text-slate-400 font-mono text-[11px]">
          Official Azure Retail Prices API &bull; 730 hrs/month
        </div>
      </footer>
    </div>
  );
}
