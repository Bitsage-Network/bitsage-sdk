/**
 * Obelysk Protocol MCP Server
 *
 * Model Context Protocol server that exposes Obelysk protocol tools
 * for AI assistants (Claude, etc.) to interact with the protocol on Starknet.
 *
 * Read-only tools query on-chain state via RPC. Write tools (deposit, stake)
 * require the DEPLOYER_PRIVKEY environment variable to be set.
 *
 * Usage:
 *   STARKNET_RPC=<rpc_url> npx ts-node src/mcp/server.ts
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { Account, RpcProvider } from 'starknet';
import { ObelyskClient } from '../obelysk/client';
import {
  MAINNET_TOKENS,
  MAINNET_PRIVACY_POOLS,
  DARKPOOL_ASSET_IDS,
  TOKEN_DECIMALS,
  formatAmount,
  parseAmount,
} from '../obelysk/contracts';

// =============================================================================
// Configuration
// =============================================================================

const RPC_URL =
  process.env.STARKNET_RPC ??
  'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_7/GUBwFqKhSgn4mwVbN6Sbn';

const VM31_RELAYER_URL =
  process.env.VM31_RELAYER_URL ?? 'http://35.163.191.22:3080';

/** Contract addresses (mainnet) */
const CONTRACTS = {
  sageToken: '0x0098d563900789f934e610b67482ae58793a2efc373ba3a45af94cdbf931c799',
  confidentialTransfer: '0x0673685bdb01fbf57c390ec2c0d893e7c77316cdea315b0fbfbc85b9a9a979d2',
  privacyRouter: '0x00f3fd871ba1b5b176270a7eb9e222c964c50fa8a31234394ea00ce70bfbdfbd',
  proverStaking: '0x07d2ecff4a4d7ca6c75df367d8dbc7cc12ea583f88813f7020832a7cf7f293e3',
  darkPool: '0x0230b5822556f0d9afca7b02f01e37cb9cf2a7e8d590a9020e9bbca183ea7727',
  shieldedSwap: '0x05a7f8a6ab74ee6ab41169118ca2ea21070dc6594bae5a39f5bb9ac50629725b',
  stealthRegistry: '0x077ee4c38201b4e45b643f4af56ff6daf780260e9c8a281f3536fb711afcaea8',
  otcOrderbook: '0x04165f8fe590e94d7f12e77af72577123b24cbd01101a62b53c3e119fb8bb119',
  vm31Pool: '0x0230eb355e54a98b4511d86585d45d6a5b9075d0ec254877485047b6d651400d',
  privacyPoolSage: '0x0224977344d123eb5c20fd088f15b62d0541f8282f4a23dd87bdf9839aac724f',
} as const;

// =============================================================================
// Client Initialization
// =============================================================================

function createReadOnlyClient(): ObelyskClient {
  return new ObelyskClient({
    network: 'mainnet',
    rpcUrl: RPC_URL,
  });
}

function createWriteClient(): ObelyskClient {
  const privKey = process.env.DEPLOYER_PRIVKEY;
  const accountAddr = process.env.DEPLOYER_ADDRESS;
  if (!privKey || !accountAddr) {
    throw new Error(
      'Write operations require DEPLOYER_PRIVKEY and DEPLOYER_ADDRESS environment variables'
    );
  }
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account = new Account(provider, accountAddr, privKey);
  return new ObelyskClient({
    network: 'mainnet',
    rpcUrl: RPC_URL,
    account,
  });
}

// =============================================================================
// Tool Definitions
// =============================================================================

