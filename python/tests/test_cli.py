"""Tests for bitsage.cli — the command-line interface.

Drives commands through :func:`bitsage.cli.main` directly so we don't
shell out + fork for each test. Stdout/stderr captured via
``capsys``; stdin prompts fed via :mod:`io.StringIO`.

Network-touching commands (``run``) are exercised by monkey-patching
``Function.remote`` so the full HTTP stack doesn't need to be up.
"""

from __future__ import annotations

import asyncio
import io
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import pytest

import bitsage
from bitsage import cli


# ─── Credential file isolation ───────────────────────────────────────


@pytest.fixture(autouse=True)
def _isolated_credentials(tmp_path, monkeypatch):
    """Redirect the credentials file to a per-test tmp path."""
    creds_path = tmp_path / "credentials"
    monkeypatch.setattr(cli, "CREDENTIALS_PATH", creds_path)
    # Also clear env vars so tests see a clean slate unless they set them.
    monkeypatch.delenv("BITSAGE_API_KEY", raising=False)
    monkeypatch.delenv("BITSAGE_API_URL", raising=False)
    yield creds_path


# ─── version ──────────────────────────────────────────────────────────


class TestVersion:
    def test_prints_sdk_version(self, capsys):
        rc = cli.main(["version"])
        captured = capsys.readouterr()
        assert rc == 0
        assert captured.out.strip() == bitsage.__version__


# ─── whoami ───────────────────────────────────────────────────────────


class TestWhoami:
    def test_no_credentials_exits_nonzero(self, capsys):
        rc = cli.main(["whoami"])
        captured = capsys.readouterr()
        assert rc == 1
        assert "not logged in" in captured.out

    def test_reads_env_key(self, monkeypatch, capsys):
        monkeypatch.setenv("BITSAGE_API_KEY", "bsk_abcdef123456")
        monkeypatch.setenv("BITSAGE_API_URL", "https://coord.test")
        rc = cli.main(["whoami"])
        captured = capsys.readouterr()
        assert rc == 0
        assert "https://coord.test" in captured.out
        # Token should be redacted — never echo full key.
        assert "bsk_abcdef123456" not in captured.out
        assert "bsk_ab" in captured.out
        assert "(env)" in captured.out

    def test_reads_credentials_file(self, _isolated_credentials, capsys):
        _isolated_credentials.parent.mkdir(parents=True, exist_ok=True)
        _isolated_credentials.write_text(
            json.dumps(
                {
                    "type": "api_key",
                    "token": "bsk_fromfile_xxxxxxx",
                    "api_url": "https://file.example.com",
                }
            )
        )
        rc = cli.main(["whoami"])
        captured = capsys.readouterr()
        assert rc == 0
        assert "https://file.example.com" in captured.out
        assert "(credentials file)" in captured.out
        assert "Type    : api_key" in captured.out

    def test_env_key_takes_precedence_over_file(
        self, _isolated_credentials, monkeypatch, capsys
    ):
        _isolated_credentials.parent.mkdir(parents=True, exist_ok=True)
        _isolated_credentials.write_text(
            json.dumps({"type": "api_key", "token": "file_token_aaaa"})
        )
        monkeypatch.setenv("BITSAGE_API_KEY", "bsk_env_token_bbbb")
        rc = cli.main(["whoami"])
        captured = capsys.readouterr()
        assert rc == 0
        assert "(env)" in captured.out
        assert "file_token_aaaa" not in captured.out


# ─── setup ────────────────────────────────────────────────────────────


class TestSetup:
    def test_setup_with_flags_writes_credentials(
        self, _isolated_credentials, capsys
    ):
        rc = cli.main(
            [
                "setup",
                "--api-key",
                "bsk_flag_ccccccc",
                "--api-url",
                "https://from-flag.example",
            ]
        )
        captured = capsys.readouterr()
        assert rc == 0
        assert _isolated_credentials.exists()
        creds = json.loads(_isolated_credentials.read_text())
        assert creds["token"] == "bsk_flag_ccccccc"
        assert creds["api_url"] == "https://from-flag.example"
        assert creds["type"] == "api_key"
        # Token should be redacted in output but URL shown.
        assert "bsk_flag_ccccccc" not in captured.out
        assert "from-flag.example" in captured.out

    def test_setup_file_permissions_are_0600(self, _isolated_credentials):
        cli.main(
            [
                "setup",
                "--api-key",
                "bsk_perm_ddddd",
                "--api-url",
                "https://x",
            ]
        )
        mode = _isolated_credentials.stat().st_mode & 0o777
        assert mode == 0o600, f"expected 0600 perms, got {oct(mode)}"

    def test_setup_without_token_fails(
        self, _isolated_credentials, monkeypatch, capsys
    ):
        # Simulate non-interactive input with no key on stdin.
        monkeypatch.setattr(sys, "stdin", io.StringIO("\n\n"))
        rc = cli.main(["setup", "--api-url", "https://x"])
        captured = capsys.readouterr()
        assert rc == 1
        assert "no API key provided" in captured.out
        assert not _isolated_credentials.exists()


