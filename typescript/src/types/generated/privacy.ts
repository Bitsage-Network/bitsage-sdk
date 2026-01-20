/**
 * Obelysk Privacy Types
 * Generated from BitSage-Cairo-Smart-Contracts/src/obelysk/
 */

/** Elliptic curve point (STARK curve) */
export interface ECPoint {
  /** X coordinate (felt252) */
  x: bigint;
  /** Y coordinate (felt252) */
  y: bigint;
}

/** ElGamal ciphertext (encrypted value) */
export interface ElGamalCiphertext {
  /** First component C1 = r*G */
  c1: ECPoint;
  /** Second component C2 = M + r*PK */
  c2: ECPoint;
}

/** Encrypted balance with pending operations */
export interface EncryptedBalance {
  /** Main encrypted balance */
  ciphertext: ElGamalCiphertext;
  /** Pending incoming amount (encrypted) */
  pending_in: ElGamalCiphertext;
  /** Pending outgoing amount (encrypted) */
  pending_out: ElGamalCiphertext;
  /** Current epoch for balance updates */
  epoch: number;
}

/** Schnorr proof for knowledge of discrete log */
export interface SchnorrProof {
  /** Commitment point R = k*G */
  commitment: ECPoint;
  /** Challenge c = H(R || P || context) */
  challenge: bigint;
  /** Response s = k + c*x */
  response: bigint;
}

/** Range proof for value bounds (0 <= v < 2^64) */
export interface RangeProof {
  /** Commitment to value V = v*G + r*H */
  commitment: ECPoint;
  /** Proof hash (compressed representation) */
  proof_hash: bigint;
  /** Bit commitments for range decomposition */
  bit_commitments: ECPoint[];
}

/** Complete transfer proof */
export interface TransferProof {
  /** Proof sender has sufficient balance */
  sender_proof: SchnorrProof;
  /** Proof receiver received correct amount */
  receiver_proof: SchnorrProof;
  /** Range proof that amount is valid */
  balance_proof: RangeProof;
  /** Nullifier to prevent double-spending */
  nullifier: bigint;
}

/** Same encryption proof (auditable transfers) */
export interface SameEncryption3Proof {
  /** Proof that all ciphertexts encrypt same value */
  commitment: ECPoint;
  /** Challenge */
  challenge: bigint;
  /** Response */
  response: bigint;
  /** Second commitment for 3-party proof */
  commitment2: ECPoint;
  /** Second response */
  response2: bigint;
}

/** AE (Additively Encrypted) hint for fast decryption */
export interface AEHint {
  /** Hint component 0 */
  c0: bigint;
  /** Hint component 1 */
  c1: bigint;
  /** Hint component 2 */
  c2: bigint;
}

/** Private account state */
export interface PrivateAccount {
  /** Account owner address */
  owner: string;
  /** ElGamal public key for receiving */
  public_key: ECPoint;
  /** Current encrypted balance */
  balance: EncryptedBalance;
  /** AE hints for fast balance lookup */
  hints: AEHint;
  /** Account creation timestamp */
  created_at: number;
  /** Last activity timestamp */
  last_activity: number;
}

/** Account hints for fast decryption */
export interface AccountHints {
  /** AE hint data */
  hint: AEHint;
  /** Last update epoch */
  epoch: number;
  /** Hint verification hash */
  verification_hash: bigint;
}

/** Privacy key pair */
export interface PrivacyKeyPair {
  /** Public key for receiving encrypted funds */
  publicKey: ECPoint;
  /** Private key (never expose, use via WASM only) */
  privateKey: Uint8Array;
}

/** Stealth address for one-time payments */
export interface StealthAddress {
  /** Ephemeral public key (for ECDH) */
  ephemeral_pubkey: ECPoint;
  /** Stealth public key derived via ECDH */
  stealth_pubkey: ECPoint;
  /** View tag for scanning optimization */
  view_tag: number;
}

/** Steganographic transaction (uniform format) */
export interface SteganographicTransaction {
  /** Transaction type hidden in uniform format */
  type_commitment: bigint;
  /** Encrypted amount */
  encrypted_amount: ElGamalCiphertext;
  /** Sender's new balance (encrypted) */
  sender_new_balance: ElGamalCiphertext;
  /** Receiver's new balance (encrypted) */
  receiver_new_balance: ElGamalCiphertext;
  /** Proof of correctness */
  proof: TransferProof;
  /** Random padding for uniformity */
  padding: bigint[];
}

/** Ring signature member */
export interface RingMember {
  /** Member's public key */
  public_key: ECPoint;
  /** Member's commitment */
  commitment: ECPoint;
}

