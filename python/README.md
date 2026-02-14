# bitsage-sdk

Official Python SDK for the BitSage Network — decentralized GPU compute with zero-knowledge proofs.

## Installation

```bash
pip install bitsage-sdk
```

## Quick Start

### Easy API (recommended)

The easy API shares credentials with the CLI (`~/.bitsage/credentials`):

```python
import bitsage

# Authenticate (reads ~/.bitsage/credentials or uses env vars)
bitsage.login()
# Or: bitsage.login(api_key="sk-...")

# One-line inference
output = await bitsage.infer("qwen-14b", "What is ZKML?")
print(output)

# Submit a training job
job = await bitsage.train(
    model="llama-3.1-8b",
    dataset="s3://my-data/train.jsonl",
    gpu="h100",
    epochs=3,
    method="lora",
)

# Wait for results
result = await job.wait()
await result.download("./output/")

# Run an arbitrary script on remote GPU
job = await bitsage.run("train.py", gpu="a100", env={"BATCH_SIZE": "32"})
status = await job.status()

# List available workers
workers = await bitsage.workers()

# Network stats
stats = await bitsage.network_status()
```

### Full Client (advanced)

For more control, use `BitSageClient` directly:

```python
import asyncio
from bitsage import BitSageClient, ClientConfig, WalletConfig, JobType, SubmitJobRequest

async def main():
    config = ClientConfig(
        api_url="https://api.bitsage.network",
        network="sepolia",
    )

    async with BitSageClient(config=config) as client:
        # Submit a job
        response = await client.submit_job(
            SubmitJobRequest(
                job_type=JobType.ai_inference("llama-7b", batch_size=1),
                input_data="base64_encoded_data",
                max_cost_sage=100,
            )
        )
        print(f"Job: {response.job_id}")

        # Wait for completion
        result = await client.wait_for_completion(response.job_id)
        print(f"Output: {result.output_data}")
        print(f"Cost: {result.actual_cost_sage} SAGE")
        print(f"Proof: {result.proof_hash}")

asyncio.run(main())
```

### ZKML Proving

Prove ML inference with zero-knowledge proofs:

```python
import asyncio
from bitsage import ZkmlProverClient, ZkmlVerifierClient

async def main():
    # Connect to prove-server
    prover = ZkmlProverClient()  # reads BITSAGE_PROVER_URL or defaults to localhost:8080

    # Check server health
    health = await prover.health()
    print(f"GPU: {health.gpu_available}, Models: {health.loaded_models}")

    # Load a model
    model = await prover.load_model("/path/to/model", description="My model")
    print(f"Model ID: {model.model_id}")

    # Prove with progress callback
    async def on_progress(status):
        print(f"Progress: {status.progress_bps / 100:.1f}%")

    result = await prover.prove(
        model.model_id,
        gpu=True,
        on_progress=on_progress,
    )
    print(f"Calldata: {len(result.calldata)} felts")
    print(f"Proof time: {result.prove_time_ms}ms")

    # Verify on-chain
    verifier = ZkmlVerifierClient()
    is_verified = await verifier.is_proof_verified(result.calldata[0])
    count = await verifier.get_verification_count(model.model_id)
    print(f"Verified: {is_verified}, Total verifications: {count}")

asyncio.run(main())
```

## API Reference

### Easy API (`bitsage.*`)

| Function | Description |
|----------|-------------|
| `login(api_key?, api_url?)` | Authenticate. Reads `~/.bitsage/credentials` or env vars. |
| `train(model, dataset?, epochs?, batch_size?, lr?, method?, gpu?)` | Submit training job. Returns `JobHandle`. |
| `run(script, gpu?, env?, timeout?)` | Run script on remote GPU. Returns `JobHandle`. |
| `infer(model, prompt, system_prompt?, max_tokens?, temperature?)` | One-shot inference. Returns output string. |
| `workers()` | List available GPU workers. |
| `network_status()` | Get network stats dict. |

### JobHandle

Returned by `train()` and `run()`:

| Method | Description |
|--------|-------------|
| `await job.status()` | Get current `JobStatusResponse` |
| `await job.wait(poll_interval?, timeout?)` | Block until completion, return `JobResult` |
| `await job.cancel()` | Cancel the job |
| `await job.result()` | Get result (must be completed) |
| `await job.download(output_dir?)` | Download output files to local dir |

### BitSageClient

Full async client with all API operations:

**Job Operations:**
| Method | Description |
|--------|-------------|
| `submit_job(request)` | Submit a `SubmitJobRequest`, returns `SubmitJobResponse` |
| `get_job_status(job_id)` | Get `JobStatusResponse` |
| `get_job_result(job_id)` | Get `JobResult` |
| `cancel_job(job_id)` | Cancel a job |
| `list_jobs(params?)` | List jobs with filters, returns `ListJobsResponse` |
| `wait_for_completion(job_id, poll_interval?, timeout?)` | Poll until done |
| `stream_job_status(job_id)` | Async iterator of status updates |

