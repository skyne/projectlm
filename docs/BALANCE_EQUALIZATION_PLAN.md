# Performance Equalization Plan

> Based on endurance benchmarks (June 2026):
> - **Exotic Hypercar grid** (23 cars) — `tmp/benchmark/latest_summary.json`
> - **Stock multiclass grid** (68 cars: 23 Hypercar / 20 LMP2 / 25 LMGT3) — `tmp/benchmark/stock_lemans_summary.json`
>
> Status: **plan only** — not yet implemented.

---

## Executive summary

Two benchmark passes exposed a split problem:

| Layer | Status | Evidence |
|-------|--------|----------|
| **Pace BoP (lap time)** | ✅ Mostly correct | Hypercar 4:06.9 → LMP2 4:24.6 (+7.2%) → LMGT3 4:47.3 (+16.4%) on La Sarthe |
| **Endurance viability (stint / fuel / AI)** | ❌ Broken | 72% of stock grid DNF at 24h Le Mans; **100% of DNFs = “Out of fuel”** |
| **Multiclass ordering** | ✅ Correct when cars finish | LMP2 leader P7 overall; LMGT3 leader P13 — proper class ladder |
| **Exotic powertrain spread** | ⚠️ Premature to tune | Full EV invalid; H₂ FC/ICE need work *after* multiclass stint fix |

**Priority:** fix **multiclass stint viability** (especially LMP2) before exotic Hypercar powertrain nerfs/buffs.

---

## Design goals

### Global (24h Le Mans, AI pit strategy)

| Metric | Target |
|--------|--------|
| Retirements from “Out of fuel” | **≈ 0** under AI |
| Retirements from engine wear | **≤ 1–2 cars** per race |
| Grid still running at chequered flag | **≥ 85%** of entries |

### Per-class (stock grid, 24h Le Mans)

| Class | Finish rate target | Leader laps (24h LM) | Best-lap vs Hypercar | Pit stops (24h) |
|-------|-------------------|----------------------|----------------------|-----------------|
| **Hypercar** | **≥ 85%** (≥ 20/23) | 235–250 | — (4:06–4:10) | 45–55 |
| **LMP2** | **≥ 90%** (≥ 18/20) | 215–235 | **+6–8%** (~4:22–4:28) | 45–55 |
| **LMGT3** | **≥ 85%** (≥ 21/25) | 190–210 | **+14–18%** (~4:42–4:52) | 50–60 |

### Hypercar powertrain (exotic grid, after multiclass gate)

| Metric | Target |
|--------|--------|
| Finish rate (all powertrain families) | **≥ 90%** |
| Total laps spread (among finishers) | **≤ 12%** (best vs worst finisher) |
| H₂ FC vs H₂ ICE lap gap | **5–12%** (FC ahead on distance) |
| Full EV | excluded until battery SOC is real |

Powertrains should still feel different: H₂ FC = range/reliability, H₂ ICE = pace cost, diesel = torque/stint length, REX = economy/slow.

---

## Benchmark observations (stock grid)

**Setup:** 3× identical 24h Le Mans runs, `configs/entries.txt`, `configs/drivers/lemans2026_drivers.txt`, AI pit strategy. Sim is deterministic (all three runs matched).

### Pace hierarchy — keep as-is

| Class | Best lap | Δ vs Hypercar | Δ vs class below |
|-------|----------|---------------|------------------|
| Hypercar | **4:06.9** | — | — |
| LMP2 | **4:24.6** | +7.2% | — |
| LMGT3 | **4:47.3** | +16.4% | +8.6% vs LMP2 |

Class power caps (680 / 460 / 520 hp) and aero modifiers in `configs/class_rules.txt` produce realistic lap-time steps. **Do not rework pace BoP** until stint viability is fixed.

### Distance hierarchy (class leaders, when finishing)

| Class | Leader | Laps | Pits | Overall pos |
|-------|--------|------|------|-------------|
| Hypercar | Ferrari #50 | 245 | 49 | P1 |
| LMP2 | Algarve #25 | 230 | 50 | P7 |
| LMGT3 | Team WRT BMW #32 | 202 | 56 | P13 |

LMP2 ~6% fewer laps than Hypercar; GT3 ~18% fewer — reasonable for pace + pit cadence.

### Endurance — broken

