# @bitsage/cli

Official CLI for the BitSage Network - One-command deployment for workers, validators, and stakers.

## Installation

```bash
npm install -g @bitsage/cli
```

Or with yarn:

```bash
yarn global add @bitsage/cli
```

## Quick Start

### 1. Initialize Your Node

```bash
# Interactive setup wizard
bitsage init

# Or specify mode directly
bitsage init worker      # GPU worker setup
bitsage init validator   # Validator setup
bitsage init staker      # Staker setup
```

### 2. Get Testnet Tokens

```bash
bitsage faucet claim
```

### 3. Stake Tokens

```bash
bitsage stake deposit 1000
```

### 4. Start Your Worker

```bash
bitsage worker start
```

## Commands

### Initialization

```bash
bitsage init [mode]           # Setup wizard
  --network <network>         # mainnet, sepolia, local (default: sepolia)
  --coordinator <url>         # Coordinator URL
  --force                     # Overwrite existing config
```

### Wallet Management

```bash
bitsage wallet create         # Create new wallet
bitsage wallet import         # Import existing wallet
bitsage wallet balance        # Check balance
bitsage wallet export         # Export wallet info
bitsage wallet list           # List keystores
```

### Faucet (Testnet)

```bash
bitsage faucet claim          # Claim testnet tokens
bitsage faucet status         # Check cooldown
```

### Staking

```bash
bitsage stake deposit <amt>   # Stake SAGE tokens
bitsage stake withdraw <amt>  # Unstake tokens
bitsage stake status          # View stake info
bitsage claim                 # Claim rewards
```

### Worker Operations

```bash
bitsage worker register       # Register as worker
bitsage worker start          # Start worker node
  --foreground                # Run in foreground
  --update                    # Update binary first
bitsage worker stop           # Stop worker
bitsage worker status         # Check status
bitsage worker logs           # View logs
  -f, --follow                # Follow log output
  -n, --lines <n>             # Number of lines
```

### Monitoring

```bash
bitsage status                # Overall status
bitsage health                # Health check
bitsage earnings              # View earnings
bitsage jobs                  # List recent jobs
  --status <status>           # Filter by status
  --limit <n>                 # Number of jobs
```

## Configuration

Configuration is stored in `~/.bitsage/`:

```
~/.bitsage/
├── config.json           # Main configuration
├── keystores/            # Encrypted wallet files
├── bin/                  # Downloaded binaries
├── worker.pid            # Worker process ID
└── worker.log            # Worker logs
```

### Environment Variables

- `RUST_LOG` - Log level (trace, debug, info, warn, error)
- `DEBUG` - Enable CLI debug output

## User Flows

### GPU Worker Flow

```bash
# Install and setup
npm install -g @bitsage/cli
bitsage init worker

# Get tokens and stake
bitsage faucet claim
bitsage stake deposit 1000

# Register and start
bitsage worker register
bitsage worker start

# Monitor
bitsage status
bitsage earnings
```

### Staker Flow

```bash
# Install and setup
npm install -g @bitsage/cli
bitsage init staker

# Import wallet with SAGE
bitsage wallet import

# Stake tokens
bitsage stake deposit 5000

# Monitor rewards
bitsage stake status
bitsage claim
```

## Development

```bash
# Clone the repository
git clone https://github.com/Bitsage-Network/bitsage-network
cd bitsage-network/sdk/cli

# Install dependencies
npm install

# Build
npm run build

# Link for local testing
npm link

# Test
bitsage --help
```

## Requirements

- Node.js 18.0.0 or higher
- npm or yarn

## License

MIT
