import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { resolve, basename } from 'path';
import chalk from 'chalk';
import {
  isAuthenticated,
  getAuthHeaders,
} from '../lib/config.js';
import { findHealthyCoordinator } from '../lib/coordinator.js';
import { logger } from '../utils/logger.js';
import { withSpinner, startSpinner, stopSpinner } from '../utils/spinner.js';

// Well-known model registry
const MODEL_REGISTRY: Record<string, { hf_id: string; default_gpu: string }> = {
  'llama-3.1-8b':   { hf_id: 'meta-llama/Llama-3.1-8B', default_gpu: 'Enterprise' },
  'llama-3.1-70b':  { hf_id: 'meta-llama/Llama-3.1-70B', default_gpu: 'Enterprise' },
  'qwen-14b':       { hf_id: 'Qwen/Qwen2.5-14B', default_gpu: 'Enterprise' },
  'qwen-7b':        { hf_id: 'Qwen/Qwen2.5-7B', default_gpu: 'DataCenter' },
  'mistral-7b':     { hf_id: 'mistralai/Mistral-7B-v0.3', default_gpu: 'DataCenter' },
  'phi-3-mini':     { hf_id: 'microsoft/Phi-3-mini-4k-instruct', default_gpu: 'Consumer' },
  'gemma-2b':       { hf_id: 'google/gemma-2b', default_gpu: 'Consumer' },
};

export function createTrainCommand(): Command {
  return new Command('train')
    .description('Submit a training job on remote GPU workers')
    .option('--model <name>', 'Model name or HuggingFace ID (e.g., llama-3.1-8b)')
    .option('--dataset <path>', 'Dataset: local file path, S3 URL, or HuggingFace dataset')
    .option('--epochs <n>', 'Number of training epochs', '3')
    .option('--batch-size <n>', 'Batch size per GPU', '4')
    .option('--lr <rate>', 'Learning rate', '2e-5')
    .option('--gpu <tier>', 'GPU tier: h100, a100, any', 'any')
    .option('--method <type>', 'Training method: full, lora, qlora', 'lora')
    .option('--output <path>', 'Local path to download results')
    .option('--dry-run', 'Show estimated cost and configuration')
    .action(async (options) => {
      try {
        if (!isAuthenticated()) {
          logger.error('Not authenticated. Run `bitsage login` first.');
          process.exit(1);
        }

        if (!options.model) {
          logger.error('--model is required. Example: bitsage train --model llama-3.1-8b --dataset ./data/');
          console.log();
          logger.heading('Available Models');
          for (const [name, info] of Object.entries(MODEL_REGISTRY)) {
            console.log(`  ${chalk.cyan(name.padEnd(20))} ${chalk.gray(info.hf_id)}`);
          }
          console.log();
          logger.info('Or use any HuggingFace model ID: --model org/model-name');
          process.exit(1);
        }

        // Resolve model
        const registryEntry = MODEL_REGISTRY[options.model.toLowerCase()];
        const modelId = registryEntry?.hf_id || options.model;

        // Resolve GPU tier
        const gpuTierMap: Record<string, string> = {
          'h100': 'Enterprise', 'h200': 'Enterprise',
          'a100': 'DataCenter',
          'rtx4090': 'Consumer',
          'any': registryEntry?.default_gpu || 'DataCenter',
        };
        const gpuTier = gpuTierMap[options.gpu.toLowerCase()] || options.gpu;

        // Handle dataset
        let datasetPayload: { type: string; value: string } | undefined;

        if (options.dataset) {
          const dsPath = options.dataset;

          if (dsPath.startsWith('s3://') || dsPath.startsWith('https://')) {
            datasetPayload = { type: 'url', value: dsPath };
          } else if (dsPath.startsWith('hf://') || dsPath.includes('/') && !existsSync(dsPath)) {
            datasetPayload = { type: 'huggingface', value: dsPath.replace('hf://', '') };
          } else {
            // Local file
            const absPath = resolve(dsPath);
            if (!existsSync(absPath)) {
              logger.error(`Dataset not found: ${absPath}`);
              process.exit(1);
            }

            const content = readFileSync(absPath);
            const sizeMB = content.byteLength / (1024 * 1024);

            if (sizeMB > 100) {
              logger.error(`Dataset too large for direct upload (${sizeMB.toFixed(1)}MB). Use S3 or HuggingFace URL instead.`);
              process.exit(1);
            }

            logger.info(`Uploading dataset: ${basename(absPath)} (${sizeMB.toFixed(1)}MB)`);
            datasetPayload = {
              type: 'inline',
              value: content.toString('base64'),
            };
          }
        }

        // Build training config
        const trainingConfig = {
          model_id: modelId,
          method: options.method,
          epochs: parseInt(options.epochs),
          batch_size: parseInt(options.batchSize),
          learning_rate: parseFloat(options.lr),
          dataset: datasetPayload,
        };

        // Dry run
        if (options.dryRun) {
          logger.heading('Training Configuration');
          logger.table({
            'Model': `${options.model} (${modelId})`,
            'Method': options.method.toUpperCase(),
            'Epochs': options.epochs,
            'Batch Size': options.batchSize,
            'Learning Rate': options.lr,
            'GPU Tier': gpuTier,
            'Dataset': options.dataset || '(none)',
          });
          return;
        }

        // Submit job
        const coordinatorUrl = await withSpinner('Finding coordinator', findHealthyCoordinator);
        const authHeaders = getAuthHeaders();

        const payload = {
          job_type: 'ai_inference',
          parameters: {
            task: 'train',
            ...trainingConfig,
          },
          gpu_tier: gpuTier,
          max_duration_secs: 86400, // 24 hours for training
        };

        const submitResponse = await withSpinner('Submitting training job', async () => {
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

          return response.json() as Promise<{ job_id: string; estimated_cost_sage?: number; estimated_completion_secs?: number }>;
        });

        const jobId = submitResponse.job_id;

        logger.box('Training Job Submitted', [
          `Job ID: ${jobId}`,
          `Model: ${modelId}`,
          `Method: ${options.method.toUpperCase()}`,
          ...(submitResponse.estimated_cost_sage
            ? [`Estimated cost: ${submitResponse.estimated_cost_sage} SAGE`]
            : []),
          ...(submitResponse.estimated_completion_secs
            ? [`ETA: ${Math.round(submitResponse.estimated_completion_secs / 60)} minutes`]
            : []),
        ]);

        console.log();
        logger.info('Monitor progress:');
        logger.list([
          `bitsage logs ${jobId}`,
          `bitsage connect ${jobId}`,
          `bitsage jobs --status processing`,
        ]);

        if (options.output) {
          console.log();
          logger.info(`Results will be downloaded to: ${options.output}`);
          logger.info(`Run \`bitsage download ${jobId}\` when complete`);
        }

      } catch (error) {
        logger.error(`Training failed: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
}

export default createTrainCommand;
