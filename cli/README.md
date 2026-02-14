# @bitsage/cli

The BitSage CLI. One command to earn with your GPU, or use GPUs for ML.

## 30-Second Quick Start

```bash
npm install -g @bitsagecli/cli

bitsage login
bitsage start     # GPU earning in one command
```

## Installation

```bash
npm install -g @bitsagecli/cli
```

Or via direct download:

```bash
curl -fsSL https://get.bitsage.sh | sh
```

## GPU Operator (Earn SAGE)

Have a GPU? Start earning in two commands:

```bash
bitsage login                  # Authenticate
bitsage start                  # Auto: detect GPU -> register -> stake -> run

# That's it. Your GPU is earning SAGE tokens.
bitsage status                 # Dashboard view
bitsage earnings               # What you've earned
bitsage stop                   # Pause
```

`bitsage start` handles everything: GPU detection, wallet creation, worker registration, testnet faucet, staking, and daemon startup. No bash scripts needed.

## GPU Consumer (Use GPUs for ML)

### Run any script on remote GPU

```bash
bitsage run train.py --gpu h100
bitsage run preprocess.sh --gpu any --include data/ --env BATCH_SIZE=32
```

### Submit training jobs

```bash
bitsage train --model llama-3.1-8b --dataset ./data/ --epochs 3
bitsage train --model qwen-14b --dataset s3://bucket/data.jsonl --gpu h100 --method lora
```

### One-shot inference

```bash
bitsage infer --model qwen-14b --input "What is ZKML?"
echo "Explain transformers" | bitsage infer --model llama-3.1-8b --stream
bitsage infer --model phi-3-mini --input-file prompts.jsonl --json
```

### Monitor jobs

```bash
bitsage jobs                   # List your jobs
bitsage connect <job-id>       # Live log viewer / interactive terminal
bitsage logs <job-id>          # Stream logs (alias for connect)
```

## Command Reference

### Auth

| Command | Description |
|---------|-------------|
| `bitsage login` | Authenticate (browser OAuth, API key, or wallet) |
| `bitsage login --api-key <key>` | Auth with API key |
| `bitsage login --wallet` | Auth with configured wallet |
| `bitsage login --status` | Check current auth status |
| `bitsage logout` | Clear stored credentials |

### Operator

| Command | Description |
|---------|-------------|
| `bitsage start` | One-command operator onboarding |
| `bitsage start --foreground` | Run worker in foreground |
| `bitsage start --network mainnet` | Target specific network |
| `bitsage stop` | Stop the worker daemon |

### Consumer

| Command | Description |
|---------|-------------|
| `bitsage run <script> [args]` | Run script on remote GPU |
| `bitsage run script.py --gpu h100` | Specify GPU tier |
| `bitsage run script.py --dry-run` | Estimate cost |
| `bitsage train --model <name>` | Submit training job |
| `bitsage train --model llama-3.1-8b --dataset ./data/` | Train with local data |
| `bitsage infer --model <name> --input <text>` | Run inference |
| `bitsage infer --model qwen-14b --stream` | Stream tokens |
| `bitsage connect <job-id>` | Connect to running job |

### Setup & Management

| Command | Description |
|---------|-------------|
| `bitsage init [mode]` | Setup wizard (worker/validator/staker/developer) |
| `bitsage wallet create` | Create new Starknet wallet |
| `bitsage wallet balance` | Check wallet balance |
| `bitsage faucet claim` | Get testnet SAGE tokens |
| `bitsage stake deposit <amount>` | Stake SAGE tokens |
| `bitsage stake withdraw <amount>` | Unstake (7-day lockup) |
| `bitsage stake status` | View staking info |
| `bitsage claim` | Claim staking rewards |
| `bitsage worker register` | Register as network worker |
| `bitsage worker start` | Start worker node |
| `bitsage worker stop` | Stop worker node |
| `bitsage worker logs [-f]` | View worker logs |

### Monitoring

| Command | Description |
|---------|-------------|
| `bitsage status` | Full dashboard (config, balance, network, worker) |
| `bitsage status --json` | JSON output |
| `bitsage health` | System health check |
| `bitsage earnings` | View your earnings breakdown |
| `bitsage jobs` | List recent jobs |
| `bitsage jobs --status completed` | Filter by status |

## Python SDK

Install:

```bash
pip install bitsage
```

Quick start:

```python
import bitsage

# Auth (uses ~/.bitsage/credentials from CLI)
bitsage.login()

# One-line inference
output = await bitsage.infer("qwen-14b", "What is ZKML?")

# Submit training
job = await bitsage.train(
    model="llama-3.1-8b",
    dataset="s3://my-data/train.jsonl",
    gpu="h100",
    epochs=3,
)
result = await job.wait()
print(result.metrics)
await result.download("./output/")

# Run arbitrary code
job = await bitsage.run("train.py", gpu="a100", env={"BATCH_SIZE": "32"})

# List workers
workers = await bitsage.workers()
```

Full client (advanced):

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

## MCP Integration

BitSage has a Claude MCP server with 40+ tools. Add to your Claude config:

```json
{
  "mcpServers": {
    "bitsage": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"]
    }
  }
}
```

Then ask Claude: "Submit a training job for llama-3.1-8b on BitSage"

## Configuration

All config lives in `~/.bitsage/`:

```
~/.bitsage/
  config.json         # Network, wallet, worker settings
  credentials         # Auth token (chmod 600)
  keystores/          # Encrypted wallet keystores
  bin/                # Downloaded worker/validator binaries
  worker.pid          # Running worker PID
  worker.log          # Worker output logs
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `BITSAGE_API_KEY` | API key (overrides credentials file) |
| `BITSAGE_API_URL` | Coordinator URL override |
| `RUST_LOG` | Worker log level (trace/debug/info/warn/error) |
| `DEBUG` | Enable CLI debug output |

## Troubleshooting

**"No healthy coordinator found"** — Check your network connection. Try `bitsage health` for diagnostics.

**"Not authenticated"** — Run `bitsage login`. Credentials expire after 30 days.

**"Worker binary not found"** — Run `bitsage worker start --update` to download the latest binary.

**"Faucet cooldown active"** — Testnet faucet has a cooldown. Run `bitsage faucet status` to check.

**GPU not detected** — Ensure `nvidia-smi` is available. The CLI uses it for GPU detection.

## Development

```bash
git clone https://github.com/Bitsage-Network/bitsage-network
cd bitsage-network/sdk/cli

npm install
npm run build
npm link

# Test
bitsage --help
bitsage login --status
```

## Requirements

- Node.js >= 18.0.0
- npm or yarn
- NVIDIA GPU + drivers (for operator mode)

## License

MIT
