/**
 * Privacy Pool Client
 *
 * Deposit tokens into shielded privacy pools using Pedersen commitments.
 * Withdraw with nullifier + Merkle proof to break the on-chain link.
 *
 * Flow:
 *   1. deposit(token, amount) → creates commitment, stores note locally
 *   2. withdraw(note, recipient) → reveals nullifier + Merkle proof
 */
import { CallData, hash, type Call } from 'starknet';
import type { ObelyskClient } from './client';
import { parseAmount, formatAmount } from './contracts';
import {
  mod, ecAdd, ecMul, randomScalar, pedersenCommit, commitmentToHash,
  FIELD_PRIME, CURVE_ORDER, GENERATOR_G, GENERATOR_H,
} from './crypto';

// ============================================================================
// Types
// ============================================================================

export interface DepositParams {
  /** Token symbol (eth, strk, usdc, wbtc, sage) */
  token: string;
  /** Human-readable amount (e.g. "1.5") */
  amount: string;
}

export interface DepositResult {
  /** Transaction hash */
  txHash: string;
  /** Note data (SAVE THIS — needed for withdrawal) */
  note: PrivacyNote;
  /** Commitment hash (on-chain identifier) */
  commitmentHash: string;
}

export interface WithdrawParams {
  /** The note from a previous deposit */
  note: PrivacyNote;
  /** Recipient address (can be different from depositor for anonymity) */
  recipient: string;
  /** Merkle proof (array of sibling hashes from leaf to root) */
  merkleProof: string[];
  /** Leaf index in the Merkle tree */
  leafIndex: number;
}

export interface WithdrawResult {
  txHash: string;
  amount: string;
  token: string;
}

/** Serializable privacy note — MUST be saved by the user */
export interface PrivacyNote {
  /** Token symbol */
  token: string;
  /** Amount in wei (bigint as string) */
  amount: string;
  /** Pedersen blinding factor (bigint as string) */
  blinding: string;
  /** Nullifier secret (bigint as string) */
  nullifierSecret: string;
  /** Commitment point x (bigint as string) */
  commitmentX: string;
  /** Commitment point y (bigint as string) */
  commitmentY: string;
  /** Poseidon hash of commitment (felt252 hex) */
  commitmentHash: string;
  /** Leaf index in Merkle tree (set after deposit confirms) */
  leafIndex?: number;
  /** Deposit transaction hash */
  depositTxHash?: string;
  /** Timestamp */
  createdAt: number;
}

// ============================================================================
// Range proof (32-bit, STARK-verified)
// ============================================================================

interface RangeProof32 {
  value_bits: bigint[];
  blinding_bits: bigint[];
  bit_commitments: { x: bigint; y: bigint }[];
}

function generateRangeProof32(value: bigint, blinding: bigint): RangeProof32 {
  if (value < 0n || value >= (1n << 32n)) {
    throw new Error('Value out of 32-bit range');
  }

  const value_bits: bigint[] = [];
  const blinding_bits: bigint[] = [];
  const bit_commitments: { x: bigint; y: bigint }[] = [];

  let blindingSum = 0n;

  for (let i = 0; i < 32; i++) {
    const bit = (value >> BigInt(i)) & 1n;
    value_bits.push(bit);

    let r_i: bigint;
    if (i === 31) {
      r_i = mod(blinding - blindingSum, CURVE_ORDER);
    } else {
      r_i = randomScalar();
      blindingSum = mod(blindingSum + r_i * (1n << BigInt(i)), CURVE_ORDER);
    }
    blinding_bits.push(r_i);
    bit_commitments.push(pedersenCommit(bit, r_i));
  }

  return { value_bits, blinding_bits, bit_commitments };
}

function serializeRangeProof32(proof: RangeProof32): string[] {
  const calldata: string[] = [];
  for (const c of proof.bit_commitments) {
    calldata.push('0x' + c.x.toString(16));
    calldata.push('0x' + c.y.toString(16));
  }
  for (const r of proof.blinding_bits) {
    calldata.push('0x' + r.toString(16));
  }
  return calldata;
}

/** Derive nullifier: Poseidon(nullifierSecret, leafIndex) */
function deriveNullifier(nullifierSecret: bigint, leafIndex: number): string {
  return hash.computePoseidonHash(nullifierSecret.toString(), leafIndex.toString());
}

