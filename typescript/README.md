# @obelyzk/sdk

TypeScript SDK for ObelyZK -- verifiable ML inference on Starknet.

Prove any supported model and get an on-chain verification receipt in a single call. All proofs use full OODS + Merkle + FRI + PoW (trustless) verification.

## Installation

```bash
npm install @obelyzk/sdk
```

## Quick Start

```typescript
import { createProverClient } from "@obelyzk/sdk";

const client = createProverClient();

// Prove a model and verify on-chain
const result = await client.prove({
  model: "smollm2-135m",
  input: [1.0, 2.0, 3.0],
  onChain: true,
});

console.log("Output:", result.output);
console.log("Proof hash:", result.proofHash);
console.log("TX hash:", result.txHash);
console.log("Verified:", result.verified);
```

## API Reference

### `createProverClient(options?)`

Create a prover client instance.

```typescript
const client = createProverClient({
  url: "https://api.obelysk.com",  // default; or your own GPU prover
  apiKey: "your-api-key",           // optional, for rate limiting
  timeout: 300_000,                 // request timeout in ms (default: 5 min)
});
```

### `client.prove(request)`

Prove an ML model execution and optionally verify on-chain.

```typescript
const result = await client.prove({
  model: "smollm2-135m",        // model name or HuggingFace ID
  input: [1.0, 2.0, 3.0],      // input tensor (flat array)
  onChain: true,                 // submit to Starknet (default: false)
  recursive: true,               // use recursive STARK (default: true)
  network: "sepolia",            // Starknet network (default: "sepolia")
});

// result: {
//   output: number[],           // model output tensor
//   proofHash: string,          // Poseidon hash of the proof
//   txHash?: string,            // Starknet TX hash (if onChain: true)
//   verified?: boolean,         // on-chain verification status
//   proveTime: number,          // proving time in seconds (~102s for SmolLM2)
//   recursiveTime: number,      // recursive STARK time (~3.55s)
//   felts: number,              // calldata size in felts (~942)
//   modelId: string,            // hex model identifier
// }
```

### `client.attest(request)`

Prove and submit a full attestation with streaming verification.

```typescript
const attestation = await client.attest({
  model: "smollm2-135m",
  input: [1.0, 2.0, 3.0],
  submitOnChain: true,
});
```

### `client.getModels()`

List all available models on the prover.

```typescript
const models = await client.getModels();
// [{ name: "smollm2-135m", params: "135M", layers: 30, ... }, ...]
```

### `client.getJob(jobId)`

Check the status of an async proving job.

```typescript
const job = await client.getJob("job-abc123");
// { status: "completed", progress: 100, result: { ... } }
```

## Async Jobs

For large models, proving runs asynchronously:

```typescript
const { jobId } = await client.prove({
  model: "phi-3-mini",
  input: data,
  async: true,
});

// Poll for completion
let job;
do {
  await new Promise(r => setTimeout(r, 5000));
  job = await client.getJob(jobId);
  console.log(`Progress: ${job.progress}%`);
} while (job.status === "running");

console.log("Result:", job.result);
```

## Supported Models

| Model | Params | Prove Time (GPU) | Recursive Felts |
|-------|--------|-------------------|-----------------|
| SmolLM2-135M | 135M | ~102s | 942 |
| Qwen2-0.5B | 500M | ~45s | ~900 |
| Phi-3-mini | 3.8B | ~180s | ~950 |

## On-Chain Verification

When `onChain: true`, the SDK submits the proof to the ObelyZK Recursive Verifier contract on Starknet Sepolia. Verification uses full OODS + Merkle + FRI + PoW (trustless).

- **Contract:** `0x526fcdb940f92dc50bc3a234ffafe6d08d7b2e3b69f6cb41678331ee6a5a03c`
- **Method:** `verify_recursive(model_id, io_commitment, stark_proof_data)`
- **Verification:** Full OODS + Merkle + FRI + PoW (trustless)
- **Felts:** ~942 per proof (49x compression)
- **Cost:** ~$0.02 per verification on Sepolia

You can verify independently:

```typescript
import { RpcProvider } from "starknet";

const provider = new RpcProvider({
  nodeUrl: "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_8/demo",
});

const result = await provider.callContract({
  contractAddress: "0x526fcdb940f92dc50bc3a234ffafe6d08d7b2e3b69f6cb41678331ee6a5a03c",
  entrypoint: "get_recursive_verification_count",
  calldata: [modelId],
});

console.log("Verification count:", result[0]);
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OBELYSK_API_KEY` | API key for hosted prover | For hosted |
| `OBELYSK_PROVER_URL` | Custom prover URL | For self-hosted |
| `STARKNET_ACCOUNT` | Starknet account address | For on-chain |
| `STARKNET_PRIVATE_KEY` | Starknet private key | For on-chain |

## Self-Hosted Prover

Point the SDK at your own GPU prover instead of the hosted service:

```typescript
const client = createProverClient({
  url: "http://your-gpu-server:8080",
});
```

See the [Self-Hosting Guide](../../libs/stwo-ml/scripts/pipeline/GETTING_STARTED.md#option-3-self-host-a-gpu-prover) for setup instructions.

## Links

- [GitHub](https://github.com/obelyzk/stwo-ml)
- [npm](https://www.npmjs.com/package/@obelyzk/sdk)
- [Getting Started](../../libs/stwo-ml/scripts/pipeline/GETTING_STARTED.md)
- [On-Chain Docs](../../libs/stwo-ml/docs/ON_CHAIN_VERIFICATION.md)
