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
    name: "firewall_classify",
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
    name: "firewall_agent_status",
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
    name: "firewall_check_action",
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
    name: "firewall_health",
    description:
      "Check health of the ObelyZK policy infrastructure. Returns prover server status, firewall contract reachability, and classifier model status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  // ── Write Tools (require DEPLOYER_PRIVKEY + DEPLOYER_ADDRESS) ──────
  {
    name: "firewall_register_agent",
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
    name: "firewall_submit_action",
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
    name: "firewall_resolve_action",
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
    name: "firewall_approve_escalated",
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
    name: "firewall_reject_escalated",
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
        case "firewall_classify":
          result = await handleClassify(safeArgs);
          break;
        case "firewall_agent_status":
          result = await handleAgentStatus(safeArgs);
          break;
        case "firewall_check_action":
          result = await handleCheckAction(safeArgs);
          break;
        case "firewall_health":
          result = await handleHealth();
          break;
        case "firewall_register_agent":
          result = await handleRegisterAgent(safeArgs);
          break;
        case "firewall_submit_action":
          result = await handleSubmitAction(safeArgs);
          break;
        case "firewall_resolve_action":
          result = await handleResolveAction(safeArgs);
          break;
        case "firewall_approve_escalated":
          result = await handleApproveEscalated(safeArgs);
          break;
        case "firewall_reject_escalated":
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