| Class | Finish rate (observed) | Avg laps (all entries) | DNF reason | Typical DNF profile |
|-------|------------------------|------------------------|------------|---------------------|
| Hypercar | **48%** (11/23) | 138 | Out of fuel (12) | ~51 laps, ~12 pits |
| LMP2 | **5%** (1/20) | 18 | Out of fuel (19) | **~7 laps, ~2 pits** |
| LMGT3 | **28%** (7/25) | 94 | Out of fuel (18) | ~53 laps, ~14 pits |

**Only 19/68 cars** were still running at the chequered flag.

Key insight: **LMP2 is inverted vs reality.** In WEC, LMP2 is the reliable backbone; in sim it dies before completing a single proper stint. GT3 out-survives LMP2 despite being slower — likely due to tank size (`StandardTank` 100 L on Oreca vs GT3 `120 L` AI fallback) and class AI profile differences.

Likely root causes (investigate during implementation):

1. **`lap < 2` pit lock** — cars burn fuel on laps 1–2 but cannot pit; LMP2 may empty tank before first legal stop on a 13.6 km lap.
2. **AI `CLASS_PROFILES`** — Hypercar/LMP2/LMGT3 share similar `fuelLowFraction` (0.27–0.30) but very different burn rates and tank sizes.
3. **Tank catalog mismatch** — Oreca uses `StandardTank` (100 L); real LMP2 stints at Le Mans are ~50 L / ~11 laps; sim burn may be miscalibrated for Gibson NA V8 at 460 hp BoP.
4. **No engine/crash DNFs** — the entire reliability problem is fuel scheduling, not mechanical failure.

---

## Benchmark observations (exotic Hypercar grid)

See prior exotic pass (`tmp/benchmark/latest_summary.json`):

- **Full EV:** wins every race by 15–40% lap count; `fuelRemaining` unused — **invalid, exclude from BoP**.
- **H₂ FC:** 100% finish, 263–275 laps LM, ~40–51 pits, no engine wear — slightly OP on distance.
- **H₂ ICE:** 50% finish at LM; V12 NA dies at lap 4; rotary outlier survives.
- **Gas REX:** 25% finish; dies ~lap 7 at LM.
- **Stock Hypercar (in exotic grid):** 69% finish at LM; strong at Spa/Ricard.

Exotic tuning **depends on multiclass stint fix** — many Hypercar “Out of fuel” DNFs share the same AI/tank root cause as stock.

---

## Phase 0 — Invalid / blocked configs

### 0a — Full EV (prerequisite for EV balance)

**Observed:** wins every race; battery does not gate endurance.

1. Tie Full EV to **battery SOC** (`batteryChargeMJ`), not `fuelRemaining`.
2. **Pit recharge only** (plug/swap fiction) with +15 s stop penalty.
3. Cap deploy to BoP (~680 hp equivalent).
4. Re-benchmark solo before grid inclusion.

### 0b — Multiclass stint viability (**highest priority**)

**Observed:** LMP2 5% finish; 100% fuel DNFs across classes.

**Plan:**

| Knob | Hypercar | LMP2 | LMGT3 | Rationale |
|------|----------|------|-------|-----------|
| AI `fuelLowFraction` | 0.28 → **0.30** | 0.27 → **0.34** | 0.30 → **0.32** | LMP2 pits earlier; avoid lap-6–8 empty tank |
| AI `fuelCriticalFraction` | 0.12 → **0.14** | 0.11 → **0.16** | 0.13 → **0.15** | Emergency stop before zero |
| AI `targetStintSeconds` | 2700 | 3000 → **2700** | 2100 → **2400** | Align with real ~45 min stints |
| Min pit lap rule | keep `lap ≥ 2` | **allow lap-1 stop if fuel ≤ critical** | same as LMP2 | Fix pre-first-stop DNFs |
| Tank catalog | verify `LeMans90L`/`110L` | **add `LMP2LeMans75L` or bump StandardTank → 110 L** | verify GT3 tank in catalog | Oreca 100 L may be wrong effective capacity after burn |
| Fuel burn audit | Gibson vs LMP2 BoP | **measure L/100 km at 4:25 lap** | GT3 at 4:47 | Ensure one stint ≥ 6 La Sarthe laps |

**Success metric (stock grid, 24h LM):**

