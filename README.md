# ObelyZK SDK

Unified SDKs for verifiable ML inference on Starknet. Prove any model, verify on-chain in 1 transaction with full OODS + Merkle + FRI + PoW (trustless) verification.

## Packages

| Package | Language | Install | Description |
|---------|----------|---------|-------------|
| [@obelyzk/sdk](./typescript/) | TypeScript | `npm install @obelyzk/sdk` | Full-featured prover client with async jobs |
| [obelyzk](./python/) | Python | `pip install obelyzk` | Pythonic API with sync and async support |
| [@obelyzk/cli](./cli/) | CLI | `npm install -g @obelyzk/cli` | Command-line proving and submission |
| @obelyzk/mcp-server | MCP | `npm install @obelyzk/mcp-server` | Claude AI tool integration (40+ tools) |

## API Comparison

| Feature | TypeScript | Python | CLI |
|---------|-----------|--------|-----|
| Prove a model | `client.prove({ model, input })` | `client.prove(model, input)` | `obelysk prove --model --input` |
| List models | `client.getModels()` | `client.models()` | `obelysk models` |
| Attestation | `client.attest({ model, input })` | `client.attest(model, input)` | `obelysk prove --on-chain` |
| Async support | Native Promises | `AsyncObelyzkClient` | Background jobs |
| Job polling | `client.getJob(id)` | `client.job(id)` | `obelysk status --job` |
| Config | Constructor options | Constructor args | `obelysk config` |

## Quick Start

### TypeScript

```typescript
import { createProverClient } from "@obelyzk/sdk";

const client = createProverClient();
const result = await client.prove({
  model: "smollm2-135m",
  input: [1.0, 2.0, 3.0],
  onChain: true,
});

console.log("Proof TX:", result.txHash);
console.log("Verified:", result.verified);
```

See the full [TypeScript SDK README](./typescript/README.md) for API reference and examples.

### Python

```python
from obelyzk import ObelyzkClient

client = ObelyzkClient()
result = client.prove(
    model="smollm2-135m",
    input=[1.0, 2.0, 3.0],
    on_chain=True,
)

print(f"Proof TX: {result.tx_hash}")
print(f"Verified: {result.verified}")
```

See the full [Python SDK README](./python/README.md) for API reference and async usage.

### CLI

```bash
# Install
npm install -g @obelyzk/cli

# Prove and verify on-chain
obelysk prove --model smollm2-135m --input "Hello world" --on-chain

# List available models
obelysk models
```

See the full [CLI README](./cli/README.md) for all commands and flags.

## How It Works

1. Your SDK call hits the hosted GPU prover at `https://api.obelysk.com`
2. The prover executes the model over the M31 field and generates a GKR sumcheck proof
3. A recursive STARK compresses the proof to ~942 felts (constant size, 49x compression)
4. The proof is verified on Starknet Sepolia in a single transaction using full OODS + Merkle + FRI + PoW (trustless)

## On-Chain Verification

All proofs are verified by the ObelyZK Recursive Verifier contract on Starknet Sepolia:

- **Contract:** `0x526fcdb940f92dc50bc3a234ffafe6d08d7b2e3b69f6cb41678331ee6a5a03c`
- **Verification:** Full OODS + Merkle + FRI + PoW (trustless)
- **Network:** Starknet Sepolia
- **Felts:** ~942 per proof
- **Compression:** 49x vs raw GKR data
- **Cost:** ~$0.02 per verification

## Supported Models

| Model | Params | Prove Time (GPU) | Recursive Felts |
|-------|--------|-------------------|-----------------|
| SmolLM2-135M | 135M | ~102s | 942 |
| Qwen2-0.5B | 500M | ~45s | ~900 |
| Phi-3-mini | 3.8B | ~180s | ~950 |
| Custom HuggingFace | Any LLaMA/Qwen/Phi | Varies | ~950 |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OBELYSK_API_KEY` | API key for hosted prover | For hosted |
| `OBELYSK_PROVER_URL` | Custom prover URL | For self-hosted |
| `STARKNET_ACCOUNT` | Starknet account address | For on-chain |
| `STARKNET_PRIVATE_KEY` | Starknet private key | For on-chain |

## Configuration

All SDKs accept a prover URL. Default is the hosted service:

```typescript
// Use hosted prover (default)
const client = createProverClient();

// Use your own GPU prover
const client = createProverClient({ url: "http://your-gpu:8080" });
```

## Links

- [Main Documentation](../libs/stwo-ml/README.md)
- [Getting Started Guide](../libs/stwo-ml/scripts/pipeline/GETTING_STARTED.md)
- [On-Chain Verification](../libs/stwo-ml/docs/ON_CHAIN_VERIFICATION.md)
- [npm: @obelyzk/sdk](https://www.npmjs.com/package/@obelyzk/sdk)
- [PyPI: obelyzk](https://pypi.org/project/obelyzk/)
