# Powertrain balance plan (June 2026)

> Branch: `balance/fuel-ai-and-powertrains` (worktree `.worktrees/balance-fixes`)  
> Status: **implemented on branch; main sim WIP synced; post-sync re-benchmark done**  
> Last dry sweep: Frenet corridor dynamics (main checkout, June 2026) — Spa quali ~8 s faster vs prior branch sim.

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
- `tools/benchmark/diag_race.mjs` — per-lap fuel/wear trace + pit log.
- `tools/benchmark/diag_pace_delta.mjs` — quali vs race pace breakdown (stint position, wear, fuel).
- `tools/benchmark/garage_compile_sweep.mts`.

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

### Post–main-sim-sync sweep (`TRIM=quick`, 6h, June 2026)

Synced uncommitted Frenet/path-dynamics WIP from main checkout. **Spa quali sanity (Gas-ICE-HV benchmark): 2:07.2 → 1:59.5 (−7.7 s)** — driven by sim code, not `spa.json`.

| Family | Spa quali | Spa laps | Spa stint | LM quali | LM laps | LM stint |
|--------|-----------|----------|-----------|----------|---------|----------|
| H2-FC | 1:59.2 | 152 | 19.3 tyre | 3:25.7 | 81 | 9.1 tyre |
| REX | 1:56.6 | 99 | 1.9 fuel | 3:23.2 | 52 | 1.0 fuel |
| Gas-ICE-HV | 2:01.0 | 153 | 26.8 fuel | 3:32.1 | 85 | 12.8 tyre |
| Rotary-Gas | 2:06.8 | 154 | 65.0 tyre | 3:38.9 | 87 | 32.0 tyre |
| H2-ICE | 2:05.0 | 149 | 31.5 fuel | 3:38.3 | 83 | 15.0 fuel |
| Rotary-H2 | 2:07.1 | 151 | 54.0 fuel | 3:36.6 | 88 | 27.0 tyre |
| Gas-ICE | 2:01.7 | 152 | 26.8 fuel | 3:34.8 | 82 | 12.5 tyre |
| Diesel | 2:08.0 | 143 | 34.8 fuel | 3:52.8 | 80 | 20.3 tyre |
| BEV | 2:03.5 | 114 | 4.7 fuel | 3:40.9 | 54 | 1.8 fuel |

**Takeaways:** Spa quali now near WEC pole band (~1:59.5). LM quali unchanged (~3:32 Gas-ICE-HV). **REX/BEV LM race pace broken** (6+ min avg lap, ~1-lap stints) — pit AI / fuel-window regression to investigate. H2-FC 1 Spa retirement. Gas-ICE-HV LM stint length still realistic.

Real-world check (2025): LM Hypercar **12–13 lap fuel stints** (~45 min), tyres **double/triple** (sometimes quad); Spa **~25 laps** per stint, 150 laps / 6h.

---

## Pace tuning (new workstream — separate from relative balance)

**Goal:** Lap times feel like WEC Hypercar. Stint *length* is already calibrated via `fuel_burn_coeff`; this pass tunes *seconds per lap* without breaking stint math.

### Reference car

`Gas-ICE-HV` — `LMHInHouse` + `HypercarHV` + V8 gas, same trim as sweep best build:

`tmp/sweep/pt_Gas-ICE-HV_WinglessGroundEffect_DoubleDeckerDiffuser_StraightLowRestriction.txt`

Diagnostic: `node tools/benchmark/diag_pace_delta.mjs` (quali vs race breakdown).

### Real-world targets (dry, 2024–25 WEC Hypercar)

| Metric | Spa | Le Mans |
|--------|-----|---------|
| Pole quali | ~1:59.5 | ~3:27.7 |
| Clean race lap (early stint) | ~2:02–2:06 | ~3:33–3:40 |
| Quali → race delta | +3–7 s | +6–12 s |
| 6h lap count (gas HV) | ~150 | ~82–88 |

### Sim reference targets (post-tuning)

| Metric | Spa target | LM target |
|--------|------------|-----------|
| Quali (Gas-ICE-HV) | ≤2:01.0 (±1.5 s pole) | ≤3:29.5 (±2 s pole) |
| Clean race lap | ≤2:08 (+≤8 s quali) | ≤3:40 (+≤12 s quali) |
| 6h laps (Gas-ICE-HV) | 148–152 | 81–85 |
| Stint length | ~25–27 laps | ~12–13 laps |

### Safe pace levers (do not use `fuel_burn_coeff` — that is stint-length only)

| Lever | Location | Notes |
|-------|----------|-------|
| `drag_modifier` / `aero_balance_modifier` | `configs/class_rules.txt` Hypercar | Global class pace; **0.85 / 1.05** (drag-only trim slowed LM quali in testing) |
| `hybrid.*.regen_rate` / `stint_budget_mj` | `configs/part_catalog.txt` | Quali→race delta for HV; regen **0.65** applied |
| Grip / drag globals | `configs/physics_config.txt` | Tyre mu, body drag baseline |
| Frenet corridor | `use_frenet_dynamics`, `heading_restore_gain`, `max_heading_error_rad` | Post-merge slowdown source |
| Driver model | `driver_config` aggression / consistency | Race-only delta |
| Track calibration | track JSON length / sector speeds | Last resort |

### Archetype spread (after anchor — intentional tech variance)

| Archetype | Acceptable quali offset | Identity tradeoff |
|-----------|---------------------------|-------------------|
| Gas-ICE-HV | reference | Balanced benchmark |
| Gas-ICE | −2 s quali | Longer stint / simpler pits |
| Diesel | −4 s quali | Fuel economy / tyre life |
| H2-FC / REX | ±1 s quali | Stint length + pit time, not raw pace |
| BEV | −5 s quali | Sprint bursts, structural endurance gap |

