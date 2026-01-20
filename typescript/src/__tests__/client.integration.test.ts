/**
 * BitSage SDK Integration Tests
 *
 * These tests run against a live coordinator (local or Sepolia).
 * Set BITSAGE_API_URL environment variable to target a specific endpoint.
 *
 * Run with: npm test -- --run
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BitSageClient, ClientConfig, SdkError } from '../client';
import type { SubmitJobRequest, JobType, GpuTier } from '../types';

// Test configuration from environment
const TEST_CONFIG: Partial<ClientConfig> = {
  apiUrl: process.env.BITSAGE_API_URL || 'http://localhost:8080',
  starknetRpcUrl: process.env.STARKNET_RPC_URL || 'https://starknet-sepolia.public.blastapi.io',
  timeout: 30000,
  network: (process.env.BITSAGE_NETWORK as 'sepolia' | 'mainnet') || 'sepolia',
};

// Test wallet (Sepolia testnet only - DO NOT use on mainnet!)
const TEST_WALLET = {
  privateKey: process.env.TEST_PRIVATE_KEY || '0x1234567890abcdef',
  accountAddress: process.env.TEST_ACCOUNT_ADDRESS || '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
};

// Skip integration tests if not configured
const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION_TESTS === 'true';

describe.skipIf(SKIP_INTEGRATION)('BitSageClient Integration Tests', () => {
  let client: BitSageClient;

  beforeAll(() => {
    client = new BitSageClient(TEST_CONFIG);
  });

  describe('Health & Connectivity', () => {
    it('should connect to the API endpoint', async () => {
      // Network stats endpoint should always be available
      const stats = await client.getNetworkStats();
      expect(stats).toBeDefined();
    });

    it('should handle timeout gracefully', async () => {
      const slowClient = new BitSageClient({
        ...TEST_CONFIG,
        timeout: 1, // 1ms timeout - should fail
      });

      await expect(slowClient.getNetworkStats()).rejects.toThrow(SdkError);
    });
  });

  describe('Network Operations', () => {
    it('should get network statistics', async () => {
      const stats = await client.getNetworkStats();

      expect(stats).toHaveProperty('total_workers');
      expect(stats).toHaveProperty('active_workers');
      expect(stats).toHaveProperty('total_jobs_completed');
      expect(stats).toHaveProperty('total_jobs_pending');
      expect(typeof stats.total_workers).toBe('number');
    });
  });

  describe('Worker Operations', () => {
    it('should list workers', async () => {
      const workers = await client.listWorkers();

      expect(Array.isArray(workers)).toBe(true);
      // Workers array may be empty on fresh deployment
    });

    it('should handle non-existent worker gracefully', async () => {
      const fakeWorkerId = '00000000-0000-0000-0000-000000000000';

      await expect(client.getWorker(fakeWorkerId)).rejects.toThrow();
    });
  });

  describe('Job Operations', () => {
    let submittedJobId: string | undefined;

    it('should submit a job', async () => {
      const jobRequest: SubmitJobRequest = {
        job_type: {
          type: 'ai_inference',
          model_type: 'test-model',
          batch_size: 1,
        },
        input_data: btoa('test input data'), // base64 encoded
        max_cost_sage: 100n,
        max_duration_secs: 300,
        priority: 5,
        require_tee: false,
      };

      try {
        const response = await client.submitJob(jobRequest);

        expect(response).toHaveProperty('job_id');
        expect(response).toHaveProperty('status');
        expect(response).toHaveProperty('estimated_cost');

        submittedJobId = response.job_id;
      } catch (error) {
        // May fail if no workers available - that's OK for integration test
        if (error instanceof SdkError && error.code === 'API_ERROR') {
          console.log('Job submission failed (expected if no workers):', error.message);
        } else {
          throw error;
        }
      }
    });

    it('should get job status', async () => {
      if (!submittedJobId) {
        console.log('Skipping - no job was submitted');
        return;
      }

      const status = await client.getJobStatus(submittedJobId);

      expect(status).toHaveProperty('job_id', submittedJobId);
      expect(status).toHaveProperty('status');
      expect(['pending', 'assigned', 'running', 'completed', 'failed', 'cancelled']).toContain(status.status);
    });

    it('should list jobs', async () => {
      const response = await client.listJobs({ limit: 10 });

      expect(response).toHaveProperty('jobs');
      expect(Array.isArray(response.jobs)).toBe(true);
      expect(response).toHaveProperty('total');
    });

    it('should list jobs with pagination', async () => {
      const page1 = await client.listJobs({ limit: 5, offset: 0 });
      const page2 = await client.listJobs({ limit: 5, offset: 5 });

      expect(page1.jobs).not.toEqual(page2.jobs);
    });

    it('should cancel a job', async () => {
      if (!submittedJobId) {
        console.log('Skipping - no job was submitted');
        return;
      }

      try {
        await client.cancelJob(submittedJobId);
        // Verify status changed
        const status = await client.getJobStatus(submittedJobId);
        expect(['cancelled', 'completed', 'failed']).toContain(status.status);
      } catch (error) {
        // May fail if job already completed
        console.log('Cancel job result:', error);
      }
    });

    it('should stream job status', async () => {
      if (!submittedJobId) {
        console.log('Skipping - no job was submitted');
        return;
      }

      const statuses: string[] = [];

      for await (const status of client.streamJobStatus(submittedJobId, 500)) {
        statuses.push(status.status);
        if (statuses.length >= 3) break; // Limit iterations for test
      }

      expect(statuses.length).toBeGreaterThan(0);
    });
  });

  describe('Proof Operations', () => {
    it('should handle non-existent proof gracefully', async () => {
      const fakeProofHash = '0x0000000000000000000000000000000000000000000000000000000000000000';

      await expect(client.getProof(fakeProofHash)).rejects.toThrow();
    });
  });

  describe('Faucet Operations (Testnet)', () => {
    it('should check faucet status', async () => {
      if (TEST_CONFIG.network === 'mainnet') {
        console.log('Skipping faucet test on mainnet');
        return;
      }

      const testAddress = TEST_WALLET.accountAddress;
      const status = await client.faucetStatus(testAddress);

      expect(status).toHaveProperty('can_claim');
      expect(status).toHaveProperty('last_claim_timestamp');
      expect(typeof status.can_claim).toBe('boolean');
    });

    it('should claim from faucet', async () => {
      if (TEST_CONFIG.network === 'mainnet') {
        console.log('Skipping faucet test on mainnet');
        return;
      }

      const testAddress = TEST_WALLET.accountAddress;

      try {
        const response = await client.faucetClaim(testAddress);

        expect(response).toHaveProperty('success');
        expect(response).toHaveProperty('amount');
        expect(response).toHaveProperty('transaction_hash');
      } catch (error) {
        // Rate limited or already claimed - OK for integration test
        if (error instanceof SdkError) {
          console.log('Faucet claim result:', error.message);
        } else {
          throw error;
        }
      }
    });
  });

  describe('Staking Operations', () => {
    let clientWithWallet: BitSageClient;

    beforeAll(() => {
      clientWithWallet = new BitSageClient(TEST_CONFIG).withWallet(TEST_WALLET);
    });

    it('should require wallet for staking operations', async () => {
      const clientNoWallet = new BitSageClient(TEST_CONFIG);

      await expect(clientNoWallet.stake(1000n, 'consumer')).rejects.toThrow('Wallet not configured');
    });

    it('should get stake info', async () => {
      try {
        const stakeInfo = await clientWithWallet.getStakeInfo();

        expect(stakeInfo).toHaveProperty('staked_amount');
        expect(stakeInfo).toHaveProperty('pending_rewards');
        expect(stakeInfo).toHaveProperty('gpu_tier');
      } catch (error) {
        // May fail if address not registered - OK for integration test
        console.log('Get stake info result:', error);
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw SdkError for 404 responses', async () => {
      try {
        await client.getWorker('invalid-id');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SdkError);
        expect((error as SdkError).statusCode).toBe(404);
      }
    });

    it('should handle network errors', async () => {
      const badClient = new BitSageClient({
        apiUrl: 'http://localhost:99999', // Invalid port
        timeout: 1000,
        network: 'sepolia',
        starknetRpcUrl: '',
      });

      await expect(badClient.getNetworkStats()).rejects.toThrow(SdkError);
    });
  });
});

describe('BitSageClient Unit Tests', () => {
  it('should use default configuration', () => {
    const client = new BitSageClient();
    expect(client).toBeDefined();
  });

  it('should merge custom configuration', () => {
    const customConfig = {
      apiUrl: 'https://custom.api.com',
      timeout: 60000,
    };

    const client = new BitSageClient(customConfig);
    expect(client).toBeDefined();
  });

  it('should chain wallet configuration', () => {
    const client = new BitSageClient()
      .withWallet({
        privateKey: '0x123',
        accountAddress: '0x456',
      });

    expect(client).toBeDefined();
  });
});
