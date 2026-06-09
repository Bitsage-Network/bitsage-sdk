"""
Proof receipt — the cryptographic evidence that a BitSage invocation ran
as commanded.

Every invocation with ``require_proof=True`` returns a :class:`ProofReceipt`.
The receipt carries the proof artefact hash, the on-chain verifier
transaction reference, and a ``.verify()`` helper that re-runs verification
against the EloVerifier contract on Starknet.

This is the primitive Modal and FAL cannot match — the whole moat compresses
into three fields and one method.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


class ProofVerificationError(Exception):
    """Raised when :meth:`ProofReceipt.verify` cannot confirm the proof on-chain."""

    def __init__(self, message: str, *, proof_hash: str, verifier_address: str):
        super().__init__(message)
        self.proof_hash = proof_hash
        self.verifier_address = verifier_address


@dataclass(frozen=True)
class ProofReceipt:
    """Cryptographic receipt for a single invocation.

    Attributes
    ----------
    proof_hash : str
        Hex-encoded Blake3 hash of the proof artefact. Stable id — use for
        caching, dedup, and cross-referencing with on-chain events.
    proof_commitment : str
        On-chain commitment felt (hex). What the EloVerifier checks against.
    verifier_address : str
        Starknet contract address of the verifier that attested this proof.
        Defaults to EloVerifier v11 on Sepolia; override per environment.
    on_chain_tx : str, optional
        Starknet transaction hash of the verification call, if the
        coordinator already submitted it. ``None`` when verification is
        deferred to the client (call :meth:`verify` to submit).
    starknet_rpc_url : str, optional
        RPC endpoint used for :meth:`verify`. Inherits from the client
        config when omitted.
    """

    proof_hash: str
    proof_commitment: str
    verifier_address: str
    on_chain_tx: Optional[str] = None
    starknet_rpc_url: Optional[str] = None

    @property
    def on_chain_url(self) -> Optional[str]:
        """Starknet explorer URL for the verification transaction, if any."""
        if self.on_chain_tx is None:
            return None
        # Voyager-style URL; works for Sepolia and mainnet via the network
        # embedded in `starknet_rpc_url`. Simple heuristic: mainnet if not sepolia.
        base = (
            "https://sepolia.voyager.online/tx/"
            if self._is_sepolia()
            else "https://voyager.online/tx/"
        )
        return f"{base}{self.on_chain_tx}"

    def _is_sepolia(self) -> bool:
        return bool(self.starknet_rpc_url and "sepolia" in self.starknet_rpc_url.lower())

    async def verify(self, starknet_rpc_url: Optional[str] = None) -> bool:
        """Verify the proof on-chain.

        When :attr:`on_chain_tx` is set, this queries the transaction
        receipt and confirms the EloVerifier emitted a ``ProofVerified``
        event for :attr:`proof_hash`. When :attr:`on_chain_tx` is ``None``,
        this submits a fresh verification call (requires a configured
        signer via ``starknet-py``).

        Parameters
        ----------
        starknet_rpc_url : str, optional
            Override the receipt's RPC URL for this call.

        Returns
        -------
        bool
            ``True`` iff the on-chain verifier confirmed the proof.

        Raises
        ------
        ProofVerificationError
            On network errors, transaction reverts, or missing event.
        """
        # Lazy import so ``starknet-py`` stays optional at import time.
        try:
            from starknet_py.net.full_node_client import FullNodeClient  # type: ignore
        except ImportError as exc:  # pragma: no cover - import guard
            raise ProofVerificationError(
                "starknet-py is not installed; run `pip install obelyzk[verify]`",
                proof_hash=self.proof_hash,
                verifier_address=self.verifier_address,
            ) from exc

        rpc_url = starknet_rpc_url or self.starknet_rpc_url
        if rpc_url is None:
            raise ProofVerificationError(
                "no starknet_rpc_url configured — pass one to verify() or on the receipt",
                proof_hash=self.proof_hash,
                verifier_address=self.verifier_address,
            )

        if self.on_chain_tx is None:
            raise ProofVerificationError(
                "client-side verification submission is not implemented in v0.3.0; "
                "coordinator must submit on-chain when `require_proof=True`",
                proof_hash=self.proof_hash,
                verifier_address=self.verifier_address,
            )

        client = FullNodeClient(node_url=rpc_url)
        try:
            receipt = await client.get_transaction_receipt(self.on_chain_tx)
        except Exception as exc:
            raise ProofVerificationError(
                f"failed to fetch tx receipt: {exc}",
                proof_hash=self.proof_hash,
                verifier_address=self.verifier_address,
            ) from exc

        # Success criteria: the tx executed successfully and emitted an
        # event from the verifier whose data contains our proof_hash.
        status = getattr(receipt, "execution_status", None)
        if str(status) not in {"SUCCEEDED", "ExecutionStatus.SUCCEEDED"}:
            raise ProofVerificationError(
                f"on-chain verification reverted (status={status})",
                proof_hash=self.proof_hash,
                verifier_address=self.verifier_address,
            )

        events = getattr(receipt, "events", []) or []
        verifier_addr_int = int(self.verifier_address, 16)
        proof_hash_int = int(self.proof_hash, 16)
        for event in events:
            if getattr(event, "from_address", None) != verifier_addr_int:
                continue
            data = getattr(event, "data", []) or []
            if proof_hash_int in data:
                return True

        raise ProofVerificationError(
            "verifier did not emit a ProofVerified event for this proof_hash",
            proof_hash=self.proof_hash,
            verifier_address=self.verifier_address,
        )


__all__ = ["ProofReceipt", "ProofVerificationError"]
