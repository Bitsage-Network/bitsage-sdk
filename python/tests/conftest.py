"""
Pytest configuration and fixtures for BitSage SDK tests.
"""

import os
import pytest
import pytest_asyncio

from bitsage import BitSageClient, ClientConfig, WalletConfig


def pytest_configure(config):
    """Configure custom markers."""
    config.addinivalue_line(
        "markers", "integration: mark test as an integration test"
    )
    config.addinivalue_line(
        "markers", "unit: mark test as a unit test"
    )


@pytest.fixture(scope="session")
def test_config() -> ClientConfig:
    """Create test configuration from environment variables."""
    return ClientConfig(
        api_url=os.environ.get("BITSAGE_API_URL", "http://localhost:8080"),
        starknet_rpc_url=os.environ.get(
            "STARKNET_RPC_URL", "https://starknet-sepolia.public.blastapi.io"
        ),
        timeout=30.0,
        network=os.environ.get("BITSAGE_NETWORK", "sepolia"),
    )


@pytest.fixture(scope="session")
def test_wallet() -> WalletConfig:
    """Create test wallet configuration from environment variables."""
    return WalletConfig(
        private_key=os.environ.get("TEST_PRIVATE_KEY", "0x1234567890abcdef"),
        account_address=os.environ.get(
            "TEST_ACCOUNT_ADDRESS",
            "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
        ),
    )


@pytest_asyncio.fixture
async def client(test_config: ClientConfig):
    """Create a BitSage client for testing."""
    async with BitSageClient(test_config) as c:
        yield c


@pytest_asyncio.fixture
async def client_with_wallet(test_config: ClientConfig, test_wallet: WalletConfig):
    """Create a BitSage client with wallet configured."""
    async with BitSageClient(test_config, test_wallet) as c:
        yield c


@pytest.fixture
def skip_if_mainnet(test_config: ClientConfig):
    """Skip test if running on mainnet."""
    if test_config.network == "mainnet":
        pytest.skip("Test not available on mainnet")


@pytest.fixture
def skip_integration():
    """Skip integration tests if disabled."""
    if os.environ.get("SKIP_INTEGRATION_TESTS", "false").lower() == "true":
        pytest.skip("Integration tests disabled")