# ─── Input parsing ────────────────────────────────────────────────────


class TestParseInputs:
    def test_none_yields_empty(self):
        args, kwargs = cli._parse_inputs(None)
        assert args == [] and kwargs == {}

    def test_list_becomes_args(self):
        args, kwargs = cli._parse_inputs("[1, 2, 3]")
        assert args == [1, 2, 3]
        assert kwargs == {}

    def test_plain_dict_becomes_kwargs(self):
        args, kwargs = cli._parse_inputs('{"x": 5, "y": 7}')
        assert args == []
        assert kwargs == {"x": 5, "y": 7}

    def test_envelope_shape_unpacks_both(self):
        args, kwargs = cli._parse_inputs(
            '{"args": [1, 2], "kwargs": {"z": 3}}'
        )
        assert args == [1, 2]
        assert kwargs == {"z": 3}

    def test_envelope_partial_args_only(self):
        args, kwargs = cli._parse_inputs('{"args": [9]}')
        assert args == [9]
        assert kwargs == {}

    def test_envelope_partial_kwargs_only(self):
        args, kwargs = cli._parse_inputs('{"kwargs": {"iters": 100}}')
        assert args == []
        assert kwargs == {"iters": 100}

    def test_invalid_json_raises(self):
        with pytest.raises(ValueError) as exc:
            cli._parse_inputs("not json")
        assert "not valid JSON" in str(exc.value)

    def test_envelope_with_non_list_args_raises(self):
        with pytest.raises(ValueError):
            cli._parse_inputs('{"args": "nope"}')

    def test_envelope_with_non_dict_kwargs_raises(self):
        with pytest.raises(ValueError):
            cli._parse_inputs('{"kwargs": []}')


# ─── file::fn parsing ─────────────────────────────────────────────────


class TestParseFileFn:
    def test_happy_path(self):
        assert cli._parse_file_fn("app.py::fn") == ("app.py", "fn")

    def test_with_path(self):
        assert cli._parse_file_fn("examples/x.py::go") == (
            "examples/x.py",
            "go",
        )

    def test_missing_separator_raises(self):
        with pytest.raises(ValueError):
            cli._parse_file_fn("app.py")

    def test_empty_fn_raises(self):
        with pytest.raises(ValueError):
            cli._parse_file_fn("app.py::")

    def test_empty_file_raises(self):
        with pytest.raises(ValueError):
            cli._parse_file_fn("::fn")


# ─── run ──────────────────────────────────────────────────────────────


# A shared decorated function in a tmp file, returned by the fixture.
@pytest.fixture
def tmp_example(tmp_path: Path) -> Path:
    source = """
import bitsage
app = bitsage.App("tmp")

@app.function(tier="cpu_standard")
def go(x, factor=1):
    return x * factor
"""
    f = tmp_path / "tmp_example.py"
    f.write_text(source)
    return f


@dataclass
class _FakeUsage:
    wall_seconds: float
    billable_credits: float


@dataclass
class _FakeResult:
    value: object
    usage: _FakeUsage
    proof: object = None
    job_id: str = "job-fake"
    worker_id: str = "worker-fake"


