/**
 * ObelyZK Policy MCP Server
 *
 * Model Context Protocol server that exposes ZKML firewall and policy tools
 * for AI agents to classify transactions, check trust status, and verify proofs.
 *
 * This server is separate from the Obelysk Protocol MCP server (which handles
 * DeFi operations). This one is focused on agent safety and policy enforcement.
 *
 * Environment variables:
 *   PROVER_URL          - Prove-server base URL (default: http://localhost:8080)
 *   STARKNET_RPC        - Starknet JSON-RPC URL (default: Sepolia Alchemy)
 *   FIREWALL_CONTRACT   - AgentFirewallZK contract address on Starknet
 *   VERIFIER_CONTRACT   - ObelyskVerifier contract address on Starknet
 *   PROVER_API_KEY      - Optional bearer token for prove-server auth
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Account, RpcProvider } from "starknet";
import { AgentFirewallSDK } from "../firewall/client";
import { CiroClient } from "../firewall/ciro";

// =============================================================================
// Configuration
// =============================================================================

const PROVER_URL =
  process.env.PROVER_URL ?? "http://localhost:8080";

const STARKNET_RPC =
  process.env.STARKNET_RPC ??
  "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/demo";

const FIREWALL_CONTRACT = process.env.FIREWALL_CONTRACT ?? "";
const VERIFIER_CONTRACT = process.env.VERIFIER_CONTRACT ?? "";
const PROVER_API_KEY = process.env.PROVER_API_KEY;
const CIRO_URL = process.env.CIRO_URL ?? "";
const CIRO_API_KEY = process.env.CIRO_API_KEY ?? "";

// =============================================================================
// Client Initialization
// =============================================================================

function createFirewallClient(): AgentFirewallSDK {
  return new AgentFirewallSDK({
    proverUrl: PROVER_URL,
    firewallContract: FIREWALL_CONTRACT,
    verifierContract: VERIFIER_CONTRACT,
    rpcUrl: STARKNET_RPC,
    apiKey: PROVER_API_KEY,
  });
}

function createWriteFirewallClient(): AgentFirewallSDK {
  const privKey = process.env.DEPLOYER_PRIVKEY;
  const accountAddr = process.env.DEPLOYER_ADDRESS;
  if (!privKey || !accountAddr) {
    throw new Error(
      "Write operations require DEPLOYER_PRIVKEY and DEPLOYER_ADDRESS environment variables"
    );
  }
  const provider = new RpcProvider({ nodeUrl: STARKNET_RPC });
  const account = new Account(provider, accountAddr, privKey);
  return new AgentFirewallSDK({
    proverUrl: PROVER_URL,
    firewallContract: FIREWALL_CONTRACT,
    verifierContract: VERIFIER_CONTRACT,
    rpcUrl: STARKNET_RPC,
    apiKey: PROVER_API_KEY,
    account,
  });
}

// =============================================================================
// Tool Definitions
// =============================================================================

const DECISION_LABELS: Record<number, string> = {
  0: "pending",
  1: "approved",
  2: "escalated",
  3: "blocked",
};

const tools: Tool[] = [
  {
    name: "obelyzk_classify",
    description:
      "Classify a transaction through the ZKML classifier. Returns a cryptographically-proven threat score and decision (approve/escalate/block). Use this BEFORE executing any on-chain transaction to check if it is safe.",
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Target contract address (hex, 0x-prefixed)",
        },
        value: {
          type: "string",
          description: "Transaction value (decimal string, u256). Default: '0'",
        },
        selector: {
          type: "string",
          description:
            "Function selector (hex, 4 bytes, 0x-prefixed). Default: '0x0'",
        },
        calldata: {
          type: "string",
          description:
            "Calldata after selector (hex, 0x-prefixed). Default: '0x'",
        },
        agent_trust_score: {
          type: "number",
          description: "Agent's current trust score (0-100000). Default: 0",
        },
        agent_strikes: {
          type: "number",
          description: "Agent's current strike count. Default: 0",
        },
        target_verified: {
          type: "boolean",
          description:
            "Whether the target contract is verified on a block explorer. Default: false",
        },
        target_interaction_count: {
          type: "number",
          description:
            "Number of previous interactions with this target. Default: 0",
        },
      },
      required: ["target"],
    },
  },
  {
    name: "obelyzk_agent_status",
    description:
      "Check the trust status of an agent on the firewall contract. Returns registration status, trust score (0-100000), strike count, and whether the agent is trusted.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "Agent ID (felt252, hex or decimal)",
        },
      },
      required: ["agent_id"],
    },
  },
  {
    name: "obelyzk_check_action",
    description:
      "Check the status of a specific action submitted to the firewall. Returns the decision (pending/approved/escalated/blocked), threat score, and IO commitment.",
    inputSchema: {
      type: "object",
      properties: {
        action_id: {
          type: "number",
          description: "Action ID (u64, returned from submit_action)",
        },
      },
      required: ["action_id"],
    },
  },
  {
    name: "obelyzk_health",
    description:
      "Check health of the ObelyZK policy infrastructure. Returns prover server status, firewall contract reachability, and classifier model status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "obelyzk_get_policy",
    description:
      "Get the current policy configuration. Shows which soundness gates are enforced, the weight binding mode, and the Poseidon commitment hash. Use this to understand what verification level is active.",
    inputSchema: {
      type: "object",
      properties: {
        preset: {
          type: "string",
          enum: ["strict", "standard", "relaxed"],
          description: "Policy preset to inspect. Default: current active policy.",
        },
      },
    },
  },
  {
    name: "obelyzk_list_models",
    description:
      "List all models available on the prover server. Returns model IDs, names, weight commitments, layer counts, and input shapes.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "obelyzk_prove_inference",
    description:
      "Submit an async proof generation job for a model. Returns a job_id to poll for status. Use this for arbitrary model proving, not just classification.",
    inputSchema: {
      type: "object",
      properties: {
        model_id: {
          type: "string",
          description: "Model ID (hex) or name (e.g., 'smollm2-135m')",
        },
        input_data: {
          type: "array",
          items: { type: "number" },
          description: "Input tensor data as flat array of numbers",
        },
        policy: {
          type: "string",
          enum: ["strict", "standard", "relaxed"],
          description: "Policy preset for proving. Default: 'standard'",
        },
      },
      required: ["model_id", "input_data"],
    },
  },
  {
    name: "obelyzk_verify_proof",
    description:
      "Check if a proof has been verified on-chain. Returns verification status, model ID, and IO commitment.",
    inputSchema: {
      type: "object",
      properties: {
        proof_hash: {
          type: "string",
          description: "Proof hash (hex, from classify or prove result)",
        },
      },
      required: ["proof_hash"],
    },
  },
  {
    name: "obelyzk_enrich_target",
    description:
      "Enrich a target address with intelligence from CIRO data lake. Returns risk score, sanctions status, Forta alerts, verification status, and behavioral context. Requires CIRO_URL and CIRO_API_KEY.",
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Target contract address (hex)",
        },
        sender: {
          type: "string",
          description: "Sender address (hex, optional — provides behavioral context)",
        },
        value: {
          type: "string",
          description: "Transaction value (decimal string). Default: '0'",
        },
        selector: {
          type: "string",
          description: "Function selector (hex). Default: '0x0'",
        },
      },
      required: ["target"],
    },
  },
  {
    name: "obelyzk_address_risk",
    description:
      "Get comprehensive risk assessment for an address from CIRO. Returns risk level, sanctions status, exploit involvement, Forta alert count, and address cluster information.",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "Address to assess (hex)",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "obelyzk_alerts",
    description:
      "Get recent security alerts from CIRO's detection pipeline (Forta bots + custom heuristics). Filter by severity level.",
    inputSchema: {
      type: "object",
      properties: {
        severity: {
          type: "string",
          enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"],
          description: "Filter by alert severity",
        },
        limit: {
          type: "number",
          description: "Max alerts to return. Default: 20",
        },
      },
    },
  },
  {
    name: "obelyzk_data_lake_stats",
    description:
      "Get statistics about CIRO's blockchain data lake — total transactions indexed, label distribution, Forta bots active, sanctioned addresses tracked.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  // ── Write Tools (require DEPLOYER_PRIVKEY + DEPLOYER_ADDRESS) ──────
  {
    name: "obelyzk_register_agent",
    description:
      "Register a new agent on the firewall contract. The calling account becomes the agent owner. One-time operation per agent_id.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "Agent ID (felt252, hex or decimal). Must be unique.",
        },
      },
      required: ["agent_id"],
    },
  },
  {
    name: "obelyzk_submit_action",
    description:
      "Submit a pending action to the firewall contract for classification. Returns an action_id. The action must be resolved with a proof within 1 hour or it expires.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "Agent ID (must be registered)",
        },
        target: {
          type: "string",
          description: "Target contract address (hex)",
        },
        value: {
          type: "string",
          description: "Transaction value (hex felt252)",
        },
        selector: {
          type: "number",
          description: "Function selector (u32)",
        },
        io_commitment: {
          type: "string",
          description:
            "IO commitment from classify result (Poseidon hash, hex)",
        },
      },
      required: ["agent_id", "target", "value", "selector", "io_commitment"],
    },
  },
  {
    name: "obelyzk_resolve_action",
    description:
      "Resolve a pending action with a verified ZKML proof. The proof must already be verified on the ObelyskVerifier contract. Updates the agent's trust score and applies the decision.",
    inputSchema: {
      type: "object",
      properties: {
        action_id: {
          type: "number",
          description: "Action ID (from submit_action result)",
        },
        proof_hash: {
          type: "string",
          description: "Proof hash (from the verified proof on ObelyskVerifier)",
        },
        original_io_len: {
          type: "number",
          description: "Number of M31 values in the original IO",
        },
        packed_raw_io: {
          type: "array",
          items: { type: "string" },
          description: "Packed IO data (array of felt252 hex strings, 8 M31 per felt)",
        },
      },
      required: ["action_id", "proof_hash", "original_io_len", "packed_raw_io"],
    },
  },
  {
    name: "obelyzk_approve_escalated",
    description:
      "Approve an escalated action (human-in-the-loop). Only the agent owner or contract owner can call this. Converts the action from escalated to approved.",
    inputSchema: {
      type: "object",
      properties: {
        action_id: {
          type: "number",
          description: "Action ID of the escalated action",
        },
      },
      required: ["action_id"],
    },
  },
  {
    name: "obelyzk_reject_escalated",
    description:
      "Reject an escalated action and add a strike to the agent. Only the agent owner or contract owner can call this.",
    inputSchema: {
      type: "object",
      properties: {
        action_id: {
          type: "number",
          description: "Action ID of the escalated action",
        },
      },
      required: ["action_id"],
    },
  },
];

// =============================================================================
// Tool Handlers
// =============================================================================

async function handleClassify(
  args: Record<string, unknown>
): Promise<string> {
  const sdk = createFirewallClient();

  const result = await sdk.classify({
    target: args.target as string,
    value: (args.value as string) || undefined,
    selector: (args.selector as string) || undefined,
    calldata: (args.calldata as string) || undefined,
    agentTrustScore: (args.agent_trust_score as number) || undefined,
    agentStrikes: (args.agent_strikes as number) || undefined,
    targetVerified: (args.target_verified as boolean) || undefined,
    targetInteractionCount:
      (args.target_interaction_count as number) || undefined,
  });

  return JSON.stringify({
    decision: result.decision,
    threat_score: result.threatScore,
    scores: {
      safe: result.scores[0],
      suspicious: result.scores[1],
      malicious: result.scores[2],
    },
    io_commitment: result.ioCommitment,
    policy_commitment: result.policyCommitment,
    prove_time_ms: result.proveTimeMs,
    model_status: "test_weights",
    note: "Classifier uses test weights. Scores are deterministic but not trained on real attack data.",
  });
}

async function handleAgentStatus(
  args: Record<string, unknown>
): Promise<string> {
  if (!FIREWALL_CONTRACT) {
    return JSON.stringify({
      error: "FIREWALL_CONTRACT not configured",
      hint: "Set the FIREWALL_CONTRACT environment variable to the AgentFirewallZK contract address",
    });
  }

  const sdk = createFirewallClient();
  const agentId = args.agent_id as string;
  const status = await sdk.getAgentStatus(agentId);

  return JSON.stringify({
    agent_id: agentId,
    registered: status.registered,
    active: status.active,
    trust_score: status.trustScore,
    strikes: status.strikes,
    trusted: status.trusted,
    trust_score_pct: `${(status.trustScore / 1000).toFixed(1)}%`,
  });
}

async function handleCheckAction(
  args: Record<string, unknown>
): Promise<string> {
  if (!FIREWALL_CONTRACT) {
    return JSON.stringify({
      error: "FIREWALL_CONTRACT not configured",
      hint: "Set the FIREWALL_CONTRACT environment variable to the AgentFirewallZK contract address",
    });
  }

  const sdk = createFirewallClient();
  const actionId = args.action_id as number;

  const [decision, approved, threatScore, ioCommitment] = await Promise.all([
    sdk.getActionDecision(actionId),
    sdk.isActionApproved(actionId),
    sdk.getActionThreatScore(actionId).catch(() => 0),
    sdk.getActionIoCommitment(actionId).catch(() => "0x0"),
  ]);

  return JSON.stringify({
    action_id: actionId,
    decision: DECISION_LABELS[decision] ?? `unknown(${decision})`,
    decision_code: decision,
    approved,
    threat_score: threatScore,
    io_commitment: ioCommitment,
  });
}

async function handleHealth(): Promise<string> {
  const health: Record<string, unknown> = {
    prover_url: PROVER_URL,
    firewall_contract: FIREWALL_CONTRACT || "(not configured)",
    verifier_contract: VERIFIER_CONTRACT || "(not configured)",
    starknet_rpc: STARKNET_RPC,
  };

  // Check prover server
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${PROVER_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      health.prover = "ok";
      health.prover_gpu = data.gpu ?? "unknown";
      health.prover_uptime_s = data.uptime_s ?? "unknown";
    } else {
      health.prover = `error (${res.status})`;
    }
  } catch (err) {
    health.prover =
      err instanceof Error && err.name === "AbortError"
        ? "timeout (5s)"
        : "unreachable";
  }

  // Check firewall contract reachability
  if (FIREWALL_CONTRACT) {
    try {
      const sdk = createFirewallClient();
      await sdk.isAgentTrusted("0x0");
      health.firewall = "ok";
    } catch {
      health.firewall = "unreachable";
    }
  } else {
    health.firewall = "not configured";
  }

  health.classifier_weights = "test";
  health.note =
    "Classifier uses test (random) weights. Deploy trained weights before enabling enforcement.";

  return JSON.stringify(health);
}

async function handleGetPolicy(
  args: Record<string, unknown>
): Promise<string> {
  // Policy presets are defined in Rust (policy.rs). We document them here.
  const presets: Record<string, Record<string, unknown>> = {
    strict: {
      preset: "strict",
      allow_missing_norm_proof: false,
      allow_logup_activation: false,
      allow_missing_segment_binding: false,
      skip_rms_sq_proof: false,
      piecewise_activation: true,
      skip_batch_tokens: false,
      skip_unified_stark: false,
      weight_binding_mode: "TrustlessMode3",
      aggregated_full_binding: true,
      validate_decode_chain: true,
      commitment: "0x0370c9348ed6edddf310baf5d8104d57c07f36962deea9738dd00519d9948449",
    },
    standard: {
      preset: "standard",
      allow_missing_norm_proof: true,
      allow_logup_activation: true,
      allow_missing_segment_binding: true,
      skip_rms_sq_proof: true,
      piecewise_activation: false,
      skip_batch_tokens: true,
      skip_unified_stark: true,
      weight_binding_mode: "Aggregated",
      aggregated_full_binding: true,
      validate_decode_chain: false,
      commitment: "computed_at_runtime",
    },
    relaxed: {
      preset: "relaxed",
      allow_missing_norm_proof: true,
      allow_logup_activation: true,
      allow_missing_segment_binding: true,
      skip_rms_sq_proof: true,
      piecewise_activation: false,
      skip_batch_tokens: true,
      skip_unified_stark: true,
      weight_binding_mode: "Individual",
      aggregated_full_binding: false,
      validate_decode_chain: false,
      commitment: "computed_at_runtime",
    },
  };

  const preset = (args.preset as string) || "standard";
  const policy = presets[preset];
  if (!policy) {
    return JSON.stringify({ error: `Unknown preset: ${preset}. Use strict, standard, or relaxed.` });
  }
  return JSON.stringify(policy);
}

async function handleListModels(): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (PROVER_API_KEY) headers["Authorization"] = `Bearer ${PROVER_API_KEY}`;

    const res = await fetch(`${PROVER_URL}/api/v1/models`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return JSON.stringify({ error: `Prover returned ${res.status}` });
    }
    const data = await res.json();
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Failed to list models",
      hint: `Check that the prover is running at ${PROVER_URL}`,
    });
  }
}

async function handleProveInference(
  args: Record<string, unknown>
): Promise<string> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (PROVER_API_KEY) headers["Authorization"] = `Bearer ${PROVER_API_KEY}`;

    const body = {
      model_id: args.model_id as string,
      input: args.input_data as number[],
      policy: (args.policy as string) || "standard",
    };

    const res = await fetch(`${PROVER_URL}/api/v1/prove`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      return JSON.stringify({ error: `Prove failed (${res.status}): ${(error as any).error || res.statusText}` });
    }

    const data = await res.json() as any;
    return JSON.stringify({
      job_id: data.job_id,
      status: data.status || "submitted",
      poll_url: `${PROVER_URL}/api/v1/prove/${data.job_id}`,
      note: "Poll the job_id endpoint for status updates. Proving may take seconds to minutes.",
    });
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Failed to submit proof job",
      hint: `Check that the prover is running at ${PROVER_URL}`,
    });
  }
}

async function handleVerifyProof(
  args: Record<string, unknown>
): Promise<string> {
  try {
    const headers: Record<string, string> = {};
    if (PROVER_API_KEY) headers["Authorization"] = `Bearer ${PROVER_API_KEY}`;

    const proofHash = args.proof_hash as string;
    const res = await fetch(`${PROVER_URL}/api/v1/verify/${proofHash}`, { headers });

    if (!res.ok) {
      if (res.status === 404) {
        return JSON.stringify({ proof_hash: proofHash, verified: false, error: "Proof not found" });
      }
      return JSON.stringify({ error: `Verify failed (${res.status})` });
    }

    const data = await res.json();
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Failed to verify proof",
    });
  }
}

// =============================================================================
// CIRO Intelligence Handlers
// =============================================================================

function requireCiro(): CiroClient {
  if (!CIRO_URL || !CIRO_API_KEY) {
    throw new Error(
      "CIRO integration requires CIRO_URL and CIRO_API_KEY environment variables"
    );
  }
  return new CiroClient({
    baseUrl: CIRO_URL,
    apiKey: CIRO_API_KEY,
  });
}

async function handleEnrichTarget(
  args: Record<string, unknown>
): Promise<string> {
  try {
    const ciro = requireCiro();
    const result = await ciro.enrichTransaction({
      target: args.target as string,
      sender: (args.sender as string) || undefined,
      value: (args.value as string) || "0",
      selector: (args.selector as string) || "0x0",
    });
    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Enrichment failed",
      hint: "Set CIRO_URL and CIRO_API_KEY, or check CIRO service availability",
    });
  }
}

async function handleAddressRisk(
  args: Record<string, unknown>
): Promise<string> {
  try {
    const ciro = requireCiro();
    const result = await ciro.getAddressRisk(args.address as string);
    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Risk assessment failed",
      hint: "Set CIRO_URL and CIRO_API_KEY",
    });
  }
}

async function handleAlerts(
  args: Record<string, unknown>
): Promise<string> {
  try {
    const ciro = requireCiro();
    const alerts = await ciro.getRecentAlerts({
      severity: (args.severity as string) || undefined,
      limit: (args.limit as number) || 20,
    });
    return JSON.stringify({ alerts, count: alerts.length });
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Alert fetch failed",
    });
  }
}

async function handleDataLakeStats(): Promise<string> {
  try {
    const ciro = requireCiro();
    const stats = await ciro.getStats();
    return JSON.stringify(stats);
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Stats fetch failed",
    });
  }
}

// =============================================================================
// Write Tool Handlers
// =============================================================================

async function handleRegisterAgent(
  args: Record<string, unknown>
): Promise<string> {
  if (!FIREWALL_CONTRACT) {
    return JSON.stringify({
      error: "FIREWALL_CONTRACT not configured",
      hint: "Set the FIREWALL_CONTRACT environment variable",
    });
  }

  try {
    const sdk = createWriteFirewallClient();
    const agentId = args.agent_id as string;
    const txHash = await sdk.registerAgent(agentId);
    return JSON.stringify({
      agent_id: agentId,
      tx_hash: txHash,
      status: "registered",
    });
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Registration failed",
      hint: "Ensure DEPLOYER_PRIVKEY and DEPLOYER_ADDRESS are set",
    });
  }
}

async function handleSubmitAction(
  args: Record<string, unknown>
): Promise<string> {
  if (!FIREWALL_CONTRACT) {
    return JSON.stringify({
      error: "FIREWALL_CONTRACT not configured",
    });
  }

  try {
    const sdk = createWriteFirewallClient();
    const result = await sdk.submitAction(
      args.agent_id as string,
      args.target as string,
      args.value as string,
      args.selector as number,
      args.io_commitment as string
    );
    return JSON.stringify({
      action_id: result.actionId,
      tx_hash: result.txHash,
      status: "pending",
      note: "Resolve within 1 hour with a verified proof, or the action expires.",
    });
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Submit action failed",
      hint: "Ensure the agent is registered and not frozen",
    });
  }
}

async function handleResolveAction(
  args: Record<string, unknown>
): Promise<string> {
  if (!FIREWALL_CONTRACT) {
    return JSON.stringify({
      error: "FIREWALL_CONTRACT not configured",
    });
  }

  try {
    const sdk = createWriteFirewallClient();
    const result = await sdk.resolveAction(
      args.action_id as number,
      args.proof_hash as string,
      args.original_io_len as number,
      args.packed_raw_io as string[]
    );
    return JSON.stringify({
      action_id: args.action_id,
      decision: result.decision,
      threat_score: result.threatScore,
      tx_hash: result.txHash,
    });
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Resolve action failed",
      hint: "Ensure the proof is verified on ObelyskVerifier and IO commitment matches",
    });
  }
}

async function handleApproveEscalated(
  args: Record<string, unknown>
): Promise<string> {
  if (!FIREWALL_CONTRACT) {
    return JSON.stringify({ error: "FIREWALL_CONTRACT not configured" });
  }

  try {
    const sdk = createWriteFirewallClient();
    const txHash = await sdk.approveEscalated(args.action_id as number);
    return JSON.stringify({
      action_id: args.action_id,
      decision: "approved",
      tx_hash: txHash,
    });
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Approve escalated failed",
    });
  }
}

async function handleRejectEscalated(
  args: Record<string, unknown>
): Promise<string> {
  if (!FIREWALL_CONTRACT) {
    return JSON.stringify({ error: "FIREWALL_CONTRACT not configured" });
  }

  try {
    const sdk = createWriteFirewallClient();
    const txHash = await sdk.rejectEscalated(args.action_id as number);
    return JSON.stringify({
      action_id: args.action_id,
      decision: "blocked",
      tx_hash: txHash,
      note: "Strike added to agent",
    });
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Reject escalated failed",
    });
  }
}

// =============================================================================
// Server Setup
// =============================================================================

function createPolicyServer(): Server {
  const server = new Server(
    {
      name: "obelyzk-policy",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const safeArgs = (args ?? {}) as Record<string, unknown>;

    try {
      let result: string;

      switch (name) {
        case "obelyzk_classify":
          result = await handleClassify(safeArgs);
          break;
        case "obelyzk_agent_status":
          result = await handleAgentStatus(safeArgs);
          break;
        case "obelyzk_check_action":
          result = await handleCheckAction(safeArgs);
          break;
        case "obelyzk_health":
          result = await handleHealth();
          break;
        case "obelyzk_get_policy":
          result = await handleGetPolicy(safeArgs);
          break;
        case "obelyzk_list_models":
          result = await handleListModels();
          break;
        case "obelyzk_prove_inference":
          result = await handleProveInference(safeArgs);
          break;
        case "obelyzk_verify_proof":
          result = await handleVerifyProof(safeArgs);
          break;
        case "obelyzk_enrich_target":
          result = await handleEnrichTarget(safeArgs);
          break;
        case "obelyzk_address_risk":
          result = await handleAddressRisk(safeArgs);
          break;
        case "obelyzk_alerts":
          result = await handleAlerts(safeArgs);
          break;
        case "obelyzk_data_lake_stats":
          result = await handleDataLakeStats();
          break;
        case "obelyzk_register_agent":
          result = await handleRegisterAgent(safeArgs);
          break;
        case "obelyzk_submit_action":
          result = await handleSubmitAction(safeArgs);
          break;
        case "obelyzk_resolve_action":
          result = await handleResolveAction(safeArgs);
          break;
        case "obelyzk_approve_escalated":
          result = await handleApproveEscalated(safeArgs);
          break;
        case "obelyzk_reject_escalated":
          result = await handleRejectEscalated(safeArgs);
          break;
        default:
          result = JSON.stringify({ error: `Unknown tool: ${name}` });
      }

      return {
        content: [{ type: "text", text: result }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  return server;
}

export async function startPolicyServer(): Promise<void> {
  const server = createPolicyServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ObelyZK Policy MCP server started on stdio");
}
