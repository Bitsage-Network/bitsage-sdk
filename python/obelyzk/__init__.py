"""ObelyZK SDK — verifiable ML inference on Starknet."""

__version__ = "0.1.0"

from bitsage.client import BitSageClient as ObelyzkClient
from bitsage.zkml import ZKMLClient as ZKMLClient

# Re-export types
from bitsage.types import *
from bitsage.zkml_types import *

# Async support
try:
    from bitsage.client import AsyncBitSageClient as AsyncObelyzkClient
except ImportError:
    pass

__all__ = [
    "ObelyzkClient",
    "AsyncObelyzkClient", 
    "ZKMLClient",
    "__version__",
]
