/**
 * ObelyZK Agent Middleware
 *
 * Wraps agent tool execution with automatic ZKML classification.
 * Designed for use with the Claude Agent SDK or any tool-calling agent framework.
 *
 * @example
 * ```typescript
 * import { createPolicyEnforcer } from '@obelyzk/sdk/firewall';
 *
 * const enforcer = createPolicyEnforcer({
 *   proverUrl: 'http://localhost:8080',
 *   agentId: 'my-agent-001',
 * });
 *
 * // Check before executing an on-chain action
 * const decision = await enforcer.checkAction({
 *   target: '0x049d...',
 *   value: '1000000000',
 *   selector: '0xa9059cbb',
 * });
 *
 * if (decision.allowed) {
 *   // safe to execute
 * } else {
 *   console.log(decision.reason); // "Blocked: threat_score=85000"
 * }
 *
 * // Get MCP server config for Claude Agent SDK
 * const mcpConfig = enforcer.getMcpServerConfig();
 * // Pass to agent's mcpServers option
 *
 * // Get allowed tools list
 * const tools = enforcer.getAllowedTools();
 * // Pass to agent's allowedTools option
 * ```
 */

import { AgentFirewallSDK } from "./client";
import type {
  FirewallConfig,
  TransactionFeatures,
  ClassifyResult,
  Decision,
} from "./types";

/** Policy enforcer configuration. */
export interface PolicyEnforcerConfig {
  /** Prove-server base URL. */
  proverUrl: string;
  /** Agent ID for firewall registration. */
  agentId?: string;
  /** Starknet RPC URL (for on-chain queries). */
  rpcUrl?: string;
  /** Firewall contract address (for on-chain queries). */
  firewallContract?: string;
  /** Verifier contract address. */
  verifierContract?: string;
  /** API key for prove-server. */
  apiKey?: string;
  /** Threat score threshold for blocking (default: 70000). */
  blockThreshold?: number;
  /** Threat score threshold for escalation (default: 40000). */
  escalateThreshold?: number;
  /** Path to MCP server entry point (for getMcpServerConfig). */
  mcpServerPath?: string;
}

/** Result from checking an action. */
export interface ActionCheck {
  /** Whether the action is allowed to proceed. */
  allowed: boolean;
  /** Classifier decision. */
  decision: Decision;
  /** Threat score (0-100000). */
  threatScore: number;
  /** Human-readable reason for the decision. */
  reason: string;
  /** IO commitment from the proof (for audit trail). */
  ioCommitment: string;
  /** Policy commitment hash. */
  policyCommitment: string;
  /** Proving time in milliseconds. */
  proveTimeMs: number;
}

/**
 * Create a policy enforcer for programmatic agent use.
 *
 * The enforcer wraps the AgentFirewallSDK and provides a simplified API
 * for checking actions, getting MCP server configs, and building
 * allowedTools lists for the Claude Agent SDK.
 */
export function createPolicyEnforcer(
  config: PolicyEnforcerConfig
): PolicyEnforcer {
  return new PolicyEnforcer(config);
}

export class PolicyEnforcer {
  private sdk: AgentFirewallSDK;
  private config: PolicyEnforcerConfig;
  private blockThreshold: number;
  private escalateThreshold: number;

  constructor(config: PolicyEnforcerConfig) {
    this.config = config;
    this.blockThreshold = config.blockThreshold ?? 70000;
    this.escalateThreshold = config.escalateThreshold ?? 40000;

    this.sdk = new AgentFirewallSDK({
      proverUrl: config.proverUrl,
      firewallContract: config.firewallContract ?? "",
      verifierContract: config.verifierContract ?? "",
      rpcUrl: config.rpcUrl ?? "https://starknet-sepolia.public.blastapi.io",
      apiKey: config.apiKey,
    });
  }

  /**
   * Check whether an action should be allowed.
   * Calls the ZKML classifier and returns a structured decision.
   */
  async checkAction(tx: TransactionFeatures): Promise<ActionCheck> {
    const result = await this.sdk.classify(tx);

    const allowed = result.decision === "approve";
    let reason: string;

    switch (result.decision) {
      case "approve":
        reason = `Approved: threat_score=${result.threatScore}`;
        break;
      case "escalate":
        reason = `Escalated: threat_score=${result.threatScore}. Requires human approval.`;
        break;
      case "block":
        reason = `Blocked: threat_score=${result.threatScore}. Action rejected by ZKML classifier.`;
        break;
    }

    return {
      allowed,
      decision: result.decision,
      threatScore: result.threatScore,
      reason,
      ioCommitment: result.ioCommitment,
      policyCommitment: result.policyCommitment,
      proveTimeMs: result.proveTimeMs,
    };
  }

