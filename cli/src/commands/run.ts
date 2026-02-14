import { Command } from 'commander';
import { readFileSync, existsSync, createReadStream } from 'fs';
import { basename, extname, resolve } from 'path';
import chalk from 'chalk';
import {
  isAuthenticated,
  getAuthHeaders,
  getCoordinatorUrl,
} from '../lib/config.js';
import { findHealthyCoordinator } from '../lib/coordinator.js';
import { logger } from '../utils/logger.js';
import { withSpinner, startSpinner, stopSpinner } from '../utils/spinner.js';

interface SubmitJobPayload {
  job_type: string;
  parameters: Record<string, unknown>;
  input_data?: string;
  gpu_tier?: string;
  max_duration_secs?: number;
}

async function streamJobLogs(coordinatorUrl: string, jobId: string, authHeaders: Record<string, string>): Promise<void> {
  const sseUrl = `${coordinatorUrl}/api/v1/jobs/${jobId}/stream`;

  try {
    const response = await fetch(sseUrl, {
      headers: {
        ...authHeaders,
        'Accept': 'text/event-stream',
      },
    });

    if (!response.ok || !response.body) {
      // Fall back to polling
      return pollJobStatus(coordinatorUrl, jobId, authHeaders);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);
            if (event.type === 'log') {
              process.stdout.write(event.message + '\n');
            } else if (event.type === 'status') {
              if (event.status === 'completed') {
                console.log();
                logger.success('Job completed');
                return;
              } else if (event.status === 'failed') {
                console.log();
                logger.error(`Job failed: ${event.error || 'Unknown error'}`);
                process.exit(1);
              }
            } else if (event.type === 'progress') {
              process.stdout.write(`\r${chalk.gray(`[${event.percent}%]`)} ${event.message || ''}`);
            }
          } catch {
            // Non-JSON SSE data, print raw
            if (data.trim()) process.stdout.write(data + '\n');
          }
        }
      }
    }
  } catch {
    // SSE not available, fall back to polling
    return pollJobStatus(coordinatorUrl, jobId, authHeaders);
  }
}

async function pollJobStatus(coordinatorUrl: string, jobId: string, authHeaders: Record<string, string>): Promise<void> {
  const spinner = startSpinner('Waiting for job to complete');

  while (true) {
    try {
      const response = await fetch(`${coordinatorUrl}/api/v1/jobs/${jobId}`, {
        headers: { ...authHeaders, 'Accept': 'application/json' },
      });

      if (!response.ok) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      const job = await response.json() as Record<string, unknown>;
      const status = job.status as string;

      spinner.text = `Job ${jobId.slice(0, 8)}... status: ${status}`;

      if (status === 'completed') {
        stopSpinner(true, 'Job completed');
        if (job.output_data) {
          console.log();
          console.log(job.output_data);
        }
        return;
      }

      if (status === 'failed') {
        stopSpinner(false, `Job failed: ${job.error_message || 'Unknown error'}`);
        process.exit(1);
      }
    } catch {
      // Network error, continue polling
    }

    await new Promise(r => setTimeout(r, 3000));
  }
}