class TestRun:
    def test_invalid_target_returns_2(self, capsys):
        rc = cli.main(["run", "no-separator"])
        captured = capsys.readouterr()
        assert rc == 2
        assert "expected FILE::FN" in captured.err

    def test_nonexistent_file_raises(self, capsys):
        # argparse lets it through; import step raises FileNotFoundError.
        with pytest.raises(FileNotFoundError):
            cli.main(["run", "does/not/exist.py::fn"])

    def test_target_not_a_function(self, tmp_path, capsys):
        f = tmp_path / "plain.py"
        f.write_text("def fn():\n    return 1\n")
        rc = cli.main(["run", f"{f}::fn"])
        captured = capsys.readouterr()
        assert rc == 2
        assert "not a bitsage.Function" in captured.err

    def test_invokes_remote_with_parsed_inputs(
        self, tmp_example, monkeypatch, capsys
    ):
        captured_args = {}

        async def fake_remote(self, *args, **kwargs):
            captured_args["args"] = args
            captured_args["kwargs"] = kwargs
            return _FakeResult(
                value=60,
                usage=_FakeUsage(wall_seconds=0.5, billable_credits=0.004),
            )

        monkeypatch.setattr(bitsage.Function, "remote", fake_remote)

        rc = cli.main(
            [
                "run",
                f"{tmp_example}::go",
                "--inputs-json",
                '{"args": [10], "kwargs": {"factor": 6}}',
            ]
        )
        out = capsys.readouterr().out
        assert rc == 0
        assert captured_args["args"] == (10,)
        assert captured_args["kwargs"] == {"factor": 6}
        assert "completed in 0.500s" in out
        assert "billable_credits: 0.004000" in out
        assert '"result     : 60"' in out.replace("result     : 60", '"result     : 60"')

    def test_remote_raises_remote_execution_error_prints_traceback(
        self, tmp_example, monkeypatch, capsys
    ):
        from bitsage._transport import RemoteExecutionError

        async def fake_remote(self, *args, **kwargs):
            raise RemoteExecutionError(
                "ZeroDivisionError: integer division or modulo by zero",
                job_id="job-x",
                status="failed",
                code="user_code_error",
                traceback='File "user.py", line 2\nZeroDivisionError',
            )

        monkeypatch.setattr(bitsage.Function, "remote", fake_remote)

        rc = cli.main(["run", f"{tmp_example}::go", "--inputs-json", "[1]"])
        err = capsys.readouterr().err
        assert rc == 3
        assert "remote execution failed" in err
        assert "ZeroDivisionError" in err

    def test_remote_raises_http_error_prints_job_id(
        self, tmp_example, monkeypatch, capsys
    ):
        from bitsage._transport import HandlerTimeoutError

        async def fake_remote(self, *args, **kwargs):
            raise HandlerTimeoutError(
                "hold exhausted",
                status_code=504,
                code="handler_timeout",
                job_id="job-pending-123",
            )

        monkeypatch.setattr(bitsage.Function, "remote", fake_remote)

        rc = cli.main(["run", f"{tmp_example}::go", "--inputs-json", "[1]"])
        err = capsys.readouterr().err
        assert rc == 4
        assert "HTTP 504" in err
        assert "handler_timeout" in err
        assert "job-pending-123" in err

    def test_proof_fields_rendered_when_present(
        self, tmp_example, monkeypatch, capsys
    ):
        from bitsage.proof import ProofReceipt

        proof = ProofReceipt(
            proof_hash="0xabc",
            proof_commitment="0xdef",
            verifier_address="0x0121d1e988",
            on_chain_tx="0xdeadbeef",
            starknet_rpc_url="https://starknet-sepolia.public.blastapi.io",
        )

        async def fake_remote(self, *args, **kwargs):
            return _FakeResult(
                value=49,
                usage=_FakeUsage(wall_seconds=3.0, billable_credits=1.0),
                proof=proof,
            )

        monkeypatch.setattr(bitsage.Function, "remote", fake_remote)
        rc = cli.main(["run", f"{tmp_example}::go", "--inputs-json", "[7]"])
        out = capsys.readouterr().out
        assert rc == 0
        assert "proof_hash : 0xabc" in out
        assert "verifier   : 0x0121d1e988" in out
        assert "sepolia.voyager.online/tx/0xdeadbeef" in out


# ─── argparse parser sanity ───────────────────────────────────────────


class TestParserShape:
    def test_parser_has_expected_subcommands(self):
        parser = cli.build_parser()
        actions = [a for a in parser._actions if hasattr(a, "choices") and a.choices]
        assert len(actions) == 1, "expected exactly one subparser dest"
        subparsers = actions[0]
        assert set(subparsers.choices.keys()) == {"version", "whoami", "setup", "run"}

    def test_missing_command_prints_help(self, capsys):
        with pytest.raises(SystemExit):
            cli.main([])