- [ ] LMP2 finish **≥ 18/20**
- [ ] Hypercar finish **≥ 20/23**
- [ ] LMGT3 finish **≥ 21/25**
- [ ] Zero “Out of fuel” DNFs
- [ ] Pace ladder unchanged within **±1%** (4:06 / 4:24 / 4:47 band)

---

## Phase 1 — Separate “BoP pace” from “endurance viability”

Real WEC BoP equalizes **lap time and stint length**, not identical reliability. The sim currently conflates:

- **Pace** (power cap, aero, weight) — ✅ validated on stock grid
- **Stint length** (tank × burn × AI thresholds) — ❌ primary failure mode
- **Reliability** (vibration + thermal wear) — secondary; not causing stock DNFs
- **Pit economics** (stop count, repair necessity) — Hypercar exotics only, so far

```
Effective stint distance = tank × (1/burn) × AI pit thresholds × uptime
Race distance           = stint distance × pit count efficiency
```

**Rule:** never adjust power caps to fix fuel DNFs — fix tanks, burn, and AI.

---

## Phase 2 — Hypercar powertrain targets (exotic grid, after Phase 0b)

Use stock Hypercar finisher band as anchor: **~235–245 laps / 24h LM**. Exotic targets ±8% of that.

### H₂ fuel cell (strong, slightly OP on distance)

**Observed:** 100% finish, 263–275 laps (24h LM), 39–51 pits, engine health flat.

| Knob | Target | Rationale |
|------|--------|-----------|
| H₂ burn coeff (FC) | **+8–12%** | Close gap to ICE; keep ~25% range advantage |
| Stack mass | **+5 kg / 100 kW** | Minor pace cost |
| FC pit service time | **+3–5 s** | Reflect slower H₂ fill |
| Buffer burst cap | **~120 kW** | Less spike vs ICE hybrid |

**Success:** 230–250 laps, 2–8% ahead of best stock Hypercar (not 15%+).

### H₂ ICE (worst Hypercar reliability at LM)

**Observed:** 50% finish; V12 NA 4 laps / 0 pits; Combustion Ref 57 laps.

| Knob | Change |
|------|--------|
| `HydrogenTank.capacity` | **75 → 90 L** |
| H₂ ICE `fuelBurnMult` | **1.35 → 1.22–1.25** |
| H₂ ICE `stressMult` | **1.02 → 0.98** |
| High-rev layouts (V12, I4 quad) | vibration cap / `base_vibration` floor |
| AI H₂ `fuelLowFraction` | **0.32** (Hypercar override) |

**Success:** all H₂ ICE finish 24h LM, **210–245 laps**, **45–65 pits**.

### Gasoline stock Hypercar

**Observed (stock grid):** 48% finish; survivors at 217–245 laps, ~50 pits; DNFs ~51 laps.

After Phase 0b, re-evaluate. Remaining levers if needed:

- Conserve mode at **85%** engine health
- Gentler Hypercar thermal wear on long straights
- Valkyrie (no hybrid): **+5 L fuel** or **−3% burn** waiver

**Success:** **≥ 20/23 finish**, laps **225–250**.

### Diesel / REX / exotics

Unchanged from prior analysis — tune only after Phase 0b + H₂ pass:

- **Diesel:** −5% burn, accept 2–4% slower lap, target 220–235 laps
- **Gas REX:** fix generator fuel path (25% finish, lap-7 DNFs)
- **Gas exotics (EBoost):** −8% stress or +5% serviceability; cap aspiration stacking

---

## Phase 3 — Unified equalization envelope

### Multiclass (pace — validated, maintain)

| Class | Power cap | Best lap target (LM) | Overall order |
|-------|-----------|----------------------|---------------|
| Hypercar | 680 hp | ~4:07 | P1–P12 |
| LMP2 | 460 hp | ~4:25 (+7%) | P6–P15 (class leader ~P7) |
| LMGT3 | 520 hp | ~4:47 (+16%) | P13+ (class leader ~P13) |

### Hypercar powertrain modifiers (after 0b)

| Family | Stint length | Pace | Reliability | Pit time |
|--------|--------------|------|-------------|----------|
| Gas ICE + HV | baseline | baseline | baseline | baseline |
| H₂ ICE + HV | −5% vs gas | same BoP | −5% wear | same |
| H₂ FC | +25% vs H₂ ICE | −1% lap | no engine wear | +5 s |
| Diesel | +10% vs gas | −3% lap | +5% wear tolerance | same |
| REX | +15% vs gas | −4% lap | generator-limited | +8 s |
| Full EV | pack-limited | same BoP | n/a | +15 s swap |

