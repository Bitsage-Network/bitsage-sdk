import { Command } from 'commander';
import { Contract, uint256 } from 'starknet';
import chalk from 'chalk';
import {
  getConfig,
  getNetwork,
  isWalletConfigured,
} from '../lib/config.js';
import {
  getProvider,
  getAccountFromKeystore,
  waitForTransaction,
  formatSage,
} from '../lib/starknet.js';
import { getContractAddress, FAUCET_ABI } from '../lib/contracts.js';
import { logger } from '../utils/logger.js';
import { password } from '../utils/prompts.js';
import { withSpinner } from '../utils/spinner.js';

export function createFaucetCommand(): Command {
  const faucet = new Command('faucet').description('Testnet faucet commands');

  // Claim tokens
  faucet
    .command('claim')
    .description('Claim testnet SAGE tokens from the faucet')
    .action(async () => {
      try {
        const config = getConfig();
        const network = getNetwork();

        // Check network
        if (network === 'mainnet') {
          logger.error('Faucet is only available on testnet networks');
          process.exit(1);
        }

        // Check wallet
        if (!isWalletConfigured()) {
          logger.error('No wallet configured. Run `bitsage wallet create` first.');
          process.exit(1);
        }

        // Check faucet contract
        const faucetAddress = getContractAddress('faucet');
        if (!faucetAddress || faucetAddress === '0x0') {
          logger.error('Faucet contract not configured for this network');
          logger.info('You can request testnet tokens from the Discord server.');
          process.exit(1);
        }

        // Check keystore
        if (!config.wallet.keystore_path) {
          logger.error('Keystore not found. Please import a wallet with signing capability.');
          logger.info('Run `bitsage wallet import --keystore <path>`');
          process.exit(1);
        }

        // Get account
        const pwd = await password('Enter wallet password:');
        const account = await withSpinner('Loading wallet', () =>
          getAccountFromKeystore(config.wallet.keystore_path, pwd)
        );

        // Create faucet contract instance
        const provider = getProvider();
        const faucetContract = new Contract(FAUCET_ABI, faucetAddress, provider);
        faucetContract.connect(account);

        // Check cooldown first
        try {
          const cooldownResult = await faucetContract.get_claim_cooldown(config.wallet.address);
          const cooldownSeconds = Number(cooldownResult.remaining_seconds);

          if (cooldownSeconds > 0) {
            const hours = Math.floor(cooldownSeconds / 3600);
            const minutes = Math.floor((cooldownSeconds % 3600) / 60);
            logger.warn(`Cooldown active. Try again in ${hours}h ${minutes}m`);
            process.exit(1);
          }
        } catch {
          // Cooldown check failed, try claiming anyway
          logger.debug('Could not check cooldown, proceeding with claim');
        }

        // Get claim amount
        let claimAmount = '1000';
        try {
          const amountResult = await faucetContract.get_claim_amount();
          claimAmount = formatSage(uint256.uint256ToBN(amountResult.amount));
        } catch {
          logger.debug('Could not fetch claim amount, using default');
        }

        logger.info(`Claiming ${claimAmount} SAGE from faucet...`);

        // Execute claim
        const txResult = await withSpinner('Submitting transaction', async () => {
          const tx = await faucetContract.claim();
          return tx;
        });

        logger.info(`Transaction submitted: ${txResult.transaction_hash}`);

        // Wait for confirmation
        const confirmed = await withSpinner('Waiting for confirmation', () =>
          waitForTransaction(txResult.transaction_hash)
        );

        if (confirmed) {
          logger.box('Faucet Claim Successful', [
            `Amount: ${claimAmount} SAGE`,
            `Transaction: ${txResult.transaction_hash.slice(0, 10)}...${txResult.transaction_hash.slice(-8)}`,
            '',
            `View on explorer:`,
            chalk.cyan(`https://sepolia.starkscan.co/tx/${txResult.transaction_hash}`),
          ]);

          console.log();
          logger.info('Next steps:');
          logger.list([
            'Run `bitsage wallet balance` to check your balance',
            'Run `bitsage stake <amount>` to stake tokens',
          ]);
        } else {
          logger.error('Transaction failed. Check the explorer for details.');
          process.exit(1);
        }
      } catch (error) {
        logger.error(`Faucet claim failed: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  // Check faucet status
  faucet
    .command('status')
    .description('Check faucet status and cooldown')
    .action(async () => {
      try {
        const config = getConfig();
        const network = getNetwork();

        if (network === 'mainnet') {
          logger.error('Faucet is only available on testnet networks');
          process.exit(1);
        }

        const faucetAddress = getContractAddress('faucet');
        if (!faucetAddress || faucetAddress === '0x0') {
          logger.error('Faucet contract not configured for this network');
          process.exit(1);
        }

        const provider = getProvider();
        const faucetContract = new Contract(FAUCET_ABI, faucetAddress, provider);

        logger.heading('Faucet Status');

        // Get claim amount
        try {
          const amountResult = await faucetContract.get_claim_amount();
          const amount = formatSage(uint256.uint256ToBN(amountResult.amount));
          logger.info(`Claim amount: ${amount} SAGE per claim`);
        } catch {
          logger.debug('Could not fetch claim amount');
        }

        // Check cooldown for user's address
        if (config.wallet.address) {
          try {
            const cooldownResult = await faucetContract.get_claim_cooldown(config.wallet.address);
            const cooldownSeconds = Number(cooldownResult.remaining_seconds);

            if (cooldownSeconds > 0) {
              const hours = Math.floor(cooldownSeconds / 3600);
              const minutes = Math.floor((cooldownSeconds % 3600) / 60);
              logger.warn(`Your cooldown: ${hours}h ${minutes}m remaining`);
            } else {
              logger.success('You can claim now!');
            }
          } catch {
            logger.info('Could not check cooldown status');
          }
        } else {
          logger.info('Configure a wallet to check your cooldown status');
        }

        console.log();
        logger.info(`Faucet contract: ${faucetAddress}`);
      } catch (error) {
        logger.error(`Failed to check status: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  return faucet;
}

export default createFaucetCommand;
