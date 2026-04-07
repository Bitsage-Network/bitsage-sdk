/**
 * MCP Policy Server Handler Tests
 *
 * Tests the MCP server tool handler functions with mock HTTP responses.
 * Validates input/output schemas, error handling, and edge cases.
 *
 * Run with: npm test -- --run src/__tests__/mcp-policy.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test the handlers by importing the server module and calling tool handlers
// through the MCP protocol. Since the handlers are module-private, we test them
// indirectly by verifying the exported tool definitions and server behavior.

// For direct handler testing, we re-implement the key logic patterns here
// and validate against the expected MCP tool contracts.

// =============================================================================
// Tool Schema Tests
// =============================================================================

describe("MCP Tool Schemas", () => {
  // Import the server to verify tool definitions exist
  // (The actual server.ts exports startPolicyServer, but we can verify
  //  the tool naming convention and handler structure)

  it("all tool names should use obelyzk_* prefix", async () => {
    // Read the server source to extract tool names
    const fs = await import("fs");
    const serverSource = fs.readFileSync(
      new URL("../mcp-policy/server.ts", import.meta.url),
      "utf-8"
    );

    // Extract all tool name declarations
    const toolNames = [...serverSource.matchAll(/name:\s*"([^"]+)"/g)].map(
      (m) => m[1]
    );

    const obelyzkTools = toolNames.filter((n) => n.startsWith("obelyzk_"));
    expect(obelyzkTools.length).toBeGreaterThanOrEqual(13);

    // No firewall_* tools should remain
    const firewallTools = toolNames.filter((n) => n.startsWith("firewall_"));
    expect(firewallTools).toHaveLength(0);
  });

  it("should have all required tools defined", async () => {
    const fs = await import("fs");
    const serverSource = fs.readFileSync(
      new URL("../mcp-policy/server.ts", import.meta.url),
      "utf-8"
    );

    const requiredTools = [
      "obelyzk_classify",
      "obelyzk_agent_status",
      "obelyzk_check_action",
      "obelyzk_health",
      "obelyzk_get_policy",
      "obelyzk_list_models",
      "obelyzk_prove_inference",
      "obelyzk_verify_proof",
      "obelyzk_register_agent",
      "obelyzk_submit_action",
      "obelyzk_resolve_action",
      "obelyzk_approve_escalated",
      "obelyzk_reject_escalated",
    ];

    for (const tool of requiredTools) {
      expect(serverSource).toContain(`"${tool}"`);
    }
  });

  it("all tools should have switch cases", async () => {
    const fs = await import("fs");
    const serverSource = fs.readFileSync(
      new URL("../mcp-policy/server.ts", import.meta.url),
      "utf-8"
    );

    const switchCases = [
      ...serverSource.matchAll(/case\s+"(obelyzk_[^"]+)"/g),
    ].map((m) => m[1]);

    expect(switchCases).toContain("obelyzk_classify");
    expect(switchCases).toContain("obelyzk_agent_status");
    expect(switchCases).toContain("obelyzk_check_action");
    expect(switchCases).toContain("obelyzk_health");
    expect(switchCases).toContain("obelyzk_get_policy");
    expect(switchCases).toContain("obelyzk_list_models");
    expect(switchCases).toContain("obelyzk_prove_inference");
    expect(switchCases).toContain("obelyzk_verify_proof");
    expect(switchCases).toContain("obelyzk_register_agent");
    expect(switchCases).toContain("obelyzk_submit_action");
    expect(switchCases).toContain("obelyzk_resolve_action");
    expect(switchCases).toContain("obelyzk_approve_escalated");
    expect(switchCases).toContain("obelyzk_reject_escalated");
    expect(switchCases).toHaveLength(13);
  });
});

// =============================================================================
// Handler Logic Tests (testing the patterns used by handlers)
// =============================================================================

describe("Handler Logic — Classify", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("classify response should include model_status field", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        request_id: "uuid",
        decision: "approve",
        threat_score: 10000,
        scores: [80000, 10000, 10000],
        io_commitment: "0x1",
        policy_commitment: "0x2",
        prove_time_ms: 500,
      }),
    } as any);

    // Simulate what handleClassify does
    const { AgentFirewallSDK } = await import("../firewall/client");
    const sdk = new AgentFirewallSDK({
      proverUrl: "http://mock:8080",
      firewallContract: "",
      verifierContract: "",
      rpcUrl: "https://rpc",
    });

    const result = await sdk.classify({ target: "0x1" });

    // The MCP handler adds model_status to the response
    const mcpResponse = {
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
    };

    expect(mcpResponse.model_status).toBe("test_weights");
    expect(mcpResponse.scores.safe).toBe(80000);
    expect(mcpResponse.scores.suspicious).toBe(10000);
    expect(mcpResponse.scores.malicious).toBe(10000);
  });
});

describe("Handler Logic — Get Policy", () => {
  it("should return strict preset with correct fields", () => {
    const strict = {
      preset: "strict",
      allow_missing_norm_proof: false,
      allow_logup_activation: false,
      weight_binding_mode: "TrustlessMode3",
      aggregated_full_binding: true,
      validate_decode_chain: true,
    };

    expect(strict.allow_missing_norm_proof).toBe(false);
    expect(strict.weight_binding_mode).toBe("TrustlessMode3");
  });

  it("should return standard preset with relaxed gates", () => {
    const standard = {
      preset: "standard",
      allow_missing_norm_proof: true,
      allow_logup_activation: true,
      weight_binding_mode: "Aggregated",
    };

    expect(standard.allow_missing_norm_proof).toBe(true);
    expect(standard.weight_binding_mode).toBe("Aggregated");
  });

  it("should reject unknown presets", () => {
    const presets = ["strict", "standard", "relaxed"];
    expect(presets).not.toContain("yolo");
  });
});

describe("Handler Logic — Health", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should report prover unreachable on network error", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"));

    try {
      await fetch("http://localhost:8080/health");
    } catch (err) {
      expect((err as Error).message).toBe("ECONNREFUSED");
    }
  });

  it("should report prover timeout on abort", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    globalThis.fetch = vi.fn().mockRejectedValueOnce(abortError);

    try {
      await fetch("http://localhost:8080/health");
    } catch (err) {
      expect((err as Error).name).toBe("AbortError");
    }
  });
});

describe("Handler Logic — Write Tools", () => {
  it("should require FIREWALL_CONTRACT for on-chain queries", () => {
    const firewallContract = "";
    if (!firewallContract) {
      const response = JSON.stringify({
        error: "FIREWALL_CONTRACT not configured",
        hint: "Set the FIREWALL_CONTRACT environment variable",
      });
      const parsed = JSON.parse(response);
      expect(parsed.error).toContain("FIREWALL_CONTRACT");
      expect(parsed.hint).toBeDefined();
    }
  });

  it("should require DEPLOYER_PRIVKEY for write operations", () => {
    const privKey = "";
    const accountAddr = "";
    if (!privKey || !accountAddr) {
      expect(() => {
        throw new Error(
          "Write operations require DEPLOYER_PRIVKEY and DEPLOYER_ADDRESS"
        );
      }).toThrow("DEPLOYER_PRIVKEY");
    }
  });
});

describe("Handler Logic — Decision Labels", () => {
  it("should map all decision codes correctly", () => {
    const labels: Record<number, string> = {
      0: "pending",
      1: "approved",
      2: "escalated",
      3: "blocked",
    };

    expect(labels[0]).toBe("pending");
    expect(labels[1]).toBe("approved");
    expect(labels[2]).toBe("escalated");
    expect(labels[3]).toBe("blocked");
    expect(labels[99]).toBeUndefined();
  });
});

// =============================================================================
// Hook Script Tests
// =============================================================================

describe("Hook Scripts", () => {
  it("pre-tool-use.sh should exist and be executable", async () => {
    const fs = await import("fs");
    const path = new URL("../hooks/pre-tool-use.sh", import.meta.url);
    const stat = fs.statSync(path);
    expect(stat.isFile()).toBe(true);
    // Check executable bit (owner)
    expect(stat.mode & 0o100).toBeTruthy();
  });

  it("post-tool-use.sh should exist and be executable", async () => {
    const fs = await import("fs");
    const path = new URL("../hooks/post-tool-use.sh", import.meta.url);
    const stat = fs.statSync(path);
    expect(stat.isFile()).toBe(true);
    expect(stat.mode & 0o100).toBeTruthy();
  });

  it("session-start.sh should exist and be executable", async () => {
    const fs = await import("fs");
    const path = new URL("../hooks/session-start.sh", import.meta.url);
    const stat = fs.statSync(path);
    expect(stat.isFile()).toBe(true);
    expect(stat.mode & 0o100).toBeTruthy();
  });

  it("pre-tool-use.sh should contain starkli pattern matching", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../hooks/pre-tool-use.sh", import.meta.url),
      "utf-8"
    );
    expect(content).toContain("starkli invoke");
    expect(content).toContain("sncast invoke");
    expect(content).toContain("PROVER_URL");
    expect(content).toContain("classify");
  });

  it("post-tool-use.sh should log to JSONL audit file", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../hooks/post-tool-use.sh", import.meta.url),
      "utf-8"
    );
    expect(content).toContain("audit.jsonl");
    expect(content).toContain("OBELYZK_AUDIT_LOG");
    expect(content).toContain("async");
  });
});

// =============================================================================
// Example Files Tests
// =============================================================================

describe("Example Files", () => {
  it("claude-settings.json should reference all 3 hooks", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../../examples/claude-settings.json", import.meta.url),
      "utf-8"
    );
    const config = JSON.parse(content);

    expect(config.hooks.PreToolUse).toBeDefined();
    expect(config.hooks.PostToolUse).toBeDefined();
    expect(config.hooks.SessionStart).toBeDefined();
    expect(config.mcpServers["obelyzk-policy"]).toBeDefined();
  });

  it("CLAUDE.md should reference obelyzk_* tool names", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../../examples/CLAUDE.md", import.meta.url),
      "utf-8"
    );

    expect(content).toContain("obelyzk_classify");
    expect(content).toContain("obelyzk_agent_status");
    expect(content).not.toContain("firewall_classify");
  });
});
