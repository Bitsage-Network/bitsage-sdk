# @bitsage/sdk

Official TypeScript SDK for the BitSage Network - Decentralized Compute with Privacy.

## Installation

```bash
npm install @bitsage/sdk
# or
yarn add @bitsage/sdk
# or
pnpm add @bitsage/sdk
```

## Features

- **Obelysk Privacy Layer** - Client-side ElGamal encryption and Schnorr proofs for private payments
- **STWO GPU Prover** - GPU-accelerated proof generation for batch operations
- **Confidential Swaps** - Trade tokens privately with encrypted amounts
- **Staking & Workers** - Manage stake and worker nodes
- **React Hooks** - Ready-to-use hooks for React applications

---

## Quick Start

### Basic Setup

```typescript
import { BitSageClient } from '@bitsage/sdk';

const client = new BitSageClient({
  network: 'sepolia', // or 'mainnet'
  apiKey: 'your-api-key',
});

// Submit a compute job
const job = await client.submitJob({
  job_type: { type: 'ai_inference', model_type: 'llama-7b', batch_size: 1 },
  input_data: btoa('Hello, BitSage!'),
  max_cost_sage: 100n,
  priority: 5,
});

console.log('Job ID:', job.job_id);
```

---

## Obelysk Privacy Layer

The Obelysk Privacy Layer enables fully private on-chain payments using ElGamal encryption and Schnorr zero-knowledge proofs. **All cryptography runs client-side** - no server ever sees your amounts.

### Private Payments

```typescript
import { ObelyskPrivacy, ConfidentialSwapClient } from '@bitsage/sdk';

// Initialize privacy module
const privacy = new ObelyskPrivacy();

// Generate your key pair (store securely!)
const keyPair = privacy.generateKeyPair();
console.log('Public Key:', keyPair.publicKey);

// Encrypt an amount (only you and recipient can see it)
const amount = 1000n; // 1000 SAGE
const encrypted = privacy.encrypt(amount, recipientPublicKey);
console.log('Encrypted:', encrypted.c1, encrypted.c2);

// Create a proof that amount is valid (without revealing it)
const proof = privacy.createEncryptionProof(amount, keyPair, encrypted);

// Verify proof (anyone can do this)
const isValid = privacy.verifyEncryptionProof(proof, keyPair.publicKey, encrypted);
console.log('Proof valid:', isValid); // true
```

### Confidential Swaps

```typescript
import { ConfidentialSwapClient } from '@bitsage/sdk';

const swapClient = new ConfidentialSwapClient({
  contractAddress: '0x...',
  proverUrl: 'https://prover.bitsage.network',
});

// Create a private order (amounts hidden on-chain)
const order = await swapClient.createPrivateOrder({
  giveAsset: 'SAGE',
  wantAsset: 'USDC',
  giveAmount: 1000n,
  wantAmount: 100n,
});

console.log('Order ID:', order.orderId);
console.log('Encrypted amounts:', order.encryptedGive, order.encryptedWant);
```

### Privacy Operations Reference

| Operation | Privacy | Speed | Cost |
|-----------|---------|-------|------|
| `encrypt()` | Full | < 1ms | Free |
| `createEncryptionProof()` | Full | ~50ms | Free |
| `createRangeProof()` | Full | ~100ms | Free |
| `verifyProof()` | N/A | < 10ms | Free |
| On-chain verification | Full | N/A | ~$0.03 |

---

## STWO GPU Prover

For batch operations and complex computations, use the STWO GPU Prover to generate proofs efficiently.

### When to Use STWO GPU

| Scenario | Recommendation | Savings |
|----------|---------------|---------|
| Single payment | Client-side Schnorr | - |
| 100+ payments | STWO GPU batch | 95% |
| AI/ML inference | STWO GPU | Required |
| Cross-chain bridge | STWO GPU | 98% |
| Gaming state | STWO GPU batch | 99% |

### Basic Usage

```typescript
import { createStwoProverClient, PROOF_TYPES, GPU_TIERS } from '@bitsage/sdk';

const prover = createStwoProverClient({
  baseUrl: 'https://prover.bitsage.network',
  apiKey: 'your-api-key',
});

// Submit a proof generation job
const job = await prover.submitProofJob({
  proofType: PROOF_TYPES.BATCH_PAYMENTS,
  publicInputs: [/* payment data */],
  priority: 'high',
  gpuTier: GPU_TIERS.H100,
});

console.log('Job ID:', job.jobId);
console.log('Estimated cost:', job.estimatedCostUsdc, 'USDC');
console.log('Estimated time:', job.estimatedTimeSecs, 'seconds');

// Wait for completion with progress updates
const result = await prover.waitForProof(job.jobId, {
  onProgress: (status) => {
    console.log(`Progress: ${status.progressBps / 100}%`);
    console.log(`Phase: ${status.currentPhase}`);
  },
});

console.log('Proof hash:', result.proofHash);
console.log('Actual cost:', result.costUsdc, 'USDC');
```