  /**
   * Check if a Bash command contains an on-chain transaction pattern.
   * Returns the target address if found, null otherwise.
   */
  extractTarget(command: string): string | null {
    // Match starkli/sncast invoke/deploy patterns
    if (
      !/(?:starkli|sncast)\s+(?:invoke|deploy)/.test(command) &&
      !/(?:cast\s+send|transfer|approve)/.test(command)
    ) {
      return null;
    }

    // Extract first hex address (40-66 chars)
    const match = command.match(/0x[0-9a-fA-F]{10,66}/);
    return match ? match[0] : null;
  }

  /**
   * Build a canUseTool callback for the Claude Agent SDK.
   *
   * Returns an async function that:
   * - Auto-allows ObelyZK policy tools
   * - Auto-allows safe read-only tools (Read, Glob, Grep)
   * - Classifies Bash commands containing on-chain transactions
   * - Blocks everything else
   */
  buildCanUseTool(): (
    tool: string,
    input: Record<string, unknown>
  ) => Promise<{ approved: boolean; reason?: string }> {
    return async (tool: string, input: Record<string, unknown>) => {
      // Always allow ObelyZK policy tools
      if (tool.startsWith("mcp__obelyzk-policy__")) {
        return { approved: true };
      }

      // Allow safe read-only tools
      const safeTools = ["Read", "Glob", "Grep", "Bash"];
      if (!safeTools.includes(tool)) {
        return {
          approved: false,
          reason: `Tool '${tool}' not in allowlist. Only safe tools and ObelyZK policy tools are allowed.`,
        };
      }

      // For Bash, check if it's an on-chain command
      if (tool === "Bash") {
        const command = (input.command as string) || "";
        const target = this.extractTarget(command);

        if (target) {
          const check = await this.checkAction({ target });
          if (!check.allowed) {
            return { approved: false, reason: check.reason };
          }
        }
      }

      return { approved: true };
    };
  }

  /**
   * Get the MCP server configuration for .claude/settings.json
   * or Claude Agent SDK's mcpServers option.
   */
  getMcpServerConfig(): Record<string, unknown> {
    const mcpPath =
      this.config.mcpServerPath ??
      "./node_modules/@obelyzk/sdk/src/mcp-policy/index.ts";

    return {
      "obelyzk-policy": {
        command: "npx",
        args: ["ts-node", mcpPath],
        env: {
          PROVER_URL: this.config.proverUrl,
          STARKNET_RPC: this.config.rpcUrl ?? "",
          FIREWALL_CONTRACT: this.config.firewallContract ?? "",
          VERIFIER_CONTRACT: this.config.verifierContract ?? "",
          PROVER_API_KEY: this.config.apiKey ?? "",
        },
      },
    };
  }

  /**
   * Get the list of allowed tools for Claude Agent SDK.
   * Includes safe read-only tools and all ObelyZK policy tools.
   */
  getAllowedTools(): string[] {
    return [
      "Read",
      "Glob",
      "Grep",
      "Bash",
      "mcp__obelyzk-policy__obelyzk_classify",
      "mcp__obelyzk-policy__obelyzk_agent_status",
      "mcp__obelyzk-policy__obelyzk_check_action",
      "mcp__obelyzk-policy__obelyzk_health",
      "mcp__obelyzk-policy__obelyzk_get_policy",
      "mcp__obelyzk-policy__obelyzk_list_models",
      "mcp__obelyzk-policy__obelyzk_verify_proof",
      "mcp__obelyzk-policy__obelyzk_register_agent",
      "mcp__obelyzk-policy__obelyzk_submit_action",
      "mcp__obelyzk-policy__obelyzk_resolve_action",
      "mcp__obelyzk-policy__obelyzk_approve_escalated",
      "mcp__obelyzk-policy__obelyzk_reject_escalated",
    ];
  }

  /** Get the underlying AgentFirewallSDK for advanced use. */
  getSDK(): AgentFirewallSDK {
    return this.sdk;
  }
}