const tools: Tool[] = [
  {
    name: 'obelysk_balance',
    description:
      'Get encrypted balance information for a Starknet address across Obelysk protocol contracts (ConfidentialTransfer, DarkPool, PrivacyPool). Returns ElGamal ciphertext components for encrypted balances.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        address: {
          type: 'string',
          description: 'Starknet address (hex, e.g. 0x0123...)',
        },
        contract: {
          type: 'string',
          enum: ['confidential_transfer', 'dark_pool', 'privacy_pool'],
          description: 'Which contract to query the balance from',
        },
        token: {
          type: 'string',
          enum: ['eth', 'strk', 'usdc', 'wbtc', 'sage'],
          description: 'Token symbol (required for dark_pool balances)',
        },
      },
      required: ['address', 'contract'],
    },
  },
  {
    name: 'obelysk_epoch_info',
    description:
      'Get the current DarkPool batch auction epoch information including the epoch number, current phase (Commit, Reveal, Settle, Closed), and supported trading pairs.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'obelysk_staking_info',
    description:
      'Get ProverStaking information: total SAGE staked, staking configuration (min stakes per GPU tier, cooldown, reward rate), and optionally a specific worker\'s stake position.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        worker_address: {
          type: 'string',
          description:
            'Optional Starknet address of a worker to get their specific stake info',
        },
      },
    },
  },
  {
    name: 'obelysk_pool_stats',
    description:
      'Get privacy pool statistics for a given token: total deposit count, total withdrawal count, deposited amount, withdrawn amount (TVL = deposited - withdrawn), and current Merkle root.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          enum: ['eth', 'strk', 'usdc', 'wbtc', 'sage'],
          description: 'Token symbol for the privacy pool to query',
        },
      },
      required: ['token'],
    },
  },
  {
    name: 'obelysk_vm31_status',
    description:
      'Check VM31 relayer health, pending transaction queue, and batch configuration. Queries the relayer HTTP API directly.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'obelysk_trade_history',
    description:
      'Get recent trades from the OTC orderbook for a given trading pair. Returns trade details including price, amount, maker/taker addresses, and execution timestamp.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pair_id: {
          type: 'number',
          description:
            'Trading pair ID (0=SAGE/STRK, 1=ETH/USDC, 2=WBTC/USDC, 3=STRK/USDC, 4=SAGE/ETH)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of trades to return (default: 10, max: 50)',
        },
        offset: {
          type: 'number',
          description: 'Offset for pagination (default: 0)',
        },
      },
      required: ['pair_id'],
    },
  },
  {
    name: 'obelysk_deposit',
    description:
      'Deposit tokens into a privacy pool or DarkPool. This is a WRITE operation that submits a transaction to Starknet. Requires DEPLOYER_PRIVKEY and DEPLOYER_ADDRESS environment variables. For privacy pool deposits, a Pedersen commitment and range proof are generated automatically.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          enum: ['privacy_pool', 'dark_pool'],
          description: 'Where to deposit: privacy_pool or dark_pool',
        },
        token: {
          type: 'string',
          enum: ['eth', 'strk', 'usdc', 'wbtc', 'sage'],
          description: 'Token symbol to deposit',
        },
        amount: {
          type: 'string',
          description: 'Human-readable amount to deposit (e.g. "1.5", "1000")',
        },
      },
      required: ['target', 'token', 'amount'],
    },
  },
  {
    name: 'obelysk_stake',
    description:
      'Stake SAGE tokens in the ProverStaking contract to become eligible as a GPU prover. This is a WRITE operation that submits a transaction to Starknet. Requires DEPLOYER_PRIVKEY and DEPLOYER_ADDRESS environment variables.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        amount: {
          type: 'string',
          description: 'Human-readable SAGE amount to stake (e.g. "10000")',
        },
        gpu_tier: {
          type: 'string',
          enum: ['Consumer', 'Professional', 'DataCenter', 'H100'],
          description: 'GPU tier to register as',
        },
      },
      required: ['amount', 'gpu_tier'],
    },
  },
  {
    name: 'obelysk_network_status',
    description:
      'Get overall Obelysk network status: contract deployment verification, protocol health checks, OTC orderbook stats, DarkPool epoch state, and staking totals. Provides a comprehensive overview of the protocol.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
];

// =============================================================================
// Tool Handlers
// =============================================================================

