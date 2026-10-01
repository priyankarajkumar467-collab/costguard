import {
  AnalysisResponse,
  CacheStatsResponse,
  SamplePlanItem,
  SimulationResult,
} from '../types';
import { SAMPLE_PLANS_LIST, SAMPLE_PLANS_CONTENT } from '../data/sample-plans';
import {
  analyzeCostGuardPlan,
  simulateSkuSwitch,
  universalCache,
  runCostGuardCli,
} from '../engine/costguard-core';

// Detect if running on GitHub Pages or static hosting where backend Node/Express server does not exist
const isGitHubPages =
  typeof window !== 'undefined' &&
  (window.location.hostname.includes('github.io') ||
    window.location.protocol === 'file:');

// Only attempt backend fetch if running in local dev / AI Studio preview environment
const canTryBackend =
  typeof window !== 'undefined' &&
  !isGitHubPages &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.includes('run.app'));

export const api = {
  async getSamplePlans(): Promise<SamplePlanItem[]> {
    if (canTryBackend) {
      try {
        const res = await fetch('/costguard/api/plans').catch(() => fetch('/api/plans'));
        if (res && res.ok) {
          return await res.json();
        }
      } catch {
        // Fall back to bundled plans
      }
    }
    return SAMPLE_PLANS_LIST;
  },

  async getPlanContent(filename: string): Promise<{ filename: string; content: any }> {
    if (canTryBackend) {
      try {
        const res = await fetch(`/costguard/api/plans/${filename}`).catch(() => fetch(`/api/plans/${filename}`));
        if (res && res.ok) {
          return await res.json();
        }
      } catch {
        // Fall back to bundled content
      }
    }

    if (filename in SAMPLE_PLANS_CONTENT) {
      return { filename, content: SAMPLE_PLANS_CONTENT[filename] };
    }

    // Try fetching from static public folder if not in bundled list
    try {
      const publicRes = await fetch(`./test-plans/${filename}`);
      if (publicRes.ok) {
        const json = await publicRes.json();
        return { filename, content: json };
      }
    } catch {
      // ignore
    }

    throw new Error(`Plan file '${filename}' not found`);
  },

  async analyzePlan(
    plan: any,
    maxIncrease: number = 4000,
    currency: string = 'INR',
    includeSpot: boolean = false
  ): Promise<AnalysisResponse> {
    // If running in development with active backend server, attempt API call first
    if (canTryBackend) {
      try {
        const apiUrl = '/costguard/api/analyze';
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan,
            max_increase: maxIncrease,
            currency,
            include_spot: includeSpot,
          }),
        }).catch(() =>
          fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              plan,
              max_increase: maxIncrease,
              currency,
              include_spot: includeSpot,
            }),
          })
        );

        if (res && res.ok) {
          return await res.json();
        }
      } catch {
        // Server unreachable -> seamless client-side execution below
      }
    }

    // Client-side pure TypeScript analysis (Works on GitHub Pages with ZERO backend required)
    const result = await analyzeCostGuardPlan(plan, {
      maxIncrease,
      currency,
      includeSpot,
    });
    return result as AnalysisResponse;
  },

  async runCliCommand(
    command: string,
    planContent?: any
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (canTryBackend) {
      try {
        const res = await fetch('/costguard/api/cli/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, plan_content: planContent }),
        }).catch(() =>
          fetch('/api/cli/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command, plan_content: planContent }),
          })
        );
        if (res && res.ok) {
          return await res.json();
        }
      } catch {
        // Fall back to client-side CLI runner
      }
    }

    // In-browser CLI execution
    return await runCostGuardCli(command, planContent);
  },

  async getCacheStats(): Promise<CacheStatsResponse> {
    if (canTryBackend) {
      try {
        const res = await fetch('/costguard/api/cache/stats').catch(() => fetch('/api/cache/stats'));
        if (res && res.ok) {
          return await res.json();
        }
      } catch {
        // Fall back to local client cache
      }
    }

    const stats = universalCache.getStats();
    return stats as CacheStatsResponse;
  },

  async clearCache(): Promise<{ status: string; deleted: number }> {
    if (canTryBackend) {
      try {
        const res = await fetch('/costguard/api/cache', { method: 'DELETE' }).catch(() =>
          fetch('/api/cache', { method: 'DELETE' })
        );
        if (res && res.ok) {
          return await res.json();
        }
      } catch {
        // Fall back to local client cache
      }
    }

    const deleted = universalCache.clear();
    return { status: 'success', deleted };
  },

  async simulate(
    currentSku: string,
    alternativeSku: string,
    region: string = 'eastus',
    currency: string = 'INR'
  ): Promise<SimulationResult> {
    if (canTryBackend) {
      try {
        const res = await fetch('/costguard/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            current_sku: currentSku,
            alternative_sku: alternativeSku,
            region,
            currency,
          }),
        }).catch(() =>
          fetch('/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              current_sku: currentSku,
              alternative_sku: alternativeSku,
              region,
              currency,
            }),
          })
        );
        if (res && res.ok) {
          return await res.json();
        }
      } catch {
        // Fall back to client-side simulation
      }
    }

    const sim = await simulateSkuSwitch(currentSku, alternativeSku, region, currency);
    return sim as SimulationResult;
  },

  async queryAdvisor(analysisData: any, promptContext?: string): Promise<any> {
    if (canTryBackend) {
      try {
        const res = await fetch('/costguard/api/advisor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            analysis_data: analysisData,
            prompt_context: promptContext,
          }),
        }).catch(() =>
          fetch('/api/advisor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              analysis_data: analysisData,
              prompt_context: promptContext,
            }),
          })
        );
        if (res && res.ok) {
          return await res.json();
        }
      } catch {
        // Fall back to rule-based advisor
      }
    }

    // Static / Client-Side FinOps Advisor
    const netImpact = analysisData?.financial_summary?.net_monthly_impact || 0;
    const isBreached = analysisData?.policy_verdict?.is_breached;
    return {
      title: 'CostGuard FinOps Advisor',
      detected_cost_increase: `${netImpact >= 0 ? '+' : ''}₹${Math.abs(netImpact).toLocaleString('en-IN')}/mo`,
      primary_driver: analysisData?.explanations?.[0] || 'Compute and storage alterations',
      executive_commentary: isBreached
        ? '⚠️ Deployment exceeds configured cost threshold. Review high-spec VM SKUs (e.g., Standard_D2s_v3) or consider burstable B-series instances before merging.'
        : '✅ Infrastructure plan complies with financial guardrails. Cost changes are within policy headroom.',
    };
  },
};
