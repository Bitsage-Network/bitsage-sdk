"""
Image build DSL — Modal-shaped method chain for declaring a function's
container environment.

.. code-block:: python

    image = (
        bitsage.Image.debian_slim(python_version="3.12")
        .apt_install("git", "build-essential")
        .pip_install("numpy", "scipy", "torch==2.3.1")
        .run_commands("python -c 'import torch; print(torch.cuda.is_available())'")
        .env({"CUDA_VISIBLE_DEVICES": "0"})
    )

    @app.function(image=image, gpu="h100")
    def train(): ...

The DSL is pure data during Day 1 — each method returns a new :class:`Image`
with an appended :class:`ImageLayer`. Actual build execution on the
coordinator lands in Phase 1 Week 3-4 alongside the cloud provisioner. Until
then, tiers' pre-baked worker images serve as the execution environment and
``Image`` is metadata the scheduler uses to hint at matching workers.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any, Mapping, Sequence


@dataclass(frozen=True)
class ImageLayer:
    """A single declarative step in an :class:`Image` build chain.

    The ``kind`` discriminates which build operation the coordinator will
    perform; ``args`` carries the kind-specific payload.
    """

    kind: str
    args: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Image:
    """A container-image specification.

    Built up via a fluent chain. Each method returns a *new* :class:`Image`
    (the original is not mutated), so branching is safe:

    .. code-block:: python

        base = Image.debian_slim().pip_install("requests")
        with_torch = base.pip_install("torch")
        with_jax   = base.pip_install("jax")
    """

    base: str
    layers: tuple[ImageLayer, ...] = ()
    python_version: str | None = None

    # ─── Constructors ─────────────────────────────────────────────────

    @classmethod
    def debian_slim(cls, python_version: str = "3.12") -> "Image":
        """Debian-slim base with a pinned Python version."""
        return cls(base="debian_slim", python_version=python_version)

    @classmethod
    def from_registry(cls, image_ref: str, *, setup_dockerfile_commands: Sequence[str] = ()) -> "Image":
        """Start from an existing Docker registry image.

        ``image_ref`` is a full OCI reference like ``"nvcr.io/nvidia/pytorch:24.09-py3"``.
        """
        layers: tuple[ImageLayer, ...] = ()
        if setup_dockerfile_commands:
            layers = (
                ImageLayer(kind="run_commands", args={"commands": list(setup_dockerfile_commands)}),
            )
        return cls(base=f"registry:{image_ref}", layers=layers)

    @classmethod
    def from_dockerfile(cls, path: str, *, context: str | None = None) -> "Image":
        """Use an existing Dockerfile as the image source.

        Parameters
        ----------
        path : str
            Path to the Dockerfile relative to the invocation directory.
        context : str, optional
            Build context directory; defaults to the Dockerfile's directory.
        """
        return cls(
            base="dockerfile",
            layers=(ImageLayer(kind="dockerfile", args={"path": path, "context": context}),),
        )

    # ─── Build steps ──────────────────────────────────────────────────

    def pip_install(self, *packages: str, extra_index_url: str | None = None) -> "Image":
        """Append a ``pip install`` layer with the given packages."""
        args: dict[str, Any] = {"packages": list(packages)}
        if extra_index_url is not None:
            args["extra_index_url"] = extra_index_url
        return self._with_layer(ImageLayer(kind="pip_install", args=args))

    def apt_install(self, *packages: str) -> "Image":
        """Append an ``apt-get install`` layer."""
        return self._with_layer(ImageLayer(kind="apt_install", args={"packages": list(packages)}))

    def run_commands(self, *commands: str) -> "Image":
        """Append a layer that runs the given shell commands sequentially."""
        return self._with_layer(ImageLayer(kind="run_commands", args={"commands": list(commands)}))

    def env(self, variables: Mapping[str, str]) -> "Image":
        """Append a layer setting environment variables in the built image."""
        return self._with_layer(ImageLayer(kind="env", args={"variables": dict(variables)}))

    def workdir(self, path: str) -> "Image":
        """Set the working directory for subsequent layers + runtime."""
        return self._with_layer(ImageLayer(kind="workdir", args={"path": path}))

    # ─── Internal / serialisation ─────────────────────────────────────

    def _with_layer(self, layer: ImageLayer) -> "Image":
        return replace(self, layers=self.layers + (layer,))

    def to_request_payload(self) -> dict[str, Any]:
        """Serialise to the dict shape the coordinator expects.

        Stable across SDK versions — coordinator parses ``base``,
        ``python_version``, and each ``layer`` by ``kind``.
        """
        return {
            "base": self.base,
            "python_version": self.python_version,
            "layers": [
                {"kind": layer.kind, "args": layer.args}
                for layer in self.layers
            ],
        }

    # ─── Convenience / introspection ──────────────────────────────────

    def __len__(self) -> int:
        """Number of layers in this image."""
        return len(self.layers)

    def summarise(self) -> str:
        """One-line human summary, for logs + error messages."""
        layer_summary = ", ".join(layer.kind for layer in self.layers) or "no-layers"
        py = f"py{self.python_version}" if self.python_version else "py?"
        return f"Image({self.base}, {py}, [{layer_summary}])"


__all__ = ["Image", "ImageLayer"]
