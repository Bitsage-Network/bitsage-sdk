import { Command } from 'commander';
import chalk from 'chalk';
import {
  isAuthenticated,
  getAuthHeaders,
  getCoordinatorUrl,
} from '../lib/config.js';
import { findHealthyCoordinator } from '../lib/coordinator.js';
import { logger } from '../utils/logger.js';
import { withSpinner } from '../utils/spinner.js';

export function createConnectCommand(): Command {
  return new Command('connect')
    .description('Connect to a running job (live logs / interactive terminal)')
    .argument('<job-id>', 'Job ID to connect to')
    .option('--follow', 'Keep following even after completion', true)
    .action(async (jobId: string, options) => {
      try {
        if (!isAuthenticated()) {
          logger.error('Not authenticated. Run `bitsage login` first.');
          process.exit(1);
        }

        const coordinatorUrl = await findHealthyCoordinator();
        const authHeaders = getAuthHeaders();

        // Verify job exists
        const jobInfo = await withSpinner('Connecting to job', async () => {
          const response = await fetch(`${coordinatorUrl}/api/v1/jobs/${jobId}`, {
            headers: { ...authHeaders, 'Accept': 'application/json' },
          });

          if (!response.ok) {
            if (response.status === 404) {
              throw new Error(`Job not found: ${jobId}`);
            }
            throw new Error(`Failed to fetch job: ${response.status}`);
          }

          return response.json() as Promise<{
            job_id: string;
            status: string;
            worker_id?: string;
          }>;
        });

        if (jobInfo.status === 'completed' || jobInfo.status === 'failed') {
          logger.info(`Job ${jobId.slice(0, 8)}... is already ${jobInfo.status}`);

          // Show result
          try {
            const resultResponse = await fetch(`${coordinatorUrl}/api/v1/jobs/${jobId}/result`, {
              headers: { ...authHeaders, 'Accept': 'application/json' },
            });
            if (resultResponse.ok) {
              const result = await resultResponse.json() as Record<string, unknown>;
              if (result.output_data) {
                console.log();
                console.log(result.output_data);
              }
            }
          } catch {}
          return;
        }

        logger.info(`Connected to job ${jobId.slice(0, 8)}... [${chalk.cyan(jobInfo.status)}]`);
        if (jobInfo.worker_id) {
          logger.info(`Worker: ${jobInfo.worker_id}`);
        }
        console.log(chalk.gray('─'.repeat(60)));

        // Try WebSocket first
        const wsUrl = coordinatorUrl.replace(/^http/, 'ws');
        let connected = false;

        try {
          const ws = new WebSocket(`${wsUrl}/ws/jobs/${jobId}`);

          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              ws.close();
              reject(new Error('WebSocket connection timeout'));
            }, 5000);

            ws.addEventListener('open', () => {
              clearTimeout(timeout);
              connected = true;

              // Send auth
              ws.send(JSON.stringify({
                type: 'auth',
                token: authHeaders['Authorization']?.replace('Bearer ', ''),
              }));

              // Subscribe to job
              ws.send(JSON.stringify({
                type: 'subscribe',
                job_id: jobId,
              }));

              resolve();
            });

            ws.addEventListener('error', () => {
              clearTimeout(timeout);
              reject(new Error('WebSocket failed'));
            });
          });

          // Handle messages
          ws.addEventListener('message', (event) => {
            try {
              const data = JSON.parse(event.data as string);

              switch (data.type) {
                case 'log':
                  process.stdout.write(data.message + '\n');
                  break;
                case 'status':
                  if (data.status === 'completed') {
                    console.log(chalk.gray('─'.repeat(60)));
                    logger.success('Job completed');
                    ws.close();
                    process.exit(0);
                  } else if (data.status === 'failed') {
                    console.log(chalk.gray('─'.repeat(60)));
                    logger.error(`Job failed: ${data.error || ''}`);
                    ws.close();
                    process.exit(1);
                  } else {
                    logger.info(`Status: ${data.status}`);
                  }
                  break;
                case 'progress':
                  process.stdout.write(`\r${chalk.gray(`[${data.percent}%]`)} ${data.message || ''}`);
                  break;
                case 'interactive':
                  // Relay stdin to the job
                  if (process.stdin.isTTY) {
                    process.stdin.setRawMode(true);
                    process.stdin.resume();
                    process.stdin.on('data', (chunk) => {
                      ws.send(JSON.stringify({
                        type: 'stdin',
                        data: chunk.toString('base64'),
                      }));
                    });
                  }
                  break;
                case 'stdout':
                  if (data.data) {
                    process.stdout.write(Buffer.from(data.data, 'base64'));
                  }
                  break;
                default:
                  if (data.message) {
                    console.log(data.message);
                  }
              }
            } catch {
              console.log(event.data);
            }
          });

          ws.addEventListener('close', () => {
            if (process.stdin.isTTY) {
              process.stdin.setRawMode(false);
            }
          });

          // Handle Ctrl+C
          process.on('SIGINT', () => {
            logger.info('Disconnecting...');
            ws.close();
            process.exit(0);
          });

          // Keep alive
          await new Promise(() => {}); // Block forever (event-driven)

        } catch {
          // WebSocket not available, fall back to SSE/polling
          if (!connected) {
            logger.debug('WebSocket unavailable, falling back to SSE');
            await fallbackSSE(coordinatorUrl, jobId, authHeaders, options.follow);
          }
        }

      } catch (error) {
        logger.error(`Connect failed: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
}

async function fallbackSSE(
  coordinatorUrl: string,
  jobId: string,
  authHeaders: Record<string, string>,
  follow: boolean,
): Promise<void> {
  try {
    const response = await fetch(`${coordinatorUrl}/api/v1/jobs/${jobId}/stream`, {
      headers: {
        ...authHeaders,
        'Accept': 'text/event-stream',
      },
    });

    if (!response.ok || !response.body) {
      // Fall back to polling
      return fallbackPolling(coordinatorUrl, jobId, authHeaders);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      for (const line of text.split('\n')) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);
            if (event.type === 'log') {
              process.stdout.write(event.message + '\n');
            } else if (event.type === 'status') {
              if (event.status === 'completed') {
                console.log(chalk.gray('─'.repeat(60)));
                logger.success('Job completed');
                return;
              } else if (event.status === 'failed') {
                console.log(chalk.gray('─'.repeat(60)));
                logger.error(`Job failed: ${event.error || ''}`);
                process.exit(1);
              }
            }
          } catch {
            if (data.trim()) process.stdout.write(data + '\n');
          }
        }
      }
    }
  } catch {
    return fallbackPolling(coordinatorUrl, jobId, authHeaders);
  }
}

async function fallbackPolling(
  coordinatorUrl: string,
  jobId: string,
  authHeaders: Record<string, string>,
): Promise<void> {
  let lastStatus = '';

  while (true) {
    try {
      const response = await fetch(`${coordinatorUrl}/api/v1/jobs/${jobId}`, {
        headers: { ...authHeaders, 'Accept': 'application/json' },
      });

      if (response.ok) {
        const job = await response.json() as Record<string, unknown>;
        const status = job.status as string;

        if (status !== lastStatus) {
          logger.info(`Status: ${status}`);
          lastStatus = status;
        }

        if (status === 'completed') {
          console.log(chalk.gray('─'.repeat(60)));
          logger.success('Job completed');
          return;
        }

        if (status === 'failed') {
          console.log(chalk.gray('─'.repeat(60)));
          logger.error(`Job failed: ${job.error_message || ''}`);
          process.exit(1);
        }
      }
    } catch {}

    await new Promise(r => setTimeout(r, 3000));
  }
}

export default createConnectCommand;
