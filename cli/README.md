# @obelyzk/cli

Command-line interface for ObelyZK -- prove ML models and verify on Starknet from your terminal.

All proofs use full OODS + Merkle + FRI + PoW (trustless) verification on Starknet Sepolia.

## Installation

```bash
# Via npm
npm install -g @obelyzk/cli

# Or one-liner
curl -sSf https://raw.githubusercontent.com/Bitsage-Network/obelyzk.rs/main/install.sh | sh
```

## Quick Start

```bash
# Prove from a text prompt — server tokenizes automatically
obelysk prove smollm2-135m --prompt "Hello world"

# Prove from raw JSON input
obelysk prove smollm2-135m --input "[1.0, 2.0, 3.0]"

# Prove and verify on-chain
obelysk prove smollm2-135m --prompt "Hello world" --on-chain

# List available models
obelysk models

# Download a model for self-hosting
obelysk models --download smollm2-135m
```

## Commands

### `obelysk prove`

Prove a model execution. Uses the hosted GPU prover by default. Accepts text prompts (tokenized server-side) or raw f32 arrays.

```bash
# Text prompt (recommended)
obelysk prove smollm2-135m --prompt "What is zero knowledge?"

# Raw input
obelysk prove smollm2-135m --input "[1.0, 2.0, 3.0]"

# Full options
obelysk prove smollm2-135m \
  --prompt "Hello world" \
  --on-chain \
  --recursive \
  --output proof.json
```

| Flag | Description | Default |
|------|-------------|---------|
| `<model>` | Model name or ID (positional) | (required) |
| `--prompt` | Text prompt (tokenized server-side) | -- |
| `--input` | Raw f32 JSON array | -- |
| `--input-file` | Read input from JSON file | -- |
| `--on-chain` | Submit to Starknet | false |
| `--recursive` | Use recursive STARK (1 TX) | true |
| `--gpu` | Use GPU acceleration | true |
| `--output` | Save proof to file | stdout |
| `--prover-url` | Custom prover URL | `https://api.bitsage.network` |
| `--quiet` | Suppress progress output | false |

When `--prompt` is used, the server tokenizes the text, extracts the embedding, and returns the predicted next token alongside the proof:

```
=== Proof Result ===
Proof ID:      proof-174605e2-...
Tokens:        2 (IDs: 19556, 905)
Predicted:     "the"
IO Commitment: 0x312c67eb...
Prove time:    95523ms
Calldata:      46148 felts
```

### `obelysk submit`

Submit an existing proof to Starknet.

```bash
obelysk submit --proof proof.json --network sepolia
```

### `obelysk models`

List or download available models.

```bash
# List all models
obelysk models

# Download for local proving
obelysk models --download smollm2-135m

# Show model details
obelysk models --info smollm2-135m
```

### `obelysk status`

Check proving job status.

```bash
obelysk status --job job-abc123
```

### `obelysk config`

Configure default settings.

```bash
# Set default prover
obelysk config set prover-url http://your-gpu:8080

# Set API key
obelysk config set api-key your-key

# Show config
obelysk config show
```

## Supported Models

| Model | Params | Prove Time (GPU) | Recursive Felts |
|-------|--------|-------------------|-----------------|
| SmolLM2-135M | 135M | ~102s | 942 |
| Qwen2-0.5B | 500M | ~45s | ~900 |
| Phi-3-mini | 3.8B | ~180s | ~950 |

## Self-Hosted Proving

For local GPU proving (requires NVIDIA GPU + CUDA 12+):

```bash
# Install and build
./scripts/setup.sh

# Prove locally (no network needed)
obelysk prove \
  --model-dir ~/.obelysk/models/smollm2-135m \
  --input "test" \
  --gkr --format ml_gkr --recursive \
  --output proof.json

# Submit to Starknet
obelysk submit --proof proof.json
```

## On-Chain Verification

When `--on-chain` is set, the proof is verified by the ObelyZK Recursive Verifier using full OODS + Merkle + FRI + PoW (trustless):

- **Contract:** `0x1c208a5fe731c0d03b098b524f274c537587ea1d43d903838cc4a2bf90c40c7`
- **Network:** Starknet Sepolia
- **Verification:** Full OODS + Merkle + FRI + PoW (trustless)
- **Felts:** ~942 per proof (49x compression)
- **Cost:** ~$0.02 per verification
- **Explorer:** `https://sepolia.starkscan.co/tx/<tx_hash>`

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OBELYSK_API_KEY` | API key for hosted prover | For hosted |
| `OBELYSK_PROVER_URL` | Custom prover URL | For self-hosted |
| `STARKNET_ACCOUNT` | Starknet account address | For on-chain |
| `STARKNET_PRIVATE_KEY` | Starknet private key | For on-chain |

## Output Format

```json
{
  "model_id": "0x57248a5c...",
  "output": [0.123, 0.456],
  "proof_hash": "0xabc...",
  "recursive_proof": {
    "total_felts": 942,
    "calldata": ["0x...", "..."]
  },
  "tx_hash": "0x2c8100...",
  "verified": true,
  "prove_time": 102.3,
  "recursive_time": 3.55
}
```

## Links

- [GitHub](https://github.com/Bitsage-Network/obelyzk.rs)
- [npm](https://www.npmjs.com/package/@obelyzk/cli)
- [TypeScript SDK](../typescript/README.md)
- [Python SDK](../python/README.md)
- [Getting Started](../../libs/obelyzk.rs/scripts/pipeline/GETTING_STARTED.md)
