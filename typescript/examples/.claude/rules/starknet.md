---
paths:
  - "scripts/**/*.mjs"
  - "scripts/**/*.ts"
  - "deployment/**"
  - "contracts/**"
---

# Starknet Transaction Rules

Before ANY on-chain transaction in these paths:

1. Call `firewall_classify` with the target contract address, value, and function selector.
2. If the decision is `escalate` or `block`, stop and explain the threat score.
3. Include the `io_commitment` in the commit message for the audit trail.
4. Never use `--skip-policy` or set `STWO_SKIP_POLICY_COMMITMENT=1`.
5. Never call `starkli invoke` or `sncast invoke` without prior classification.