### Batch Operations (95-99% Cost Savings)

```typescript
// Batch 1000 payments into a single proof
const payments = [
  { sender: '0x...', recipient: '0x...', amount: 100n, asset: 'SAGE' },
  // ... 999 more payments
];

const result = await prover.proveBatchPayments(payments, {
  priority: 'high',
  requireTee: true, // Use TEE for privacy
});

// Cost: ~$0.25 instead of $30 (99% savings!)
console.log('Batch proof hash:', result.proofHash);
```

### AI/ML Inference Proofs

```typescript
// Prove AI inference was computed correctly
const result = await prover.proveInference(
  'llama-7b',           // Model ID
  [/* input tokens */], // Inputs
  [/* output tokens */], // Outputs
  { requireTee: true }   // Keep data private
);

console.log('Inference proof:', result.proofHash);
```

### Cross-Chain Bridge Proofs

```typescript
// Prove a transaction occurred on another chain
const result = await prover.proveBridge(
  'ethereum',                    // Source chain
  '0xabc...def',                 // Transaction hash
  ['0x...', '0x...', '0x...'],   // Block headers
  { priority: 'critical' }
);

console.log('Bridge proof:', result.proofHash);
```

### Recursive Proof Aggregation

```typescript
// Aggregate multiple proofs into one
const proofHashes = [
  '0x111...',
  '0x222...',
  '0x333...',
];

const aggregated = await prover.aggregateProofs(proofHashes);
console.log('Aggregated proof:', aggregated.proofHash);
// Verify once instead of 3 times!
```

### Cost Estimation

```typescript
// Estimate cost before submitting
const estimate = await prover.estimateCost({
  proofType: PROOF_TYPES.BATCH_PAYMENTS,
  publicInputs: new Array(1000).fill(0n),
  priority: 'high',
  requireTee: true,
});

console.log('Estimated cost:', estimate.costUsdc, 'USDC');
console.log('Breakdown:');
console.log('  Base:', estimate.breakdown.baseCost);
console.log('  Priority:', estimate.breakdown.prioritySurcharge);
console.log('  TEE:', estimate.breakdown.teeSurcharge);
```

### Network Metrics

```typescript
// Check network status
const metrics = await prover.getMetrics();

console.log('Available GPUs:');
for (const gpu of metrics.availableGpus) {
  console.log(`  ${gpu.tier}: ${gpu.count} (${gpu.teeEnabled} TEE)`);
}

console.log('Queue depth:', metrics.queueDepth);
console.log('Avg wait time:', metrics.avgWaitTimeSecs, 'seconds');
console.log('Utilization:', metrics.networkUtilization * 100, '%');
```

---

## Full Privacy Client

For advanced privacy operations including steganographic transactions, ring signatures, and threshold decryption.

```typescript
import { createPrivacyClient } from '@bitsage/sdk';

const privacy = createPrivacyClient({
  contractAddress: '0x...',
  httpUrl: 'https://api.bitsage.network',
});

// Register a private account
const account = await privacy.registerAccount(keyPair);

// Private transfer
const tx = await privacy.privateTransfer({
  recipientPublicKey: recipient.publicKey,
  amount: 500n,
  asset: 'SAGE',
});

// Check encrypted balance
const balance = await privacy.getEncryptedBalance(myAddress, 'SAGE');

// Reveal balance (client-side decryption)
const revealed = await privacy.revealBalance(keyPair, 'SAGE');
console.log('My SAGE balance:', revealed);
```

---

## React Hooks

```typescript
import { useBitSage, usePrivacy, useStwoProver } from '@bitsage/sdk/react';

function App() {
  const { client, isConnected } = useBitSage();
  const { privacy, keyPair, generateKeyPair } = usePrivacy();
  const { prover, submitJob, status } = useStwoProver();

  return (
    <div>
      <button onClick={generateKeyPair}>Generate Keys</button>
      <button onClick={() => submitJob({ ... })}>Submit Proof</button>
      {status && <p>Progress: {status.progressBps / 100}%</p>}
    </div>
  );
}
```

---

## Contract Registry