### Work order

1. **Pace anchor** — tune reference car to targets above (Spa + LM).
2. **Anti-gaming layer** — BoP on kW fields + archetype clamps (below).
3. **Archetype balance** — per-family levers (planned table).
4. **Re-sweep** — check both relative ranking and absolute clock.

### Pace diagnostic findings (Gas-ICE-HV, 2026-06-10)

Tool: `node tools/benchmark/diag_pace_delta.mjs` (+ `TRACK=spa`). Logs: `tmp/benchmark/pace_diag_*.log`.

| Metric | Spa | Le Mans |
|--------|-----|---------|
| Quali best | 2:07.8 (+8 s vs pole) | 3:32.4 (+5 s vs pole) |
| Race best lap | 2:10.5 (+2.7 s) | 3:45.0 (+12.6 s) |
| Sweep avg (L3+, all laps) | 2:23.5 (+16 s) | 4:19.4 (+47 s) |
| **Clean avg** (excl. pit in/out) | **2:21.0 (+13 s)** | **3:51.0 (+19 s)** |
| Mid-stint avg (L2–4) | 2:20.7 (+13 s) | 4:03.5 (+31 s) |
| Late-stint avg (L5+) | 2:20.9 (+13 s) | 4:02.2 (+30 s) |

**Interpretation:**

1. **Spa race pace is believable** — sustained +13 s vs quali matches real WEC quali→race delta. Global pace tuning mainly needs ~5–8 s quali trim.
2. **Le Mans has a track-specific race-pace gap** — best race lap is only +13 s (good), but *sustained* laps cluster at **4:02 (+30 s)**. This is not just pit-lap pollution (only 6 out-laps avg 7:49), though the sweep’s `race_lap_sec` metric mixes in-laps/out-laps and inflates the headline +47 s.
3. **Tyre wear and fuel load are minor** at LM — clean laps show similar pace at 0–25% and 25–50% wear; fuel >70% vs <35% differs <4 s.
4. **Push-mode isolation test** (`FORCE_DRIVER=push`): **no change** — pit-bot already commands push when `engineHealth > 92%`. Conserve mode is not the main LM gap.

5. **Hybrid deploy depletion (root cause)** — 14-lap LM trace (no pit-bot, forced push): every lap ends with `hybridDeployMJ ≈ 0`; sustained race pace ~**3:51** (+19 s vs quali). Quali tow refuel calls `restoreFullStintEnergy()` → full `stint_budget_mj=4.5` every flying lap. Race must regen from braking only (`regen_rate` was 0.50).

**Applied (2026-06-10):**
- `hybrid.HypercarHV.regen_rate` **0.50 → 0.65** — modest race sustain improvement without touching quali trim.
- `run_powertrain_sweep.mjs` — exclude pit-phase laps from `race_lap_sec` average.
- `diag_pace_delta.mjs` — `FORCE_DRIVER=push` for isolation tests.
- **Hybrid quali/race parity (Option A):** `restoreOpenSessionFuelOnly()` — practice/quali tow refills fuel (+ fresh tyres), preserves `hybridDeployRemainingMJ`. Race pit stops still reset hybrid via `pit_stop.cpp`. Unit test: `Practice tow refuel preserves hybrid deploy budget and resets tyres`.

**Post-implementation note:** 15 min quali benchmark rarely triggers fuel tow (0 tows), so quali best lap unchanged. Tow parity matters for long practice / multi-run quali.

**Quali vs race lap-gap analysis (2026-06-10):**

Tool: `node tools/benchmark/diag_lap_gap.mjs`

| Cause | Δ lap time | Fix |
|-------|-----------|-----|
| Grid standing start (0 m/s) vs garage release (12 m/s) | ~15 s L3 | `kRollingStartSpeedMs=12` in `placeOnGrid` |
| Quali auto setup pit (fresh softs L2+) vs race green-flag tyres | ~8 s | Realistic — compare race stint L2+ not L3 |
| Tyre wear 25%+ (`tire_wear_effect` × `Soft.wear_rate`) | ~5–8 s | `tire_wear_effect` 0.50→0.40, Soft `wear_rate` 0.08→0.065 |
| Fuel load mass | ~0 s | Not modeled dynamically |

**Pit-bot race pace (2026-06-10):**
- `ENGINE_CONSERVE_HEALTH` **92 → 80** — conserve/balanced hybrid only when engine ≤ 80%.
- Default dry-slick driver mode **push** (was implicit only without stint plan).
- Hypercar **hybrid_strategy=deploy** on dry race + quali when health > 80%.

**Drag trim experiment (reverted):** lowering `drag_modifier` (0.85 → 0.80) sped up Spa quali slightly but **slowed** LM quali (~3:32 → ~3:36). Global class BoP drag is not a clean knob for both tracks — need physics/Frenet or per-track calibration next.

**Pace tuning split:**

| Layer | Scope | Action |
|-------|-------|--------|
| Hybrid quali/race parity | Hypercar HV | Regen bumped; consider regen floor at lap start or limit quali tow to fuel-only |
| Global quali trim | Spa + LM | `tire_friction` / Frenet corridor / track JSON — not `drag_modifier` alone |
| LM race sustain | Le Mans | Mid-stint still ~4:02 (+30 s); pit in/out laps pollute averages |
| Metric hygiene | Benchmark tooling | Done — pit-phase laps excluded from sweep `race_lap_sec` |

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
