# BitSage SDK

Unified SDKs for the BitSage Network — decentralized GPU compute with zero-knowledge proofs on Starknet.

## 30-Second Quick Start

### GPU Operator (earn SAGE)

```bash
npm install -g @bitsagecli/cli
bitsage login
bitsage start
```

### GPU Consumer (use GPUs)

```bash
bitsage login
bitsage train --model llama-3.1-8b --dataset ./data/ --epochs 3
bitsage infer --model qwen-14b --input "What is ZKML?"
bitsage run my_script.py --gpu h100
```

### Python

```python
import bitsage

bitsage.login()
output = await bitsage.infer("qwen-14b", "What is ZKML?")
job = await bitsage.train(model="llama-3.1-8b", dataset="./data/", epochs=3)
result = await job.wait()
```

## Available SDKs

| Package | Install | Description |
|---------|---------|-------------|
| **CLI** | `npm i -g @bitsagecli/cli` | `bitsage login/start/train/run/infer` — full operator + consumer UX |
| **Python** | `pip install bitsage-sdk` | `bitsage.login()`, `.train()`, `.infer()`, `BitSageClient`, ZKML prover/verifier |
| **TypeScript** | `npm i @bitsage/sdk` | `StwoProverClient`, React hooks, WebSocket, all modules |
| **Rust** | `bitsage-sdk = "0.1"` | `ZkmlProverClient`, `ZkmlVerifierClient` |
| **MCP** | `@bitsage/mcp-server` | 40+ Claude tools for AI agent integration |

## Contract Addresses

Canonical addresses live in [`contracts.json`](./contracts.json).
The STARK verifier on Sepolia:

```
0x005928ac548dc2719ef1b34869db2b61c2a55a4b148012fad742262a8d674fba
```

## CLI (`@bitsagecli/cli`)

The CLI provides a unified, opinionated surface for both GPU operators and consumers.

### Operator Flow

```bash
bitsage login                  # Authenticate (browser OAuth, API key, or wallet)
bitsage start                  # Auto: detect GPU -> register -> stake -> run daemon

bitsage status                 # Dashboard
bitsage earnings               # Check SAGE earnings
bitsage stop                   # Pause
```

### Consumer Flow

```bash
bitsage login

# Training
bitsage train --model llama-3.1-8b --dataset ./data/ --epochs 3 --gpu h100

# Remote script execution
bitsage run train.py --gpu a100 --env BATCH_SIZE=32

# Inference
bitsage infer --model qwen-14b --input "Explain ZK proofs"
echo "prompt" | bitsage infer --model phi-3-mini --stream

# Job management
bitsage jobs
bitsage connect <job-id>       # Live logs / interactive terminal
```

### All Commands

| Category | Command | Description |
|----------|---------|-------------|
| Auth | `login`, `logout` | Authenticate with API key, wallet, or browser |
| Operator | `start`, `stop` | One-command GPU operator onboarding |
| Consumer | `run`, `train`, `infer`, `connect` | Submit and monitor GPU jobs |
| Setup | `init`, `wallet`, `faucet`, `stake`, `worker` | Manual setup and management |
| Monitor | `status`, `health`, `earnings`, `jobs` | Dashboards and diagnostics |

See [`cli/README.md`](./cli/README.md) for full command reference.

## Python SDK (`bitsage-sdk`)

### Easy API

```python
import bitsage

bitsage.login()                                          # Uses ~/.bitsage/credentials
output = await bitsage.infer("qwen-14b", "Hello")       # One-shot inference
job = await bitsage.train(model="llama-3.1-8b", ...)    # Training job -> JobHandle
result = await job.wait()                                # Block until done
await result.download("./output/")                       # Download results
job = await bitsage.run("script.py", gpu="h100")         # Remote execution
workers = await bitsage.workers()                        # List GPU workers
```

### Full Client

```python
from bitsage import BitSageClient, JobType, SubmitJobRequest

async with BitSageClient() as client:
    response = await client.submit_job(
        SubmitJobRequest(
            job_type=JobType.ai_inference("llama-7b", batch_size=1),
            input_data="base64_encoded_data",
        )
    )
    result = await client.wait_for_completion(response.job_id)
```

### ZKML Proving

```python
from bitsage import ZkmlProverClient

prover = ZkmlProverClient()                    # auto-detects BITSAGE_PROVER_URL
health = await prover.health()
result = await prover.prove("model-id", gpu=True)
print(f"Calldata: {len(result.calldata)} felts")
```

### On-Chain Verification

```python
from bitsage import ZkmlVerifierClient

verifier = ZkmlVerifierClient()
is_verified = await verifier.is_proof_verified("0xabc...")
commitment = await verifier.get_model_commitment("model-id")
```

See [`python/README.md`](./python/README.md) for full API reference.

## TypeScript SDK (`@bitsage/sdk`)

```bash
npm install @bitsage/sdk
```

```typescript
import { StwoProverClient } from '@bitsage/sdk';

const prover = new StwoProverClient({ baseUrl: 'http://localhost:8080' });

const model = await prover.loadZkmlModel({ modelPath: '/path/to/model.onnx' });
const result = await prover.proveZkml({ modelId: model.modelId, gpu: true });
console.log(`Calldata: ${result.calldata.length} felts`);
```

