"""
Tests for BitSage ZKML module.
"""

import os
import pytest

from bitsage.zkml import (
    ZkmlProverClient,
    ZkmlVerifierClient,
    DEFAULT_PROVER_URL,
    DEFAULT_VERIFIER_ADDRESS,
    DEFAULT_RPC_URL,
)
from bitsage.zkml_types import (
    ZkmlHealthResponse,
    ZkmlJobStatus,
    ZkmlModelInfo,
    ZkmlProveRequest,
    ZkmlProveResult,
    ZkmlProveStatus,
)


# ===== Unit Tests =====


class TestZkmlTypes:
    """Test Pydantic model serialization and validation."""

    def test_job_status_enum_values(self):
        """Enum values must match server's snake_case convention."""
        assert ZkmlJobStatus.QUEUED == "queued"
        assert ZkmlJobStatus.PROVING == "proving"
        assert ZkmlJobStatus.COMPLETED == "completed"
        assert ZkmlJobStatus.FAILED == "failed"

    def test_model_info_roundtrip(self):
        """ZkmlModelInfo serializes and deserializes correctly."""
        info = ZkmlModelInfo(
            model_id="abc123",
            weight_commitment="0xdead",
            num_layers=32,
            input_shape=[1, 512],
            description="test model",
        )
        data = info.model_dump()
        restored = ZkmlModelInfo(**data)
        assert restored.model_id == "abc123"
        assert restored.num_layers == 32
        assert restored.input_shape == [1, 512]
        assert restored.description == "test model"

    def test_model_info_optional_description(self):
        """Description is optional and defaults to None."""
        info = ZkmlModelInfo(
            model_id="x",
            weight_commitment="0x0",
            num_layers=1,
            input_shape=[4],
        )
        assert info.description is None

    def test_prove_request_defaults(self):
        """ZkmlProveRequest defaults match prove-server defaults."""
        req = ZkmlProveRequest(model_id="m1")
        assert req.gpu is False
        assert req.security == "auto"
        assert req.input is None

    def test_prove_request_serialization(self):
        """ZkmlProveRequest round-trips through model_dump."""
        req = ZkmlProveRequest(
            model_id="m1",
            input=[1.0, 2.0, 3.0],
            gpu=True,
            security="zk-only",
        )
        data = req.model_dump()
        assert data["model_id"] == "m1"
        assert data["input"] == [1.0, 2.0, 3.0]
        assert data["gpu"] is True
        assert data["security"] == "zk-only"

    def test_prove_status_fields(self):
        """ZkmlProveStatus includes all progress fields."""
        status = ZkmlProveStatus(
            job_id="j1",
            status=ZkmlJobStatus.PROVING,
            progress_bps=5000,
            elapsed_secs=12.5,
        )
        assert status.progress_bps == 5000
        assert status.elapsed_secs == 12.5

    def test_prove_result_fields(self):
        """ZkmlProveResult matches prove-server ProveResultPayload."""
        result = ZkmlProveResult(
            calldata=["0x1", "0x2", "0x3"],
            io_commitment="0xabc",
            weight_commitment="0xdef",
            layer_chain_commitment="0x456",
            estimated_gas=150000,
            num_matmul_proofs=4,
            num_layers=12,
            prove_time_ms=40520,
            tee_attestation_hash="0x789",
        )
        assert len(result.calldata) == 3
        assert result.layer_chain_commitment == "0x456"
        assert result.prove_time_ms == 40520
        assert result.estimated_gas == 150000
        assert result.tee_attestation_hash == "0x789"

    def test_prove_result_optional_tee(self):
        """tee_attestation_hash is optional."""
        result = ZkmlProveResult(
            calldata=["0x1"],
            io_commitment="0x0",
            weight_commitment="0x0",
            layer_chain_commitment="0x0",
        )
        assert result.tee_attestation_hash is None
        assert result.prove_time_ms == 0

    def test_health_response_matches_server(self):
        """ZkmlHealthResponse field names match prove-server HealthResponse."""
        health = ZkmlHealthResponse(status="ok")
        assert health.gpu_available is False
        assert health.tee_available is False
        assert health.loaded_models == 0
        assert health.active_jobs == 0
        assert health.device_name == ""

    def test_health_response_full(self):
        """ZkmlHealthResponse with all fields populated."""
        health = ZkmlHealthResponse(
            status="ok",
            uptime_secs=3600.0,
            gpu_available=True,
            tee_available=True,
            device_name="NVIDIA H200",
            loaded_models=3,
            active_jobs=1,
        )
        assert health.device_name == "NVIDIA H200"
        assert health.loaded_models == 3
        assert health.active_jobs == 1


