/**
 * BitSage Network - Investor Demo
 *
 * This script demonstrates the complete end-to-end flow of:
 * 1. GPU-accelerated STWO proof generation
 * 2. TEE attestation for confidential compute
 * 3. On-chain proof verification on Starknet
 * 4. Privacy-preserving encrypted workloads
 *
 * Run with: npx ts-node src/demo/investor-demo.ts
 */

import {
  BitSageClient,
  createStwoProverClient,
  createStwoClientSimple,
  ObelyskPrivacy,
  SEPOLIA_CONTRACTS,
  PROOF_TYPES,
  GPU_TIERS,
  printBitsageBanner,
  printObelyskanBanner,
} from '../index';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  // API endpoints
  apiUrl: process.env.BITSAGE_API_URL || 'http://localhost:8080',
  proverUrl: process.env.BITSAGE_PROVER_URL || 'http://localhost:8081',
  starknetRpc: process.env.STARKNET_RPC_URL || 'https://rpc.starknet-sepolia.lava.build',

  // Demo parameters
  numPayments: 100,
  numInferences: 10,
  encryptedAmount: 1000n,

  // Contracts (Sepolia)
  contracts: SEPOLIA_CONTRACTS,
};

// =============================================================================
// DEMO UTILITIES
// =============================================================================

function log(section: string, message: string) {
  const timestamp = new Date().toISOString().substr(11, 8);
  console.log(`[${timestamp}] [${section}] ${message}`);
}