/** Ring signature for anonymity */
export interface RingSignature {
  /** Key image (prevents double-spending) */
  key_image: ECPoint;
  /** Ring members (including real signer) */
  ring: RingMember[];
  /** Signature components c values */
  c_values: bigint[];
  /** Signature components r values */
  r_values: bigint[];
}

/** Mixing transaction for anonymity set */
export interface MixingTransaction {
  /** Ring signature */
  signature: RingSignature;
  /** Encrypted output amount */
  output: ElGamalCiphertext;
  /** Recipient's stealth address */
  recipient: StealthAddress;
  /** Fee commitment */
  fee_commitment: ECPoint;
}

/** Mixing output for anonymity pool */
export interface MixingOutput {
  /** Output commitment */
  commitment: ECPoint;
  /** Encrypted amount */
  encrypted_amount: ElGamalCiphertext;
  /** Public key for claiming */
  claim_key: ECPoint;
  /** Timestamp */
  created_at: number;
  /** Whether used as decoy */
  is_decoy_eligible: boolean;
}

/** Ragequit proof for emergency withdrawal */
export interface RagequitProof {
  /** Proof of account ownership */
  ownership_proof: SchnorrProof;
  /** Revealed balance amount */
  revealed_amount: bigint;
  /** Balance proof */
  balance_proof: RangeProof;
  /** Current timestamp */
  timestamp: number;
}

/** DKG (Distributed Key Generation) share */
export interface DKGShare {
  /** Participant index */
  index: number;
  /** Share value */
  share: bigint;
  /** Commitment to share */
  commitment: ECPoint;
  /** Verification shares for VSS */
  verification_shares: ECPoint[];
}

/** Threshold decryption request */
export interface ThresholdDecryptionRequest {
  /** Request ID */
  id: bigint;
  /** Ciphertext to decrypt */
  ciphertext: ElGamalCiphertext;
  /** Requester address */
  requester: string;
  /** Shares received so far */
  shares_received: number;
  /** Required threshold */
  threshold: number;
  /** Status */
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

/** Multi-asset encrypted balance */
export interface MultiAssetBalance {
  /** Asset token address */
  asset: string;
  /** Encrypted balance for this asset */
  balance: EncryptedBalance;
}

/** Multi-asset balances container */
export interface MultiAssetBalances {
  /** SAGE token balance */
  SAGE: EncryptedBalance;
  /** USDC balance */
  USDC: EncryptedBalance;
  /** STRK balance */
  STRK: EncryptedBalance;
  /** WBTC balance */
  WBTC: EncryptedBalance;
  /** ETH balance */
  ETH: EncryptedBalance;
}

/** Private swap parameters */
export interface PrivateSwapParams {
  /** Source asset */
  from_asset: 'SAGE' | 'USDC' | 'STRK' | 'WBTC' | 'ETH';
  /** Destination asset */
  to_asset: 'SAGE' | 'USDC' | 'STRK' | 'WBTC' | 'ETH';
  /** Encrypted amount to swap */
  encrypted_amount: ElGamalCiphertext;
  /** Minimum output proof */
  min_output_proof: RangeProof;
  /** Swap proof */
  swap_proof: TransferProof;
}

/** Audit report for compliance */
export interface AuditReport {
  /** Auditor address */
  auditor: string;
  /** Transaction hash audited */
  tx_hash: bigint;
  /** Decrypted amount (only auditor sees) */
  decrypted_amount: bigint;
  /** Audit timestamp */
  timestamp: number;
  /** Signature of audit */
  signature: bigint;
}

/** Private transfer parameters */
export interface PrivateTransferParams {
  /** Recipient address */
  to: string;
  /** Encrypted amount to transfer */
  encrypted_amount: ElGamalCiphertext;
  /** Sender's new balance (encrypted) */
  sender_new_balance: ElGamalCiphertext;
  /** Receiver's new balance (encrypted) */
  receiver_new_balance: ElGamalCiphertext;
  /** Transfer proof */
  proof: TransferProof;
}

/** Private transfer with audit parameters */
export interface PrivateTransferWithAuditParams extends PrivateTransferParams {
  /** Encrypted amount for auditor */
  auditor_encrypted: ElGamalCiphertext;
  /** Proof all three encrypt same value */
  same_encryption_proof: SameEncryption3Proof;
}

/** Worker payment envelope */
export interface PrivateWorkerPayment {
  /** Job ID */
  job_id: bigint;
  /** Worker address */
  worker: string;
  /** Encrypted payment amount */
  encrypted_amount: ElGamalCiphertext;
  /** Payment assets (multi-asset) */
  assets: {
    asset: string;
    amount: ElGamalCiphertext;
  }[];
  /** Payment proof */
  proof: TransferProof;
}
