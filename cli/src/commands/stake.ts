import { Command } from 'commander';
import { Contract, uint256, cairo } from 'starknet';
import chalk from 'chalk';
import {
  getConfig,
  isWalletConfigured,
} from '../lib/config.js';
import {
  getProvider,
  getAccountFromKeystore,
  waitForTransaction,
  formatSage,
  parseSage,
  getBalance,
} from '../lib/starknet.js';
import { getContractAddress, STAKING_ABI, ERC20_ABI } from '../lib/contracts.js';
import { logger } from '../utils/logger.js';
import { password, confirm } from '../utils/prompts.js';
import { withSpinner } from '../utils/spinner.js';

// Staking tiers
const STAKE_TIERS = [
  { name: 'Basic', minStake: 100n * 10n ** 18n, benefits: 'Access to basic jobs' },
  { name: 'Standard', minStake: 1000n * 10n ** 18n, benefits: 'Priority job assignment' },
  { name: 'Premium', minStake: 5000n * 10n ** 18n, benefits: 'GPU acceleration eligible' },
  { name: 'Elite', minStake: 10000n * 10n ** 18n, benefits: 'Validator eligible + highest priority' },
];

function getStakeTier(amount: bigint): string {
  for (let i = STAKE_TIERS.length - 1; i >= 0; i--) {
    if (amount >= STAKE_TIERS[i].minStake) {
      return STAKE_TIERS[i].name;
    }
  }
  return 'None';
}