async function handleBalance(args: Record<string, unknown>): Promise<string> {
  const client = createReadOnlyClient();
  const address = args.address as string;
  const contract = args.contract as string;
  const token = (args.token as string) ?? 'sage';

  if (contract === 'dark_pool') {
    const assetId = DARKPOOL_ASSET_IDS[token];
    if (!assetId) return JSON.stringify({ error: `Unknown token: ${token}` });
    const balance = await client.darkPool.getEncryptedBalance(address, assetId);
    if (!balance) {
      return JSON.stringify({
        address,
        contract: 'dark_pool',
        token,
        balance: null,
        note: 'No encrypted balance found (user may not have deposited)',
      });
    }
    return JSON.stringify({
      address,
      contract: 'dark_pool',
      token,
      encrypted_balance: {
        c1: { x: balance.c1.x.toString(), y: balance.c1.y.toString() },
        c2: { x: balance.c2.x.toString(), y: balance.c2.y.toString() },
      },
      note: 'Balance is ElGamal encrypted. Decryption requires the private key.',
    });
  }

  if (contract === 'confidential_transfer') {
    const result = await client.provider.callContract({
      contractAddress: CONTRACTS.confidentialTransfer,
      entrypoint: 'get_encrypted_balance',
      calldata: [address],
    });
    if (result.length < 4 || result.every((r: string) => BigInt(r) === 0n)) {
      return JSON.stringify({
        address,
        contract: 'confidential_transfer',
        balance: null,
        note: 'No encrypted balance found',
      });
    }
    return JSON.stringify({
      address,
      contract: 'confidential_transfer',
      encrypted_balance: {
        c1: { x: result[0], y: result[1] },
        c2: { x: result[2], y: result[3] },
      },
      note: 'Balance is ElGamal encrypted. Decryption requires the private key.',
    });
  }

  if (contract === 'privacy_pool') {
    const poolAddr = MAINNET_PRIVACY_POOLS[token];
    if (!poolAddr) return JSON.stringify({ error: `No privacy pool for ${token}` });
    const stats = await client.privacyPool.getPoolStats(token);
    return JSON.stringify({
      address,
      contract: 'privacy_pool',
      token,
      note: 'Privacy pools use commitment-based balances. Individual balances cannot be queried on-chain (this is by design for privacy). Pool-level stats returned instead.',
      pool_stats: {
        total_deposits: stats.totalDeposits,
        total_withdrawals: stats.totalWithdrawals,
        total_deposited: stats.totalDeposited.toString(),
        total_withdrawn: stats.totalWithdrawn.toString(),
      },
    });
  }

  return JSON.stringify({ error: `Unknown contract type: ${contract}` });
}

async function handleEpochInfo(): Promise<string> {
  const client = createReadOnlyClient();
  const epochInfo = await client.darkPool.getEpochInfo();
  const pairs = await client.darkPool.getSupportedPairs();
  const orderCount = await client.darkPool.getOrderCount();
  const feeInfo = await client.darkPool.getFeeInfo();

  return JSON.stringify({
    epoch: epochInfo.epoch,
    phase: epochInfo.phase,
    blocks_remaining: epochInfo.blocksRemaining,
    total_orders: orderCount,
    supported_pairs: pairs.map((p) => ({
      give_asset: p.giveAsset,
      want_asset: p.wantAsset,
    })),
    fees: feeInfo
      ? { fee_bps: feeInfo.feeBps, fee_recipient: feeInfo.feeRecipient }
      : null,
    contract: CONTRACTS.darkPool,
  });
}

