import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT || '3000', 10);
const ROOT_DIR = process.cwd();
const CLI_PATH = path.join(ROOT_DIR, 'cli', 'costguard.py');
const TEST_PLANS_DIR = path.join(ROOT_DIR, 'test-plans');

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Helper to run costguard CLI
  function runCostGuardCli(args: string[], stdinInput?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const child = spawn('python3', [CLI_PATH, ...args], {
        cwd: ROOT_DIR,
        env: { ...process.env, PYTHONPATH: ROOT_DIR },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });

      child.on('error', (err) => {
        stderr += err.message;
        resolve({
          stdout,
          stderr,
          exitCode: 2,
        });
      });

      if (stdinInput) {
        child.stdin.write(stdinInput);
        child.stdin.end();
      }
    });
  }

  // Health endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      app: 'CostGuard FinOps Guardrail',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
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
        const fullPath = path.join(TEST_PLANS_DIR, filename);
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

  // Main plan analysis endpoint
  app.post('/api/analyze', async (req: Request, res: Response) => {
    try {
      const { plan, max_increase = 4000, currency = 'INR', include_spot = false } = req.body;
      if (!plan) {
        return res.status(400).json({ error: 'Missing plan payload' });
      }

      const planString = typeof plan === 'string' ? plan : JSON.stringify(plan);
      const tempPath = path.join(os.tmpdir(), `tfplan-${Date.now()}-${Math.random().toString(36).substring(7)}.json`);
      fs.writeFileSync(tempPath, planString, 'utf-8');

      const args = ['--plan', tempPath, '--max-increase', String(max_increase), '--currency', currency, '--json'];
      if (include_spot) args.push('--include-spot');

      const cliResult = await runCostGuardCli(args);

      try {
        fs.unlinkSync(tempPath);
      } catch {
        // ignore
      }

      if (cliResult.exitCode === 2) {
        return res.status(400).json({
          error: cliResult.stderr || 'Plan parsing failed (exit code 2)',
          raw_stderr: cliResult.stderr,
        });
      }

      let parsedJson: any = {};
      try {
        parsedJson = JSON.parse(cliResult.stdout);
      } catch (err: any) {
        return res.status(500).json({
          error: 'Failed to parse CLI output',
          stdout: cliResult.stdout,
          stderr: cliResult.stderr,
        });
      }

      // Add resource counts
      const details = parsedJson.resource_details || [];
      parsedJson.resource_counts = {
        total_detected: details.length,
        billable: details.filter((d: any) => d.status !== 'SKIPPED').length,
        skipped: details.filter((d: any) => d.status === 'SKIPPED').length,
        creates: details.filter((d: any) => d.action === 'CREATE').length,
        deletes: details.filter((d: any) => d.action === 'DELETE').length,
        updates: details.filter((d: any) => d.action === 'UPDATE').length,
        replacements: details.filter((d: any) => d.action === 'REPLACEMENT').length,
      };

      res.json(parsedJson);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Run raw CLI command for in-browser terminal
  app.post('/api/cli/run', async (req: Request, res: Response) => {
    try {
      const { command, plan_content } = req.body;
      const cmdStr = (command || '').trim();

      // Parse CLI arguments safely
      const parts = cmdStr.split(/\s+/).filter(Boolean);
      if (parts[0] === 'costguard' || parts[0] === './costguard') {
        parts.shift();
      }

      let tempFile: string | null = null;
      let argsToPass = [...parts];

      // If user piped or didn't supply --plan, use plan_content
      const hasPlanArg = argsToPass.includes('--plan') || argsToPass.includes('-p');
      if (!hasPlanArg && plan_content) {
        tempFile = path.join(os.tmpdir(), `cli-plan-${Date.now()}.json`);
        fs.writeFileSync(tempFile, typeof plan_content === 'string' ? plan_content : JSON.stringify(plan_content));
        argsToPass.push('--plan', tempFile);
      }

      const result = await runCostGuardCli(argsToPass);

      if (tempFile) {
        try {
          fs.unlinkSync(tempFile);
        } catch {
          // ignore
        }
      }

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
    const pyScript = `
import json, sys
from backend.app.services.pricing_service import AzureRetailPricingProvider
provider = AzureRetailPricingProvider()
res = provider.get_hourly_price('${sku}', '${region}', 'azurerm_virtual_machine', '${currency}')
print(json.dumps({
    'sku': res.sku,
    'region': res.region,
    'currency': res.currency,
    'hourly_rate': res.hourly_rate,
    'monthly_rate': round(res.hourly_rate * 730, 2) if res.hourly_rate else None,
    'found': res.found,
    'source': res.source,
    'meter_name': res.meter_name
}))
`;
    const child = spawn('python3', ['-c', pyScript], {
      cwd: ROOT_DIR,
      env: { ...process.env, PYTHONPATH: ROOT_DIR },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.on('close', () => {
      try {
        res.json(JSON.parse(out));
      } catch (err: any) {
        res.status(500).json({ error: 'Pricing lookup failed', details: out });
      }
    });
  });

  // Cache stats & clear
  app.get('/api/cache/stats', async (_req: Request, res: Response) => {
    const pyScript = `
import json
from backend.app.database import get_cache_statistics
print(json.dumps(get_cache_statistics()))
`;
    const child = spawn('python3', ['-c', pyScript], {
      cwd: ROOT_DIR,
      env: { ...process.env, PYTHONPATH: ROOT_DIR },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.on('close', () => {
      try {
        res.json(JSON.parse(out));
      } catch {
        res.json({ total_entries: 0, oldest_timestamp: null, newest_timestamp: null, entries: [] });
      }
    });
  });

  app.delete('/api/cache', async (_req: Request, res: Response) => {
    const pyScript = `
import json
from backend.app.database import clear_cache
deleted = clear_cache()
print(json.dumps({'status': 'success', 'deleted': deleted}))
`;
    const child = spawn('python3', ['-c', pyScript], {
      cwd: ROOT_DIR,
      env: { ...process.env, PYTHONPATH: ROOT_DIR },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.on('close', () => {
      try {
        res.json(JSON.parse(out));
      } catch {
        res.json({ status: 'success', deleted: 0 });
      }
    });
  });

  // What-If Simulator
  app.post('/api/simulate', async (req: Request, res: Response) => {
    const { current_sku, alternative_sku, region = 'eastus', currency = 'INR' } = req.body;
    const pyScript = `
import json
from backend.app.api.analysis import simulate_sku_switch
res = simulate_sku_switch('${current_sku}', '${alternative_sku}', '${region}', '${currency}')
print(json.dumps(res))
`;
    const child = spawn('python3', ['-c', pyScript], {
      cwd: ROOT_DIR,
      env: { ...process.env, PYTHONPATH: ROOT_DIR },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.on('close', () => {
      try {
        res.json(JSON.parse(out));
      } catch {
        res.status(500).json({ error: 'Simulation failed' });
      }
    });
  });

  // AI Cost Advisor with Gemini grounding
  app.post('/api/advisor', async (req: Request, res: Response) => {
    try {
      const { analysis_data, prompt_context } = req.body;
      const fin = analysis_data?.financial_summary;
      const verdict = analysis_data?.policy_verdict;
      const explanations = analysis_data?.explanations || [];
      const resources = analysis_data?.resource_details || [];

      // Always prepare deterministic base analysis
      const pyScript = `
import json
from backend.app.services.advisor import AICostAdvisor, RiskAnalyzer
from backend.app.schemas.report import FinancialSummary, PolicyVerdict, ResourceCostDetail

fin = FinancialSummary(**${JSON.stringify(fin || { currency: 'INR', prior_monthly_total: 0, projected_monthly_total: 0, net_monthly_impact: 0, annualized_impact: 0, quarterly_impact: 0 })})
verdict = PolicyVerdict(**${JSON.stringify(verdict || { budget_threshold: 4000, status: 'PASSED', amount_difference: 4000, is_breached: false, exit_code: 0, summary_message: 'OK' })})
details = [ResourceCostDetail(**r) for r in ${JSON.stringify(resources)}]
explanations = ${JSON.stringify(explanations)}

advice = AICostAdvisor.generate_advice(details, fin, verdict, explanations)
risk = RiskAnalyzer.assess_risk(fin, verdict, details)
print(json.dumps({'advice': advice, 'risk': risk}))
`;

      const child = spawn('python3', ['-c', pyScript], {
        cwd: ROOT_DIR,
        env: { ...process.env, PYTHONPATH: ROOT_DIR },
      });
      let out = '';
      child.stdout.on('data', (d) => (out += d.toString()));

      child.on('close', async () => {
        let baseResult: any = { advice: {}, risk: {} };
        try {
          baseResult = JSON.parse(out);
        } catch {
          // fallback
        }

        // If GEMINI_API_KEY is available, synthesize executive commentary without altering prices
        let executiveCommentary = '';
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
            executiveCommentary = response.text || '';
          } catch (aiErr: any) {
            console.warn('Gemini advisor call skipped or failed:', aiErr.message);
          }
        }

        baseResult.executive_commentary = executiveCommentary;
        res.json(baseResult);
      });
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
    console.log(`[CostGuard] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
