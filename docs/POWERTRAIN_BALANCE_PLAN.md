# Powertrain balance plan (June 2026)

> Branch: `balance/fuel-ai-and-powertrains` (worktree `.worktrees/balance-fixes`)  
> Status: **implemented on branch; main merged (`cab21bd`); post-merge re-benchmark done**  
> Last dry sweep: post-merge with Frenet 2D dynamics + overtake battle WIP synced from main checkout.

---

## Implemented on this branch

### Pit / fuel AI
- Burn-scaled fuel windows (`FUEL_RESERVE_LAPS_*`, `burnScaledFuelBase`) — track-length independent.
- Fuel-aware pit deferral under SC/FCY (don't defer when fuel critical).
- Hybrid deploy budget refilled at serviced pit stops (C++ + TS).
- Stint-aware tyre planning: per-set wear rate, bundle tyres at fuel stop when set won't cover next fuel stint.

### Simulation fixes
- Speed-cap throttle decay (less fuel burn under SC/FCY).
- Global fuel scale: `fuel_burn_coeff` 0.0135 → 0.0045 (+ matching FC/REX generator coeffs).
- BEV regen: credit `batteryChargeMJ` from braking; enable regen scale for battery-primary EVs.
- REX generator burn coefficient fix; REX `throttleMult` 1.12 → 1.04.
- H2-ICE tank/burn, Diesel/H2-FC trait tweaks, BEV/REX pack sizes (see `part_catalog.txt`).

### Benchmark tooling
- `tools/benchmark/run_powertrain_sweep.mjs` — `TRIM=quick`, deterministic dry (`weather_resolved=1`).
- `tools/benchmark/diag_race.mjs`, `tools/benchmark/garage_compile_sweep.mts`.

### Dry sweep baseline (pre–main-merge, `TRIM=quick`, 6h)

| Family | Spa quali | Spa laps | LM quali | LM laps | LM stint |
|--------|-----------|----------|----------|---------|----------|
| REX | 1:56.1 | 160 | 3:27.2 | 88 | 16.2 fuel |
| H2-FC | 1:57.9 | 160 | 3:28.3 | 90 | 32.0 fuel |
| Gas-ICE-HV | 1:57.0 | 155 | 3:31.9 | 83 | 12.5 fuel |
| Rotary-H2 | 2:04.4 | 156 | 3:37.4 | 87 | 35.0 fuel |
| Gas-ICE | 2:00.6 | 152 | 3:34.7 | 82 | 12.7 tyre |
| Diesel | 2:04.5 | 145 | 3:49.3 | 80 | 20.3 tyre |
| BEV | 2:01.7 | 115 | 3:40.5 | 59 | 2.4 fuel |

### Post-merge sweep (`cab21bd` + Frenet dynamics, `TRIM=quick`, 6h)

Frenet corridor dynamics slowed all lap times ~8–10 s (Spa) / ~15–20 s (LM) vs pre-merge. Relative ranking shifted: H2-FC now leads LM (90 laps); REX/H2-FC no longer dominate Spa by 10+ laps.

| Family | Spa quali | Spa laps | Spa stint | LM quali | LM laps | LM stint |
|--------|-----------|----------|-----------|----------|---------|----------|
| H2-FC | 2:05.9 | 153 | 36.7 fuel | 3:31.2 | 90 | 31.5 fuel |
| H2-ICE | 2:05.9 | 151 | 30.0 fuel | 3:39.1 | 85 | 19.3 tyre |
| Rotary-H2 | 2:08.6 | 152 | 67.0 fuel | 3:38.8 | 87 | 35.0 tyre |
| Rotary-Gas | 2:09.5 | 151 | 64.0 tyre | 3:41.0 | 86 | 32.0 fuel |
| REX | 2:04.5 | 152 | 28.2 fuel | 3:31.1 | 87 | 15.8 fuel |
| Gas-ICE-HV | 2:07.1 | 149 | 26.4 tyre | 3:32.4 | 83 | 12.8 tyre |
| Gas-ICE | 2:06.8 | 147 | 26.4 fuel | 3:36.8 | 82 | 12.7 tyre |
| Diesel | 2:12.8 | 141 | 34.8 fuel | 3:52.1 | 80 | 20.7 tyre |
| BEV | 2:09.9 | 106 | 4.7 fuel | 3:43.9 | 61 | 2.3 fuel |

**Takeaways vs pre-merge:** LM fuel stints still realistic (12–13 laps Gas-ICE, ~16 REX, ~32 H2-FC). H2-FC/REX still OP on LM laps but gap narrowed. BEV improved slightly (59→61 LM laps) but remains structurally weak. Diesel still slowest. Zero retirements all families.

Real-world check (2025): LM Hypercar **12–13 lap fuel stints** (~45 min), tyres **double/triple** (sometimes quad); Spa **~25 laps** per stint, 150 laps / 6h.

---

## Planned balance (not yet implemented)

Guiding rule: **every archetype wins something; nobody wins everything.**

| Archetype | Issue | Planned lever |
|-----------|-------|----------------|
| **H2-FC** | Best race + stints | Slow H2 refuel in pit (`pitFuelRateMult` ~2×) — not pace nerf |
| **REX** | OP quali + race | Archetype `genEfficiency` / `deployCapKw`; not slider-only |
| **Diesel** | Slowest quali + laps | Trait mass/throttle buff; trim Rotary fuel economy |
| **Gas-ICE** | Dominated by HV | Reliability + faster non-hybrid pit services |
| **BEV** | 115/59 laps | Battery-swap pit mechanic + pack bump; sprint-class option |

---

## Anti-gaming architecture (implement before balance numbers)

Balance must live in **compile-time archetype identity**, not tunable sliders players can max out.

### Three layers
1. **Identity** — `fuel_type` + `energy_converter` + `drivetrain` → archetype ID (variance).
2. **Tuning** — sliders = tradeoffs *within* archetype (rev ↔ mass, buffer ↔ burst).
3. **Authoritative compile** — server/C++ re-derive sim stats; raw `generator_kw` / `power_target` are inputs, not truth.

### Known bypass vectors today
- REX/H2-FC: **generator size** slider → `generator_kw` 180–400 kW (not power slider).
- BEV: **motor power** slider → `electricalDeployKW`.
- BoP caps `peakHorsepower` only — **not** `electricalDeployKW` / `generatorPowerKW` (sim uses kW).

### Required fixes (order)
1. **Extend `ApplyClassBoP`** — scale `electricalDeployKW`, `generatorPowerKW`, `hybridDeployPowerKW` with power cap.
2. **Archetype clamp table** — per-archetype min/max for `generator_kw`, BEV deploy (e.g. REX 220–320 kW not 400).
3. **Archetype balance table** in `powertrain_traits.cpp` — efficiency, fuel burn, pit fuel rate, serviceability.
4. **Server `validateEngineBuild`** — reject compiled stats outside archetype bands.

### Safe vs unsafe levers

| Safe (identity-locked) | Unsafe (slider-gameable alone) |
|----------------------|--------------------------------|
| `fuelBurnMult` per fuel/drivetrain | Global `fuel_burn_coeff` for one family |
| Pit H2 refuel rate by fuel type | `throttleMult` only while generator uncapped |
| `serviceabilityMult` per archetype | BoP on `peakHorsepower` only for e-drive |
| Catalog pack `energy_mj` (parts choice) | Trusting garage HP for e-drive balance |

---

## Re-benchmark checklist (after main merge)

```bash
cd bindings/node && npm run build
cd server && npm run build && npm run test
make test   # expect 1 pre-existing engine-wear failure
TRIM=quick node tools/benchmark/run_powertrain_sweep.mjs
```

Done 2026-06-10 — see post-merge table above. Raw JSON: `tmp/benchmark/powertrain_sweep/powertrains_*.json`.