// ============================================================================
// Privacy Pool Client
// ============================================================================

export class PrivacyPoolClient {
  constructor(private readonly obelysk: ObelyskClient) {}

  /**
   * Deposit tokens into a privacy pool.
   *
   * Creates a Pedersen commitment and range proof, then calls the
   * privacy pool contract's deposit function.
   *
   * @returns DepositResult with the note (SAVE THIS for withdrawal)
   */
  async deposit(params: DepositParams): Promise<DepositResult> {
    const account = this.obelysk.requireAccount();
    const poolAddress = this.obelysk.getPrivacyPoolAddress(params.token);
    const tokenAddress = this.obelysk.getTokenAddress(params.token);
    const amountWei = parseAmount(params.amount, params.token);

    const blinding = randomScalar();
    const nullifierSecret = randomScalar();
    const commitment = pedersenCommit(amountWei, blinding);
    const commitHash = commitmentToHash(commitment);

    const rangeProof = generateRangeProof32(amountWei, blinding);

    const amountLow = amountWei & ((1n << 128n) - 1n);
    const amountHigh = amountWei >> 128n;

    const calls: Call[] = [
      {
        contractAddress: tokenAddress,
        entrypoint: 'approve',
        calldata: CallData.compile({
          spender: poolAddress,
          amount: { low: amountLow.toString(), high: amountHigh.toString() },
        }),
      },
      {
        contractAddress: poolAddress,
        entrypoint: 'deposit',
        calldata: CallData.compile({
          amount: { low: amountLow.toString(), high: amountHigh.toString() },
          commitment_x: commitment.x.toString(),
          commitment_y: commitment.y.toString(),
          range_proof: serializeRangeProof32(rangeProof),
        }),
      },
    ];

    const result = await account.execute(calls);
    await this.obelysk.provider.waitForTransaction(result.transaction_hash);

    const note: PrivacyNote = {
      token: params.token,
      amount: amountWei.toString(),
      blinding: blinding.toString(),
      nullifierSecret: nullifierSecret.toString(),
      commitmentX: commitment.x.toString(),
      commitmentY: commitment.y.toString(),
      commitmentHash: commitHash,
      depositTxHash: result.transaction_hash,
      createdAt: Date.now(),
    };

    return { txHash: result.transaction_hash, note, commitmentHash: commitHash };
  }

  /**
   * Withdraw tokens from a privacy pool.
   *
   * Requires the original note, a Merkle proof of inclusion,
   * and the leaf index. The recipient can be any address.
   */
  async withdraw(params: WithdrawParams): Promise<WithdrawResult> {
    const account = this.obelysk.requireAccount();
    const poolAddress = this.obelysk.getPrivacyPoolAddress(params.note.token);

    const leafIndex = params.leafIndex ?? params.note.leafIndex;
    if (leafIndex === undefined) throw new Error('leafIndex required for withdrawal');

    const nullifier = deriveNullifier(BigInt(params.note.nullifierSecret), leafIndex);
    const amountWei = BigInt(params.note.amount);
    const amountLow = amountWei & ((1n << 128n) - 1n);
    const amountHigh = amountWei >> 128n;

    const calls: Call[] = [
      {
        contractAddress: poolAddress,
        entrypoint: 'withdraw',
        calldata: CallData.compile({
          amount: { low: amountLow.toString(), high: amountHigh.toString() },
          nullifier,
          recipient: params.recipient,
          commitment_x: params.note.commitmentX,
          commitment_y: params.note.commitmentY,
          blinding: params.note.blinding,
          merkle_proof: params.merkleProof,
          leaf_index: leafIndex,
        }),
      },
    ];

    const result = await account.execute(calls);
    await this.obelysk.provider.waitForTransaction(result.transaction_hash);

    return {
      txHash: result.transaction_hash,
      amount: formatAmount(amountWei, params.note.token),
      token: params.note.token,
    };
  }

  /**
   * Read the current global deposit Merkle root of a privacy pool.
   */
  async getMerkleRoot(token: string): Promise<string> {
    const poolAddress = this.obelysk.getPrivacyPoolAddress(token);
    const result = await this.obelysk.provider.callContract({
      contractAddress: poolAddress,
      entrypoint: 'get_global_deposit_root',
      calldata: [],
    });
    return result[0];
  }

