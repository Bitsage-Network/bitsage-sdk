import { Command } from 'commander';
import { spawn, ChildProcess, execSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import {
  getConfig,
  setWorkerId,
  getConfigDir,
  isWalletConfigured,
} from '../lib/config.js';
import { ensureBinary, getBinaryPath, binaryExists, updateBinary } from '../lib/download.js';
import {
  registerWorker,
  getWorkerStatus,
  getWorkerEarnings,
  findHealthyCoordinator,
} from '../lib/coordinator.js';
import { logger } from '../utils/logger.js';
import { confirm, input } from '../utils/prompts.js';
import { withSpinner, startSpinner, stopSpinner } from '../utils/spinner.js';
import { randomBytes } from 'crypto';

const PID_FILE = join(getConfigDir(), 'worker.pid');
const LOG_FILE = join(getConfigDir(), 'worker.log');

interface WorkerCapabilities {
  gpu_count: number;
  gpu_memory_gb: number;
  gpu_model: string;
  gpu_tier: string;
  tee_type: string;
  cpu_cores: number;
  ram_gb: number;
  max_concurrent_jobs: number;
}

async function detectCapabilities(): Promise<WorkerCapabilities> {
  const capabilities: WorkerCapabilities = {
    gpu_count: 0,
    gpu_memory_gb: 0,
    gpu_model: 'none',
    gpu_tier: 'Consumer',
    tee_type: 'None',
    cpu_cores: 1,
    ram_gb: 1,
    max_concurrent_jobs: 1,
  };

  try {
    // Detect CPU
    const os = await import('os');
    capabilities.cpu_cores = os.cpus().length;
    capabilities.ram_gb = Math.floor(os.totalmem() / (1024 * 1024 * 1024));

    // Detect GPU
    const output = execSync(
      'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader',
      { encoding: 'utf-8', timeout: 5000 }
    );

    const lines = output.trim().split('\n');
    if (lines.length > 0 && lines[0]) {
      const [name, memoryStr] = lines[0].split(', ').map(s => s.trim());
      capabilities.gpu_count = lines.length;
      capabilities.gpu_memory_gb = Math.round(
        parseInt(memoryStr.replace(/[^0-9]/g, '')) / 1024
      );
      capabilities.gpu_model = name;

      // Determine tier
      if (/B300|B200|H200|H100/i.test(name)) {
        capabilities.gpu_tier = 'Enterprise';
      } else if (/A100/i.test(name)) {
        capabilities.gpu_tier = 'DataCenter';
      } else if (/A6000|L40|L4/i.test(name)) {
        capabilities.gpu_tier = 'Workstation';
      } else if (/MI300/i.test(name) || capabilities.gpu_count > 1) {
        capabilities.gpu_tier = 'Frontier';
      }

      capabilities.max_concurrent_jobs = capabilities.gpu_count * 2;
    }

    // Detect TEE
    try {
      const dmesg = execSync('dmesg 2>/dev/null | grep -i "tdx\\|sgx" || true', {
        encoding: 'utf-8',
        timeout: 5000,
      });
      if (dmesg.includes('tdx') || dmesg.includes('TDX')) {
        capabilities.tee_type = 'Full';
      } else if (dmesg.includes('sgx') || dmesg.includes('SGX')) {
        capabilities.tee_type = 'CpuOnly';
      }
    } catch {
      // TEE detection failed, assume none
    }
  } catch {
    // GPU detection failed
  }

  return capabilities;
}

function isWorkerRunning(): boolean {
  if (!existsSync(PID_FILE)) return false;

  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim());
    process.kill(pid, 0);
    return true;
  } catch {
    // Process not running, clean up PID file
    try {
      unlinkSync(PID_FILE);
    } catch {}
    return false;
  }
}

function getWorkerPid(): number | null {
  if (!existsSync(PID_FILE)) return null;
  try {
    return parseInt(readFileSync(PID_FILE, 'utf-8').trim());
  } catch {
    return null;
  }
}

