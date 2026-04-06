"""
ZKML Agent Firewall — verifiable AI guardrails for agent transactions.

A small MLP classifier scores transaction threat level, proven with GKR+STARK.
The proof verifies on-chain via the AgentFirewallZK contract on Starknet.

Usage:
    from bitsage.firewall import FirewallClient

    client = FirewallClient()
    result = client.classify(target="0x1234...", value="1000000", selector="0xa9059cbb")
    print(result.decision)       # "approve" | "escalate" | "block"
    print(result.threat_score)   # 0-100000
"""

from dataclasses import dataclass
from typing import Optional
import json

try:
    import httpx
except ImportError:
    import urllib.request
    httpx = None


@dataclass
class ClassifyResult:
    """Result from classifying a transaction."""
    request_id: str
    decision: str  # "approve" | "escalate" | "block"
    threat_score: int  # 0-100000
    scores: tuple  # (safe, suspicious, malicious)
    io_commitment: str
    policy_commitment: str
    prove_time_ms: int


@dataclass
class AgentStatus:
    """Agent trust status from on-chain state."""
    registered: bool
    active: bool
    trust_score: int
    strikes: int
    trusted: bool


class FirewallClient:
    """Client for the ZKML transaction classifier and AgentFirewallZK contract.

    Args:
        prover_url: Prove-server URL (default: https://prover.bitsage.network)
        api_key: Optional API key for the prover
    """

    def __init__(
        self,
        prover_url: str = "https://prover.bitsage.network",
        api_key: Optional[str] = None,
    ):
        self.prover_url = prover_url.rstrip("/")
        self.api_key = api_key

    def classify(
        self,
        target: str,
        value: str = "0",
        selector: str = "0x0",
        calldata: str = "0x",
        agent_trust_score: int = 0,
        agent_strikes: int = 0,
        agent_age_blocks: int = 0,
        target_verified: bool = False,
        target_is_proxy: bool = False,
        target_has_source: bool = False,
        target_interaction_count: int = 0,
        tx_frequency: int = 0,
        unique_targets_24h: int = 0,
        avg_value_24h: int = 0,
        max_value_24h: int = 0,
    ) -> ClassifyResult:
        """Classify a transaction through the ZKML classifier.

        Sends transaction features to the prove-server, which runs the MLP
        classifier and generates a GKR+STARK proof. Returns the proven
        threat score and decision.

        Args:
            target: Target contract address (hex, 0x-prefixed)
            value: Transaction value (decimal string)
            selector: Function selector (hex, 4 bytes)
            calldata: Calldata after selector (hex)
            agent_trust_score: Agent's current trust score (0-100000)
            agent_strikes: Agent's current strike count
            agent_age_blocks: Agent age in blocks since registration

        Returns:
            ClassifyResult with decision, threat_score, scores, commitments
        """
        body = {
            "target": target,
            "value": value,
            "selector": selector,
            "calldata": calldata,
            "agent_trust_score": agent_trust_score,
            "agent_strikes": agent_strikes,
            "agent_age_blocks": agent_age_blocks,
            "target_verified": target_verified,
            "target_is_proxy": target_is_proxy,
            "target_has_source": target_has_source,
            "target_interaction_count": target_interaction_count,
            "tx_frequency": tx_frequency,
            "unique_targets_24h": unique_targets_24h,
            "avg_value_24h": avg_value_24h,
            "max_value_24h": max_value_24h,
        }

        data = self._post("/api/v1/classify", body)

        return ClassifyResult(
            request_id=data.get("request_id", ""),
            decision=data["decision"],
            threat_score=data["threat_score"],
            scores=tuple(data["scores"]),
            io_commitment=data["io_commitment"],
            policy_commitment=data["policy_commitment"],
            prove_time_ms=data["prove_time_ms"],
        )

    def _post(self, path: str, body: dict) -> dict:
        url = f"{self.prover_url}{path}"
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        payload = json.dumps(body).encode()

        if httpx:
            resp = httpx.post(url, json=body, headers=headers, timeout=120)
            resp.raise_for_status()
            return resp.json()
        else:
            req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode())
