# BitSage SDK

Official SDKs for interacting with the BitSage Network - a decentralized compute network for AI/ML workloads with zero-knowledge proofs.

## Available SDKs

| Language | Package | Status |
|----------|---------|--------|
| Rust | `bitsage-sdk` | ✅ Ready |
| TypeScript | `@bitsage/sdk` | ✅ Ready |
| Python | `bitsage-sdk` | ✅ Ready |

## Quick Start

### Rust

```toml
[dependencies]
bitsage-sdk = "0.1"
```

```rust
use bitsage_sdk::{BitSageClient, JobType, SubmitJobRequest};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = BitSageClient::default_client()?;

    let response = client.submit_job(
        SubmitJobRequest::new(
            JobType::AiInference {
                model_type: "llama-7b".to_string(),
                batch_size: 1,
            },
            "base64_input_data".to_string(),
        )
        .with_max_cost(100)
        .with_priority(5)
    ).await?;

    println!("Job submitted: {}", response.job_id);

    let result = client.jobs()
        .wait_for_completion(response.job_id, 1000, 3600)
        .await?;

    println!("Result: {:?}", result);
    Ok(())
}
```

### TypeScript

```bash
npm install @bitsage/sdk
```

```typescript
import { BitSageClient } from '@bitsage/sdk';

const client = new BitSageClient();

const response = await client.submitJob({
  job_type: { type: 'ai_inference', model_type: 'llama-7b', batch_size: 1 },
  input_data: btoa('Hello, BitSage!'),
  max_cost_sage: 100n,
  max_duration_secs: 3600,
  priority: 5,
  require_tee: false,
});

console.log('Job submitted:', response.job_id);

const result = await client.waitForCompletion(response.job_id);
console.log('Result:', result);
```

### Python

```bash
pip install bitsage-sdk
```

```python
from bitsage import BitSageClient, JobType, SubmitJobRequest

async def main():
    async with BitSageClient() as client:
        response = await client.submit_job(
            SubmitJobRequest(
                job_type=JobType.ai_inference("llama-7b", batch_size=1),
                input_data="base64_input_data",
                max_cost_sage=100,
            )
        )
        print(f"Job submitted: {response.job_id}")

        result = await client.wait_for_completion(response.job_id)
        print(f"Result: {result}")

import asyncio
asyncio.run(main())
```

## Features

All SDKs provide:

- **Job Management**: Submit, monitor, cancel, and stream job status
- **Worker Discovery**: List and filter available compute workers
- **Proof Verification**: Verify ZK proofs on-chain
- **Staking**: Stake SAGE tokens and claim rewards
- **Faucet**: Claim testnet tokens (Sepolia only)

## Configuration

By default, SDKs connect to Sepolia testnet. For mainnet:

```typescript
const client = new BitSageClient({
  apiUrl: 'https://api.bitsage.network',
  starknetRpcUrl: 'https://starknet-mainnet.public.blastapi.io',
  network: 'mainnet',
});
```

## Documentation

- [API Reference](https://docs.bitsage.network/sdk)
- [BitSage Network Docs](https://docs.bitsage.network)

## License

MIT OR Apache-2.0