**Worker Operations:**
| Method | Description |
|--------|-------------|
| `list_workers()` | List all `WorkerInfo` |
| `get_worker(worker_id)` | Get specific worker |

**Proof Operations:**
| Method | Description |
|--------|-------------|
| `get_proof(proof_hash)` | Get `ProofDetails` |
| `verify_proof(proof_hash)` | Verify a proof, returns bool |

**Staking (requires wallet):**
| Method | Description |
|--------|-------------|
| `stake(amount, gpu_tier)` | Stake SAGE tokens |
| `unstake(amount)` | Unstake tokens |
| `claim_rewards()` | Claim pending rewards |
| `get_stake_info()` | Get `StakeInfo` |

**Network & Faucet:**
| Method | Description |
|--------|-------------|
| `get_network_stats()` | Get `NetworkStats` |
| `faucet_claim(address)` | Claim testnet tokens |
| `faucet_status(address)` | Get `FaucetStatus` |

### ZkmlProverClient

| Method | Description |
|--------|-------------|
| `health()` | Server health check |
| `load_model(path, description?)` | Load ONNX model |
| `get_model(model_id)` | Get model info |
| `submit_prove(request)` | Submit proving job |
| `get_prove_status(job_id)` | Get job status |
| `get_prove_result(job_id)` | Get proof result |
| `prove(model_id, input?, gpu?, on_progress?, timeout?)` | High-level: submit + poll |

### ZkmlVerifierClient

| Method | Description |
|--------|-------------|
| `get_model_commitment(model_id)` | Get on-chain weight commitment |
| `get_verification_count(model_id)` | Number of verified proofs |
| `is_proof_verified(proof_hash)` | Check if proof is verified |

## Types

### Enums

| Enum | Values |
|------|--------|
| `JobStatus` | PENDING, ASSIGNED, RUNNING, COMPLETED, FAILED, CANCELLED, TIMEOUT |
| `GpuTier` | CONSUMER, WORKSTATION, DATA_CENTER, ENTERPRISE, FRONTIER |
| `WorkerStatus` | AVAILABLE, BUSY, OFFLINE, SUSPENDED |
| `ProofVerificationStatus` | PENDING, VERIFIED, FAILED |
| `ZkmlJobStatus` | QUEUED, PROVING, COMPLETED, FAILED |

### Job Types (factory methods)

```python
JobType.ai_inference(model_type="llama-7b", batch_size=1)
JobType.zk_proof(circuit_type="stark", proof_system="stwo")
JobType.computer_vision(model_name="yolo", input_format="image")
JobType.data_pipeline(pipeline_type="etl", tee_required=False)
JobType.render_3d(resolution="4k", frames=1)
JobType.custom(name="my_task", parallelizable=True)
```

### GPU Tier Properties

```python
GpuTier.ENTERPRISE.min_stake   # 10_000
GpuTier.from_gpu_model("H100") # GpuTier.ENTERPRISE
```

## Configuration

### Authentication

The easy API reads credentials in this order:

1. Explicit `api_key` parameter
2. `BITSAGE_API_KEY` environment variable
3. `~/.bitsage/credentials` file (shared with CLI)

Run `bitsage login` from the CLI to create the credentials file.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BITSAGE_API_KEY` | — | API key for authentication |
| `BITSAGE_API_URL` | `https://api.bitsage.network` | Coordinator API URL |
| `BITSAGE_PROVER_URL` | `http://localhost:8080` | prove-server URL |
| `ZKML_VERIFIER_ADDRESS` | `0x005928ac...` | On-chain verifier contract |
| `STARKNET_RPC_URL` | Sepolia public RPC | Starknet RPC endpoint |

### Async vs Sync Usage

All operations are async. In sync contexts:

```python
import asyncio
import bitsage

# Option 1: asyncio.run
result = asyncio.run(bitsage.infer("qwen-14b", "Hello"))

# Option 2: In Jupyter / IPython (already has event loop)
output = await bitsage.infer("qwen-14b", "Hello")
```

## Development

```bash
git clone https://github.com/Bitsage-Network/bitsage-network
cd bitsage-network/sdk/python

# Install with dev dependencies
pip install -e ".[dev]"

# Run tests
pytest                        # Unit tests only (default)
pytest -m integration         # Integration tests (needs running server)

# Lint
ruff check bitsage/
mypy bitsage/
```

## Requirements

- Python >= 3.9
- httpx >= 0.25.0
- pydantic >= 2.0.0
- starknet-py >= 0.20.0 (for ZKML verification)

## License

MIT