  /**
   * Get pool stats: (total_deposits, total_withdrawals, total_deposited_amount, total_withdrawn_amount)
   */
  async getPoolStats(token: string): Promise<{ totalDeposits: number; totalWithdrawals: number; totalDeposited: bigint; totalWithdrawn: bigint }> {
    const poolAddress = this.obelysk.getPrivacyPoolAddress(token);
    const result = await this.obelysk.provider.callContract({
      contractAddress: poolAddress,
      entrypoint: 'get_pp_stats',
      calldata: [],
    });
    return {
      totalDeposits: Number(BigInt(result[0])),
      totalWithdrawals: Number(BigInt(result[1])),
      totalDeposited: BigInt(result[2]),
      totalWithdrawn: BigInt(result[3]),
    };
  }

  /**
   * Get the current leaf count (number of deposits) in a privacy pool.
   */
  async getLeafCount(token: string): Promise<number> {
    const stats = await this.getPoolStats(token);
    return stats.totalDeposits;
  }

  /**
   * Check if a nullifier has been used (prevents double-withdrawal).
   */
  async isNullifierUsed(token: string, nullifier: string): Promise<boolean> {
    const poolAddress = this.obelysk.getPrivacyPoolAddress(token);
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: poolAddress,
        entrypoint: 'is_pp_nullifier_used',
        calldata: [nullifier],
      });
      return BigInt(result[0]) !== 0n;
    } catch {
      return false;
    }
  }

  /**
   * Check if a deposit commitment is valid.
   */
  async isDepositValid(token: string, commitment: string): Promise<boolean> {
    const poolAddress = this.obelysk.getPrivacyPoolAddress(token);
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: poolAddress,
        entrypoint: 'is_pp_deposit_valid',
        calldata: [commitment],
      });
      return BigInt(result[0]) !== 0n;
    } catch {
      return false;
    }
  }

  /**
   * Get fee info for a privacy pool (bps, recipient, accumulated).
   */
  async getFeeInfo(token: string): Promise<{ feeBps: number; feeRecipient: string; accumulated: bigint }> {
    const poolAddress = this.obelysk.getPrivacyPoolAddress(token);
    const result = await this.obelysk.provider.callContract({
      contractAddress: poolAddress,
      entrypoint: 'get_fee_info',
      calldata: [],
    });
    return {
      feeBps: Number(BigInt(result[0])),
      feeRecipient: result[1],
      accumulated: BigInt(result[2]),
    };
  }

  /**
   * Fetch a Merkle proof for a given leaf index from on-chain data.
   * Reconstructs the tree from deposit events.
   */
  async fetchMerkleProof(token: string, leafIndex: number): Promise<{ proof: string[]; root: string }> {
    const poolAddress = this.obelysk.getPrivacyPoolAddress(token);

    const events = await this.obelysk.provider.getEvents({
      address: poolAddress,
      keys: [],
      from_block: { block_number: 0 },
      to_block: 'latest',
      chunk_size: 1000,
    });

    const leaves: string[] = [];
    for (const event of events.events) {
      if (event.data.length >= 1) {
        leaves.push(event.data[0]);
      }
    }

    if (leafIndex >= leaves.length) {
      throw new Error(`Leaf index ${leafIndex} out of range (${leaves.length} leaves)`);
    }

    const { proof, root } = buildMerkleProof(leaves, leafIndex);
    return { proof, root };
  }
}

// ============================================================================
// Merkle tree helpers (Poseidon-based, matching on-chain LeanIMT)
// ============================================================================

function poseidonHash2(a: string, b: string): string {
  return hash.computePoseidonHash(a, b);
}

function buildMerkleProof(leaves: string[], leafIndex: number): { proof: string[]; root: string } {
  if (leaves.length === 0) throw new Error('Empty tree');

  let level = [...leaves];
  const depth = Math.ceil(Math.log2(Math.max(level.length, 2)));
  while (level.length < (1 << depth)) {
    level.push('0x0');
  }

  const proof: string[] = [];
  let idx = leafIndex;

  for (let d = 0; d < depth; d++) {
    const siblingIdx = idx ^ 1;
    proof.push(level[siblingIdx] ?? '0x0');

    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      nextLevel.push(poseidonHash2(level[i], level[i + 1]));
    }
    level = nextLevel;
    idx >>= 1;
  }

  return { proof, root: level[0] };
}