export function createRunCommand(): Command {
  return new Command('run')
    .description('Run a script on remote GPU workers')
    .argument('<script>', 'Path to script file (Python, bash, etc.)')
    .argument('[args...]', 'Arguments to pass to the script')
    .option('--gpu <tier>', 'GPU tier: h100, a100, rtx4090, any', 'any')
    .option('--include <paths...>', 'Additional files/dirs to include')
    .option('--env <vars...>', 'Environment variables (KEY=VALUE)')
    .option('--timeout <secs>', 'Maximum runtime in seconds', '3600')
    .option('--dry-run', 'Show estimated cost without running')
    .option('--no-stream', 'Do not stream logs (poll for result instead)')
    .action(async (script: string, args: string[], options) => {
      try {
        // Check auth
        if (!isAuthenticated()) {
          logger.error('Not authenticated. Run `bitsage login` first.');
          process.exit(1);
        }

        // Resolve script
        const scriptPath = resolve(script);
        if (!existsSync(scriptPath)) {
          logger.error(`Script not found: ${scriptPath}`);
          process.exit(1);
        }

        const scriptContent = readFileSync(scriptPath, 'utf-8');
        const ext = extname(scriptPath).toLowerCase();
        const scriptName = basename(scriptPath);

        // Detect language
        let language = 'bash';
        if (ext === '.py') language = 'python';
        else if (ext === '.js' || ext === '.ts') language = 'node';
        else if (ext === '.sh') language = 'bash';

        // Parse env vars
        const envVars: Record<string, string> = {};
        if (options.env) {
          for (const envVar of options.env) {
            const [key, ...valueParts] = envVar.split('=');
            envVars[key] = valueParts.join('=');
          }
        }

        // Map GPU tier names
        const gpuTierMap: Record<string, string> = {
          'h100': 'Enterprise',
          'h200': 'Enterprise',
          'a100': 'DataCenter',
          'a6000': 'Workstation',
          'l40': 'Workstation',
          'rtx4090': 'Consumer',
          'any': 'Consumer',
        };
        const gpuTier = gpuTierMap[options.gpu.toLowerCase()] || options.gpu;

        // Build include files
        let includeData: string | undefined;
        if (options.include) {
          const files: Record<string, string> = {};
          for (const includePath of options.include) {
            const absPath = resolve(includePath);
            if (existsSync(absPath)) {
              files[basename(absPath)] = readFileSync(absPath, 'utf-8');
            } else {
              logger.warn(`Include file not found: ${includePath}`);
            }
          }
          includeData = Buffer.from(JSON.stringify(files)).toString('base64');
        }

        // Auto-detect requirements.txt
        const reqPath = resolve(scriptPath, '..', 'requirements.txt');
        let requirements: string | undefined;
        if (language === 'python' && existsSync(reqPath)) {
          requirements = readFileSync(reqPath, 'utf-8');
          logger.info(`Detected requirements.txt (${requirements.split('\n').length} packages)`);
        }

        // Build payload
        const payload: SubmitJobPayload = {
          job_type: 'custom',
          parameters: {
            script: scriptContent,
            script_name: scriptName,
            language,
            args,
            env: envVars,
            requirements,
            include_files: includeData,
          },
          gpu_tier: gpuTier,
          max_duration_secs: parseInt(options.timeout),
        };

        // Dry run
        if (options.dryRun) {
          logger.heading('Dry Run');
          logger.table({
            'Script': scriptName,
            'Language': language,
            'GPU Tier': gpuTier,
            'Timeout': `${options.timeout}s`,
            'Env Vars': Object.keys(envVars).length || 'None',
            'Includes': options.include?.length || 0,
          });
          return;
        }

        // Submit job
        const coordinatorUrl = await withSpinner('Finding coordinator', findHealthyCoordinator);
        const authHeaders = getAuthHeaders();

        const submitResponse = await withSpinner('Submitting job', async () => {
          const response = await fetch(`${coordinatorUrl}/api/v1/jobs/submit`, {
            method: 'POST',
            headers: {
              ...authHeaders,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const error = await response.text();
            throw new Error(`Submission failed: ${response.status} - ${error}`);
          }

          return response.json() as Promise<{ job_id: string; estimated_cost_sage?: number }>;
        });

        const jobId = submitResponse.job_id;

        logger.success(`Job submitted: ${jobId}`);
        if (submitResponse.estimated_cost_sage) {
          logger.info(`Estimated cost: ${submitResponse.estimated_cost_sage} SAGE`);
        }

        // Stream logs
        console.log();
        logger.heading('Output');
        await streamJobLogs(coordinatorUrl, jobId, authHeaders);

      } catch (error) {
        logger.error(`Run failed: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
}

export default createRunCommand;
