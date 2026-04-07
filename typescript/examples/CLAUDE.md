## Agent Safety Policy

This project uses ObelyZK cryptographic policy enforcement. All on-chain actions
are classified by a ZKML model before execution. The classifier generates a
GKR+STARK proof binding the threat score to the specific transaction features
and policy configuration.

### Tools Available

- `obelyzk_classify` — Classify a transaction before executing it. Returns a
  proven threat score (0-100000) and decision (approve/escalate/block).
- `obelyzk_agent_status` — Check your agent's trust score, strike count, and
  whether you are trusted by the firewall contract.
- `obelyzk_check_action` — Query the status of a previously submitted action.
- `obelyzk_health` — Check prover server and firewall contract availability.
- `obelyzk_get_policy` — Inspect the active policy configuration and commitment hash.
- `obelyzk_list_models` — List available models on the prover server.
- `obelyzk_prove_inference` — Submit an async proof generation job for any model.
- `obelyzk_verify_proof` — Check if a proof has been verified on-chain.
- `obelyzk_register_agent` — Register a new agent on the firewall contract.
- `obelyzk_submit_action` — Submit a pending action for on-chain classification.
- `obelyzk_resolve_action` — Resolve a pending action with a verified ZKML proof.
- `obelyzk_approve_escalated` — Approve an escalated action (human-in-the-loop).
- `obelyzk_reject_escalated` — Reject an escalated action and add a strike.

### Required Workflow

Before ANY on-chain transaction (`starkli invoke`, `sncast invoke`, contract
deployments, token transfers, approvals):

1. Call `obelyzk_classify` with the target address, value, and selector.
2. If decision is `block` — do NOT execute. Explain the threat score to the user.
3. If decision is `escalate` — ask the user for explicit approval before proceeding.
4. If decision is `approve` — safe to execute.
5. Include the `io_commitment` from the classify result in any commit messages
   or logs for audit trail purposes.

### Decision Thresholds

| Score Range | Decision | Action |
|-------------|----------|--------|
| 0 - 40,000 | approve | Execute immediately |
| 40,001 - 70,000 | escalate | Requires human review |
| 70,001 - 100,000 | block | Reject, do not execute |

### Trust Score

Your agent's trust score is updated via asymmetric EMA after each resolved action:
- Bad actions raise the score quickly (alpha = 0.5)
- Good actions lower the score slowly (alpha = 0.1)
- At 5 strikes, the agent is automatically frozen

Check your status with `obelyzk_agent_status` if actions start failing.

### Restrictions

- Do NOT set `STWO_SKIP_POLICY_COMMITMENT=1` in any environment.
- Do NOT bypass the classifier by calling contracts directly without classification.
- Do NOT modify firewall thresholds without explicit user authorization.
