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
} from './commands/index.js';
import { ensureConfigDir } from './lib/config.js';

const VERSION = '0.1.0';

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
    .description('BitSage Network CLI - One-command deployment for workers, validators, and stakers')
    .version(VERSION, '-v, --version', 'Show version number')
    .option('-d, --debug', 'Enable debug output')
    .hook('preAction', (thisCommand) => {
      if (thisCommand.opts().debug) {
        process.env.DEBUG = '1';
      }
    });

  // Add commands
  program.addCommand(createInitCommand());
  program.addCommand(createWalletCommand());
  program.addCommand(createWorkerCommand());
  program.addCommand(createFaucetCommand());
  program.addCommand(createStakeCommand());
  program.addCommand(createClaimCommand());
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
    console.log('  1. Initialize your node:');
    console.log(chalk.cyan('     bitsage init worker'));
    console.log();
    console.log('  2. Get testnet tokens:');
    console.log(chalk.cyan('     bitsage faucet claim'));
    console.log();
    console.log('  3. Stake tokens:');
    console.log(chalk.cyan('     bitsage stake deposit 1000'));
    console.log();
    console.log('  4. Start earning:');
    console.log(chalk.cyan('     bitsage worker start'));
    console.log();
    console.log(chalk.bold('Common Commands:'));
    console.log();
    console.log('  bitsage init [mode]      Setup wizard (worker/validator/staker)');
    console.log('  bitsage wallet create    Create a new wallet');
    console.log('  bitsage wallet balance   Check your balance');
    console.log('  bitsage faucet claim     Get testnet tokens');
    console.log('  bitsage stake deposit    Stake SAGE tokens');
    console.log('  bitsage worker start     Start the worker node');
    console.log('  bitsage status           Show overall status');
    console.log('  bitsage earnings         View your earnings');
    console.log();
    console.log('Run', chalk.cyan('bitsage --help'), 'for all commands');
    console.log('Run', chalk.cyan('bitsage <command> --help'), 'for command details');
    console.log();
    console.log(chalk.gray('Documentation: https://docs.bitsage.network'));
    console.log(chalk.gray('Support: https://discord.gg/bitsage'));
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