```typescript
import {
  SEPOLIA_CONTRACTS,
  MAINNET_CONTRACTS,
  getContractsForNetwork
} from '@bitsage/sdk';

// Get contracts for a network
const contracts = getContractsForNetwork('sepolia');

console.log('SAGE Token:', contracts.sageToken);
console.log('Confidential Swap:', contracts.confidentialSwap);
console.log('Privacy Router:', contracts.privacyRouter);
console.log('STWO Verifier:', contracts.stwoVerifier);
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              @bitsage/sdk                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   OBELYSK PRIVACY (Client-Side)         STWO GPU PROVER (Server-Side)      │
│   ─────────────────────────────         ──────────────────────────────     │
│   • ElGamal encryption                  • Batch proof generation           │
│   • Schnorr proofs                      • GPU acceleration (H100/H200)     │
│   • Range proofs                        • TEE privacy (optional)           │
│   • Confidential swaps                  • Recursive aggregation            │
│                                                                             │
│   import { ObelyskPrivacy }             import { createStwoProverClient }  │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                              STARKNET L2                                    │
│                     • Proof verification                                    │
│                     • Encrypted balances                                    │
│                     • Atomic swaps                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## API Reference

### ObelyskPrivacy

| Method | Description |
|--------|-------------|
| `generateKeyPair()` | Generate ElGamal key pair |
| `encrypt(amount, publicKey)` | Encrypt amount |
| `decrypt(ciphertext, privateKey)` | Decrypt ciphertext |
| `homomorphicAdd(c1, c2)` | Add encrypted values |
| `createEncryptionProof()` | Create Schnorr proof |
| `verifyEncryptionProof()` | Verify proof |

### StwoProverClient

| Method | Description |
|--------|-------------|
| `submitProofJob(request)` | Submit proof generation job |
| `getJobStatus(jobId)` | Get job status |
| `waitForProof(jobId)` | Wait for completion |
| `cancelJob(jobId)` | Cancel pending job |
| `submitBatch(request)` | Submit batch of proofs |
| `estimateCost(request)` | Estimate proof cost |
| `getMetrics()` | Get network metrics |
| `proveBatchPayments()` | Helper for batch payments |
| `proveInference()` | Helper for AI inference |
| `proveBridge()` | Helper for bridge proofs |
| `aggregateProofs()` | Recursive aggregation |
| `loadZkmlModel(req)` | Load ONNX model on prover server |
| `submitZkmlProve(req)` | Submit ZKML proving job |
| `getZkmlProveStatus(jobId)` | Get ZKML job progress |
| `getZkmlProveResult(jobId)` | Get proof calldata + commitments |
| `proveZkml(req, opts?)` | Full prove pipeline with progress callback |

### StwoClient (On-Chain Verification)

| Method | Description |
|--------|-------------|
| `submitProof(data, hash)` | Submit proof for verification |
| `verifyProof(hash)` | Verify proof via contract |
| `submitGpuTeeProof(params)` | Submit GPU-TEE optimistic proof |
| `registerZkmlModel(id, commitment)` | Register model on verifier contract |
| `verifyZkmlModel(id, calldata)` | Verify ML model proof on-chain |
| `isZkmlProofVerified(hash)` | Check if proof is verified |
| `getZkmlVerificationCount(id)` | Get verification count for model |
| `getZkmlModelCommitment(id)` | Get registered weight commitment |
| `proveAndVerifyOnChain(prover, req)` | End-to-end: prove via API + verify on-chain |

---

## ZKML Proving

End-to-end ML inference proving and on-chain verification.

### Prove a Model

```typescript
import { createStwoProverClient } from '@bitsage/sdk';

const prover = createStwoProverClient({
  baseUrl: 'http://your-gpu-server:8080',
});

// Load an ONNX model
const model = await prover.loadZkmlModel({
  modelPath: '/path/to/model.onnx',
  description: 'Qwen3-14B block 0',
});
console.log('Model ID:', model.modelId);
console.log('Weight commitment:', model.weightCommitment);

// Prove with progress tracking
const result = await prover.proveZkml(
  { modelId: model.modelId, gpu: true },
  {
    onProgress: (status) => {
      console.log(`${(status.progressBps / 100).toFixed(1)}% — ${status.elapsedSecs.toFixed(1)}s`);
    },
    pollIntervalMs: 2000,
    timeoutMs: 300_000,
  }
);

console.log('Calldata:', result.calldataLength, 'felts');
console.log('Gas estimate:', result.estimatedGas);
console.log('Prove time:', (result.proveTimeMs / 1000).toFixed(1), 's');
```

### Verify On-Chain

```typescript
import { createStwoClient } from '@bitsage/sdk';

const verifier = createStwoClient({ /* ... */ });

// Set verifier contract (default: deployed v3 on Sepolia)
verifier.setZkmlVerifier('0x048070fbd531a0192f3d4a37eb019ae3174600cae15e08c737982fae5d929160');

// Register model
await verifier.registerZkmlModel(model.modelId, model.weightCommitment);

// Check verification status
const count = await verifier.getZkmlVerificationCount(model.modelId);
console.log('Verified', count, 'times');
```

### Full Pipeline

```typescript
// Prove on GPU server + verify on Starknet in one call
const tx = await verifier.proveAndVerifyOnChain(prover, {
  modelId: model.modelId,
  gpu: true,
});
console.log('Transaction hash:', tx);
```

---

## License

MIT
