import {
  AnalysisResponse,
  CacheStatsResponse,
  SamplePlanItem,
  SimulationResult,
} from '../types';

export const api = {
  async getSamplePlans(): Promise<SamplePlanItem[]> {
    const res = await fetch('/api/plans');
    if (!res.ok) throw new Error('Failed to load sample plans');
    return res.json();
  },

  async getPlanContent(filename: string): Promise<{ filename: string; content: any }> {
    const res = await fetch(`/api/plans/${filename}`);
    if (!res.ok) throw new Error(`Failed to load plan ${filename}`);
    return res.json();
  },

  async analyzePlan(
    plan: any,
    maxIncrease: number = 4000,
    currency: string = 'INR',
    includeSpot: boolean = false
  ): Promise<AnalysisResponse> {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan,
        max_increase: maxIncrease,
        currency,
        include_spot: includeSpot,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async runCliCommand(command: string, planContent?: any): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const res = await fetch('/api/cli/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, plan_content: planContent }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'CLI execution failed' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async getCacheStats(): Promise<CacheStatsResponse> {
    const res = await fetch('/api/cache/stats');
    if (!res.ok) throw new Error('Failed to load cache statistics');
    return res.json();
  },

  async clearCache(): Promise<{ status: string; deleted: number }> {
    const res = await fetch('/api/cache', { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to clear cache');
    return res.json();
  },

  async simulate(
    currentSku: string,
    alternativeSku: string,
    region: string = 'eastus',
    currency: string = 'INR'
  ): Promise<SimulationResult> {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_sku: currentSku,
        alternative_sku: alternativeSku,
        region,
        currency,
      }),
    });
    if (!res.ok) throw new Error('Failed to simulate SKU switch');
    return res.json();
  },

  async queryAdvisor(analysisData: any, promptContext?: string): Promise<any> {
    const res = await fetch('/api/advisor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        analysis_data: analysisData,
        prompt_context: promptContext,
      }),
    });
    if (!res.ok) throw new Error('Failed to consult AI advisor');
    return res.json();
  },
};
