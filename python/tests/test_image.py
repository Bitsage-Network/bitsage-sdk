"""Tests for bitsage.image — the build DSL."""

from __future__ import annotations

from bitsage.image import Image, ImageLayer


class TestImageConstruction:
    def test_debian_slim_default_python(self):
        img = Image.debian_slim()
        assert img.base == "debian_slim"
        assert img.python_version == "3.12"
        assert img.layers == ()

    def test_debian_slim_custom_python(self):
        img = Image.debian_slim(python_version="3.10")
        assert img.python_version == "3.10"

    def test_from_registry_wraps_image_ref(self):
        img = Image.from_registry("nvcr.io/nvidia/pytorch:24.09-py3")
        assert img.base == "registry:nvcr.io/nvidia/pytorch:24.09-py3"
        assert img.layers == ()

    def test_from_registry_with_setup_commands(self):
        img = Image.from_registry(
            "python:3.12-slim",
            setup_dockerfile_commands=["mkdir /data", "chmod 700 /data"],
        )
        assert len(img.layers) == 1
        assert img.layers[0].kind == "run_commands"
        assert img.layers[0].args["commands"] == ["mkdir /data", "chmod 700 /data"]

    def test_from_dockerfile_records_path_and_context(self):
        img = Image.from_dockerfile("./Dockerfile.prod", context="./build-ctx")
        assert img.base == "dockerfile"
        assert img.layers[0].kind == "dockerfile"
        assert img.layers[0].args == {"path": "./Dockerfile.prod", "context": "./build-ctx"}


class TestImageDSLChainImmutability:
    def test_pip_install_returns_new_instance(self):
        base = Image.debian_slim()
        chained = base.pip_install("numpy")
        assert base is not chained
        assert base.layers == ()
        assert len(chained.layers) == 1

    def test_branching_does_not_cross_contaminate(self):
        # Explicit test for the immutability promise — if this fails, the
        # docstring example ("base.pip_install(torch)" vs "base.pip_install(jax)")
        # is a lie.
        base = Image.debian_slim().pip_install("requests")
        with_torch = base.pip_install("torch")
        with_jax = base.pip_install("jax")

        assert len(with_torch.layers) == 2
        assert len(with_jax.layers) == 2
        assert with_torch.layers[-1].args["packages"] == ["torch"]
        assert with_jax.layers[-1].args["packages"] == ["jax"]
        # Base unaffected.
        assert len(base.layers) == 1


class TestImageDSLOperations:
    def test_pip_install_records_packages(self):
        img = Image.debian_slim().pip_install("numpy", "scipy==1.12.0")
        layer = img.layers[0]
        assert layer.kind == "pip_install"
        assert layer.args["packages"] == ["numpy", "scipy==1.12.0"]
        assert "extra_index_url" not in layer.args

    def test_pip_install_with_extra_index_url(self):
        img = Image.debian_slim().pip_install(
            "torch", extra_index_url="https://download.pytorch.org/whl/cu124"
        )
        assert img.layers[0].args["extra_index_url"] == "https://download.pytorch.org/whl/cu124"

    def test_apt_install_records_packages(self):
        img = Image.debian_slim().apt_install("git", "build-essential")
        assert img.layers[0].kind == "apt_install"
        assert img.layers[0].args["packages"] == ["git", "build-essential"]

    def test_run_commands_records_commands(self):
        img = Image.debian_slim().run_commands("echo hi", "cat /etc/os-release")
        assert img.layers[0].kind == "run_commands"
        assert img.layers[0].args["commands"] == ["echo hi", "cat /etc/os-release"]

    def test_env_records_variables(self):
        img = Image.debian_slim().env({"FOO": "bar", "BAZ": "42"})
        assert img.layers[0].kind == "env"
        assert img.layers[0].args["variables"] == {"FOO": "bar", "BAZ": "42"}

    def test_workdir_records_path(self):
        img = Image.debian_slim().workdir("/app")
        assert img.layers[0].kind == "workdir"
        assert img.layers[0].args["path"] == "/app"


class TestImageSerialisation:
    def test_to_request_payload_minimal(self):
        payload = Image.debian_slim().to_request_payload()
        assert payload == {
            "base": "debian_slim",
            "python_version": "3.12",
            "layers": [],
        }

    def test_to_request_payload_rich_chain(self):
        img = (
            Image.debian_slim(python_version="3.11")
            .apt_install("git")
            .pip_install("numpy", "scipy")
            .run_commands("python --version")
            .env({"CUDA_VISIBLE_DEVICES": "0"})
        )
        payload = img.to_request_payload()
        assert payload["base"] == "debian_slim"
        assert payload["python_version"] == "3.11"
        assert [l["kind"] for l in payload["layers"]] == [
            "apt_install",
            "pip_install",
            "run_commands",
            "env",
        ]

    def test_to_request_payload_is_json_serialisable(self):
        import json

        img = (
            Image.debian_slim()
            .pip_install("numpy")
            .env({"K": "V"})
        )
        # If any arg ever becomes non-JSON-safe this test snaps.
        json.dumps(img.to_request_payload())

    def test_len_returns_layer_count(self):
        img = Image.debian_slim().pip_install("numpy").apt_install("git")
        assert len(img) == 2

    def test_summarise_includes_base_and_layer_kinds(self):
        img = Image.debian_slim().pip_install("numpy").apt_install("git")
        summary = img.summarise()
        assert "debian_slim" in summary
        assert "pip_install" in summary
        assert "apt_install" in summary
        assert "py3.12" in summary


class TestImageLayer:
    def test_layer_is_frozen_dataclass(self):
        layer = ImageLayer(kind="pip_install", args={"packages": ["numpy"]})
        import dataclasses

        with pytest.raises(dataclasses.FrozenInstanceError):  # type: ignore[attr-defined]
            layer.kind = "apt_install"  # noqa


# pytest import used inside TestImageLayer
import pytest  # noqa: E402
