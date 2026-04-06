#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import {
  createInitCommand,
  createWalletCommand,
  createWorkerCommand,
  createFaucetCommand,
  createStakeCommand,
  createClaimCommand,
  createStatusCommand,
  createHealthCommand,
  createEarningsCommand,
  createJobsCommand,
  createLoginCommand,
  createLogoutCommand,
  createRunCommand,
  createTrainCommand,
  createInferCommand,
  createConnectCommand,
  createShellCommand,
  createStartCommand,
  createStopCommand,
} from './commands/index.js';
import { ensureConfigDir } from './lib/config.js';

const VERSION = '0.2.0';

const BANNER = `
${chalk.cyan('╔═════════════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}                                                                 ${chalk.cyan('║')}
${chalk.cyan('║')}    ${chalk.bold.cyan('██████╗ ██╗████████╗███████╗ █████╗  ██████╗ ███████╗')}     ${chalk.cyan('║')}
${chalk.cyan('║')}    ${chalk.bold.cyan('██╔══██╗██║╚══██╔══╝██╔════╝██╔══██╗██╔════╝ ██╔════╝')}     ${chalk.cyan('║')}
${chalk.cyan('║')}    ${chalk.bold.cyan('██████╔╝██║   ██║   ███████╗███████║██║  ███╗█████╗')}       ${chalk.cyan('║')}
${chalk.cyan('║')}    ${chalk.bold.cyan('██╔══██╗██║   ██║   ╚════██║██╔══██║██║   ██║██╔══╝')}       ${chalk.cyan('║')}
${chalk.cyan('║')}    ${chalk.bold.cyan('██████╔╝██║   ██║   ███████║██║  ██║╚██████╔╝███████╗')}     ${chalk.cyan('║')}
${chalk.cyan('║')}    ${chalk.bold.cyan('╚═════╝ ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝')}     ${chalk.cyan('║')}
${chalk.cyan('║')}                                                                 ${chalk.cyan('║')}
${chalk.cyan('║')}         ${chalk.bold.white('The Economic Heart of Decentralized Compute')}            ${chalk.cyan('║')}
${chalk.cyan('║')}                        ${chalk.gray(`CLI v${VERSION}`)}                                ${chalk.cyan('║')}
${chalk.cyan('╚═════════════════════════════════════════════════════════════════╝')}
`;

// OBELYSK banner for privacy/proof-related commands
export const OBELYSK_BANNER = `
${chalk.magenta('╔═════════════════════════════════════════════════════════════════╗')}
${chalk.magenta('║')}                                                                 ${chalk.magenta('║')}
${chalk.magenta('║')}    ${chalk.bold.magenta('██████╗ ██████╗ ███████╗██╗  ██╗   ██╗███████╗██╗  ██╗')}    ${chalk.magenta('║')}
${chalk.magenta('║')}   ${chalk.bold.magenta('██╔═══██╗██╔══██╗██╔════╝██║  ╚██╗ ██╔╝██╔════╝██║ ██╔╝')}    ${chalk.magenta('║')}
${chalk.magenta('║')}   ${chalk.bold.magenta('██║   ██║██████╔╝█████╗  ██║   ╚████╔╝ ███████╗█████╔╝')}     ${chalk.magenta('║')}
${chalk.magenta('║')}   ${chalk.bold.magenta('██║   ██║██╔══██╗██╔══╝  ██║    ╚██╔╝  ╚════██║██╔═██╗')}     ${chalk.magenta('║')}
${chalk.magenta('║')}   ${chalk.bold.magenta('╚██████╔╝██████╔╝███████╗███████╗██║   ███████║██║  ██╗')}    ${chalk.magenta('║')}
${chalk.magenta('║')}    ${chalk.bold.magenta('╚═════╝ ╚═════╝ ╚══════╝╚══════╝╚═╝   ╚══════╝╚═╝  ╚═╝')}    ${chalk.magenta('║')}
${chalk.magenta('║')}                                                                 ${chalk.magenta('║')}
${chalk.magenta('║')}      ${chalk.bold.white('Verifiable GPU Compute • ZK Proofs • TEE Attestation')}     ${chalk.magenta('║')}
${chalk.magenta('╚═════════════════════════════════════════════════════════════════╝')}
`;

