import { Command } from 'commander';
import chalk from 'chalk';
import {
  ensureConfigDir,
  getConfig,
  setConfig,
  setNetwork,
  setWalletAddress,
  setKeystorePath,
  setWorkerId,
  isConfigured,
  getConfigDir,
  type Network,
  BOOTSTRAP_COORDINATORS,
  DEFAULT_RPC_URLS,
} from '../lib/config.js';
import { createAndSaveWallet, getProvider } from '../lib/starknet.js';
import { findHealthyCoordinator, checkHealth } from '../lib/coordinator.js';
import { logger } from '../utils/logger.js';
import { confirm, input, select, password } from '../utils/prompts.js';
import { withSpinner } from '../utils/spinner.js';
import { randomBytes } from 'crypto';

type InitMode = 'worker' | 'validator' | 'staker' | 'developer';

interface GpuInfo {
  name: string;
  memory_mb: number;
  count: number;
  tier: 'Consumer' | 'Workstation' | 'DataCenter' | 'Enterprise' | 'Frontier';
}

async function detectGpu(): Promise<GpuInfo | null> {
  try {
    const { execSync } = await import('child_process');

    // Try nvidia-smi
    const output = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader', {
      encoding: 'utf-8',
      timeout: 5000,
    });

    const lines = output.trim().split('\n');
    if (lines.length === 0) return null;

    const [name, memoryStr] = lines[0].split(', ').map(s => s.trim());
    const memory_mb = parseInt(memoryStr.replace(/[^0-9]/g, ''));
    const count = lines.length;

    // Determine tier
    let tier: GpuInfo['tier'] = 'Consumer';
    if (/B300|B200|H200|H100/i.test(name)) {
      tier = 'Enterprise';
    } else if (/A100/i.test(name)) {
      tier = 'DataCenter';
    } else if (/A6000|L40|L4/i.test(name)) {
      tier = 'Workstation';
    } else if (/MI300/i.test(name) || count > 1) {
      tier = 'Frontier';
    }

    return { name, memory_mb, count, tier };
  } catch {
    return null;
  }
}

async function initWorker(): Promise<void> {
  logger.heading('BitSage Worker Setup');

  // Detect GPU
  const gpu = await withSpinner('Detecting GPU', detectGpu);

  if (gpu) {
    logger.success(`Detected: ${gpu.name} (${Math.round(gpu.memory_mb / 1024)}GB) x ${gpu.count}`);
    logger.info(`GPU Tier: ${gpu.tier}`);
    setConfig({
      worker: {
        id: '',
        enabled: true,
        gpu_enabled: true,
        listen_port: 8081,
      },
    });
  } else {
    logger.warn('No NVIDIA GPU detected. Worker will run in CPU-only mode.');
    const proceed = await confirm('Continue without GPU?', false);
    if (!proceed) {
      logger.info('Setup cancelled. Please ensure nvidia-smi is available.');
      process.exit(0);
    }
    setConfig({
      worker: {
        id: '',
        enabled: true,
        gpu_enabled: false,
        listen_port: 8081,
      },
    });
  }

  // Generate worker ID
  const workerId = `worker-${randomBytes(4).toString('hex')}`;
  setWorkerId(workerId);
  logger.info(`Worker ID: ${workerId}`);
}

async function initValidator(): Promise<void> {
  logger.heading('BitSage Validator Setup');

  logger.info('Validators participate in consensus and earn rewards for securing the network.');
  logger.info('Minimum stake required: 10,000 SAGE');

  setConfig({
    worker: {
      id: `validator-${randomBytes(4).toString('hex')}`,
      enabled: true,
      gpu_enabled: false,
      listen_port: 9000,
    },
  });
}

async function initStaker(): Promise<void> {
  logger.heading('BitSage Staker Setup');

  logger.info('Stakers earn rewards by delegating SAGE tokens to validators or workers.');
  logger.info('No hardware requirements - you only need SAGE tokens.');
}

async function initDeveloper(): Promise<void> {
  logger.heading('BitSage Developer Setup');

  logger.info('Developers can submit jobs and integrate with the BitSage network.');
  logger.info('See documentation at https://docs.bitsage.network');
}

