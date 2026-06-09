# BitSage SDK Examples

Three small programs that cover the API surface a Python developer meets
in the first hour.

Each example is self-contained and runnable via `bitsage run FILE::FN`
once you've configured credentials (`bitsage setup`).

| # | Example | Shows |
|---|---|---|
| 01 | `01_hello_world.py` | The smallest possible function. Modal-shaped decorator. |
| 02 | `02_monte_carlo.py` | `Image.pip_install()` DSL, per-second billing, `max_cost_credits` cap. |
| 03 | `03_verifiable_compute.py` | `require_proof=True` — the feature Modal and FAL cannot match. |
| 04 | `04_parallel_map.py` | `.map()` fan-out over 100 parallel invocations. Modal's canonical throughput demo. |

## Setup

```shell
pip install obelyzk
bitsage setup                  # prompts for API key + URL
bitsage whoami                 # confirm auth
```

## Running

```shell
# Hello World — cpu_standard, no inputs
bitsage run examples/01_hello_world.py::hello

# Monte Carlo — pass inputs as JSON
bitsage run examples/02_monte_carlo.py::monte_carlo \
    --inputs-json '{"iters": 100000}'

# Verifiable Compute — the moat demo
bitsage run examples/03_verifiable_compute.py::compute_with_proof \
    --inputs-json '{"x": 42}'
```

## Porting from Modal

The decorator surface is designed so Modal tutorials port across with a
find-replace:

| Modal | BitSage |
|---|---|
| `import modal` | `import bitsage` |
| `modal.App("x")` | `bitsage.App("x")` |
| `@app.function(gpu="H100")` | `@app.function(tier="gpu_h100")` |
| `@app.function(image=...)` | `@app.function(image=...)` |
| `modal.Image.debian_slim()` | `bitsage.Image.debian_slim()` |
| `.pip_install(...)` / `.apt_install(...)` | same |
| `f.remote(x)` / `f.local(x)` | same |
| `modal run file.py::fn` | `bitsage run file.py::fn` |

### What Modal has that BitSage doesn't (yet)

- `.spawn()` — durable fire-and-forget (needs coordinator-side non-blocking submit; Phase 1 Week 3)
- `@modal.cls()` with `@modal.enter`/`@modal.exit` lifecycle hooks — Phase 2
- Volumes, Secrets, Scheduled jobs — Phase 2
- Memory Snapshots for sub-second cold-start — Phase 6

### What BitSage has at parity with Modal today (SDK 0.3)

- `@app.function()` decorator with `tier`, `gpu`, `timeout`, `retries`, image chain
- `.remote()`, `.local()`, `.map()`, `.starmap()`, `.for_each()` — parallel fan-out
- `Image.debian_slim().pip_install().apt_install().run_commands().env()` — layered build DSL
- CLI: `bitsage setup`, `bitsage run FILE::FN`, `bitsage whoami`, `bitsage version`
- Per-second billing with `max_cost_credits` cap
- HTTP error hierarchy: `BadRequestError / CostCapExceededError / HandlerTimeoutError / ...`

### What BitSage has that Modal can't

- `require_proof=True` — every invocation returns a cryptographic receipt
- `result.proof.verify()` — re-run verification on-chain at any time
- TEE attestation on H100-CC tiers — Phase 3
- Decentralized supply (eventually) — no single-cloud lock-in
