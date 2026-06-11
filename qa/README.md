# ProjectLM QA Matrix

Automated quality tiers across the three layers: **C++ sim**, **Node server**, and **TypeScript viewer**.

## Test tiers

| Tier | Purpose | Where | CI |
|------|---------|-------|-----|
| **Unit** | Pure logic, fast regression | `tests/unit/`, `server/src/**/*.test.ts`, `viewer/src/**/*.test.ts`, `bindings/node/test/` | Every PR |
| **Integration** | Cross-module / native bridge | `tests/integration/`, `server/test/integration/`, `viewer/test/integration/` | Every PR |
| **Functional** | Live WebSocket flows | `tools/session-player/src/run_ci_suite.ts` | Nightly (`RUN_RECONNECT_E2E=1` for reconnect suite) |
| **Balance** | Parts meta / endurance gates | *Deferred until rebalance worktree merges* | — |

## Local commands

```bash
# All unit + integration (sim, bindings, server, viewer)
./scripts/test-all.sh

# Functional E2E (starts server, runs session-player suite)
bash scripts/ci-e2e.sh

# Viewer Playwright smoke (builds + preview + browser check)
cd viewer && npm run build && npm run test:smoke
```

## C++ sim tags

```bash
make test                                          # full suite
build/bin/projectlm_tests '[unit][weather]'        # weather only
build/bin/projectlm_tests '[integration][golden]'  # lap completion matrix
build/bin/projectlm_tests '[integration][determinism]'
```

## Fixtures

Shared JSON fixtures for cross-layer reducer tests live in [`qa/fixtures/`](fixtures/).

## Known pre-existing issues

- `make test` may segfault in `SimBridge read API lifecycle` (`test_sim_bridge.cpp`) during teardown after other cases pass — investigate separately.
- `test_paul_ricard_pace.cpp` is not wired into the Makefile until the rebalance worktree merges (BoP gap assertion fails today).
- Viewer `npm run build` has unrelated TS errors in `EventLog.ts` / `carStatus.ts`; CI runs `npm test` (tsx) without requiring `tsc` build.

## Phase D (balance) — pending

After the rebalance worktree merges, add:

- `tools/benchmark/assert_setup_balance.mjs` (dominant-meta gate)
- `tools/benchmark/assert_endurance_gate.mjs` (Gate 1/2 from `docs/BALANCE_EQUALIZATION_PLAN.md`)
- PR path-filtered balance job

Until then, agents should still follow `.cursor/rules/parts-setup-balance-check.mdc` manually on catalog changes.