async function handleStakingInfo(args: Record<string, unknown>): Promise<string> {
  const client = createReadOnlyClient();
  const [totalStaked, totalSlashed, config] = await Promise.all([
    client.staking.getTotalStaked(),
    client.staking.getTotalSlashed(),
    client.staking.getConfig(),
  ]);

  const result: Record<string, unknown> = {
    total_staked: formatAmount(totalStaked, 'sage'),
    total_staked_wei: totalStaked.toString(),
    total_slashed: formatAmount(totalSlashed, 'sage'),
    total_slashed_wei: totalSlashed.toString(),
    config: {
      min_stake_consumer: formatAmount(config.minStakeConsumer, 'sage'),
      min_stake_professional: formatAmount(config.minStakeProfessional, 'sage'),
      min_stake_datacenter: formatAmount(config.minStakeDataCenter, 'sage'),
      min_stake_h100: formatAmount(config.minStakeH100, 'sage'),
      cooldown_period_secs: config.cooldownPeriod,
      slash_percent: config.slashPercent,
      reward_rate_bps: config.rewardRateBps,
      apy_percent: (config.rewardRateBps / 100).toFixed(2),
    },
    contract: CONTRACTS.proverStaking,
  };

  const workerAddress = args.worker_address as string | undefined;
  if (workerAddress) {
    const [stake, eligible] = await Promise.all([
      client.staking.getStake(workerAddress),
      client.staking.isEligible(workerAddress),
    ]);
    result.worker = {
      address: workerAddress,
      amount: formatAmount(stake.amount, 'sage'),
      amount_wei: stake.amount.toString(),
      gpu_tier: stake.gpuTier,
      staked_at: stake.stakedAt,
      is_active: stake.isActive,
      is_eligible: eligible,
      success_count: stake.successCount,
      fail_count: stake.failCount,
    };
  }

  return JSON.stringify(result);
}

async function handlePoolStats(args: Record<string, unknown>): Promise<string> {
  const client = createReadOnlyClient();
  const token = args.token as string;

  const poolAddr = MAINNET_PRIVACY_POOLS[token];
  if (!poolAddr) {
    return JSON.stringify({ error: `No privacy pool for token: ${token}` });
  }

  const [stats, merkleRoot, feeInfo] = await Promise.all([
    client.privacyPool.getPoolStats(token),
    client.privacyPool.getMerkleRoot(token),
    client.privacyPool.getFeeInfo(token).catch(() => null),
  ]);

  const deposited = stats.totalDeposited;
  const withdrawn = stats.totalWithdrawn;
  const tvl = deposited - withdrawn;

  return JSON.stringify({
    token,
    pool_address: poolAddr,
    total_deposits: stats.totalDeposits,
    total_withdrawals: stats.totalWithdrawals,
    total_deposited: formatAmount(deposited, token),
    total_deposited_wei: deposited.toString(),
    total_withdrawn: formatAmount(withdrawn, token),
    total_withdrawn_wei: withdrawn.toString(),
    tvl: formatAmount(tvl > 0n ? tvl : 0n, token),
    tvl_wei: (tvl > 0n ? tvl : 0n).toString(),
    merkle_root: merkleRoot,
    tree_size: stats.totalDeposits,
    fees: feeInfo
      ? {
          fee_bps: feeInfo.feeBps,
          fee_recipient: feeInfo.feeRecipient,
          accumulated: feeInfo.accumulated.toString(),
        }
      : null,
  });
}

async function handleVm31Status(): Promise<string> {
  try {
    const healthRes = await fetch(`${VM31_RELAYER_URL}/health`);
    const health = await healthRes.json();

    let queue: unknown = null;
    try {
      const queueRes = await fetch(`${VM31_RELAYER_URL}/api/queue`);
      queue = await queueRes.json();
    } catch {
      // Queue endpoint may not be available
    }

    return JSON.stringify({
      relayer_url: VM31_RELAYER_URL,
      healthy: healthRes.ok,
      health_data: health,
      queue: queue,
      vm31_pool_contract: CONTRACTS.vm31Pool,
    });
  } catch (err) {
    return JSON.stringify({
      relayer_url: VM31_RELAYER_URL,
      healthy: false,
      error: err instanceof Error ? err.message : 'Failed to connect to VM31 relayer',
      vm31_pool_contract: CONTRACTS.vm31Pool,
    });
  }
}

