import { Command } from 'commander';
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, mkdtempSync, rmdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import chalk from 'chalk';
import {
  isAuthenticated,
  getAuthHeaders,
  getCoordinatorUrl,
} from '../lib/config.js';
import { logger } from '../utils/logger.js';
import { withSpinner } from '../utils/spinner.js';

interface WorkerSSHInfo {
  worker_id: string;
  worker_name: string;
  host: string;
  port: number;
  user: string;
  ssh_private_key: string;
  gpu_model: string;
  gpu_memory_gb: number;
  model_loaded?: string;
  prover_version?: string;
}

interface WorkerListEntry {
  worker_id: string;
  worker_name: string;
  status: string;
  gpu_model: string;
  gpu_memory_gb: number;
  region?: string;
}

export function createShellCommand(): Command {
  return new Command('shell')
    .description('SSH into a GPU worker (like brev shell)')
    .argument('[worker]', 'Worker name or ID (default: your assigned worker)')
    .option('--list', 'List available workers')
    .option('--identity <path>', 'Use your own SSH key instead of provisioned one')
    .option('--port <port>', 'Override SSH port')
    .option('--user <user>', 'Override SSH user')
    .action(async (worker: string | undefined, options) => {
      try {
        if (!isAuthenticated()) {
          console.log();
          logger.error('Not authenticated. Run `bitsage login` first.');
          console.log();
          console.log(chalk.gray('  Quick start:'));
          console.log(chalk.cyan('    bitsage login'));
          console.log(chalk.cyan('    bitsage shell'));
          console.log();
          process.exit(1);
        }

        const coordinatorUrl = getCoordinatorUrl();
        const authHeaders = getAuthHeaders();

        // SSH gateway is routed through the same domain via ALB path rules
        // Override with BITSAGE_SSH_GATEWAY_URL for local dev
        const gatewayUrl = process.env.BITSAGE_SSH_GATEWAY_URL || coordinatorUrl;

        // List mode
        if (options.list) {
          return await listWorkers(gatewayUrl, authHeaders);
        }

        // Get SSH connection details from gateway
        const sshInfo = await withSpinner(
          `${chalk.cyan('⣾')} Connecting to worker`,
          async () => {
            const endpoint = worker
              ? `${gatewayUrl}/api/v1/workers/ssh?worker=${encodeURIComponent(worker)}`
              : `${gatewayUrl}/api/v1/workers/ssh`;

            const response = await fetch(endpoint, {
              headers: {
                ...authHeaders,
                'Accept': 'application/json',
              },
            });

            if (!response.ok) {
              if (response.status === 404) {
                throw new Error(
                  worker
                    ? `Worker "${worker}" not found. Run \`bitsage shell --list\` to see available workers.`
                    : 'No workers available. Check your account or try again later.'
                );
              }
              if (response.status === 403) {
                throw new Error('Access denied. Your account may not have GPU access.');
              }
              const body = await response.text().catch(() => '');
              throw new Error(`Failed to get SSH details: ${response.status} ${body}`);
            }

            return response.json() as Promise<WorkerSSHInfo>;
          }
        );

        // Print connection banner
        console.log();
        console.log(
          chalk.cyan('  Connecting to ') +
          chalk.bold.white(sshInfo.worker_name || sshInfo.worker_id.slice(0, 8)) +
          chalk.gray(` (${sshInfo.host})`)
        );
        console.log(
          chalk.gray('  GPU: ') +
          chalk.white(`${sshInfo.gpu_model} (${sshInfo.gpu_memory_gb} GB)`) +
          (sshInfo.model_loaded ? chalk.gray(` • Model: ${sshInfo.model_loaded}`) : '')
        );
        console.log();

        // Spawn SSH
        const sshArgs = buildSSHArgs(sshInfo, options);
        let tempKeyPath: string | null = null;
        let tempDir: string | null = null;

        // Clean up temp key + directory (called from all exit paths)
        const cleanupTempKey = () => {
          if (tempKeyPath) {
            try { unlinkSync(tempKeyPath); } catch {}
            tempKeyPath = null;
          }
          if (tempDir) {
            try { rmdirSync(tempDir); } catch {}
            tempDir = null;
          }
        };

        // If coordinator provisioned a key, write it to a temp file
        if (!options.identity && sshInfo.ssh_private_key) {
          tempDir = mkdtempSync(join(tmpdir(), 'bitsage-'));
          tempKeyPath = join(tempDir, 'key');
          writeFileSync(tempKeyPath, sshInfo.ssh_private_key + '\n', { mode: 0o600 });
          sshArgs.unshift('-i', tempKeyPath);
        } else if (options.identity) {
          sshArgs.unshift('-i', options.identity);
        }

        // Spawn interactive SSH session
        const ssh = spawn('ssh', sshArgs, {
          stdio: 'inherit',
          env: { ...process.env },
        });

        ssh.on('close', (code) => {
          cleanupTempKey();

          if (code !== 0 && code !== null) {
            // Don't show error for normal disconnects (130 = Ctrl+C)
            if (code !== 130 && code !== 255) {
              logger.error(`SSH exited with code ${code}`);
            }
          }

          console.log();
          console.log(chalk.gray('  Connection to ') + chalk.white(sshInfo.worker_name || sshInfo.host) + chalk.gray(' closed.'));
          console.log();

          process.exit(code || 0);
        });

        ssh.on('error', (err) => {
          cleanupTempKey();

          if (err.message.includes('ENOENT')) {
            logger.error('SSH client not found. Please install OpenSSH.');
          } else {
            logger.error(`SSH error: ${err.message}`);
          }
          process.exit(1);
        });

        // Forward SIGINT/SIGTERM to SSH process and clean up
        process.on('SIGINT', () => { ssh.kill('SIGINT'); });
        process.on('SIGTERM', () => { ssh.kill('SIGTERM'); cleanupTempKey(); });
        process.on('exit', () => cleanupTempKey());

      } catch (error) {
        logger.error(`Shell failed: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
}

function buildSSHArgs(sshInfo: WorkerSSHInfo, options: { port?: string; user?: string }): string[] {
  const user = options.user || sshInfo.user;
  const port = options.port || String(sshInfo.port || 22);

  return [
    '-t',                              // Force TTY allocation
    '-o', 'StrictHostKeyChecking=no',  // Don't prompt for host key (workers are ephemeral)
    '-o', 'UserKnownHostsFile=/dev/null',
    '-o', 'LogLevel=ERROR',           // Suppress warnings about known_hosts
    '-o', 'ServerAliveInterval=30',    // Keep connection alive
    '-o', 'ServerAliveCountMax=3',
    '-p', port,
    `${user}@${sshInfo.host}`,
  ];
}

async function listWorkers(
  coordinatorUrl: string,
  authHeaders: Record<string, string>,
): Promise<void> {
  const workers = await withSpinner('Fetching workers', async () => {
    const response = await fetch(`${coordinatorUrl}/api/v1/workers/available`, {
      headers: { ...authHeaders, 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to list workers: ${response.status}`);
    }

    return response.json() as Promise<WorkerListEntry[]>;
  });

  if (workers.length === 0) {
    console.log();
    logger.info('No workers available.');
    console.log(chalk.gray('  Workers become available when GPU nodes are online.'));
    console.log();
    return;
  }

  console.log();
  console.log(chalk.bold('  Available Workers'));
  console.log(chalk.gray('  ' + '─'.repeat(64)));
  console.log(
    chalk.gray('  ') +
    'Name'.padEnd(24) +
    'GPU'.padEnd(22) +
    'Status'.padEnd(12) +
    'Region'
  );
  console.log(chalk.gray('  ' + '─'.repeat(64)));

  for (const w of workers) {
    const statusColor = w.status === 'online' ? chalk.green : w.status === 'busy' ? chalk.yellow : chalk.red;
    console.log(
      chalk.gray('  ') +
      chalk.white(w.worker_name.padEnd(24)) +
      chalk.gray(`${w.gpu_model} ${w.gpu_memory_gb}GB`.padEnd(22)) +
      statusColor(w.status.padEnd(12)) +
      chalk.gray(w.region || '-')
    );
  }

  console.log(chalk.gray('  ' + '─'.repeat(64)));
  console.log();
  console.log(chalk.gray('  Connect: ') + chalk.cyan('bitsage shell <worker-name>'));
  console.log();
}

export default createShellCommand;