export function createWorkerCommand(): Command {
  const worker = new Command('worker').description('Worker node management');

  // Register worker on-chain
  worker
    .command('register')
    .description('Register as a worker on the BitSage network')
    .action(async () => {
      try {
        const config = getConfig();

        if (!isWalletConfigured()) {
          logger.error('No wallet configured. Run `bitsage wallet create` first.');
          process.exit(1);
        }

        // Detect capabilities
        const capabilities = await withSpinner('Detecting hardware capabilities', detectCapabilities);

        logger.heading('Worker Registration');
        logger.table({
          'GPU': capabilities.gpu_count > 0
            ? `${capabilities.gpu_model} (${capabilities.gpu_memory_gb}GB) x ${capabilities.gpu_count}`
            : 'None',
          'GPU Tier': capabilities.gpu_tier,
          'TEE': capabilities.tee_type,
          'CPU': `${capabilities.cpu_cores} cores`,
          'RAM': `${capabilities.ram_gb} GB`,
        });

        const proceed = await confirm('Register with these capabilities?', true);
        if (!proceed) {
          logger.info('Cancelled.');
          return;
        }

        // Generate worker ID if not set
        let workerId = config.worker.id;
        if (!workerId) {
          workerId = `worker-${randomBytes(4).toString('hex')}`;
          setWorkerId(workerId);
        }

        // Register with coordinator
        const result = await withSpinner('Registering worker', () =>
          registerWorker({
            worker_id: workerId,
            wallet_address: config.wallet.address,
            capabilities,
          })
        );

        if (result.success) {
          logger.success(`Worker registered: ${result.worker_id}`);
          logger.info('Run `bitsage worker start` to begin processing jobs');
        } else {
          logger.error(`Registration failed: ${result.message}`);
          process.exit(1);
        }
      } catch (error) {
        logger.error(`Failed to register: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  // Start worker
  worker
    .command('start')
    .description('Start the worker node')
    .option('--foreground', 'Run in foreground instead of background')
    .option('--update', 'Check for and download updates before starting')
    .action(async (options) => {
      try {
        const config = getConfig();

        if (isWorkerRunning()) {
          logger.warn('Worker is already running');
          const pid = getWorkerPid();
          logger.info(`PID: ${pid}`);
          return;
        }

        if (!config.worker.id) {
          logger.error('Worker not registered. Run `bitsage worker register` first.');
          process.exit(1);
        }

        if (!isWalletConfigured()) {
          logger.error('No wallet configured. Run `bitsage wallet create` first.');
          process.exit(1);
        }

        // Ensure binary exists
        if (options.update || !binaryExists('worker')) {
          await withSpinner('Checking for worker binary', () =>
            options.update ? updateBinary('worker') : ensureBinary('worker')
          );
        }

        const binaryPath = getBinaryPath('worker');

        if (!existsSync(binaryPath)) {
          logger.error('Worker binary not found. Run with --update to download.');
          process.exit(1);
        }

        // Find coordinator
        const coordinatorUrl = await withSpinner(
          'Finding healthy coordinator',
          findHealthyCoordinator
        );

        logger.info(`Starting worker ${config.worker.id}...`);
        logger.info(`Coordinator: ${coordinatorUrl}`);

        const args = [
          '--id', config.worker.id,
          '--coordinator', coordinatorUrl,
          '--wallet', config.wallet.address,
          '--port', config.worker.listen_port.toString(),
        ];

        if (config.worker.gpu_enabled) {
          args.push('--enable-gpu');
        }

        if (options.foreground) {
          // Run in foreground
          logger.info('Running in foreground. Press Ctrl+C to stop.');
          console.log();

          const proc = spawn(binaryPath, args, {
            stdio: 'inherit',
            env: {
              ...process.env,
              RUST_LOG: process.env.RUST_LOG || 'info',
              COORDINATOR_URL: coordinatorUrl,
              WALLET_ADDRESS: config.wallet.address,
            },
          });

          proc.on('exit', (code) => {
            logger.info(`Worker exited with code ${code}`);
          });

          // Handle Ctrl+C
          process.on('SIGINT', () => {
            logger.info('Stopping worker...');
            proc.kill('SIGINT');
          });
        } else {
          // Run in background
          const logStream = require('fs').openSync(LOG_FILE, 'a');

          const proc = spawn(binaryPath, args, {
            detached: true,
            stdio: ['ignore', logStream, logStream],
            env: {
              ...process.env,
              RUST_LOG: process.env.RUST_LOG || 'info',
              COORDINATOR_URL: coordinatorUrl,
              WALLET_ADDRESS: config.wallet.address,
            },
          });

          // Save PID
          writeFileSync(PID_FILE, proc.pid!.toString());

          proc.unref();

          logger.success(`Worker started in background`);
          logger.table({
            'PID': proc.pid,
            'Logs': LOG_FILE,
            'Worker ID': config.worker.id,
          });

          console.log();
          logger.info('Use `bitsage worker status` to check status');
          logger.info('Use `bitsage worker stop` to stop the worker');
          logger.info('Use `bitsage worker logs` to view logs');
        }
      } catch (error) {
        logger.error(`Failed to start worker: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  // Stop worker
  worker
    .command('stop')
    .description('Stop the worker node')
    .action(async () => {
      try {
        const pid = getWorkerPid();

        if (!pid) {
          logger.warn('Worker is not running');
          return;
        }

        startSpinner('Stopping worker');

        try {
          process.kill(pid, 'SIGTERM');

          // Wait for process to exit
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 100));
            try {
              process.kill(pid, 0);
            } catch {
              // Process has exited
              break;
            }
          }

          // Force kill if still running
          try {
            process.kill(pid, 'SIGKILL');
          } catch {}

        } catch (error) {
          // Process already dead
        }

        // Clean up PID file
        try {
          unlinkSync(PID_FILE);
        } catch {}

        stopSpinner(true, 'Worker stopped');
      } catch (error) {
        stopSpinner(false);
        logger.error(`Failed to stop worker: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  // Worker status
  worker
    .command('status')
    .description('Check worker status')
    .action(async () => {
      try {
        const config = getConfig();

        // Check local process
        const running = isWorkerRunning();
        const pid = getWorkerPid();

        console.log();
        logger.heading('Worker Status');

        logger.table({
          'Worker ID': config.worker.id || '(not registered)',
          'Local Status': running ? chalk.green('RUNNING') : chalk.red('STOPPED'),
          'PID': pid || '-',
          'Log File': LOG_FILE,
        });

        // Check coordinator status
        if (config.worker.id) {
          try {
            const status = await withSpinner('Fetching network status', () =>
              getWorkerStatus(config.worker.id)
            );

            console.log();
            logger.heading('Network Status');
            logger.table({
              'Status': status.status === 'online' ? chalk.green(status.status) : chalk.yellow(status.status),
              'Jobs Completed': status.jobs_completed,
              'Jobs In Progress': status.jobs_in_progress,
              'Total Earnings': `${status.total_earnings_sage} SAGE`,
              'Uptime': `${Math.floor(status.uptime_seconds / 3600)}h ${Math.floor((status.uptime_seconds % 3600) / 60)}m`,
            });
          } catch (error) {
            logger.debug(`Could not fetch network status: ${error}`);
          }
        }
      } catch (error) {
        logger.error(`Failed to get status: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  // Worker logs
  worker
    .command('logs')
    .description('View worker logs')
    .option('-f, --follow', 'Follow log output')
    .option('-n, --lines <number>', 'Number of lines to show', '50')
    .action(async (options) => {
      try {
        if (!existsSync(LOG_FILE)) {
          logger.info('No log file found. Worker may not have been started yet.');
          return;
        }

        if (options.follow) {
          // Use tail -f
          const tail = spawn('tail', ['-f', LOG_FILE], {
            stdio: 'inherit',
          });

          process.on('SIGINT', () => {
            tail.kill();
          });

          await new Promise<void>((resolve) => {
            tail.on('exit', resolve);
          });
        } else {
          // Show last N lines
          const content = readFileSync(LOG_FILE, 'utf-8');
          const lines = content.split('\n');
          const lastLines = lines.slice(-parseInt(options.lines));
          console.log(lastLines.join('\n'));
        }
      } catch (error) {
        logger.error(`Failed to read logs: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  return worker;
}

export default createWorkerCommand;
