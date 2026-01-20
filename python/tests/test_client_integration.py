"""
BitSage SDK Integration Tests

These tests run against a live coordinator (local or Sepolia).
Set BITSAGE_API_URL environment variable to target a specific endpoint.

Run with: pytest tests/ -v
"""

import os
import base64
from typing import Optional

import pytest
import pytest_asyncio

from bitsage import BitSageClient, SdkError, ClientConfig, WalletConfig
from bitsage.types import (
    SubmitJobRequest,
    JobType,
    JobStatus,
    ListJobsParams,
    GpuTier,
)


# Test configuration from environment
TEST_CONFIG = ClientConfig(
    api_url=os.environ.get("BITSAGE_API_URL", "http://localhost:8080"),
    starknet_rpc_url=os.environ.get(
        "STARKNET_RPC_URL", "https://starknet-sepolia.public.blastapi.io"
    ),
    timeout=30.0,
    network=os.environ.get("BITSAGE_NETWORK", "sepolia"),
)

# Test wallet (Sepolia testnet only - DO NOT use on mainnet!)
TEST_WALLET = WalletConfig(
    private_key=os.environ.get("TEST_PRIVATE_KEY", "0x1234567890abcdef"),
    account_address=os.environ.get(
        "TEST_ACCOUNT_ADDRESS",
        "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    ),
)

# Skip integration tests if not configured
SKIP_INTEGRATION = os.environ.get("SKIP_INTEGRATION_TESTS", "false").lower() == "true"


@pytest.fixture
def client():
    """Create a BitSage client for testing."""
    return BitSageClient(TEST_CONFIG)


@pytest.fixture
def client_with_wallet():
    """Create a BitSage client with wallet configured."""
    return BitSageClient(TEST_CONFIG, TEST_WALLET)


@pytest.mark.skipif(SKIP_INTEGRATION, reason="Integration tests disabled")
class TestHealthConnectivity:
    """Health and connectivity tests."""

    @pytest.mark.asyncio
    async def test_connect_to_api_endpoint(self, client):
        """Should connect to the API endpoint."""
        async with client:
            stats = await client.get_network_stats()
            assert stats is not None

    @pytest.mark.asyncio
    async def test_handle_timeout_gracefully(self):
        """Should handle timeout gracefully."""
        slow_config = ClientConfig(
            api_url=TEST_CONFIG.api_url,
            starknet_rpc_url=TEST_CONFIG.starknet_rpc_url,
            timeout=0.001,  # 1ms timeout - should fail
            network=TEST_CONFIG.network,
        )
        slow_client = BitSageClient(slow_config)

        async with slow_client:
            with pytest.raises(SdkError):
                await slow_client.get_network_stats()


@pytest.mark.skipif(SKIP_INTEGRATION, reason="Integration tests disabled")
class TestNetworkOperations:
    """Network operations tests."""

    @pytest.mark.asyncio
    async def test_get_network_statistics(self, client):
        """Should get network statistics."""
        async with client:
            stats = await client.get_network_stats()

            assert hasattr(stats, "total_workers")
            assert hasattr(stats, "active_workers")
            assert hasattr(stats, "total_jobs_completed")
            assert isinstance(stats.total_workers, int)


@pytest.mark.skipif(SKIP_INTEGRATION, reason="Integration tests disabled")
class TestWorkerOperations:
    """Worker operations tests."""

    @pytest.mark.asyncio
    async def test_list_workers(self, client):
        """Should list workers."""
        async with client:
            workers = await client.list_workers()

            assert isinstance(workers, list)
            # Workers array may be empty on fresh deployment

    @pytest.mark.asyncio
    async def test_handle_non_existent_worker(self, client):
        """Should handle non-existent worker gracefully."""
        async with client:
            fake_worker_id = "00000000-0000-0000-0000-000000000000"

            with pytest.raises(SdkError) as exc_info:
                await client.get_worker(fake_worker_id)

            assert exc_info.value.status_code == 404


@pytest.mark.skipif(SKIP_INTEGRATION, reason="Integration tests disabled")
class TestJobOperations:
    """Job operations tests."""

    submitted_job_id: Optional[str] = None

    @pytest.mark.asyncio
    async def test_submit_job(self, client):
        """Should submit a job."""
        async with client:
            job_request = SubmitJobRequest(
                job_type=JobType.ai_inference("test-model", batch_size=1),
                input_data=base64.b64encode(b"test input data").decode(),
                max_cost_sage=100,
                max_duration_secs=300,
                priority=5,
                require_tee=False,
            )

            try:
                response = await client.submit_job(job_request)

                assert hasattr(response, "job_id")
                assert hasattr(response, "status")
                assert hasattr(response, "estimated_cost_sage")

                TestJobOperations.submitted_job_id = response.job_id

            except SdkError as e:
                # May fail if no workers available - OK for integration test
                if e.code == "API_ERROR":
                    print(f"Job submission failed (expected if no workers): {e}")
                else:
                    raise

    @pytest.mark.asyncio
    async def test_get_job_status(self, client):
        """Should get job status."""
        if not TestJobOperations.submitted_job_id:
            pytest.skip("No job was submitted")

        async with client:
            status = await client.get_job_status(TestJobOperations.submitted_job_id)

            assert status.job_id == TestJobOperations.submitted_job_id
            assert hasattr(status, "status")
            assert status.status in [
                JobStatus.PENDING,
                JobStatus.ASSIGNED,
                JobStatus.RUNNING,
                JobStatus.COMPLETED,
                JobStatus.FAILED,
                JobStatus.CANCELLED,
            ]

    @pytest.mark.asyncio
    async def test_list_jobs(self, client):
        """Should list jobs."""
        async with client:
            response = await client.list_jobs(ListJobsParams(limit=10))

            assert hasattr(response, "jobs")
            assert isinstance(response.jobs, list)
            assert hasattr(response, "total")

    @pytest.mark.asyncio
    async def test_list_jobs_with_pagination(self, client):
        """Should list jobs with pagination."""
        async with client:
            page1 = await client.list_jobs(ListJobsParams(limit=5, offset=0))
            page2 = await client.list_jobs(ListJobsParams(limit=5, offset=5))

            # Pages should be different (if enough jobs exist)
            if len(page1.jobs) >= 5 and len(page2.jobs) >= 1:
                page1_ids = {j.job_id for j in page1.jobs}
                page2_ids = {j.job_id for j in page2.jobs}
                assert page1_ids.isdisjoint(page2_ids)

    @pytest.mark.asyncio
    async def test_cancel_job(self, client):
        """Should cancel a job."""
        if not TestJobOperations.submitted_job_id:
            pytest.skip("No job was submitted")

        async with client:
            try:
                await client.cancel_job(TestJobOperations.submitted_job_id)

                # Verify status changed
                status = await client.get_job_status(TestJobOperations.submitted_job_id)
                assert status.status in [
                    JobStatus.CANCELLED,
                    JobStatus.COMPLETED,
                    JobStatus.FAILED,
                ]
            except SdkError:
                # May fail if job already completed
                pass

    @pytest.mark.asyncio
    async def test_stream_job_status(self, client):
        """Should stream job status."""
        if not TestJobOperations.submitted_job_id:
            pytest.skip("No job was submitted")

        async with client:
            statuses = []
            count = 0

            async for status in client.stream_job_status(
                TestJobOperations.submitted_job_id, poll_interval_secs=0.5
            ):
                statuses.append(status.status)
                count += 1
                if count >= 3:
                    break

            assert len(statuses) > 0


@pytest.mark.skipif(SKIP_INTEGRATION, reason="Integration tests disabled")
class TestProofOperations:
    """Proof operations tests."""

    @pytest.mark.asyncio
    async def test_handle_non_existent_proof(self, client):
        """Should handle non-existent proof gracefully."""
        async with client:
            fake_proof_hash = (
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            )

            with pytest.raises(SdkError):
                await client.get_proof(fake_proof_hash)


@pytest.mark.skipif(SKIP_INTEGRATION, reason="Integration tests disabled")
class TestFaucetOperations:
    """Faucet operations tests (testnet only)."""

    @pytest.mark.asyncio
    async def test_check_faucet_status(self, client):
        """Should check faucet status."""
        if TEST_CONFIG.network == "mainnet":
            pytest.skip("Skipping faucet test on mainnet")

        async with client:
            status = await client.faucet_status(TEST_WALLET.account_address)

            assert hasattr(status, "can_claim")
            assert hasattr(status, "time_until_next_claim_secs")
            assert isinstance(status.can_claim, bool)

    @pytest.mark.asyncio
    async def test_claim_from_faucet(self, client):
        """Should claim from faucet."""
        if TEST_CONFIG.network == "mainnet":
            pytest.skip("Skipping faucet test on mainnet")

        async with client:
            try:
                response = await client.faucet_claim(TEST_WALLET.account_address)

                assert hasattr(response, "success")
                assert hasattr(response, "amount")
                assert hasattr(response, "transaction_hash")

            except SdkError as e:
                # Rate limited or already claimed - OK for integration test
                print(f"Faucet claim result: {e}")


@pytest.mark.skipif(SKIP_INTEGRATION, reason="Integration tests disabled")
class TestStakingOperations:
    """Staking operations tests."""

    @pytest.mark.asyncio
    async def test_require_wallet_for_staking(self):
        """Should require wallet for staking operations."""
        client_no_wallet = BitSageClient(TEST_CONFIG)

        async with client_no_wallet:
            with pytest.raises(SdkError) as exc_info:
                await client_no_wallet.stake(1000, GpuTier.CONSUMER)

            assert "Wallet not configured" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_get_stake_info(self, client_with_wallet):
        """Should get stake info."""
        async with client_with_wallet:
            try:
                stake_info = await client_with_wallet.get_stake_info()

                assert hasattr(stake_info, "staked_amount")
                assert hasattr(stake_info, "pending_rewards")
                assert hasattr(stake_info, "gpu_tier")

            except SdkError:
                # May fail if address not registered - OK for integration test
                pass


@pytest.mark.skipif(SKIP_INTEGRATION, reason="Integration tests disabled")
class TestErrorHandling:
    """Error handling tests."""

    @pytest.mark.asyncio
    async def test_throw_sdk_error_for_404(self, client):
        """Should throw SdkError for 404 responses."""
        async with client:
            with pytest.raises(SdkError) as exc_info:
                await client.get_worker("invalid-id")

            assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_handle_network_errors(self):
        """Should handle network errors."""
        bad_config = ClientConfig(
            api_url="http://localhost:99999",  # Invalid port
            starknet_rpc_url="",
            timeout=1.0,
            network="sepolia",
        )
        bad_client = BitSageClient(bad_config)

        async with bad_client:
            with pytest.raises(SdkError):
                await bad_client.get_network_stats()


class TestClientUnitTests:
    """Client unit tests (no network required)."""

    def test_use_default_configuration(self):
        """Should use default configuration."""
        client = BitSageClient()
        assert client is not None
        assert client.config.api_url == "https://api.bitsage.network"

    def test_merge_custom_configuration(self):
        """Should merge custom configuration."""
        custom_config = ClientConfig(
            api_url="https://custom.api.com",
            timeout=60.0,
        )

        client = BitSageClient(custom_config)
        assert client is not None
        assert client.config.api_url == "https://custom.api.com"
        assert client.config.timeout == 60.0

    def test_chain_wallet_configuration(self):
        """Should chain wallet configuration."""
        client = BitSageClient().with_wallet(
            WalletConfig(
                private_key="0x123",
                account_address="0x456",
            )
        )

        assert client is not None
        assert client.wallet is not None
        assert client.wallet.account_address == "0x456"


class TestGpuTier:
    """GPU tier tests."""

    def test_min_stake_values(self):
        """Should return correct minimum stake values."""
        assert GpuTier.CONSUMER.min_stake == 1_000
        assert GpuTier.WORKSTATION.min_stake == 2_500
        assert GpuTier.DATA_CENTER.min_stake == 5_000
        assert GpuTier.ENTERPRISE.min_stake == 10_000
        assert GpuTier.FRONTIER.min_stake == 25_000

    def test_from_gpu_model(self):
        """Should classify GPU models correctly."""
        assert GpuTier.from_gpu_model("RTX 4090") == GpuTier.CONSUMER
        assert GpuTier.from_gpu_model("RTX 3090") == GpuTier.CONSUMER
        assert GpuTier.from_gpu_model("A6000") == GpuTier.WORKSTATION
        assert GpuTier.from_gpu_model("L40S") == GpuTier.WORKSTATION
        assert GpuTier.from_gpu_model("A100") == GpuTier.DATA_CENTER
        assert GpuTier.from_gpu_model("NVIDIA H100") == GpuTier.ENTERPRISE
        assert GpuTier.from_gpu_model("H200") == GpuTier.ENTERPRISE
        assert GpuTier.from_gpu_model("NVIDIA B200") == GpuTier.FRONTIER


class TestJobType:
    """Job type tests."""

    def test_ai_inference_job_type(self):
        """Should create AI inference job type."""
        job_type = JobType.ai_inference("llama-7b", batch_size=4)

        assert job_type.type == "ai_inference"

    def test_zk_proof_job_type(self):
        """Should create ZK proof job type."""
        job_type = JobType.zk_proof("ecdsa", proof_system="stwo")

        assert job_type.type == "zk_proof"

    def test_custom_job_type(self):
        """Should create custom job type."""
        job_type = JobType.custom("my-custom-job", parallelizable=False)

        assert job_type.type == "custom"
