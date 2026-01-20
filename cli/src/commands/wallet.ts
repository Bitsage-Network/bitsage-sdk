import { Command } from 'commander';
import chalk from 'chalk';
import {
  getConfig,
  setWalletAddress,
  setKeystorePath,
  getKeystoreDir,
  isWalletConfigured,
} from '../lib/config.js';
import {
  createAndSaveWallet,
  loadKeystore,
  decryptKeystore,
  getBalance,
  formatSage,
  getProvider,
} from '../lib/starknet.js';
import { getContractAddress } from '../lib/contracts.js';
import { logger } from '../utils/logger.js';
import { input, password, confirm } from '../utils/prompts.js';
import { withSpinner } from '../utils/spinner.js';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

export function createWalletCommand(): Command {
  const wallet = new Command('wallet').description('Wallet management commands');

  // Create new wallet
  wallet
    .command('create')
    .description('Create a new Starknet wallet')
    .action(async () => {
      try {
        if (isWalletConfigured()) {
          const overwrite = await confirm(
            'A wallet is already configured. Create a new one?',
            false
          );
          if (!overwrite) {
            logger.info('Cancelled.');
            return;
          }
        }

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
          chalk.yellow('Never share your password or keystore with anyone.'),
        ]);
      } catch (error) {
        logger.error(`Failed to create wallet: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  // Import wallet
  wallet
    .command('import')
    .description('Import an existing wallet')
    .option('--address <address>', 'Wallet address to import')
    .option('--keystore <path>', 'Path to keystore file')
    .action(async (options) => {
      try {
        let address = options.address;
        let keystorePath = options.keystore;

        if (!address && !keystorePath) {
          const importType = await input(
            'Enter wallet address (or path to keystore file):',
            {
              validate: (val) => {
                if (val.startsWith('0x')) return true;
                if (existsSync(val)) return true;
                return 'Enter a valid address (0x...) or file path';
              },
            }
          );

          if (importType.startsWith('0x')) {
            address = importType;
          } else {
            keystorePath = importType;
          }
        }

        if (keystorePath) {
          // Verify keystore can be loaded
          const keystore = loadKeystore(keystorePath);
          address = keystore.address;

          // Verify password works
          const pwd = await password('Enter keystore password:');
          try {
            decryptKeystore(keystore, pwd);
            logger.success('Keystore verified successfully');
          } catch {
            logger.error('Invalid password');
            process.exit(1);
          }

          setKeystorePath(keystorePath);
        }

        if (address) {
          setWalletAddress(address);
          logger.success(`Wallet imported: ${address}`);
        }
      } catch (error) {
        logger.error(`Failed to import wallet: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  // Show balance
  wallet
    .command('balance')
    .description('Check wallet balance')
    .option('--address <address>', 'Address to check (defaults to configured wallet)')
    .action(async (options) => {
      try {
        const config = getConfig();
        const address = options.address || config.wallet.address;

        if (!address) {
          logger.error('No wallet configured. Run `bitsage wallet create` or `bitsage wallet import` first.');
          process.exit(1);
        }

        logger.info(`Checking balance for ${address}...`);

        // Get SAGE balance
        const sageToken = getContractAddress('sage_token');
        let sageBalance = 0n;
        if (sageToken && sageToken !== '0x0') {
          sageBalance = await withSpinner('Fetching SAGE balance', () =>
            getBalance(address, sageToken)
          );
        }

        // Get ETH balance (native token for gas)
        const provider = getProvider();
        let ethBalance = 0n;
        try {
          const result = await provider.getBalance(address);
          ethBalance = BigInt(result);
        } catch {
          // Account may not be deployed
        }

        console.log();
        logger.heading('Wallet Balance');
        logger.table({
          'Address': address,
          'SAGE': formatSage(sageBalance),
          'ETH': formatSage(ethBalance) + ' (for gas)',
        });

        if (sageBalance === 0n) {
          console.log();
          logger.info('Need testnet tokens? Run `bitsage faucet claim`');
        }
      } catch (error) {
        logger.error(`Failed to fetch balance: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  // Export wallet info
  wallet
    .command('export')
    .description('Export wallet information')
    .option('--private-key', 'Export private key (USE WITH CAUTION)')
    .action(async (options) => {
      try {
        const config = getConfig();

        if (!config.wallet.address) {
          logger.error('No wallet configured');
          process.exit(1);
        }

        if (options.privateKey) {
          logger.warn('WARNING: Exporting private key. Never share this with anyone!');
          const proceed = await confirm('Are you sure you want to export your private key?', false);

          if (!proceed) {
            logger.info('Cancelled.');
            return;
          }

          if (!config.wallet.keystore_path) {
            logger.error('No keystore file found. Cannot export private key.');
            process.exit(1);
          }

          const keystore = loadKeystore(config.wallet.keystore_path);
          const pwd = await password('Enter keystore password:');

          try {
            const privateKey = decryptKeystore(keystore, pwd);
            console.log();
            logger.warn('PRIVATE KEY (keep this secret!):');
            console.log(chalk.red(privateKey));
            console.log();
          } catch {
            logger.error('Invalid password');
            process.exit(1);
          }
        } else {
          logger.heading('Wallet Information');
          logger.table({
            'Address': config.wallet.address,
            'Keystore': config.wallet.keystore_path || '(not set)',
            'Network': config.network.name,
          });
        }
      } catch (error) {
        logger.error(`Failed to export: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  // List keystores
  wallet
    .command('list')
    .description('List available keystores')
    .action(async () => {
      try {
        const keystoreDir = getKeystoreDir();
        const config = getConfig();

        if (!existsSync(keystoreDir)) {
          logger.info('No keystores found');
          return;
        }

        const files = readdirSync(keystoreDir).filter(f => f.endsWith('.json'));

        if (files.length === 0) {
          logger.info('No keystores found');
          return;
        }

        logger.heading('Available Keystores');

        for (const file of files) {
          const path = join(keystoreDir, file);
          try {
            const keystore = loadKeystore(path);
            const isActive = config.wallet.keystore_path === path;
            const marker = isActive ? chalk.green('*') : ' ';
            console.log(`${marker} ${keystore.address} (${file})`);
          } catch {
            console.log(`  ${chalk.gray(file)} (invalid)`);
          }
        }

        if (config.wallet.keystore_path) {
          console.log();
          logger.info(`* = currently active keystore`);
        }
      } catch (error) {
        logger.error(`Failed to list keystores: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  return wallet;
}

export default createWalletCommand;
