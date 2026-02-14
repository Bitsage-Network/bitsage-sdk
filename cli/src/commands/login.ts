import { Command } from 'commander';
import chalk from 'chalk';
import http from 'http';
import {
  getCredentials,
  saveCredentials,
  clearCredentials,
  isAuthenticated,
  getWalletAddress,
  getKeystorePath,
  getCoordinatorUrl,
  type Credentials,
} from '../lib/config.js';
import { decryptKeystore, loadKeystore } from '../lib/starknet.js';
import { logger } from '../utils/logger.js';
import { password as promptPassword, confirm } from '../utils/prompts.js';
import { withSpinner } from '../utils/spinner.js';
import { randomBytes } from 'crypto';

export function createLoginCommand(): Command {
  return new Command('login')
    .description('Authenticate with BitSage Network')
    .option('--api-key <key>', 'Authenticate with an API key')
    .option('--wallet', 'Authenticate using your configured wallet')
    .option('--status', 'Check current authentication status')
    .action(async (options) => {
      try {
        // Status check
        if (options.status) {
          return showAuthStatus();
        }

        // Check if already authenticated
        const existing = getCredentials();
        if (existing) {
          logger.info(`Already logged in (${existing.type}${existing.address ? `: ${existing.address.slice(0, 10)}...` : ''})`);
          const reauth = await confirm('Re-authenticate?', false);
          if (!reauth) return;
        }

        // API key flow
        if (options.apiKey) {
          return await loginWithApiKey(options.apiKey);
        }

        // Wallet flow
        if (options.wallet) {
          return await loginWithWallet();
        }

        // Default: browser OAuth
        return await loginWithBrowser();
      } catch (error) {
        logger.error(`Login failed: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
}

export function createLogoutCommand(): Command {
  return new Command('logout')
    .description('Clear stored credentials')
    .action(async () => {
      clearCredentials();
      logger.success('Logged out. Credentials cleared.');
    });
}

function showAuthStatus(): void {
  const creds = getCredentials();

  if (!creds) {
    logger.heading('Authentication');
    logger.table({
      'Status': chalk.red('Not authenticated'),
    });
    console.log();
    logger.info('Run `bitsage login` to authenticate');
    return;
  }

  logger.heading('Authentication');
  logger.table({
    'Status': chalk.green('Authenticated'),
    'Method': creds.type === 'api_key' ? 'API Key' : 'Wallet',
    'Address': creds.address || '-',
    'Expires': creds.expires_at
      ? new Date(creds.expires_at).toLocaleDateString()
      : 'Never',
  });
}

async function loginWithApiKey(key: string): Promise<void> {
  // Validate the key against the coordinator
  const coordinatorUrl = getCoordinatorUrl();

  const valid = await withSpinner('Validating API key', async () => {
    try {
      const response = await fetch(`${coordinatorUrl}/api/v1/auth/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
      });
      // Accept 2xx or if coordinator doesn't support validation, trust the key
      return response.ok || response.status === 404;
    } catch {
      // Coordinator unreachable — store key anyway for later use
      return true;
    }
  });

  if (!valid) {
    logger.error('Invalid API key');
    process.exit(1);
  }

  const creds: Credentials = {
    type: 'api_key',
    token: key,
  };

  saveCredentials(creds);
  logger.success('Logged in with API key');
}

async function loginWithWallet(): Promise<void> {
  const address = getWalletAddress();
  const keystorePath = getKeystorePath();

  if (!address || !keystorePath) {
    logger.error('No wallet configured. Run `bitsage wallet create` first.');
    process.exit(1);
  }

  const pwd = await promptPassword('Enter wallet password:');

  const token = await withSpinner('Signing auth challenge', async () => {
    const keystore = loadKeystore(keystorePath);
    const privateKey = decryptKeystore(keystore, pwd);

    // Create a signed challenge for authentication
    const challenge = randomBytes(32).toString('hex');
    const timestamp = Date.now();

    // Use the private key as a proof of ownership (simplified auth token)
    const { ec } = await import('starknet');
    const signature = ec.starkCurve.sign(challenge, privateKey);

    // Package as an auth token (coordinator will verify)
    return Buffer.from(
      JSON.stringify({
        address,
        challenge,
        timestamp,
        signature: { r: signature.r.toString(16), s: signature.s.toString(16) },
      })
    ).toString('base64');
  });

  const creds: Credentials = {
    type: 'wallet',
    token,
    address,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
  };

  saveCredentials(creds);
  logger.success(`Logged in as ${address.slice(0, 10)}...${address.slice(-6)}`);
}

async function loginWithBrowser(): Promise<void> {
  logger.info('Opening browser for authentication...');

  const state = randomBytes(16).toString('hex');

  // Start local callback server
  const { token, address } = await new Promise<{ token: string; address?: string }>(
    (resolve, reject) => {
      const timeout = setTimeout(() => {
        server.close();
        reject(new Error('Authentication timed out (60s). Try `bitsage login --api-key` instead.'));
      }, 60_000);

      const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://localhost`);

        if (url.pathname === '/callback') {
          const receivedState = url.searchParams.get('state');
          const receivedToken = url.searchParams.get('token');
          const receivedAddress = url.searchParams.get('address') || undefined;

          if (receivedState !== state) {
            res.writeHead(400);
            res.end('Invalid state parameter');
            return;
          }

          if (!receivedToken) {
            res.writeHead(400);
            res.end('Missing token');
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html><body style="font-family: system-ui; text-align: center; padding: 60px;">
              <h1 style="color: #06b6d4;">Authenticated!</h1>
              <p>You can close this tab and return to the terminal.</p>
            </body></html>
          `);

          clearTimeout(timeout);
          server.close();
          resolve({ token: receivedToken, address: receivedAddress });
        }
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (!addr || typeof addr === 'string') {
          reject(new Error('Failed to start callback server'));
          return;
        }

        const callbackUrl = `http://127.0.0.1:${addr.port}/callback`;
        const authUrl = `https://app.bitsage.network/auth/cli?state=${state}&callback=${encodeURIComponent(callbackUrl)}`;

        // Try to open browser
        import('child_process').then(({ exec }) => {
          const openCmd =
            process.platform === 'darwin'
              ? 'open'
              : process.platform === 'win32'
              ? 'start'
              : 'xdg-open';

          exec(`${openCmd} "${authUrl}"`, (error) => {
            if (error) {
              console.log();
              logger.info('Could not open browser. Please visit:');
              console.log(chalk.cyan(authUrl));
              console.log();
            }
          });
        });

        logger.info('Waiting for browser authentication...');
        logger.info(chalk.gray('(or press Ctrl+C to cancel)'));
      });
    }
  );

  const creds: Credentials = {
    type: 'api_key',
    token,
    address,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  saveCredentials(creds);
  logger.success(`Logged in${address ? ` as ${address.slice(0, 10)}...` : ''}`);
}

export default createLoginCommand;