class TestZkmlProverClient:
    """Test ZkmlProverClient configuration."""

    def test_default_prover_url(self):
        """Default URL is localhost:8080 when no env var set."""
        old = os.environ.pop("BITSAGE_PROVER_URL", None)
        try:
            client = ZkmlProverClient()
            assert client._base_url == DEFAULT_PROVER_URL
        finally:
            if old is not None:
                os.environ["BITSAGE_PROVER_URL"] = old

    def test_env_var_prover_url(self):
        """BITSAGE_PROVER_URL env var overrides default."""
        old = os.environ.get("BITSAGE_PROVER_URL")
        try:
            os.environ["BITSAGE_PROVER_URL"] = "http://gpu-server:9090"
            client = ZkmlProverClient()
            assert client._base_url == "http://gpu-server:9090"
        finally:
            if old is not None:
                os.environ["BITSAGE_PROVER_URL"] = old
            else:
                os.environ.pop("BITSAGE_PROVER_URL", None)

    def test_explicit_url_overrides_env(self):
        """Explicit prover_url parameter takes highest priority."""
        old = os.environ.get("BITSAGE_PROVER_URL")
        try:
            os.environ["BITSAGE_PROVER_URL"] = "http://env-server:1111"
            client = ZkmlProverClient(prover_url="http://explicit:2222")
            assert client._base_url == "http://explicit:2222"
        finally:
            if old is not None:
                os.environ["BITSAGE_PROVER_URL"] = old
            else:
                os.environ.pop("BITSAGE_PROVER_URL", None)


class TestZkmlVerifierClient:
    """Test ZkmlVerifierClient configuration."""

    def test_default_verifier_address(self):
        """Default verifier is StweMlStarkVerifier on Sepolia."""
        old = os.environ.pop("ZKML_VERIFIER_ADDRESS", None)
        try:
            client = ZkmlVerifierClient()
            assert client._verifier_address == DEFAULT_VERIFIER_ADDRESS
            assert "0x005928ac548dc2719ef1b34869db2b61c2a55a4b148012fad742262a8d674fba" in client._verifier_address
        finally:
            if old is not None:
                os.environ["ZKML_VERIFIER_ADDRESS"] = old

    def test_default_rpc_url(self):
        """Default RPC is Starknet Sepolia."""
        client = ZkmlVerifierClient()
        assert client._rpc_url == DEFAULT_RPC_URL

    def test_custom_verifier_address(self):
        """Custom verifier address is accepted."""
        custom = "0x1234567890abcdef"
        client = ZkmlVerifierClient(verifier_address=custom)
        assert client._verifier_address == custom

    def test_lazy_contract_init(self):
        """Contract is not initialized until first call."""
        client = ZkmlVerifierClient()
        assert client._contract is None

    def test_has_async_lock(self):
        """Verifier client has asyncio.Lock for thread-safe init."""
        client = ZkmlVerifierClient()
        import asyncio
        assert isinstance(client._lock, asyncio.Lock)


class TestZkmlImports:
    """Test that ZKML types are importable from top-level bitsage package."""

    def test_top_level_imports(self):
        from bitsage import (
            ZkmlProverClient,
            ZkmlVerifierClient,
            ZkmlJobStatus,
            ZkmlModelInfo,
            ZkmlProveRequest,
            ZkmlProveStatus,
            ZkmlProveResult,
            ZkmlHealthResponse,
        )

        assert ZkmlProverClient is not None
        assert ZkmlVerifierClient is not None
        assert ZkmlJobStatus.COMPLETED == "completed"


# ===== Integration Tests (skipped unless server running) =====


@pytest.mark.integration
class TestZkmlProverIntegration:
    """Integration tests requiring a running prove-server."""

    @pytest.fixture
    def prover_client(self):
        return ZkmlProverClient()

    @pytest.mark.asyncio
    async def test_health_check(self, prover_client):
        """Health endpoint responds."""
        health = await prover_client.health()
        assert health.status in ("ok", "healthy")

    @pytest.mark.asyncio
    async def test_load_and_get_model(self, prover_client):
        """Load a model and retrieve its info."""
        model_path = os.environ.get("TEST_MODEL_PATH")
        if not model_path:
            pytest.skip("TEST_MODEL_PATH not set")

        info = await prover_client.load_model(model_path, description="test")
        assert info.model_id
        assert info.num_layers > 0

        fetched = await prover_client.get_model(info.model_id)
        assert fetched.model_id == info.model_id
