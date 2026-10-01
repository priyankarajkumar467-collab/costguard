import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import {
  parseTerraformPlan,
  calculateCostGuardPlan,
  generateCliReportText,
  generateMarkdownReport,
  sqliteCache,
  AzureRetailPricingService,
  simulateSkuSwitch,
  formatINRText,
} from './src/server/costguard-engine';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT || '3000', 10);
const ROOT_DIR = process.cwd();
const TEST_PLANS_DIR = path.join(ROOT_DIR, 'test-plans');

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Gracefully handle malformed JSON in HTTP body with JSON response (exit code 2)
  app.use((err: any, _req: Request, res: Response, next: any) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({
        error: `Malformed JSON syntax in plan payload: ${err.message}`,
        raw_stderr: `Malformed JSON syntax in plan payload: ${err.message}`,
        exitCode: 2,
      });
    }
    next();
  });

  // Pure TypeScript CostGuard Execution (No python3 subprocess dependency)
  async function runCostGuardInProcess(
    args: string[],
    stdinInput?: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    let planPath: string | null = null;
    let maxIncrease = 4000.0;
    let currency = 'INR';
    let isMarkdown = false;
    let isJson = false;
    let isClearCache = false;
    let includeSpot = false;

    // Simple robust CLI arg parser
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--plan' || a === '-p') {
        planPath = args[++i];
      } else if (a === '--max-increase' || a === '-m') {
        maxIncrease = parseFloat(args[++i]) || 4000.0;
      } else if (a === '--currency' || a === '-c') {
        currency = args[++i] || 'INR';
      } else if (a === '--markdown') {
        isMarkdown = true;
      } else if (a === '--json') {
        isJson = true;
      } else if (a === '--clear-cache') {
        isClearCache = true;
      } else if (a === '--include-spot') {
        includeSpot = true;
      }
    }

    if (isClearCache) {
      const deleted = sqliteCache.clear();
      return {
        stdout: `[INFO] Cleared ${deleted} entries from CostGuard SQLite pricing cache.\n`,
        stderr: '',
        exitCode: 0,
      };
    }

    let planRaw = '';
    if (planPath && planPath !== '-') {
      const resolved = path.isAbsolute(planPath) ? planPath : path.join(ROOT_DIR, planPath);
      if (!fs.existsSync(resolved)) {
        return {
          stdout: '',
          stderr: `Error: Terraform plan file '${planPath}' not found.\n`,
          exitCode: 2,
        };
      }
      try {
        planRaw = fs.readFileSync(resolved, 'utf-8');
      } catch (err: any) {
        return {
          stdout: '',
          stderr: `Error reading plan file '${planPath}': ${err.message}\n`,
          exitCode: 2,
        };
      }
    } else if (stdinInput) {
      planRaw = stdinInput;
    } else {
      return {
        stdout: '',
        stderr: 'Error: No plan provided. Specify --plan <file> or pipe Terraform JSON to stdin.\n',
        exitCode: 2,
      };
    }

    if (!planRaw.trim()) {
      return {
        stdout: '',
        stderr: 'Error: Empty Terraform plan received.\n',
        exitCode: 2,
      };
    }

    try {
      const { parsed, logs } = parseTerraformPlan(planRaw);
      const pricingService = new AzureRetailPricingService();
      const analysis = await calculateCostGuardPlan(parsed, {
        currency,
        maxIncrease,
        includeSpot,
        pricingProvider: pricingService,
      });

      // Combine parser logs with pricing logs
      analysis.logs = [...logs, ...analysis.logs];

      if (isJson) {
        return {
          stdout: JSON.stringify(analysis, null, 2),
          stderr: '',
          exitCode: analysis.policy_verdict.exit_code,
        };
      } else if (isMarkdown) {
        return {
          stdout: generateMarkdownReport(analysis),
          stderr: '',
          exitCode: analysis.policy_verdict.exit_code,
        };
      } else {
        return {
          stdout: generateCliReportText(analysis),
          stderr: '',
          exitCode: analysis.policy_verdict.exit_code,
        };
      }
    } catch (err: any) {
      return {
        stdout: '',
        stderr: `Error parsing Terraform plan: ${err.message}\n`,
        exitCode: 2,
      };
    }
  }

  // Health endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      app: 'CostGuard FinOps Guardrail',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      runtime: 'Node.js (TypeScript native)',
      capabilities: ['Terraform Plan Analysis', 'Azure Retail API', 'SQLite Cache', 'Circuit Breaker Policy', 'AI Advisor'],
    });
  });

  // Sample plans listing
  app.get('/api/plans', (_req: Request, res: Response) => {
    try {
      if (!fs.existsSync(TEST_PLANS_DIR)) {
        return res.json([]);
      }
      const files = fs.readdirSync(TEST_PLANS_DIR).filter((f) => f.endsWith('.json'));
      const list = files.map((filename) => {
        let description = '';
        if (filename.includes('create')) description = 'Plan A: Create VM Standard_D2s_v3 & Managed Disk';
        else if (filename.includes('delete')) description = 'Plan B: Delete legacy VM Standard_B1s';
        else if (filename.includes('update')) description = 'Plan B2: Upgrade VM Standard_B2s to Standard_D4s_v3';
        else if (filename.includes('replacement')) description = 'Plan D: VM Replacement (delete, create)';
        else if (filename.includes('noise')) description = 'Plan C: 15 Non-billable resources (vnet, subnet, nsg)';
        else if (filename.includes('metadata')) description = 'Plan M: Tag change only (₹0 delta)';
        else if (filename.includes('unknown')) description = 'Plan U: Unknown/Custom SKU resilience test';
        else if (filename.includes('malformed')) description = 'Plan X: Malformed plan syntax (exit code 2)';
        else description = filename.replace('.json', '');

        return {
          filename,
          title: filename.replace('.json', '').replace('plan_', '').replace(/_/g, ' ').toUpperCase(),
          description,
        };
      });
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get specific plan content
  app.get('/api/plans/:filename', (req: Request, res: Response) => {
    try {
      const filename = path.basename(req.params.filename);
      const target = path.join(TEST_PLANS_DIR, filename);
      if (!fs.existsSync(target)) {
        return res.status(404).json({ error: 'Plan not found' });
      }
      const content = fs.readFileSync(target, 'utf-8');
      res.json({ filename, content: JSON.parse(content) });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Main plan analysis endpoint (Native Node.js / TypeScript execution)
  app.post('/api/analyze', async (req: Request, res: Response) => {
    try {
      const { plan, max_increase = 4000, currency = 'INR', include_spot = false } = req.body;
      if (!plan) {
        return res.status(400).json({ error: 'Missing plan payload' });
      }

      let parsedChanges: any[];
      let parserLogs: string[];
      try {
        const result = parseTerraformPlan(plan);
        parsedChanges = result.parsed;
        parserLogs = result.logs;
      } catch (parseErr: any) {
        return res.status(400).json({
          error: parseErr.message,
          raw_stderr: `Error parsing Terraform plan: ${parseErr.message}`,
        });
      }

      const pricingService = new AzureRetailPricingService();
      const analysis = await calculateCostGuardPlan(parsedChanges, {
        currency: String(currency),
        maxIncrease: Number(max_increase),
        includeSpot: Boolean(include_spot),
        pricingProvider: pricingService,
      });

      analysis.logs = [...parserLogs, ...analysis.logs];
      res.json(analysis);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal analysis error' });
    }
  });

  // Run raw CLI command for in-browser terminal
  app.post('/api/cli/run', async (req: Request, res: Response) => {
    try {
      const { command, plan_content } = req.body;
      const cmdStr = (command || '').trim();

      const parts = cmdStr.split(/\s+/).filter(Boolean);
      if (parts[0] === 'costguard' || parts[0] === './costguard') {
        parts.shift();
      }

      let stdinInput: string | undefined = undefined;
      const hasPlanArg = parts.includes('--plan') || parts.includes('-p');
      if (!hasPlanArg && plan_content) {
        stdinInput = typeof plan_content === 'string' ? plan_content : JSON.stringify(plan_content);
      }

      const result = await runCostGuardInProcess(parts, stdinInput);

      res.json({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message, exitCode: 2 });
    }
  });

  // Pricing lookup
  app.get('/api/pricing/:sku/:region', async (req: Request, res: Response) => {
    const { sku, region } = req.params;
    const currency = (req.query.currency as string) || 'INR';
    try {
      const provider = new AzureRetailPricingService();
      const lookup = await provider.getHourlyPrice(sku, region, 'azurerm_virtual_machine', currency);
      res.json({
        sku: lookup.sku,
        region: lookup.region,
        currency: lookup.currency,
        hourly_rate: lookup.hourly_rate,
        monthly_rate: lookup.hourly_rate ? Math.round(lookup.hourly_rate * 730 * 100) / 100 : null,
        found: lookup.found,
        source: lookup.source,
        meter_name: lookup.meter_name,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Pricing lookup failed', details: err.message });
    }
  });

  // Cache stats & clear
  app.get('/api/cache/stats', async (_req: Request, res: Response) => {
    try {
      res.json(sqliteCache.getStats());
    } catch (err: any) {
      res.json({ total_entries: 0, oldest_timestamp: null, newest_timestamp: null, entries: [] });
    }
  });

  app.delete('/api/cache', async (_req: Request, res: Response) => {
    try {
      const deleted = sqliteCache.clear();
      res.json({ status: 'success', deleted });
    } catch (err: any) {
      res.json({ status: 'success', deleted: 0 });
    }
  });

  // What-If Simulator
  app.post('/api/simulate', async (req: Request, res: Response) => {
    try {
      const { current_sku, alternative_sku, region = 'eastus', currency = 'INR' } = req.body;
      const result = await simulateSkuSwitch(current_sku, alternative_sku, region, currency);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Simulation failed', details: err.message });
    }
  });

  // AI Cost Advisor with Gemini grounding
  app.post('/api/advisor', async (req: Request, res: Response) => {
    try {
      const { analysis_data, prompt_context } = req.body;
      const fin = analysis_data?.financial_summary;
      const verdict = analysis_data?.policy_verdict;
      const explanations = analysis_data?.explanations || [];
      const resources = analysis_data?.resource_details || [];

      // Deterministic advice synthesized in Node.js
      const increasingResources = resources.filter((r: any) => r.delta_monthly_cost > 0);
      let primaryDriver = 'No cost increases detected.';
      let driverImpact = 0;
      if (increasingResources.length > 0) {
        const sorted = [...increasingResources].sort((a: any, b: any) => b.delta_monthly_cost - a.delta_monthly_cost);
        primaryDriver = `${sorted[0].sku} (${sorted[0].address.split('.').pop()})`;
        driverImpact = sorted[0].delta_monthly_cost;
      }

      const totalIncrease = increasingResources.reduce((acc: number, r: any) => acc + r.delta_monthly_cost, 0);
      const concentrationPct = totalIncrease > 0 ? Math.round((driverImpact / totalIncrease) * 1000) / 10 : 0.0;

      // Risk score calculation
      let riskScore = 15;
      const riskFactors: any[] = [];

      if (verdict?.is_breached) {
        riskScore += 45;
        riskFactors.push({
          factor: 'Budget Guardrail Breached',
          severity: 'HIGH',
          description: `Net increase of ${formatINRText(fin?.net_monthly_impact || 0)}/mo exceeds allowable budget of ${formatINRText(verdict?.budget_threshold || 0)}/mo.`,
        });
      } else if (verdict?.budget_threshold > 0) {
        const util = ((fin?.net_monthly_impact || 0) / verdict.budget_threshold) * 100;
        if (util > 80) {
          riskScore += 25;
          riskFactors.push({
            factor: 'Near Budget Limit',
            severity: 'MEDIUM',
            description: `Budget consumption is at ${util.toFixed(1)}% of allowable threshold.`,
          });
        }
      }

      if ((fin?.net_monthly_impact || 0) > 15000) {
        riskScore += 30;
        riskFactors.push({
          factor: 'High Monthly Commitment',
          severity: 'HIGH',
          description: `Substantial new monthly spend addition of ${formatINRText(fin?.net_monthly_impact || 0)}/mo.`,
        });
      } else if ((fin?.net_monthly_impact || 0) > 5000) {
        riskScore += 15;
        riskFactors.push({
          factor: 'Moderate Cost Addition',
          severity: 'MEDIUM',
          description: `Spend increase of ${formatINRText(fin?.net_monthly_impact || 0)}/mo (${formatINRText(fin?.annualized_impact || 0)}/year).`,
        });
      }

      riskScore = Math.min(100, Math.max(0, riskScore));
      const riskLevel = riskScore >= 70 ? 'CRITICAL' : riskScore >= 45 ? 'HIGH' : riskScore >= 25 ? 'MODERATE' : 'LOW';

      const baseResult = {
        advice: {
          key_findings: [
            verdict?.is_breached
              ? `Plan breaches monthly budget by ${formatINRText(verdict.amount_difference)}. Deployment must be blocked.`
              : `Plan is within budget with ${formatINRText(verdict?.amount_difference || 0)} headroom. Deployment permitted.`,
            `Primary cost driver is ${primaryDriver} responsible for ${concentrationPct}% of total net cost addition.`,
            `730 hours/month Azure run-rate projected at ${formatINRText(fin?.projected_monthly_total || 0)}/month.`,
          ],
          primary_cost_driver: primaryDriver,
          driver_concentration_pct: concentrationPct,
          optimization_actions: [
            'Evaluate Azure B-series burstable VMs for variable workloads.',
            'Review disk storage tier (e.g. Standard SSD instead of Premium SSD for dev environments).',
            'Verify teardown automations for non-production environments after business hours.',
          ],
        },
        risk: {
          risk_score: riskScore,
          risk_level: riskLevel,
          factors: riskFactors,
          deployment_recommendation: verdict?.is_breached ? 'BLOCK' : 'APPROVE',
        },
        executive_commentary: '',
      };

      // Optional Gemini AI commentary if API key configured
      if (process.env.GEMINI_API_KEY) {
        try {
          const ai = new GoogleGenAI({});
          const prompt = `You are CostGuard's Senior FinOps AI Advisor.
Analyze these deterministic cost numbers for an upcoming Terraform deployment:
- Net Monthly Impact: ${fin?.net_monthly_impact} ${fin?.currency}
- Annualized Impact: ${fin?.annualized_impact} ${fin?.currency}
- Budget Threshold: ${verdict?.budget_threshold} ${fin?.currency}
- Circuit Breaker Status: ${verdict?.status}
- Changed Resources: ${JSON.stringify(resources.map((r: any) => ({ address: r.address, action: r.action, sku: r.sku, delta: r.delta_monthly_cost })))}
- Deterministic drivers: ${explanations.join('; ')}

User question/context: "${prompt_context || 'Summarize financial risk and suggest optimization actions.'}"

CRITICAL RULES:
1. NEVER invent or alter pricing calculations. The numbers above are absolute truth.
2. Provide concise, high-impact FinOps executive guidance in 3 short bullet points.
3. Clearly state whether deployment can proceed or should be held for optimization.`;

          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
          });
          baseResult.executive_commentary = response.text || '';
        } catch (aiErr: any) {
          console.warn('Gemini advisor call skipped or failed:', aiErr.message);
        }
      }

      res.json(baseResult);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // In development, mount Vite middleware
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files from dist
    const distPath = path.join(ROOT_DIR, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CostGuard] Server running on http://0.0.0.0:${PORT} (Node.js engine)`);
  });
}

startServer();
