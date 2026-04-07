# obelyzk

Python SDK for ObelyZK -- verifiable ML inference on Starknet.

All proofs use full OODS + Merkle + FRI + PoW (trustless) verification on Starknet Sepolia.

## Installation

```bash
pip install obelyzk
```

## Quick Start

```python
from obelyzk import ObelyzkClient

client = ObelyzkClient()

# Prove and verify on-chain
result = client.prove(
    model="smollm2-135m",
    input=[1.0, 2.0, 3.0],
    on_chain=True,
)

print(f"Output: {result.output}")
print(f"TX: {result.tx_hash}")
print(f"Verified: {result.verified}")
```

## API Reference

### `ObelyzkClient(url?, api_key?)`

```python
# Hosted prover (default)
client = ObelyzkClient()

# Custom prover
client = ObelyzkClient(url="http://your-gpu:8080")

# With API key
client = ObelyzkClient(api_key="your-key")
```

### `client.prove(model, input, on_chain?, recursive?)`

Prove a model execution.

```python
result = client.prove(
    model="smollm2-135m",       # model name or HuggingFace ID
    input=[1.0, 2.0, 3.0],     # input tensor
    on_chain=True,               # submit to Starknet (default: False)
    recursive=True,              # use recursive STARK (default: True)
)

# result.output          -> list[float]   model output
# result.proof_hash      -> str           Poseidon hash
# result.tx_hash         -> str | None    Starknet TX (if on_chain)
# result.verified        -> bool | None   on-chain status
# result.prove_time      -> float         seconds (~102s for SmolLM2)
# result.recursive_time  -> float         seconds (~3.55s)
# result.felts           -> int           calldata size (~942)
# result.model_id        -> str           hex identifier
```

### `client.attest(model, input, submit_on_chain?)`

Full attestation with on-chain submission.

```python
attestation = client.attest(
    model="smollm2-135m",
    input=[1.0, 2.0, 3.0],
    submit_on_chain=True,
)
```

### `client.models()`

List available models.

```python
models = client.models()
for m in models:
    print(f"{m.name}: {m.params} params, {m.layers} layers")
```

### `client.job(job_id)`

Check async job status.

```python
job = client.job("job-abc123")
print(f"Status: {job.status}, Progress: {job.progress}%")
```

## Async Support

```python
import asyncio
from obelyzk import AsyncObelyzkClient

async def main():
    client = AsyncObelyzkClient()

    # Prove with async/await
    result = await client.prove(
        model="smollm2-135m",
        input=[1.0, 2.0, 3.0],
        on_chain=True,
    )
    print(f"TX: {result.tx_hash}")
    print(f"Verified: {result.verified}")

    # List models
    models = await client.models()
    for m in models:
        print(f"{m.name}: {m.params}")

    # Async attestation
    attestation = await client.attest(
        model="smollm2-135m",
        input=[1.0, 2.0, 3.0],
        submit_on_chain=True,
    )

asyncio.run(main())
```

## Supported Models

| Model | Params | Prove Time (GPU) | Recursive Felts |
|-------|--------|-------------------|-----------------|
| SmolLM2-135M | 135M | ~102s | 942 |
| Qwen2-0.5B | 500M | ~45s | ~900 |
| Phi-3-mini | 3.8B | ~180s | ~950 |

## On-Chain Verification

Proofs are verified on the ObelyZK Recursive Verifier contract using full OODS + Merkle + FRI + PoW (trustless):

- **Contract:** `0x1c208a5fe731c0d03b098b524f274c537587ea1d43d903838cc4a2bf90c40c7`
- **Network:** Starknet Sepolia
- **Verification:** Full OODS + Merkle + FRI + PoW (trustless)
- **Felts:** ~942 per proof (49x compression)
- **Cost:** ~$0.02 per verification

Verify independently:

```python
from starknet_py.net.full_node_client import FullNodeClient

node_client = FullNodeClient(
    node_url="https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_8/demo"
)

result = await node_client.call_contract(
    contract_address=0x1c208a5fe731c0d03b098b524f274c537587ea1d43d903838cc4a2bf90c40c7,
    entry_point_selector="get_recursive_verification_count",
    calldata=[model_id],
)

print(f"Verification count: {result[0]}")
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OBELYSK_API_KEY` | API key for hosted prover | For hosted |
| `OBELYSK_PROVER_URL` | Custom prover URL | For self-hosted |
| `STARKNET_ACCOUNT` | Starknet account address | For on-chain |
| `STARKNET_PRIVATE_KEY` | Starknet private key | For on-chain |

## Self-Hosted Prover

```python
client = ObelyzkClient(url="http://your-gpu:8080")
```

See the [Self-Hosting Guide](../../libs/stwo-ml/scripts/pipeline/GETTING_STARTED.md) for GPU setup.

## Links

- [GitHub](https://github.com/obelyzk/stwo-ml)
- [PyPI](https://pypi.org/project/obelyzk/)
- [TypeScript SDK](../typescript/README.md)
- [CLI](../cli/README.md)