---

## Phase 4 — Validation protocol

### Gate 1 — Stock multiclass (run after every stint/AI change)

```bash
ENTRIES_PATH=configs/entries.txt TRACKS=lemans DURATION_HOURS=24 RUNS=3 TIME_SCALE=600 \
  node tools/benchmark/run_endurance.mjs
```

Output: `tmp/benchmark/stock_lemans_summary.json`

**Gate 1 checklist:**

- [ ] LMP2 finish ≥ 90%
- [ ] Hypercar finish ≥ 85%
- [ ] LMGT3 finish ≥ 85%
- [ ] Zero “Out of fuel” DNFs
- [ ] Best laps: Hypercar ~4:07, LMP2 ~4:25 (±1%), LMGT3 ~4:47 (±1%)
- [ ] LMP2 leader overall P5–P10; LMGT3 leader overall P12–P18

### Gate 2 — Exotic Hypercar (after Gate 1 passes)

```bash
ENTRIES_PATH=configs/entries/exotic_benchmark.txt TRACKS=lemans,spa,ricard DURATION_HOURS=24 \
  node tools/benchmark/run_endurance.mjs
```

Output: `tmp/benchmark/latest_summary.json`

**Gate 2 checklist:**

- [ ] All powertrain families ≥ 90% finish (excl. Full EV)
- [ ] H₂ FC vs H₂ ICE distance gap 5–12%
- [ ] Lap count σ among finishers < 8% of mean
- [ ] Full EV excluded or SOC-fixed

### Gate 3 — Solo isolation (debug)

6h solo, one car per class/powertrain — isolates tank/burn from traffic.

---

## Phase 5 — Implementation order (revised)

1. **Phase 0b — Multiclass stint viability** (LMP2 tank/burn/AI — blocking)
2. **Phase 0b — Hypercar + GT3 fuel AI** (same root cause as stock DNFs)
3. Re-run **Gate 1** until stock grid ≥ 85% finish
4. **Phase 0a — Full EV battery depletion** (or keep excluded)
5. **H₂ tank + burn** (exotic ICE)
6. **Gas REX generator path**
7. **Reliability pass** (V12 NA, EBoost, H₂ high-rev)
8. **Fine H₂ FC nerfs** (only after ICE survives)
9. **Valkyrie no-hybrid waiver**
10. **Gate 2** full exotic re-benchmark vs baselines:
    - `tmp/benchmark/stock_lemans_summary.json`
    - `tmp/benchmark/latest_summary.json`

---

## What we should not do

- **Don't** rework power caps / aero modifiers to fix fuel DNFs — pace BoP is already correct
- **Don't** tune exotic Hypercars before stock multiclass passes Gate 1
- **Don't** equalize to identical lap counts across classes or powertrains
- **Don't** buff H₂ ICE peak power to compensate for bad stints
- **Don't** make FC as fast as ICE on lap time
- **Don't** tune 68 individual car files — use `class_rules`, tank catalog, `ai_strategy.ts` profiles
- **Don't** balance using Full EV results until SOC is real

---

## Expected end state

### Stock 24h Le Mans

- **P1–P12:** Hypercar train (Ferrari/Peugeot/Porsche band)
- **P6–P15:** LMP2 mixing with mid-pack Hypercar (class leader ~P7)
- **P13–P25:** LMGT3 train (class leader ~P13)
- **DNFs:** ≤ 10 cars total; rare and not fuel-related

### Exotic Hypercar 24h Le Mans

- **230–250 laps:** H₂ FC, best stock, strong H₂ ICE
- **215–230:** diesel, gas exotics, most stock
- **200–215:** REX variants, no-hybrid V12
- **DNFs:** rare — wear or crash, not lap-4 fuel

---

## Reference data

| Artifact | Grid | Runs |
|----------|------|------|
| `tmp/benchmark/stock_lemans_summary.json` | 68-car stock | 3× LM 24h |
| `tmp/benchmark/latest_summary.json` | 23-car exotic | LM/Spa/Ricard + LM 48h |
| `docs/BALANCE_EQUALIZATION_PLAN.md` | this document | — |
| `tools/benchmark/run_endurance.mjs` | runner (`ENTRIES_PATH`, `RUNS`) | — |