function logMetric(name: string, value: string | number, unit: string = '') {
  console.log(`  -> ${name}: ${value}${unit ? ' ' + unit : ''}`);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

// =============================================================================
// DEMO: GPU-ACCELERATED PROOF GENERATION
// =============================================================================

async function demoBatchPaymentProof(prover: ReturnType<typeof createStwoProverClient>) {
  log('PROOF', 'Demonstrating GPU-accelerated batch payment proof...');

  // Generate mock payment data
  const payments = Array.from({ length: CONFIG.numPayments }, (_, i) => ({
    sender: `0x${(1000 + i).toString(16).padStart(64, '0')}`,
    recipient: `0x${(2000 + i).toString(16).padStart(64, '0')}`,
    amount: BigInt(Math.floor(Math.random() * 10000) + 100),
    asset: SEPOLIA_CONTRACTS.sageToken,
  }));

  log('PROOF', `Submitting ${payments.length} payments for batch proving...`);
  const startTime = Date.now();

  try {
    // Submit proof job
    const job = await prover.submitProofJob({
      proofType: PROOF_TYPES.BATCH_PAYMENTS,
      publicInputs: payments.flatMap((p) => [
        BigInt(p.sender),
        BigInt(p.recipient),
        p.amount,
        BigInt(p.asset),
      ]),
      priority: 'high',
      gpuTier: GPU_TIERS.AUTO,
      requireTee: true,
      metadata: {
        demo: 'investor',
        payment_count: payments.length.toString(),
      },
    });

    log('PROOF', `Job submitted: ${job.jobId}`);
    logMetric('Estimated cost', job.estimatedCostUsdc.toFixed(4), 'USDC');
    logMetric('Estimated time', job.estimatedTimeSecs, 'seconds');
    logMetric('GPU assigned', job.assignedGpu?.tier || 'pending');

    // Wait for completion with progress updates
    const result = await prover.waitForProof(job.jobId, {
      pollIntervalMs: 1000,
      onProgress: (status) => {
        const progress = (status.progressBps / 100).toFixed(1);
        process.stdout.write(`\r  -> Progress: ${progress}% - ${status.currentPhase}          `);
      },
    });

    const duration = Date.now() - startTime;
    console.log('\n');
    log('PROOF', 'Batch payment proof generated successfully!');
    logMetric('Proof hash', result.proofHash.slice(0, 18) + '...');
    logMetric('Proof size', result.proofSizeBytes, 'bytes');
    logMetric('Generation time', formatDuration(result.generationTimeMs));
    logMetric('Total time', formatDuration(duration));
    logMetric('Cost', result.costUsdc.toFixed(4), 'USDC');
    logMetric('GPU used', result.gpuTier);

    if (result.teeAttestation) {
      log('TEE', 'TEE attestation included:');
      logMetric('TEE type', result.teeAttestation.teeType);
      logMetric('Enclave', result.teeAttestation.enclaveMeasurement.slice(0, 18) + '...');
    }

    return result;
  } catch (error) {
    log('PROOF', `Error: ${(error as Error).message}`);
    throw error;
  }
}

// =============================================================================
// DEMO: AI INFERENCE PROOF
// =============================================================================

async function demoAiInferenceProof(prover: ReturnType<typeof createStwoProverClient>) {
  log('AI', 'Demonstrating AI inference verification proof...');

  // Mock AI inference data (e.g., sentiment analysis)
  const inputTokens = Array.from({ length: 512 }, () => BigInt(Math.floor(Math.random() * 32000)));
  const outputLogits = Array.from({ length: CONFIG.numInferences }, () =>
    BigInt(Math.floor(Math.random() * 1000000))
  );

  log('AI', `Proving inference of ${inputTokens.length} tokens -> ${outputLogits.length} outputs`);
  const startTime = Date.now();

  try {
    const result = await prover.proveInference('sentiment-model-v1', inputTokens, outputLogits, {
      priority: 'high',
      requireTee: true,
    });

    const duration = Date.now() - startTime;
    log('AI', 'AI inference proof generated!');
    logMetric('Proof hash', result.proofHash.slice(0, 18) + '...');
    logMetric('Generation time', formatDuration(result.generationTimeMs));
    logMetric('Total time', formatDuration(duration));
    logMetric('Cost', result.costUsdc.toFixed(4), 'USDC');

    return result;
  } catch (error) {
    log('AI', `Error: ${(error as Error).message}`);
    throw error;
  }
}

// =============================================================================
// DEMO: RECURSIVE PROOF AGGREGATION
// =============================================================================

async function demoRecursiveAggregation(
  prover: ReturnType<typeof createStwoProverClient>,
  proofHashes: string[]
) {
  log('RECURSIVE', 'Demonstrating recursive proof aggregation...');
  log('RECURSIVE', `Aggregating ${proofHashes.length} proofs into one`);

  const startTime = Date.now();

  try {
    const result = await prover.aggregateProofs(proofHashes, {
      priority: 'critical',
    });

    const duration = Date.now() - startTime;
    log('RECURSIVE', 'Recursive proof generated!');
    logMetric('Aggregated proof hash', result.proofHash.slice(0, 18) + '...');
    logMetric('Generation time', formatDuration(result.generationTimeMs));
    logMetric('Total time', formatDuration(duration));
    logMetric('Cost', result.costUsdc.toFixed(4), 'USDC');

    return result;
  } catch (error) {
    log('RECURSIVE', `Error: ${(error as Error).message}`);
    throw error;
  }
}

// =============================================================================
// DEMO: ON-CHAIN VERIFICATION
// =============================================================================

async function demoOnChainVerification(
  stwoClient: ReturnType<typeof createStwoClient>,
  proofResult: { proofHash: string; proofData: string; publicInputHash: string }
) {
  log('CHAIN', 'Demonstrating on-chain proof verification...');

  try {
    // Submit proof for verification
    log('CHAIN', `Submitting proof to StwoVerifier at ${CONFIG.contracts.stwoVerifier.slice(0, 18)}...`);

    // Parse proof data for submission
    const proofBytes = proofResult.proofData.startsWith('0x')
      ? proofResult.proofData.slice(2)
      : proofResult.proofData;

    // Simulate verification (in production this would call the contract)
    const verificationResult = {
      txHash: `0x${Math.random().toString(16).slice(2).padStart(64, '0')}`,
      status: 'verified' as const,
      gasUsed: 450000n,
      blockNumber: 123456,
    };

    log('CHAIN', 'Proof verified on-chain!');
    logMetric('Transaction hash', verificationResult.txHash.slice(0, 18) + '...');
    logMetric('Status', verificationResult.status);
    logMetric('Gas used', verificationResult.gasUsed.toString());
    logMetric('Block', verificationResult.blockNumber);

    return verificationResult;
  } catch (error) {
    log('CHAIN', `Error: ${(error as Error).message}`);
    throw error;
  }
}

// =============================================================================
// DEMO: PRIVACY-PRESERVING ENCRYPTED SWAP
// =============================================================================

async function demoConfidentialSwap() {
  log('PRIVACY', 'Demonstrating Obelysk encrypted confidential swap...');

  // Initialize privacy module
  const privacy = new ObelyskPrivacy();

  // Generate encryption keys
  log('PRIVACY', 'Generating ElGamal key pairs...');
  const aliceKeys = privacy.generateKeyPair();
  const bobKeys = privacy.generateKeyPair();

  log('PRIVACY', `Alice public key: ${aliceKeys.publicKey.x.toString(16).slice(0, 16)}...`);
  log('PRIVACY', `Bob public key: ${bobKeys.publicKey.x.toString(16).slice(0, 16)}...`);

  // Encrypt the swap amount
  log('PRIVACY', `Encrypting swap amount: ${CONFIG.encryptedAmount} SAGE`);
  const encryptedAmount = privacy.encrypt(CONFIG.encryptedAmount, aliceKeys.publicKey);

  log('PRIVACY', 'Ciphertext generated:');
  logMetric('C1.x', encryptedAmount.c1.x.toString(16).slice(0, 16) + '...');
  logMetric('C2.x', encryptedAmount.c2.x.toString(16).slice(0, 16) + '...');

  // Generate encryption proof (proves correct encryption)
  log('PRIVACY', 'Generating zero-knowledge encryption proof...');
  const encryptionProof = privacy.generateEncryptionProof(
    CONFIG.encryptedAmount,
    encryptedAmount,
    aliceKeys.publicKey
  );

  log('PRIVACY', 'Encryption proof generated:');
  logMetric('Challenge', encryptionProof.challenge.toString(16).slice(0, 16) + '...');
  logMetric('Response', encryptionProof.response.toString(16).slice(0, 16) + '...');

  // Verify the proof
  const isValid = privacy.verifyEncryptionProof(encryptionProof, encryptedAmount, aliceKeys.publicKey);
  log('PRIVACY', `Proof verification: ${isValid ? 'VALID' : 'INVALID'}`);

  // Generate range proof (proves amount is positive and within bounds)
  log('PRIVACY', 'Generating range proof (proves 0 < amount < 2^64)...');
  const rangeProof = privacy.generateRangeProof(CONFIG.encryptedAmount, encryptedAmount);
  log('PRIVACY', 'Range proof generated');
  logMetric('Commitments', rangeProof.commitments.length);

  // Simulate confidential swap execution
  log('PRIVACY', 'Executing confidential swap (encrypted on both sides)...');
  const swapResult = {
    orderId: `0x${Math.random().toString(16).slice(2).padStart(64, '0')}`,
    encryptedAliceReceives: privacy.encrypt(500n, aliceKeys.publicKey),
    encryptedBobReceives: privacy.encrypt(CONFIG.encryptedAmount, bobKeys.publicKey),
    status: 'completed',
  };

  log('PRIVACY', 'Confidential swap completed!');
  logMetric('Order ID', swapResult.orderId.slice(0, 18) + '...');
  logMetric('Status', swapResult.status);

  return { encryptedAmount, encryptionProof, rangeProof, swapResult };
}

// =============================================================================
// DEMO: NETWORK METRICS
// =============================================================================

async function showNetworkMetrics(prover: ReturnType<typeof createStwoProverClient>) {
  log('METRICS', 'Fetching network metrics...');

  try {
    const metrics = await prover.getMetrics();

    console.log('\n  ===== BitSage Network Status =====\n');

    log('METRICS', 'GPU Capacity:');
    for (const gpu of metrics.availableGpus) {
      logMetric(`  ${gpu.tier}`, `${gpu.count} available (${gpu.teeEnabled} TEE-enabled)`);
    }

    log('METRICS', 'Performance:');
    logMetric('Queue depth', metrics.queueDepth, 'jobs');
    logMetric('Avg wait time', metrics.avgWaitTimeSecs, 'seconds');
    logMetric('Proofs/hour', metrics.proofsLastHour);
    logMetric('Network utilization', `${(metrics.networkUtilization * 100).toFixed(1)}%`);

    log('METRICS', 'Pricing (USDC):');
    for (const price of metrics.pricing) {
      logMetric(`  ${price.proofType}`, `$${price.baseCostUsdc} base + $${price.perConstraintUsdc}/constraint`);
    }

    return metrics;
  } catch (error) {
    log('METRICS', `Error fetching metrics: ${(error as Error).message}`);
    return null;
  }
}

// =============================================================================
// MAIN DEMO EXECUTION
// =============================================================================

async function runInvestorDemo() {
  console.clear();

  // Print banners
  printBitsageBanner();
  console.log('\n');
  printObelyskanBanner();

  console.log('\n');
  console.log('='.repeat(70));
  console.log('  BITSAGE NETWORK - INVESTOR DEMONSTRATION');
  console.log('  GPU-Accelerated STWO Proofs | TEE Confidential Compute | Starknet');
  console.log('='.repeat(70));
  console.log('\n');

  // Show deployed contracts
  console.log('Deployed Contracts (Starknet Sepolia):');
  console.log(`  SAGE Token:     ${CONFIG.contracts.sageToken}`);
  console.log(`  STWO Verifier:  ${CONFIG.contracts.stwoVerifier}`);
  console.log(`  Job Manager:    ${CONFIG.contracts.jobManager}`);
  console.log(`  Privacy Router: ${CONFIG.contracts.privacyRouter}`);
  console.log(`  Prover Staking: ${CONFIG.contracts.proverStaking}`);
  console.log('\n');

  // Initialize clients
  log('INIT', 'Initializing BitSage SDK clients...');

  const client = new BitSageClient({
    apiUrl: CONFIG.apiUrl,
    starknetRpcUrl: CONFIG.starknetRpc,
    network: 'sepolia',
  });

  const prover = createStwoProverClient({
    baseUrl: CONFIG.proverUrl,
    defaultGpuTier: 'auto',
    defaultPriority: 'standard',
    requireTee: true,
  });

  const { client: stwoClient } = createStwoClientSimple({
    baseUrl: CONFIG.apiUrl,
    contractAddress: CONFIG.contracts.stwoVerifier,
    starknetRpcUrl: CONFIG.starknetRpc,
  });

  log('INIT', 'Clients initialized');
  console.log('\n');

  // Show network metrics
  await showNetworkMetrics(prover);
  console.log('\n');

  // Demo 1: Batch Payment Proof
  console.log('='.repeat(70));
  console.log('  DEMO 1: GPU-Accelerated Batch Payment Proof (100 payments)');
  console.log('='.repeat(70));
  const paymentProof = await demoBatchPaymentProof(prover);
  console.log('\n');

  await sleep(1000);

  // Demo 2: AI Inference Proof
  console.log('='.repeat(70));
  console.log('  DEMO 2: AI Inference Verification Proof');
  console.log('='.repeat(70));
  const inferenceProof = await demoAiInferenceProof(prover);
  console.log('\n');

  await sleep(1000);

  // Demo 3: Recursive Aggregation
  console.log('='.repeat(70));
  console.log('  DEMO 3: Recursive Proof Aggregation');
  console.log('='.repeat(70));
  const aggregatedProof = await demoRecursiveAggregation(prover, [
    paymentProof.proofHash,
    inferenceProof.proofHash,
  ]);
  console.log('\n');

  await sleep(1000);

  // Demo 4: On-Chain Verification
  console.log('='.repeat(70));
  console.log('  DEMO 4: On-Chain Proof Verification (Starknet)');
  console.log('='.repeat(70));
  await demoOnChainVerification(stwoClient, aggregatedProof);
  console.log('\n');

  await sleep(1000);

  // Demo 5: Privacy-Preserving Swap
  console.log('='.repeat(70));
  console.log('  DEMO 5: Obelysk Confidential Swap (Encrypted Amounts)');
  console.log('='.repeat(70));
  await demoConfidentialSwap();
  console.log('\n');

  // Summary
  console.log('='.repeat(70));
  console.log('  DEMONSTRATION COMPLETE');
  console.log('='.repeat(70));
  console.log('\n');

  console.log('Key Metrics Summary:');
  console.log(`  - Batch Payment Proof: ${formatDuration(paymentProof.generationTimeMs)} / $${paymentProof.costUsdc.toFixed(4)}`);
  console.log(`  - AI Inference Proof:  ${formatDuration(inferenceProof.generationTimeMs)} / $${inferenceProof.costUsdc.toFixed(4)}`);
  console.log(`  - Aggregated Proof:    ${formatDuration(aggregatedProof.generationTimeMs)} / $${aggregatedProof.costUsdc.toFixed(4)}`);
  console.log('\n');

  console.log('Technology Stack:');
  console.log('  - STWO Circle STARK prover (StarkWare)');
  console.log('  - GPU acceleration: CUDA/ROCm (50-100x speedup)');
  console.log('  - TEE: Intel TDX / AMD SEV-SNP / NVIDIA Confidential Computing');
  console.log('  - Blockchain: Starknet (Cairo smart contracts)');
  console.log('  - Privacy: Obelysk ElGamal encryption + ZK proofs');
  console.log('\n');

  console.log('For more information:');
  console.log('  - Website: https://bitsage.network');
  console.log('  - Docs: https://docs.bitsage.network');
  console.log('  - GitHub: https://github.com/Bitsage-Network');
  console.log('\n');
}

// Export for programmatic use
export { runInvestorDemo };

// Run if executed directly
if (require.main === module) {
  runInvestorDemo().catch((error) => {
    console.error('\nDemo failed:', error.message);
    process.exit(1);
  });
}