export function createStakeCommand(): Command {
  const stake = new Command('stake').description('Staking commands');

  // Stake tokens
  stake
    .command('deposit')
    .alias('add')
    .description('Stake SAGE tokens')
    .argument('<amount>', 'Amount of SAGE to stake')
    .action(async (amountStr: string) => {
      try {
        const config = getConfig();

        if (!isWalletConfigured()) {
          logger.error('No wallet configured. Run `bitsage wallet create` first.');
          process.exit(1);
        }

        const stakingAddress = getContractAddress('staking');
        if (!stakingAddress || stakingAddress === '0x0') {
          logger.error('Staking contract not configured');
          process.exit(1);
        }

        const sageTokenAddress = getContractAddress('sage_token');
        if (!sageTokenAddress || sageTokenAddress === '0x0') {
          logger.error('SAGE token contract not configured');
          process.exit(1);
        }

        const amount = parseSage(amountStr);
        if (amount <= 0n) {
          logger.error('Amount must be greater than 0');
          process.exit(1);
        }

        // Check balance
        const balance = await withSpinner('Checking balance', () =>
          getBalance(config.wallet.address, sageTokenAddress)
        );

        if (balance < amount) {
          logger.error(`Insufficient balance: ${formatSage(balance)} SAGE`);
          logger.info('Run `bitsage faucet claim` to get testnet tokens');
          process.exit(1);
        }

        // Show tier info
        const currentTier = getStakeTier(0n); // Fetch current stake if needed
        const newTier = getStakeTier(amount);

        logger.heading('Stake Summary');
        logger.table({
          'Amount': `${amountStr} SAGE`,
          'Current Balance': formatSage(balance) + ' SAGE',
          'New Stake Tier': newTier,
        });

        const proceed = await confirm('Proceed with staking?', true);
        if (!proceed) {
          logger.info('Cancelled.');
          return;
        }

        // Get account
        if (!config.wallet.keystore_path) {
          logger.error('Keystore not found. Please import a wallet with signing capability.');
          process.exit(1);
        }

        const pwd = await password('Enter wallet password:');
        const account = await withSpinner('Loading wallet', () =>
          getAccountFromKeystore(config.wallet.keystore_path, pwd)
        );

        const provider = getProvider();

        // First approve the staking contract to spend tokens
        const tokenContract = new Contract(ERC20_ABI, sageTokenAddress, provider);
        tokenContract.connect(account);

        const amountUint256 = uint256.bnToUint256(amount);

        logger.info('Approving staking contract...');
        const approveTx = await withSpinner('Submitting approval', async () => {
          return tokenContract.approve(stakingAddress, amountUint256);
        });

        await withSpinner('Waiting for approval confirmation', () =>
          waitForTransaction(approveTx.transaction_hash)
        );

        // Now stake
        const stakingContract = new Contract(STAKING_ABI, stakingAddress, provider);
        stakingContract.connect(account);

        logger.info('Staking tokens...');
        const stakeTx = await withSpinner('Submitting stake transaction', async () => {
          return stakingContract.stake(amountUint256);
        });

        const confirmed = await withSpinner('Waiting for confirmation', () =>
          waitForTransaction(stakeTx.transaction_hash)
        );

        if (confirmed) {
          logger.box('Staking Successful', [
            `Amount: ${amountStr} SAGE`,
            `Tier: ${newTier}`,
            `Transaction: ${stakeTx.transaction_hash.slice(0, 10)}...`,
            '',
            chalk.cyan(`https://sepolia.starkscan.co/tx/${stakeTx.transaction_hash}`),
          ]);
        } else {
          logger.error('Transaction failed');
          process.exit(1);
        }
      } catch (error) {
        logger.error(`Staking failed: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  // Unstake tokens
  stake
    .command('withdraw')
    .alias('remove')
    .description('Unstake SAGE tokens (starts unstaking period)')
    .argument('<amount>', 'Amount of SAGE to unstake')
    .action(async (amountStr: string) => {
      try {
        const config = getConfig();

        if (!isWalletConfigured()) {
          logger.error('No wallet configured');
          process.exit(1);
        }

        const stakingAddress = getContractAddress('staking');
        if (!stakingAddress || stakingAddress === '0x0') {
          logger.error('Staking contract not configured');
          process.exit(1);
        }

        const amount = parseSage(amountStr);

        logger.warn('Unstaking has a lockup period of 7 days.');
        const proceed = await confirm('Proceed with unstaking?', false);
        if (!proceed) {
          logger.info('Cancelled.');
          return;
        }

        if (!config.wallet.keystore_path) {
          logger.error('Keystore not found');
          process.exit(1);
        }

        const pwd = await password('Enter wallet password:');
        const account = await withSpinner('Loading wallet', () =>
          getAccountFromKeystore(config.wallet.keystore_path, pwd)
        );

        const provider = getProvider();
        const stakingContract = new Contract(STAKING_ABI, stakingAddress, provider);
        stakingContract.connect(account);

        const amountUint256 = uint256.bnToUint256(amount);

        const tx = await withSpinner('Submitting unstake transaction', async () => {
          return stakingContract.unstake(amountUint256);
        });

        const confirmed = await withSpinner('Waiting for confirmation', () =>
          waitForTransaction(tx.transaction_hash)
        );

        if (confirmed) {
          logger.success(`Unstaking initiated for ${amountStr} SAGE`);
          logger.info('Tokens will be available after the 7-day lockup period');
        } else {
          logger.error('Transaction failed');
          process.exit(1);
        }
      } catch (error) {
        logger.error(`Unstaking failed: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  // Check stake status
  stake
    .command('status')
    .description('Check your staking status')
    .action(async () => {
      try {
        const config = getConfig();

        if (!isWalletConfigured()) {
          logger.error('No wallet configured');
          process.exit(1);
        }

        const stakingAddress = getContractAddress('staking');
        if (!stakingAddress || stakingAddress === '0x0') {
          logger.error('Staking contract not configured');
          process.exit(1);
        }

        const provider = getProvider();
        const stakingContract = new Contract(STAKING_ABI, stakingAddress, provider);

        let stakedAmount = 0n;
        let pendingRewards = 0n;

        try {
          const stakeResult = await stakingContract.get_stake(config.wallet.address);
          stakedAmount = uint256.uint256ToBN(stakeResult.amount);
        } catch (error) {
          logger.debug(`Could not fetch stake: ${error}`);
        }

        try {
          const rewardsResult = await stakingContract.get_pending_rewards(config.wallet.address);
          pendingRewards = uint256.uint256ToBN(rewardsResult.amount);
        } catch (error) {
          logger.debug(`Could not fetch rewards: ${error}`);
        }

        const tier = getStakeTier(stakedAmount);

        logger.heading('Staking Status');
        logger.table({
          'Wallet': config.wallet.address,
          'Staked': formatSage(stakedAmount) + ' SAGE',
          'Tier': tier,
          'Pending Rewards': formatSage(pendingRewards) + ' SAGE',
        });

        console.log();
        logger.heading('Stake Tiers');
        for (const t of STAKE_TIERS) {
          const marker = tier === t.name ? chalk.green('*') : ' ';
          console.log(`${marker} ${t.name.padEnd(10)} ${formatSage(t.minStake).padStart(8)} SAGE  ${chalk.gray(t.benefits)}`);
        }

        if (pendingRewards > 0n) {
          console.log();
          logger.info('Run `bitsage claim` to claim your pending rewards');
        }
      } catch (error) {
        logger.error(`Failed to check status: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  return stake;
}

// Claim rewards command (separate from stake subcommand)
export function createClaimCommand(): Command {
  return new Command('claim')
    .description('Claim staking rewards')
    .action(async () => {
      try {
        const config = getConfig();

        if (!isWalletConfigured()) {
          logger.error('No wallet configured');
          process.exit(1);
        }

        const stakingAddress = getContractAddress('staking');
        if (!stakingAddress || stakingAddress === '0x0') {
          logger.error('Staking contract not configured');
          process.exit(1);
        }

        if (!config.wallet.keystore_path) {
          logger.error('Keystore not found');
          process.exit(1);
        }

        // Check pending rewards first
        const provider = getProvider();
        const stakingContract = new Contract(STAKING_ABI, stakingAddress, provider);

        let pendingRewards = 0n;
        try {
          const rewardsResult = await stakingContract.get_pending_rewards(config.wallet.address);
          pendingRewards = uint256.uint256ToBN(rewardsResult.amount);
        } catch {
          logger.warn('Could not check pending rewards');
        }

        if (pendingRewards === 0n) {
          logger.info('No pending rewards to claim');
          return;
        }

        logger.info(`Claiming ${formatSage(pendingRewards)} SAGE in rewards...`);

        const pwd = await password('Enter wallet password:');
        const account = await withSpinner('Loading wallet', () =>
          getAccountFromKeystore(config.wallet.keystore_path, pwd)
        );

        stakingContract.connect(account);

        const tx = await withSpinner('Submitting claim transaction', async () => {
          return stakingContract.claim_rewards();
        });

        const confirmed = await withSpinner('Waiting for confirmation', () =>
          waitForTransaction(tx.transaction_hash)
        );

        if (confirmed) {
          logger.success(`Claimed ${formatSage(pendingRewards)} SAGE`);
        } else {
          logger.error('Transaction failed');
          process.exit(1);
        }
      } catch (error) {
        logger.error(`Claim failed: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
}

export default createStakeCommand;
