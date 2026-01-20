import { Command } from 'commander';
import chalk from 'chalk';
import {
  getConfig,
  isConfigured,
  isWalletConfigured,
} from '../lib/config.js';
import {
  findHealthyCoordinator,
  checkHealth,
  getNetworkStats,
  getWorkerStatus,
  getWorkerEarnings,
  getJobs,
} from '../lib/coordinator.js';
import { getBalance, formatSage, getProvider } from '../lib/starknet.js';
import { getContractAddress } from '../lib/contracts.js';
import { logger } from '../utils/logger.js';
import { withSpinner } from '../utils/spinner.js';

export function createStatusCommand(): Command {
  return new Command('status')
    .description('Show overall status')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const config = getConfig();
        const status: Record<string, unknown> = {};

        // Configuration status
        logger.heading('Configuration');
        logger.table({
          'Network': config.network.name,
          'Coordinator': config.network.coordinator_url || '(not set)',
          'Wallet': config.wallet.address
            ? `${config.wallet.address.slice(0, 10)}...${config.wallet.address.slice(-8)}`
            : '(not configured)',
          'Worker ID': config.worker.id || '(not registered)',
        });

        if (!isConfigured()) {
          console.log();
          logger.warn('BitSage is not fully configured.');
          logger.info('Run `bitsage init` to set up your node.');
          return;
        }

        // Wallet balance
        if (isWalletConfigured()) {
          console.log();
          logger.heading('Wallet Balance');

          try {
            const sageToken = getContractAddress('sage_token');
            let sageBalance = 0n;
            let ethBalance = 0n;

            if (sageToken && sageToken !== '0x0') {
              sageBalance = await getBalance(config.wallet.address, sageToken);
            }

            const provider = getProvider();
            try {
              const result = await provider.getBalance(config.wallet.address);
              ethBalance = BigInt(result);
            } catch {}

            logger.table({
              'SAGE': formatSage(sageBalance),
              'ETH': formatSage(ethBalance) + ' (for gas)',
            });

            status.wallet = {
              address: config.wallet.address,
              sage_balance: formatSage(sageBalance),
              eth_balance: formatSage(ethBalance),
            };
          } catch (error) {
            logger.warn('Could not fetch wallet balance');
          }
        }

        // Coordinator health
        console.log();
        logger.heading('Network Status');

        try {
          const coordinatorUrl = await findHealthyCoordinator();
          const health = await checkHealth(coordinatorUrl);

          logger.table({
            'Coordinator': chalk.green('ONLINE'),
            'Version': health.version,
            'Workers Online': health.workers_online,
            'Pending Jobs': health.jobs_pending,
          });

          status.coordinator = {
            url: coordinatorUrl,
            status: health.status,
            version: health.version,
            workers_online: health.workers_online,
            jobs_pending: health.jobs_pending,
          };
        } catch (error) {
          logger.table({
            'Coordinator': chalk.red('OFFLINE'),
          });
          status.coordinator = { status: 'offline' };
        }

        // Network stats
        try {
          const networkStats = await getNetworkStats();

          console.log();
          logger.heading('Network Statistics');
          logger.table({
            'Total Workers': networkStats.total_workers,
            'Online Workers': networkStats.online_workers,
            'Total Jobs': networkStats.total_jobs,
            'Completed Jobs': networkStats.completed_jobs,
            'Total Proofs': networkStats.total_proofs_generated,
            'Avg Proof Time': `${networkStats.average_proof_time_ms}ms`,
          });

          status.network = networkStats;
        } catch {
          // Network stats not available
        }

        // Worker status (if registered)
        if (config.worker.id) {
          try {
            const workerStatus = await getWorkerStatus(config.worker.id);

            console.log();
            logger.heading('Your Worker');
            logger.table({
              'Status': workerStatus.status === 'online'
                ? chalk.green('ONLINE')
                : chalk.yellow(workerStatus.status.toUpperCase()),
              'Jobs Completed': workerStatus.jobs_completed,
              'Jobs In Progress': workerStatus.jobs_in_progress,
              'Total Earnings': `${workerStatus.total_earnings_sage} SAGE`,
            });

            status.worker = workerStatus;
          } catch {
            logger.info('Worker not found on network');
          }
        }

        // Output JSON if requested
        if (options.json) {
          console.log();
          console.log(JSON.stringify(status, null, 2));
        }
      } catch (error) {
        logger.error(`Failed to get status: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
}

export function createHealthCommand(): Command {
  return new Command('health')
    .description('Check system health')
    .action(async () => {
      try {
        const checks: { name: string; status: 'ok' | 'warn' | 'error'; message: string }[] = [];

        // Check configuration
        if (isConfigured()) {
          checks.push({ name: 'Configuration', status: 'ok', message: 'Configured' });
        } else {
          checks.push({ name: 'Configuration', status: 'warn', message: 'Run `bitsage init`' });
        }

        // Check wallet
        if (isWalletConfigured()) {
          checks.push({ name: 'Wallet', status: 'ok', message: 'Configured' });
        } else {
          checks.push({ name: 'Wallet', status: 'warn', message: 'Not configured' });
        }

        // Check coordinator
        try {
          const url = await findHealthyCoordinator();
          const health = await checkHealth(url);
          checks.push({
            name: 'Coordinator',
            status: health.status === 'ok' ? 'ok' : 'warn',
            message: `${health.status} (${health.workers_online} workers)`,
          });
        } catch {
          checks.push({ name: 'Coordinator', status: 'error', message: 'Unreachable' });
        }

        // Check Starknet RPC
        try {
          const provider = getProvider();
          await provider.getBlockNumber();
          checks.push({ name: 'Starknet RPC', status: 'ok', message: 'Connected' });
        } catch {
          checks.push({ name: 'Starknet RPC', status: 'error', message: 'Unreachable' });
        }

        // Display results
        logger.heading('Health Check');
        for (const check of checks) {
          const statusIcon =
            check.status === 'ok'
              ? chalk.green('[OK]')
              : check.status === 'warn'
              ? chalk.yellow('[WARN]')
              : chalk.red('[ERROR]');
          console.log(`${statusIcon} ${check.name.padEnd(20)} ${check.message}`);
        }

        // Exit with error if any checks failed
        if (checks.some(c => c.status === 'error')) {
          process.exit(1);
        }
      } catch (error) {
        logger.error(`Health check failed: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
}

export function createEarningsCommand(): Command {
  return new Command('earnings')
    .description('View your earnings')
    .option('--period <period>', 'Time period: day, week, month, all', 'all')
    .action(async (options) => {
      try {
        const config = getConfig();

        if (!config.worker.id) {
          logger.error('Worker not registered. Run `bitsage worker register` first.');
          process.exit(1);
        }

        if (!isWalletConfigured()) {
          logger.error('No wallet configured');
          process.exit(1);
        }

        const earnings = await withSpinner('Fetching earnings', () =>
          getWorkerEarnings(config.worker.id, config.wallet.address)
        );

        logger.heading('Earnings Summary');
        logger.table({
          'Total Earned': `${earnings.total_earned_sage} SAGE`,
          'Pending': `${earnings.pending_sage} SAGE`,
          'Claimed': `${earnings.claimed_sage} SAGE`,
          'Jobs Completed': earnings.jobs_completed,
          'Average Reward': `${earnings.average_reward_sage} SAGE per job`,
        });
      } catch (error) {
        logger.error(`Failed to fetch earnings: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
}

export function createJobsCommand(): Command {
  return new Command('jobs')
    .description('List recent jobs')
    .option('--status <status>', 'Filter by status: pending, assigned, processing, completed, failed')
    .option('--limit <n>', 'Number of jobs to show', '10')
    .action(async (options) => {
      try {
        const jobs = await withSpinner('Fetching jobs', () =>
          getJobs({
            status: options.status,
            limit: parseInt(options.limit),
          })
        );

        if (jobs.length === 0) {
          logger.info('No jobs found');
          return;
        }

        logger.heading(`Recent Jobs (${jobs.length})`);

        for (const job of jobs) {
          const statusColor =
            job.status === 'completed'
              ? chalk.green
              : job.status === 'failed'
              ? chalk.red
              : job.status === 'processing'
              ? chalk.blue
              : chalk.yellow;

          console.log(
            `${job.job_id.slice(0, 8)}... ${statusColor(job.status.padEnd(12))} ${
              job.reward_sage ? `${job.reward_sage} SAGE` : ''
            }`
          );
        }
      } catch (error) {
        logger.error(`Failed to fetch jobs: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
}

export default createStatusCommand;