async function handleTradeHistory(args: Record<string, unknown>): Promise<string> {
  const client = createReadOnlyClient();
  const pairId = args.pair_id as number;
  const limit = Math.min((args.limit as number) ?? 10, 50);
  const offset = (args.offset as number) ?? 0;

  const pairNames = ['SAGE/STRK', 'ETH/USDC', 'WBTC/USDC', 'STRK/USDC', 'SAGE/ETH'];
  const pairName = pairNames[pairId] ?? `Pair #${pairId}`;

  const [trades, stats, lastTrade] = await Promise.all([
    client.otc.getTradeHistory(pairId, offset, limit),
    client.otc.get24hStats(pairId).catch(() => null),
    client.otc.getLastTrade(pairId).catch(() => null),
  ]);

  return JSON.stringify({
    pair_id: pairId,
    pair_name: pairName,
    trades: trades.map((t) => ({
      trade_id: t.tradeId.toString(),
      maker_order_id: t.makerOrderId.toString(),
      taker_order_id: t.takerOrderId.toString(),
      maker: t.maker,
      taker: t.taker,
      price: t.price.toString(),
      amount: t.amount.toString(),
      quote_amount: t.quoteAmount.toString(),
      executed_at: t.executedAt,
    })),
    stats_24h: stats
      ? {
          volume: stats.volume.toString(),
          high: stats.high.toString(),
          low: stats.low.toString(),
          trade_count: stats.tradeCount.toString(),
        }
      : null,
    last_trade: lastTrade
      ? {
          price: lastTrade.price.toString(),
          amount: lastTrade.amount.toString(),
          timestamp: lastTrade.timestamp,
        }
      : null,
    contract: CONTRACTS.otcOrderbook,
  });
}

async function handleDeposit(args: Record<string, unknown>): Promise<string> {
  const target = args.target as string;
  const token = args.token as string;
  const amount = args.amount as string;

  let client: ObelyskClient;
  try {
    client = createWriteClient();
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : 'Failed to create write client',
      hint: 'Set DEPLOYER_PRIVKEY and DEPLOYER_ADDRESS environment variables',
    });
  }

  try {
    if (target === 'privacy_pool') {
      const result = await client.privacyPool.deposit({ token, amount });
      return JSON.stringify({
        success: true,
        target: 'privacy_pool',
        token,
        amount,
        tx_hash: result.txHash,
        commitment_hash: result.commitmentHash,
        note: 'IMPORTANT: Save the deposit note for future withdrawal. The note contains the blinding factor and nullifier secret needed to reclaim funds.',
        deposit_note: {
          token: result.note.token,
          amount: result.note.amount,
          commitment_hash: result.note.commitmentHash,
          created_at: result.note.createdAt,
        },
      });
    }

    if (target === 'dark_pool') {
      const result = await client.darkPool.deposit({ token, amount });
      return JSON.stringify({
        success: true,
        target: 'dark_pool',
        token,
        amount,
        tx_hash: result.txHash,
      });
    }

    return JSON.stringify({ error: `Unknown target: ${target}` });
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : 'Deposit failed',
      target,
      token,
      amount,
    });
  }
}

async function handleStake(args: Record<string, unknown>): Promise<string> {
  const amount = args.amount as string;
  const gpuTier = args.gpu_tier as 'Consumer' | 'Professional' | 'DataCenter' | 'H100';

  let client: ObelyskClient;
  try {
    client = createWriteClient();
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : 'Failed to create write client',
      hint: 'Set DEPLOYER_PRIVKEY and DEPLOYER_ADDRESS environment variables',
    });
  }

  try {
    const result = await client.staking.stake(amount, gpuTier);
    return JSON.stringify({
      success: true,
      amount,
      gpu_tier: gpuTier,
      tx_hash: result.txHash,
      contract: CONTRACTS.proverStaking,
    });
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : 'Stake failed',
      amount,
      gpu_tier: gpuTier,
    });
  }
}