async function main() {
  // Ensure config directory exists
  ensureConfigDir();

  const program = new Command();

  program
    .name('bitsage')
    .description('BitSage Network CLI - Decentralized GPU compute')
    .version(VERSION, '-v, --version', 'Show version number')
    .option('-d, --debug', 'Enable debug output')
    .hook('preAction', (thisCommand) => {
      if (thisCommand.opts().debug) {
        process.env.DEBUG = '1';
      }
    });

  // ── Auth ──────────────────────────────────────────────────────────────
  program.addCommand(createLoginCommand());
  program.addCommand(createLogoutCommand());

  // ── Quick Actions (top-level shortcuts) ──────────────────────────────
  program.addCommand(createStartCommand());
  program.addCommand(createStopCommand());

  // ── GPU Consumer Commands ────────────────────────────────────────────
  program.addCommand(createShellCommand());
  program.addCommand(createRunCommand());
  program.addCommand(createTrainCommand());
  program.addCommand(createInferCommand());
  program.addCommand(createConnectCommand());

  // ── Setup & Management ───────────────────────────────────────────────
  program.addCommand(createInitCommand());
  program.addCommand(createWalletCommand());
  program.addCommand(createWorkerCommand());
  program.addCommand(createFaucetCommand());
  program.addCommand(createStakeCommand());
  program.addCommand(createClaimCommand());

  // ── Monitoring ───────────────────────────────────────────────────────
  program.addCommand(createStatusCommand());
  program.addCommand(createHealthCommand());
  program.addCommand(createEarningsCommand());
  program.addCommand(createJobsCommand());

  // Show banner on help
  program.addHelpText('beforeAll', BANNER);

  // Custom help for empty command
  if (process.argv.length === 2) {
    console.log(BANNER);

    console.log(chalk.bold('Quick Start:'));
    console.log();
    console.log(chalk.cyan('  bitsage login'));
    console.log(chalk.cyan('  bitsage shell'));
    console.log(chalk.gray('  That\'s it. You\'re on an H100.'));
    console.log();

    console.log(chalk.bold('GPU Operator (earn SAGE):'));
    console.log();
    console.log(chalk.cyan('  bitsage login'));
    console.log(chalk.cyan('  bitsage start'));
    console.log(chalk.gray('  Your GPU is earning.'));
    console.log();

    console.log(chalk.bold('GPU Consumer (use GPUs):'));
    console.log();
    console.log(chalk.cyan('  bitsage shell                  SSH into a GPU worker'));
    console.log(chalk.cyan('  bitsage shell --list           List available workers'));
    console.log(chalk.cyan('  bitsage run train.py --gpu h100'));
    console.log(chalk.cyan('  bitsage infer --model qwen-14b --input "Hello"'));
    console.log();

    console.log(chalk.bold('All Commands:'));
    console.log();
    console.log('  Auth:');
    console.log('    login                    Authenticate with BitSage');
    console.log('    logout                   Clear credentials');
    console.log();
    console.log('  GPU Access:');
    console.log('    shell [worker]           SSH into a GPU worker');
    console.log('    shell --list             List available workers');
    console.log('    run <script>             Run a script on remote GPU');
    console.log('    train                    Submit a training job');
    console.log('    infer                    Run model inference');
    console.log('    connect <job-id>         Connect to a running job');
    console.log('    jobs                     List your jobs');
    console.log();
    console.log('  Operator:');
    console.log('    start                    One-command GPU operator setup');
    console.log('    stop                     Stop the worker daemon');
    console.log('    status                   Dashboard overview');
    console.log('    earnings                 View your earnings');
    console.log();
    console.log('  Setup:');
    console.log('    init [mode]              Setup wizard');
    console.log('    wallet create|balance    Wallet management');
    console.log('    faucet claim             Get testnet tokens');
    console.log('    stake deposit <amount>   Stake SAGE tokens');
    console.log('    worker register|start    Worker management');
    console.log();
    console.log('Run', chalk.cyan('bitsage <command> --help'), 'for command details');
    console.log();
    console.log(chalk.gray('Docs: https://docs.bitsage.network  •  Discord: https://discord.gg/bitsage'));
    console.log();
    return;
  }

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red('Error:'), error.message);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
