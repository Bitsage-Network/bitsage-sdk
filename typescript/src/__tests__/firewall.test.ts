/**
 * AgentFirewallSDK & MCP Policy Server Tests
 *
 * Unit tests for the firewall SDK (mock HTTP) and type validation.
 * Integration tests against a live prove-server (when PROVER_URL is set).
 *
 * Run with: npm test -- --run src/__tests__/firewall.test.ts
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import { AgentFirewallSDK } from "../firewall/client";
import type {
  FirewallConfig,
  TransactionFeatures,
  ClassifyResult,
  AgentStatus,
  Decision,
} from "../firewall/types";

// =============================================================================
// Unit Tests (no network)
// =============================================================================

describe("AgentFirewallSDK — Unit Tests", () => {
  const baseConfig: FirewallConfig = {
    proverUrl: "http://localhost:8080",
    firewallContract: "0x1234",
    verifierContract: "0x5678",
    rpcUrl: "https://starknet-sepolia.public.blastapi.io",
  };

  it("should construct without account (read-only)", () => {
    const sdk = new AgentFirewallSDK(baseConfig);
    expect(sdk).toBeDefined();
  });

  it("should throw on write operations without account", async () => {
    const sdk = new AgentFirewallSDK(baseConfig);
    await expect(sdk.registerAgent("test-agent")).rejects.toThrow(
      "Account required"
    );
  });

  it("should throw on submitAction without account", async () => {
    const sdk = new AgentFirewallSDK(baseConfig);
    await expect(
      sdk.submitAction("agent-1", "0xdead", "0", 0, "0x0")
    ).rejects.toThrow("Account required");
  });

  it("should throw on resolveAction without account", async () => {
    const sdk = new AgentFirewallSDK(baseConfig);
    await expect(
      sdk.resolveAction(1, "0xproof", 64, ["0x0"])
    ).rejects.toThrow("Account required");
  });

  it("should throw on approveEscalated without account", async () => {
    const sdk = new AgentFirewallSDK(baseConfig);
    await expect(sdk.approveEscalated(1)).rejects.toThrow(
      "Account required"
    );
  });

  it("should throw on rejectEscalated without account", async () => {
    const sdk = new AgentFirewallSDK(baseConfig);
    await expect(sdk.rejectEscalated(1)).rejects.toThrow(
      "Account required"
    );
  });
});

// =============================================================================
// Classify Tests (mock fetch)
// =============================================================================

describe("AgentFirewallSDK — Classify (Mock)", () => {
  const config: FirewallConfig = {
    proverUrl: "http://mock-prover:8080",
    firewallContract: "0x1",
    verifierContract: "0x2",
    rpcUrl: "https://starknet-sepolia.public.blastapi.io",
    apiKey: "test-key",
  };

  it("should classify a transaction and return correct shape", async () => {
    const mockResponse = {
      request_id: "uuid-123",
      decision: "approve",
      threat_score: 15000,
      scores: [70000, 15000, 15000],
      io_commitment: "0xabc",
      policy_commitment: "0xdef",
      prove_time_ms: 850,
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as any);

    try {
      const sdk = new AgentFirewallSDK(config);
      const result = await sdk.classify({
        target: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
        value: "1000000000000000000",
        selector: "0xa9059cbb",
      });

      expect(result.decision).toBe("approve");
      expect(result.threatScore).toBe(15000);
      expect(result.scores).toEqual([70000, 15000, 15000]);
      expect(result.ioCommitment).toBe("0xabc");
      expect(result.policyCommitment).toBe("0xdef");
      expect(result.proveTimeMs).toBe(850);
      expect(result.requestId).toBe("uuid-123");

      // Verify auth header was sent
      const fetchCall = (globalThis.fetch as any).mock.calls[0];
      expect(fetchCall[1].headers["Authorization"]).toBe("Bearer test-key");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should handle classify error response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ error: "Invalid target address" }),
    } as any);

    try {
      const sdk = new AgentFirewallSDK(config);
      await expect(
        sdk.classify({ target: "invalid" })
      ).rejects.toThrow("Classification failed (400)");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should handle network failure", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"));

    try {
      const sdk = new AgentFirewallSDK(config);
      await expect(
        sdk.classify({ target: "0x1" })
      ).rejects.toThrow("ECONNREFUSED");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should send all transaction features correctly", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: any;
    globalThis.fetch = vi.fn().mockImplementation(async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          request_id: "x",
          decision: "block",
          threat_score: 85000,
          scores: [5000, 10000, 85000],
          io_commitment: "0x1",
          policy_commitment: "0x2",
          prove_time_ms: 100,
        }),
      };
    });

    try {
      const sdk = new AgentFirewallSDK(config);
      const tx: TransactionFeatures = {
        target: "0xdead",
        value: "999",
        selector: "0xa9059cbb",
        calldata: "0xbeef",
        agentTrustScore: 50000,
        agentStrikes: 3,
        agentAgeBlocks: 1000,
        targetVerified: true,
        targetIsProxy: false,
        targetHasSource: true,
        targetInteractionCount: 42,
        txFrequency: 10,
        uniqueTargets24h: 5,
        avgValue24h: 500,
        maxValue24h: 2000,
      };

      const result = await sdk.classify(tx);
      expect(result.decision).toBe("block");
      expect(result.threatScore).toBe(85000);

      // Verify all fields were sent with snake_case keys
      expect(capturedBody.target).toBe("0xdead");
      expect(capturedBody.value).toBe("999");
      expect(capturedBody.selector).toBe("0xa9059cbb");
      expect(capturedBody.calldata).toBe("0xbeef");
      expect(capturedBody.agent_trust_score).toBe(50000);
      expect(capturedBody.agent_strikes).toBe(3);
      expect(capturedBody.agent_age_blocks).toBe(1000);
      expect(capturedBody.target_verified).toBe(true);
      expect(capturedBody.target_is_proxy).toBe(false);
      expect(capturedBody.target_has_source).toBe(true);
      expect(capturedBody.target_interaction_count).toBe(42);
      expect(capturedBody.tx_frequency).toBe(10);
      expect(capturedBody.unique_targets_24h).toBe(5);
      expect(capturedBody.avg_value_24h).toBe(500);
      expect(capturedBody.max_value_24h).toBe(2000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// =============================================================================
// Type Tests
// =============================================================================

describe("Type Validation", () => {
  it("Decision type should accept valid values", () => {
    const decisions: Decision[] = ["approve", "escalate", "block"];
    expect(decisions).toHaveLength(3);
  });

  it("ClassifyResult should have all required fields", () => {
    const result: ClassifyResult = {
      requestId: "uuid",
      decision: "approve",
      threatScore: 0,
      scores: [100000, 0, 0],
      ioCommitment: "0x0",
      policyCommitment: "0x0",
      proveTimeMs: 0,
    };
    expect(result.decision).toBe("approve");
    expect(result.scores).toHaveLength(3);
  });

  it("AgentStatus should have all required fields", () => {
    const status: AgentStatus = {
      registered: true,
      active: true,
      trustScore: 0,
      strikes: 0,
      trusted: true,
    };
    expect(status.trusted).toBe(true);
  });
});

// =============================================================================
// PolicyEnforcer Tests
// =============================================================================

import { PolicyEnforcer, createPolicyEnforcer } from "../firewall/middleware";

describe("PolicyEnforcer — Unit Tests", () => {
  it("should create via factory function", () => {
    const enforcer = createPolicyEnforcer({ proverUrl: "http://localhost:8080" });
    expect(enforcer).toBeInstanceOf(PolicyEnforcer);
  });

  it("should extract target from starkli invoke command", () => {
    const enforcer = createPolicyEnforcer({ proverUrl: "http://x" });
    const target = enforcer.extractTarget(
      "starkli invoke 0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7 transfer"
    );
    expect(target).toBe("0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7");
  });

  it("should extract target from sncast invoke command", () => {
    const enforcer = createPolicyEnforcer({ proverUrl: "http://x" });
    const target = enforcer.extractTarget("sncast invoke --contract 0xABCDEF1234567890");
    expect(target).toBe("0xABCDEF1234567890");
  });

  it("should return null for non-transaction commands", () => {
    const enforcer = createPolicyEnforcer({ proverUrl: "http://x" });
    expect(enforcer.extractTarget("ls -la")).toBeNull();
    expect(enforcer.extractTarget("git status")).toBeNull();
    expect(enforcer.extractTarget("npm install")).toBeNull();
  });

  it("should return MCP server config", () => {
    const enforcer = createPolicyEnforcer({
      proverUrl: "http://prover:8080",
      rpcUrl: "https://rpc.example.com",
      firewallContract: "0xFW",
      verifierContract: "0xVF",
      apiKey: "key123",
    });
    const config = enforcer.getMcpServerConfig();
    const server = config["obelyzk-policy"] as Record<string, unknown>;
    expect(server.command).toBe("npx");
    const env = server.env as Record<string, string>;
    expect(env.PROVER_URL).toBe("http://prover:8080");
    expect(env.STARKNET_RPC).toBe("https://rpc.example.com");
    expect(env.FIREWALL_CONTRACT).toBe("0xFW");
    expect(env.PROVER_API_KEY).toBe("key123");
  });

  it("should return allowed tools list", () => {
    const enforcer = createPolicyEnforcer({ proverUrl: "http://x" });
    const tools = enforcer.getAllowedTools();
    expect(tools).toContain("Read");
    expect(tools).toContain("Bash");
    expect(tools).toContain("mcp__obelyzk-policy__obelyzk_classify");
    expect(tools).toContain("mcp__obelyzk-policy__obelyzk_submit_action");
    expect(tools.length).toBeGreaterThan(10);
  });

  it("should build canUseTool that allows policy tools", async () => {
    const enforcer = createPolicyEnforcer({ proverUrl: "http://x" });
    const canUseTool = enforcer.buildCanUseTool();

    const result = await canUseTool(
      "mcp__obelyzk-policy__obelyzk_classify",
      { target: "0x1" }
    );
    expect(result.approved).toBe(true);
  });

  it("should build canUseTool that blocks unknown tools", async () => {
    const enforcer = createPolicyEnforcer({ proverUrl: "http://x" });
    const canUseTool = enforcer.buildCanUseTool();

    const result = await canUseTool("SomeDangerousTool", {});
    expect(result.approved).toBe(false);
    expect(result.reason).toContain("not in allowlist");
  });

  it("should check action and return structured decision", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        request_id: "x",
        decision: "block",
        threat_score: 85000,
        scores: [5000, 10000, 85000],
        io_commitment: "0xabc",
        policy_commitment: "0xdef",
        prove_time_ms: 500,
      }),
    } as any);

    try {
      const enforcer = createPolicyEnforcer({ proverUrl: "http://mock:8080" });
      const check = await enforcer.checkAction({ target: "0xdead" });

      expect(check.allowed).toBe(false);
      expect(check.decision).toBe("block");
      expect(check.threatScore).toBe(85000);
      expect(check.reason).toContain("Blocked");
      expect(check.ioCommitment).toBe("0xabc");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should approve safe actions", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        request_id: "x",
        decision: "approve",
        threat_score: 5000,
        scores: [90000, 5000, 5000],
        io_commitment: "0x1",
        policy_commitment: "0x2",
        prove_time_ms: 200,
      }),
    } as any);

    try {
      const enforcer = createPolicyEnforcer({ proverUrl: "http://mock:8080" });
      const check = await enforcer.checkAction({ target: "0x1234" });

      expect(check.allowed).toBe(true);
      expect(check.decision).toBe("approve");
      expect(check.reason).toContain("Approved");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should expose underlying SDK", () => {
    const enforcer = createPolicyEnforcer({ proverUrl: "http://x" });
    const sdk = enforcer.getSDK();
    expect(sdk).toBeInstanceOf(AgentFirewallSDK);
  });
});

// =============================================================================
// Integration Tests (against live prove-server)
// =============================================================================

const PROVER_URL = process.env.PROVER_URL;
const SKIP_INTEGRATION = !PROVER_URL;

describe.skipIf(SKIP_INTEGRATION)(
  "AgentFirewallSDK — Integration (Live Prover)",
  () => {
    let sdk: AgentFirewallSDK;

    beforeAll(() => {
      sdk = new AgentFirewallSDK({
        proverUrl: PROVER_URL!,
        firewallContract: "",
        verifierContract: "",
        rpcUrl: "https://starknet-sepolia.public.blastapi.io",
      });
    });

    it("should classify a simple ETH transfer", async () => {
      const result = await sdk.classify({
        target:
          "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
        value: "1000000000000000000",
        selector: "0xa9059cbb",
      });

      expect(["approve", "escalate", "block"]).toContain(result.decision);
      expect(result.threatScore).toBeGreaterThanOrEqual(0);
      expect(result.threatScore).toBeLessThanOrEqual(100000);
      expect(result.scores).toHaveLength(3);
      expect(result.ioCommitment).toMatch(/^0x/);
      expect(result.policyCommitment).toMatch(/^0x/);
      expect(result.proveTimeMs).toBeGreaterThan(0);
    }, 30000);

    it("should produce deterministic results for same input", async () => {
      const tx: TransactionFeatures = {
        target: "0x1234567890abcdef1234567890abcdef12345678",
        value: "0",
        selector: "0x0",
      };

      const [r1, r2] = await Promise.all([
        sdk.classify(tx),
        sdk.classify(tx),
      ]);

      expect(r1.ioCommitment).toBe(r2.ioCommitment);
      expect(r1.threatScore).toBe(r2.threatScore);
      expect(r1.decision).toBe(r2.decision);
    }, 30000);

    it("should produce different results for different targets", async () => {
      const [r1, r2] = await Promise.all([
        sdk.classify({ target: "0x1111" }),
        sdk.classify({ target: "0x2222" }),
      ]);

      // IO commitments must differ (different inputs → different Poseidon hash)
      expect(r1.ioCommitment).not.toBe(r2.ioCommitment);
    }, 30000);
  }
);