async function handleNetworkStatus(): Promise<string> {
  const client = createReadOnlyClient();

  // Run all queries in parallel for speed
  const [epochInfo, totalStaked, otcStats, otcConfig] = await Promise.all([
    client.darkPool.getEpochInfo().catch(() => null),
    client.staking.getTotalStaked().catch(() => null),
    client.otc.getStats().catch(() => null),
    client.otc.getConfig().catch(() => null),
  ]);

  // Verify contract deployments by checking class hashes
  const contractChecks = await Promise.all(
    Object.entries({
      sage_token: CONTRACTS.sageToken,
      confidential_transfer: CONTRACTS.confidentialTransfer,
      privacy_router: CONTRACTS.privacyRouter,
      prover_staking: CONTRACTS.proverStaking,
      dark_pool: CONTRACTS.darkPool,
      shielded_swap: CONTRACTS.shieldedSwap,
      stealth_registry: CONTRACTS.stealthRegistry,
      otc_orderbook: CONTRACTS.otcOrderbook,
      vm31_pool: CONTRACTS.vm31Pool,
    }).map(async ([name, address]) => {
      try {
        const classHash = await client.provider.getClassHashAt(address);
        return { name, address, deployed: true, class_hash: classHash };
      } catch {
        return { name, address, deployed: false, class_hash: null };
      }
    })
  );

  // Check VM31 relayer
  let relayerHealthy = false;
  try {
    const res = await fetch(`${VM31_RELAYER_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    relayerHealthy = res.ok;
  } catch {
    // Relayer unreachable
  }

  return JSON.stringify({
    network: 'mainnet',
    rpc_url: RPC_URL,
    contracts: contractChecks,
    dark_pool: epochInfo
      ? { epoch: epochInfo.epoch, phase: epochInfo.phase }
      : { error: 'Failed to query DarkPool' },
    staking: totalStaked !== null
      ? {
          total_staked: formatAmount(totalStaked, 'sage'),
          total_staked_wei: totalStaked.toString(),
        }
      : { error: 'Failed to query staking' },
    otc_orderbook: otcStats
      ? {
          order_count: otcStats.orderCount.toString(),
          trade_count: otcStats.tradeCount.toString(),
          total_volume: otcStats.totalVolume.toString(),
          total_fees: otcStats.totalFees.toString(),
          paused: otcConfig?.paused ?? false,
        }
      : { error: 'Failed to query OTC orderbook' },
    vm31_relayer: {
      url: VM31_RELAYER_URL,
      healthy: relayerHealthy,
    },
    privacy_pools: Object.entries(MAINNET_PRIVACY_POOLS).map(([token, addr]) => ({
      token,
      address: addr,
    })),
    tokens: MAINNET_TOKENS,
  });
}

// =============================================================================
// Server Setup
// =============================================================================

export function createServer(): Server {
  const server = new Server(
    {
      name: 'obelysk-protocol',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List all available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Handle tool invocations
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const safeArgs = (args ?? {}) as Record<string, unknown>;

    try {
      let result: string;

      switch (name) {
        case 'obelysk_balance':
          result = await handleBalance(safeArgs);
          break;
        case 'obelysk_epoch_info':
          result = await handleEpochInfo();
          break;
        case 'obelysk_staking_info':
          result = await handleStakingInfo(safeArgs);
          break;
        case 'obelysk_pool_stats':
          result = await handlePoolStats(safeArgs);
          break;
        case 'obelysk_vm31_status':
          result = await handleVm31Status();
          break;
        case 'obelysk_trade_history':
          result = await handleTradeHistory(safeArgs);
          break;
        case 'obelysk_deposit':
          result = await handleDeposit(safeArgs);
          break;
        case 'obelysk_stake':
          result = await handleStake(safeArgs);
          break;
        case 'obelysk_network_status':
          result = await handleNetworkStatus();
          break;
        default:
          result = JSON.stringify({ error: `Unknown tool: ${name}` });
      }

      return {
        content: [{ type: 'text', text: result }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Start the MCP server on stdio transport.
 */
export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Obelysk MCP server started on stdio');
}
