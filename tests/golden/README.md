# Golden test configs (Phase 8)

Placeholder for extended golden lap matrix with per-track expected lap bands.

Current golden coverage lives in:

- `tests/integration/test_lap_golden.cpp` — La Sarthe single lap
- `tests/integration/test_multi_track_golden.cpp` — sample_circuit, spa, paul_ricard, lemans
- `tests/integration/test_paul_ricard_pace.cpp` — multiclass pace separation (**not in Makefile yet** — enable after rebalance worktree merges; currently fails BoP gap assertion)

Future: add `*.json` race configs here with `expected_lap_seconds` and tolerance per track/class.
