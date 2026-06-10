# Powertrain balance plan (June 2026)

> Branch: `balance/fuel-ai-and-powertrains` (worktree `.worktrees/balance-fixes`)  
> Status: **implemented on branch, pending merge with main + re-benchmark**  
> Last dry sweep: before main merge — re-run after `cab21bd` (Frenet 2D dynamics).

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

Compare to table above; note Frenet/dynamics changes may shift lap times and stint lengths.
