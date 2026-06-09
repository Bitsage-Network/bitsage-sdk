"""
bitsage CLI — the command-line face of the SDK.

Minimal Day-4 surface covers the ergonomic wedge from a fresh laptop to
invoking a verifiable function:

.. code-block:: text

    $ bitsage setup                     # interactive login
    $ bitsage whoami                    # confirm auth
    $ bitsage run app.py::my_fn         # ephemeral run (Modal-shaped)
    $ bitsage version

``deploy`` / ``logs`` / ``serve`` arrive in Phase 1 Week 3 alongside the
coordinator's deployment registry. The shape intentionally mirrors
``modal run FILE::FN`` so port docs write themselves.

Uses :mod:`argparse` from the standard library — no new dependency.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import importlib.util
import inspect
import json
import os
import sys
from pathlib import Path
from typing import Any, Optional, Sequence


CREDENTIALS_PATH = Path.home() / ".bitsage" / "credentials"
DEFAULT_API_URL = "https://api.bitsage.network"


# ─── Credential management ────────────────────────────────────────────


def _load_credentials() -> Optional[dict[str, Any]]:
    if not CREDENTIALS_PATH.exists():
        return None
    try:
        return json.loads(CREDENTIALS_PATH.read_text())
    except (OSError, ValueError):
        return None


def _save_credentials(creds: dict[str, Any]) -> None:
    CREDENTIALS_PATH.parent.mkdir(parents=True, exist_ok=True)
    CREDENTIALS_PATH.write_text(json.dumps(creds, indent=2))
    # 0600 so only the owner can read — API key is sensitive.
    CREDENTIALS_PATH.chmod(0o600)


def _redact_token(token: str) -> str:
    """Display form of a token: first 6 chars + ... + last 3."""
    if len(token) <= 10:
        return "<redacted>"
    return f"{token[:6]}...{token[-3:]}"


# ─── Commands ─────────────────────────────────────────────────────────


def cmd_version(args: argparse.Namespace, *, out=sys.stdout) -> int:
    from bitsage import __version__

    out.write(f"{__version__}\n")
    return 0


def cmd_whoami(args: argparse.Namespace, *, out=sys.stdout) -> int:
    # Precedence: env vars override the credentials file, matching what
    # bitsage._transport._resolve_api_url / _resolve_auth_token do.
    api_url = os.environ.get("BITSAGE_API_URL")
    env_token = os.environ.get("BITSAGE_API_KEY")

    creds = _load_credentials()

    effective_url = api_url or (creds and creds.get("api_url")) or DEFAULT_API_URL
    effective_token = env_token or (creds and creds.get("token"))

    if effective_token is None:
        out.write(
            "✗ not logged in\n"
            "  run `bitsage setup` or set BITSAGE_API_KEY in your shell\n"
        )
        return 1

    source = "env" if env_token else "credentials file"
    out.write(f"API URL : {effective_url}\n")
    out.write(f"API key : {_redact_token(effective_token)}  ({source})\n")
    if creds and creds.get("type"):
        out.write(f"Type    : {creds['type']}\n")
    return 0


def cmd_setup(args: argparse.Namespace, *, in_=sys.stdin, out=sys.stdout) -> int:
    out.write(
        "bitsage setup — store an API key for this machine.\n"
        f"Credentials will be written to {CREDENTIALS_PATH}.\n\n"
    )

    # Reuse existing values as defaults where they exist.
    existing = _load_credentials() or {}
    default_url = existing.get("api_url") or DEFAULT_API_URL

    # Accept either interactive input or --api-key/--api-url flags.
    api_url = args.api_url or _prompt(
        f"API URL [{default_url}]: ", default=default_url, in_=in_, out=out
    )
    if args.api_key:
        token = args.api_key
    elif in_.isatty():
        token = getpass.getpass("API key (bsk_...): ")
    else:
        # Non-TTY + no flag: read plainly.
        token = _prompt("API key (bsk_...): ", in_=in_, out=out).strip()

    if not token:
        out.write("✗ no API key provided — aborting.\n")
        return 1

    from bitsage._transport import _resolve_api_url  # noqa: F401 (import validates path)

    creds = {
        "type": "api_key",
        "token": token,
        "api_url": api_url,
    }
    _save_credentials(creds)
    out.write(f"✓ wrote {CREDENTIALS_PATH}\n")
    out.write(f"✓ API URL: {api_url}\n")
    out.write(f"✓ API key: {_redact_token(token)}\n")
    return 0


def cmd_run(args: argparse.Namespace, *, out=sys.stdout, err=sys.stderr) -> int:
    """Invoke a decorated ``Function`` from a Python file.

    Argument shape: ``FILE::FN``, e.g. ``examples/monte_carlo.py::monte_carlo``.
    Inputs come from ``--inputs-json`` as either a positional list
    (``"[1, 2]"``), a kwargs dict (``'{"iters": 100}'``), or a
    ``{"args": [...], "kwargs": {...}}`` envelope.
    """
    from bitsage.app import Function
    from bitsage._transport import (
        BitSageHttpError,
        RemoteExecutionError,
    )

    try:
        file_part, fn_part = _parse_file_fn(args.target)
    except ValueError as exc:
        err.write(f"error: {exc}\n")
        return 2

    module = _load_module_from_file(Path(file_part))
    fn = getattr(module, fn_part, None)
    if not isinstance(fn, Function):
        err.write(
            f"error: {fn_part!r} in {file_part} is not a bitsage.Function — "
            f"did you forget @app.function()?\n"
        )
        return 2

    try:
        call_args, call_kwargs = _parse_inputs(args.inputs_json)
    except ValueError as exc:
        err.write(f"error: {exc}\n")
        return 2

    out.write(
        f"→ running {fn_part} on {fn.config.tier.value}"
        f"{' with proof' if fn.config.require_proof else ''} ...\n"
    )

    try:
        result = asyncio.run(fn.remote(*call_args, **call_kwargs))
    except RemoteExecutionError as exc:
        err.write(f"✗ remote execution {exc.status}: {exc}\n")
        if exc.traceback:
            err.write(f"\n{exc.traceback}\n")
        return 3
    except BitSageHttpError as exc:
        err.write(f"✗ HTTP {exc.status_code} ({exc.code}): {exc}\n")
        if exc.job_id:
            err.write(f"  job_id: {exc.job_id}\n")
        return 4
    except Exception as exc:  # pragma: no cover - defensive
        err.write(f"✗ unexpected error: {exc}\n")
        return 5

    out.write(f"✓ completed in {result.usage.wall_seconds:.3f}s\n")
    out.write(f"  billable_credits: {result.usage.billable_credits:.6f}\n")
    if result.proof is not None:
        out.write(f"  proof_hash : {result.proof.proof_hash}\n")
        out.write(f"  verifier   : {result.proof.verifier_address}\n")
        if result.proof.on_chain_url:
            out.write(f"  on_chain   : {result.proof.on_chain_url}\n")
    out.write(f"  result     : {json.dumps(result.value)}\n")
    return 0


# ─── Helpers ──────────────────────────────────────────────────────────


def _prompt(label: str, *, default: str = "", in_, out) -> str:
    out.write(label)
    out.flush()
    raw = in_.readline().rstrip("\n")
    return raw or default


def _parse_file_fn(target: str) -> tuple[str, str]:
    if "::" not in target:
        raise ValueError(
            f"invalid target {target!r}: expected FILE::FN (e.g. app.py::my_fn)"
        )
    file_part, _, fn_part = target.partition("::")
    if not file_part or not fn_part:
        raise ValueError(f"invalid target {target!r}: both FILE and FN required")
    return file_part, fn_part


def _load_module_from_file(path: Path):
    if not path.exists():
        raise FileNotFoundError(f"{path} does not exist")
    # Unique module name so repeated runs in the same process don't collide.
    mod_name = f"_bitsage_cli_{abs(hash(str(path.resolve())))}"
    spec = importlib.util.spec_from_file_location(mod_name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load module from {path}")
    module = importlib.util.module_from_spec(spec)
    # Register in sys.modules so the decorated Function's inspect.getsource
    # call in Day 1 keeps finding its own source.
    sys.modules[mod_name] = module
    spec.loader.exec_module(module)
    return module


def _parse_inputs(raw: Optional[str]) -> tuple[list[Any], dict[str, Any]]:
    """Parse ``--inputs-json`` into ``(args, kwargs)``.

    Accepted shapes:
      - ``None`` / missing           → ``([], {})``
      - ``[1, 2, 3]``                → ``([1, 2, 3], {})``
      - ``{"iters": 100}``           → ``([], {"iters": 100})``
      - ``{"args": [...], "kwargs": {...}}`` → explicit envelope
    """
    if raw is None:
        return [], {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"--inputs-json is not valid JSON: {exc}") from exc

    if isinstance(parsed, list):
        return parsed, {}
    if isinstance(parsed, dict):
        if set(parsed.keys()) <= {"args", "kwargs"} and (
            "args" in parsed or "kwargs" in parsed
        ):
            # Use explicit ``in`` checks — `parsed.get(k) or default` would
            # mask a caller-supplied ``[]`` or ``{}`` by treating them as
            # missing, which defeats the type validation below.
            a = parsed["args"] if "args" in parsed else []
            k = parsed["kwargs"] if "kwargs" in parsed else {}
            if not isinstance(a, list):
                raise ValueError("inputs.args must be a list")
            if not isinstance(k, dict):
                raise ValueError("inputs.kwargs must be a dict")
            return a, k
        # Plain dict → treat as kwargs.
        return [], parsed
    raise ValueError(
        "--inputs-json must be a list, a dict, or {args: [...], kwargs: {...}}"
    )


# ─── Entry point ──────────────────────────────────────────────────────


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="bitsage",
        description="BitSage SDK CLI — verifiable serverless compute on Starknet.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("version", help="Print the SDK version.")
    sub.add_parser(
        "whoami",
        help="Show the configured API URL + redacted key, if any.",
    )

    setup = sub.add_parser(
        "setup",
        help="Store an API key + URL in ~/.bitsage/credentials.",
    )
    setup.add_argument("--api-key", help="Skip the prompt and set the key directly.")
    setup.add_argument("--api-url", help="Override the default API URL.")

    run = sub.add_parser(
        "run",
        help="Invoke a decorated function remotely (ephemeral).",
        description=(
            "Load a Python file, look up the named bitsage.Function, "
            "and invoke it via .remote(). Mirrors `modal run FILE::FN`."
        ),
    )
    run.add_argument(
        "target",
        help="Target in FILE::FN form, e.g. `examples/monte_carlo.py::monte_carlo`",
    )
    run.add_argument(
        "--inputs-json",
        help='JSON inputs: a list (args), a dict (kwargs), or {"args": [...], "kwargs": {...}}.',
    )

    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    dispatch = {
        "version": cmd_version,
        "whoami": cmd_whoami,
        "setup": cmd_setup,
        "run": cmd_run,
    }
    handler = dispatch[args.command]
    # Signatures are uniform via kwargs; only pass what each accepts.
    sig = inspect.signature(handler)
    kwargs: dict[str, Any] = {}
    if "out" in sig.parameters:
        kwargs["out"] = sys.stdout
    if "err" in sig.parameters:
        kwargs["err"] = sys.stderr
    if "in_" in sig.parameters:
        kwargs["in_"] = sys.stdin
    return handler(args, **kwargs)


if __name__ == "__main__":  # pragma: no cover - module entry
    raise SystemExit(main())