**Modules:** Batch processing, Dashboard, Governance, Mining, Payments, Privacy (encryption/keys), Staking, STWO Prover, TEE, WebSocket, Workers.

**React hooks:** `useJobs`, `useWorkers`, `useStaking`, `useDashboard`, `useMining`, `useGovernance`, `useWebSocketHooks`, `useConfidentialSwap`.

## Rust SDK (`bitsage-sdk`)

```toml
[dependencies]
bitsage-sdk = "0.1"
tokio = { version = "1", features = ["full"] }
```

```rust
use bitsage_sdk::zkml::ZkmlProverClient;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let prover = ZkmlProverClient::default()?;
    let health = prover.health().await?;
    let result = prover.prove("model-id", true, 600).await?;
    println!("Calldata: {} felts", result.calldata.len());
    Ok(())
}
```

## MCP Server (Claude / AI Agents)

40+ tools for Claude integration:

```json
{
  "mcpServers": {
    "bitsage": {
      "command": "node",
      "args": ["mcp-server/dist/index.js"]
    }
  }
}
```

Key tools: `bitsage_submit_zkml_proof`, `bitsage_get_zkml_proof_status`, `bitsage_verify_zkml_onchain`, `bitsage_submit_job`, `bitsage_list_workers`, `bitsage_stake`, and 30+ more.

## prove-server API

Start the server:

```bash
cargo build --release --bin prove-server --features server
BIND_ADDR=0.0.0.0:8080 ./target/release/prove-server
```

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server health + GPU info |
| POST | `/api/v1/models` | Load ONNX model |
| POST | `/api/v1/models/hf` | Load HuggingFace model directory |
| GET | `/api/v1/models/{id}` | Get model info |
| POST | `/api/v1/prove` | Submit proving job |
| GET | `/api/v1/prove/{id}` | Get job status |
| GET | `/api/v1/prove/{id}/result` | Get proof result |

## Coordinator API

The coordinator (rust-node) exposes 35+ REST endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Coordinator health |
| POST | `/api/v1/jobs/submit` | Submit a compute job |
| GET | `/api/v1/jobs/{id}` | Get job status |
| GET | `/api/v1/jobs/{id}/result` | Get job result |
| GET | `/api/v1/jobs/{id}/stream` | SSE live updates |
| POST | `/api/v1/workers/register` | Register a worker |
| GET | `/api/v1/workers/{id}/status` | Worker status |
| GET | `/api/v1/workers/{id}/earnings` | Worker earnings |
| GET | `/api/v1/network/stats` | Network statistics |
| POST | `/api/v1/faucet/claim` | Claim testnet tokens |
| POST | `/api/v1/inference/stream` | Streaming inference |
| WS | `/ws` | WebSocket real-time events |

## SDK Method Matrix

| Feature | CLI | Python | TypeScript | Rust | MCP |
|---------|-----|--------|------------|------|-----|
| Login/auth | `bitsage login` | `bitsage.login()` | — | — | — |
| Train model | `bitsage train` | `bitsage.train()` | `submitJob()` | `submit_job()` | `bitsage_submit_job` |
| Run script | `bitsage run` | `bitsage.run()` | `submitJob()` | `submit_job()` | `bitsage_submit_job` |
| Inference | `bitsage infer` | `bitsage.infer()` | `submitJob()` | `submit_job()` | `bitsage_submit_job` |
| Job connect | `bitsage connect` | `job.wait()` | `streamJobStatus()` | — | — |
| Operator start | `bitsage start` | — | — | — | — |
| Load model | — | `load_model()` | `loadZkmlModel()` | `load_model()` | auto |
| Prove | — | `prove()` | `proveZkml()` | `prove()` | `bitsage_submit_zkml_proof` |
| On-chain verify | — | `is_proof_verified()` | `isZkmlProofVerified()` | `is_proof_verified()` | `bitsage_verify_zkml_onchain` |
| List workers | `bitsage status` | `bitsage.workers()` | `listWorkers()` | `list_workers()` | `bitsage_list_workers` |
| Staking | `bitsage stake` | `client.stake()` | `stake()` | `stake()` | `bitsage_stake` |
| Faucet | `bitsage faucet` | `client.faucet_claim()` | `faucetClaim()` | `faucet_claim()` | `bitsage_faucet_claim` |

## Environment Variables

All SDKs respect these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `BITSAGE_API_KEY` | — | API key for authentication |
| `BITSAGE_API_URL` | `https://api.bitsage.network` | Coordinator API |
| `BITSAGE_PROVER_URL` | `http://localhost:8080` | prove-server endpoint |
| `ZKML_VERIFIER_ADDRESS` | `0x005928ac...` | On-chain verifier contract |
| `STARKNET_RPC_URL` | Sepolia public RPC | Starknet RPC |

## Architecture

```
User
  │
  ├─ bitsage CLI ────────────────────┐
  ├─ Python SDK ─────────────────────┤
  ├─ TypeScript SDK ─────────────────┤
  ├─ Rust SDK ───────────────────────┤
  └─ MCP Server (Claude) ───────────┤
                                     │
                      ┌──────────────┘
                      ▼
              Coordinator (rust-node)
              REST API + WebSocket
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
     GPU Worker   GPU Worker   GPU Worker
     (sage-worker) ──► prove-server
                          │
                          ▼
                   Starknet L2
                (STARK verification)
```

## License

MIT OR Apache-2.0