export function createInitCommand(): Command {
  const init = new Command('init')
    .description('Initialize BitSage configuration')
    .argument('[mode]', 'Setup mode: worker, validator, staker, developer')
    .option('--network <network>', 'Network to use: mainnet, sepolia, local', 'sepolia')
    .option('--coordinator <url>', 'Coordinator URL')
    .option('--rpc <url>', 'Starknet RPC URL')
    .option('--force', 'Overwrite existing configuration')
    .option('--dry-run', 'Show what would be configured without saving')
    .action(async (mode: string | undefined, options) => {
      try {
        ensureConfigDir();

        // Check if already configured
        if (isConfigured() && !options.force) {
          const overwrite = await confirm(
            'Configuration already exists. Overwrite?',
            false
          );
          if (!overwrite) {
            logger.info('Setup cancelled.');
            return;
          }
        }

        // Select mode if not provided
        let initMode: InitMode;
        if (mode && ['worker', 'validator', 'staker', 'developer'].includes(mode)) {
          initMode = mode as InitMode;
        } else {
          initMode = await select<InitMode>('What would you like to set up?', [
            {
              name: 'GPU Worker',
              value: 'worker',
              description: 'Earn SAGE by processing compute jobs',
            },
            {
              name: 'Validator',
              value: 'validator',
              description: 'Secure the network and earn rewards',
            },
            {
              name: 'Staker',
              value: 'staker',
              description: 'Stake SAGE tokens to earn passive rewards',
            },
            {
              name: 'Developer',
              value: 'developer',
              description: 'Submit jobs and integrate with the network',
            },
          ]);
        }

        // Network selection
        const network = options.network as Network;
        setNetwork(network);
        logger.info(`Network: ${network}`);

        // Find and verify coordinator
        if (options.coordinator) {
          setConfig({ network: { name: network, coordinator_url: options.coordinator, starknet_rpc: DEFAULT_RPC_URLS[network] } });
        }

        await withSpinner('Finding healthy coordinator', async () => {
          try {
            const coordinatorUrl = await findHealthyCoordinator();
            const health = await checkHealth(coordinatorUrl);
            logger.debug(`Coordinator: ${coordinatorUrl} (${health.workers_online} workers online)`);
            setConfig({ network: { name: network, coordinator_url: coordinatorUrl, starknet_rpc: DEFAULT_RPC_URLS[network] } });
          } catch (error) {
            logger.warn('Could not connect to coordinator. You can configure it later.');
          }
        });

        // RPC URL
        if (options.rpc) {
          setConfig({ network: { name: network, coordinator_url: getConfig().network.coordinator_url, starknet_rpc: options.rpc } });
        }

        // Mode-specific setup
        switch (initMode) {
          case 'worker':
            await initWorker();
            break;
          case 'validator':
            await initValidator();
            break;
          case 'staker':
            await initStaker();
            break;
          case 'developer':
            await initDeveloper();
            break;
        }

        // Wallet setup
        console.log();
        const walletChoice = await select('Wallet configuration:', [
          {
            name: 'Create new wallet',
            value: 'create',
            description: 'Generate a new Starknet wallet',
          },
          {
            name: 'Import existing wallet',
            value: 'import',
            description: 'Use an existing wallet address',
          },
          {
            name: 'Skip for now',
            value: 'skip',
            description: 'Configure wallet later',
          },
        ]);

        if (walletChoice === 'create') {
          const pwd = await password('Enter a password to encrypt your wallet:', {
            validate: (p) => p.length >= 8 || 'Password must be at least 8 characters',
          });
          const confirmPwd = await password('Confirm password:');

          if (pwd !== confirmPwd) {
            logger.error('Passwords do not match');
            process.exit(1);
          }

          const { address, keystorePath } = await withSpinner(
            'Creating wallet',
            () => createAndSaveWallet(pwd)
          );

          setWalletAddress(address);
          setKeystorePath(keystorePath);

          logger.box('Wallet Created', [
            `Address: ${address}`,
            `Keystore: ${keystorePath}`,
            '',
            chalk.yellow('IMPORTANT: Back up your keystore file!'),
          ]);
        } else if (walletChoice === 'import') {
          const address = await input('Enter your Starknet wallet address:', {
            validate: (addr) =>
              /^0x[0-9a-fA-F]+$/.test(addr) || 'Invalid address format',
          });
          setWalletAddress(address);
          logger.success(`Wallet configured: ${address}`);
        }

        // Summary
        if (!options.dryRun) {
          const config = getConfig();

          console.log();
          logger.heading('Configuration Complete');
          logger.table({
            'Config Directory': getConfigDir(),
            'Network': config.network.name,
            'Coordinator': config.network.coordinator_url,
            'Wallet': config.wallet.address || '(not configured)',
            'Worker ID': config.worker.id || '(not configured)',
          });

          console.log();
          logger.info('Next steps:');
          logger.list([
            'Run `bitsage faucet claim` to get testnet tokens',
            'Run `bitsage stake <amount>` to stake tokens',
            initMode === 'worker'
              ? 'Run `bitsage worker start` to start earning'
              : initMode === 'validator'
              ? 'Run `bitsage validator start` to begin validating'
              : 'Run `bitsage status` to check your balance',
          ]);
        } else {
          logger.info('Dry run - no changes saved');
        }
      } catch (error) {
        logger.error(`Setup failed: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  return init;
}

export default createInitCommand;
