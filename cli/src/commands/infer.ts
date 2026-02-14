import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import {
  isAuthenticated,
  getAuthHeaders,
} from '../lib/config.js';
import { findHealthyCoordinator } from '../lib/coordinator.js';
import { logger } from '../utils/logger.js';
import { withSpinner, startSpinner, stopSpinner } from '../utils/spinner.js';

export function createInferCommand(): Command {
  return new Command('infer')
    .description('Run inference on a model')
    .option('--model <name>', 'Model name (e.g., qwen-14b, llama-3.1-8b)')
    .option('--input <text>', 'Input text / prompt')
    .option('--input-file <path>', 'Input from a file (text or JSONL)')
    .option('--system <prompt>', 'System prompt')
    .option('--max-tokens <n>', 'Maximum output tokens', '512')
    .option('--temperature <t>', 'Sampling temperature', '0.7')
    .option('--stream', 'Stream output tokens as they arrive')
    .option('--json', 'Output raw JSON response')
    .option('--gpu <tier>', 'GPU tier preference', 'any')
    .action(async (options) => {
      try {
        if (!isAuthenticated()) {
          logger.error('Not authenticated. Run `bitsage login` first.');
          process.exit(1);
        }

        if (!options.model) {
          logger.error('--model is required. Example: bitsage infer --model qwen-14b --input "Hello"');
          process.exit(1);
        }

        // Get input
        let inputText: string;
        if (options.input) {
          inputText = options.input;
        } else if (options.inputFile) {
          const filePath = resolve(options.inputFile);
          if (!existsSync(filePath)) {
            logger.error(`Input file not found: ${filePath}`);
            process.exit(1);
          }
          inputText = readFileSync(filePath, 'utf-8');
        } else {
          // Try reading from stdin if piped
          if (!process.stdin.isTTY) {
            const chunks: Buffer[] = [];
            for await (const chunk of process.stdin) {
              chunks.push(chunk);
            }
            inputText = Buffer.concat(chunks).toString('utf-8');
          } else {
            logger.error('--input or --input-file is required (or pipe via stdin)');
            process.exit(1);
          }
        }

        const coordinatorUrl = await findHealthyCoordinator();
        const authHeaders = getAuthHeaders();

        const payload = {
          job_type: 'ai_inference',
          parameters: {
            task: 'inference',
            model: options.model,
            input: inputText,
            system_prompt: options.system,
            max_tokens: parseInt(options.maxTokens),
            temperature: parseFloat(options.temperature),
            stream: options.stream || false,
          },
          gpu_tier: options.gpu === 'any' ? 'Consumer' : options.gpu,
          max_duration_secs: 120,
        };

        // For streaming, use SSE
        if (options.stream) {
          const response = await fetch(`${coordinatorUrl}/api/v1/inference/stream`, {
            method: 'POST',
            headers: {
              ...authHeaders,
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream',
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const error = await response.text();
            logger.error(`Inference failed: ${error}`);
            process.exit(1);
          }

          if (response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const text = decoder.decode(value, { stream: true });
              for (const line of text.split('\n')) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]') {
                    console.log();
                    break;
                  }
                  try {
                    const parsed = JSON.parse(data);
                    if (parsed.token) {
                      process.stdout.write(parsed.token);
                    }
                  } catch {
                    process.stdout.write(data);
                  }
                }
              }
            }
          }
          return;
        }

        // Non-streaming: submit and poll
        const result = await withSpinner('Running inference', async () => {
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

          const { job_id } = await response.json() as { job_id: string };

          // Poll for result
          const maxWait = 120_000; // 2 minutes
          const start = Date.now();

          while (Date.now() - start < maxWait) {
            await new Promise(r => setTimeout(r, 1000));

            const statusResponse = await fetch(`${coordinatorUrl}/api/v1/jobs/${job_id}`, {
              headers: { ...authHeaders, 'Accept': 'application/json' },
            });

            if (!statusResponse.ok) continue;

            const job = await statusResponse.json() as Record<string, unknown>;

            if (job.status === 'completed') {
              // Fetch result
              const resultResponse = await fetch(`${coordinatorUrl}/api/v1/jobs/${job_id}/result`, {
                headers: { ...authHeaders, 'Accept': 'application/json' },
              });
              if (resultResponse.ok) {
                return resultResponse.json();
              }
              return job;
            }

            if (job.status === 'failed') {
              throw new Error(job.error_message as string || 'Inference failed');
            }
          }

          throw new Error('Inference timed out');
        });

        // Output
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const output = (result as Record<string, unknown>).output_data
            || (result as Record<string, unknown>).output
            || (result as Record<string, unknown>).result
            || JSON.stringify(result);
          console.log(output);
        }

      } catch (error) {
        logger.error(`Inference failed: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
}

export default createInferCommand;
