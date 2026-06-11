# ProjectLM — Engineering / Manager Game Roadmap

> **Vision:** Players build cars from modular parts (Lego-style assembly now; custom part designer later), then compete in multiclass endurance races while managing strategy — setup, stints, pit stops, reliability, and class rules — deeper than a typical motorsport manager. **This repo is the simulation core + browser manager (`viewer/`); a separate Unreal Engine game is optional future work (see end of doc).**

This document is the living design plan. Sections marked **🔶 YOUR INPUT** are deliberate decision points — please comment with preferences before we lock implementation.

### ✅ Locked decisions

| Topic | Choice |
|-------|--------|
| **Ship target** | **Browser manager** (`viewer/` + `server/`) — primary dev and play surface |
| **Track authorship** | **C** — shared `track.json` is single source of truth for sim (and any future 3D client) |
| **Track geometry** | Real Catmull-Rom spline; sim progress = arc length |
| **Phase 3 viewer stack** | **TypeScript + Vite** in `viewer/` |
| **Phase 3 viewer scope** | **B** — SVG track, car dots, leaderboard, event log, time-scale, pause/resume |
| **Phase 3 transport** | **Node native binding** → WebSocket in Node only; **no networking in C++ sim** |

---

## Architecture (sim core + browser manager)

```
┌──────────────────────────────────────────────────────────────────┐
│  BROWSER MANAGER (viewer/ + server/) — primary UI               │
│  — garage, Race Hub, pit wall, season/career, multiplayer       │
│  — SVG track map, telemetry, engineer LLM                         │
└───────────────────────────┬──────────────────────────────────────┘
                            │  WebSocket + Node N-API binding
┌───────────────────────────▼──────────────────────────────────────┐
│  PROJECTLM SIM CORE (C++ — this repo)                            │
│  — physics, timing, multiclass rules, wear, fuel, pits           │
│  — car compiler, part catalog logic, AI strategy resolution      │
│  — headless CLI for dev, testing, batch balance runs             │
└──────────────────────────────────────────────────────────────────┘
```

**Division of labour**

| Sim core (C++) | Browser manager (`viewer/`) |
|----------------|----------------------------|
| Tick physics, lap timing, positions | Track map, leaderboard, pit wall UI |
| Part stats, legality, BoP, compilation | Garage builder, car stats panels |
| Pit/stint/strategy resolution | Race Hub, setup sheets, engineer LLM |
| AI opponent logic | Season calendar, HQ, negotiations |
| Deterministic race state | Meta save/load, career progression |

**Principle:** Simulation stays pure, deterministic, and **UI-agnostic** — no `std::cout` in core paths, no rendering assumptions. Manager decisions arrive as **commands**; results leave as **state snapshots + events** consumed by the server/viewer each tick.

*Optional future: a separate Unreal Engine client could link the same C++ core — see [Future / optional — Unreal Engine](#future--optional--unreal-engine-game-ex-phase-9).*

---

## Architecture (sim core — target shape)

```
┌─────────────────────────────────────────────────────────────┐
│  SimBridge API (Phase 3 — `sim_bridge.*`)                   │
│  — Init, Tick, GetSnapshots, DrainEvents, TrackGeometry   │
│  — SubmitCommand deferred to Phase 6 (race management)    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Race Orchestrator (`race.cpp`)                             │
│  — multiclass grid, timing, positions, pit queue, events    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Simulation Core (`simulation.cpp`)                         │
│  — per-tick physics for one car on track                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Car Compiler (`car_parts.cpp` + `PartCatalog`)             │
│  — parts → mass, aero, power, cooling, vibration          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Data Layer (text configs → JSON schemas)                    │
└─────────────────────────────────────────────────────────────┘
```

CLI (`main.cpp`) is a **thin dev harness** over the same `SimBridge` API the Node binding uses.

---

## Phase 1 — Foundation & Workflow *(complete)*

**Goal:** Make the engine usable as a development platform — configurable scenarios, measurable output, multi-car plumbing.

| Deliverable | Status | Files |
|-------------|--------|-------|
| `race_config.txt` + loader | ✅ Done | `race_config.hpp/cpp` |
| CLI overrides (`--laps`, `--config`, `--car`, `--telemetry`) | ✅ Done | `main.cpp` |
| Sector lap splits | ✅ Done | `simulation.*`, `telemetry.*` |
| CSV telemetry export | ✅ Done | `telemetry.*` |
| `RaceEntry` + multi-car tick loop | ✅ Done | `race.hpp/cpp`, `entries.txt` |
| Multi-car mode via `entries=` in race config | ✅ Done | `main.cpp`, `race_config.txt` |
| Spline track + `track.json` | ✅ Done | `track.hpp/cpp`, `tracks/*.json` |
| La Sarthe test circuit | ✅ Done | `tracks/lemans_la_sarthe.json` |
| Compiled car snapshot format | ⏳ Phase 8 | `compiled_car` JSON or key=value |

*Items ahead of schedule (reflected in later phases): tires/fuel (Phase 4), multiclass BoP (Phase 5), `SimBridge` skeleton (Phase 3) — landed during Phase 1 agent work.*

### Phase 1 — no design blockers
These are infrastructure; agents can implement now.

### Phase 1b — 🔶 YOUR INPUT: Telemetry granularity
How much data do you want per lap?

- **A)** Summary only: lap time, sector splits, fuel, engine health
- **B)** + per-sector peak speed / min speed / avg RPM
- **C)** Full time-series (every tick → large files, useful for debugging)

*Default if silent: **B** for race results, **C** optional via `--telemetry-verbose`.*

---

## Phase 2 — Tests & Project Structure *(complete)*

**Goal:** Organize the growing codebase and lock in regression safety before any web/Node work. API consumers (Phase 3 viewer; optional UE client later) should build on a tested, navigable layout.

### Phase 2 overview

| Deliverable | Status | Location |
|-------------|--------|----------|
| `src/` layout (core / sim / config / app) | ✅ Done | see below |
| `configs/` for data files | ✅ Done | `configs/*.txt` |
| `tests/` unit + integration | ✅ Done | Catch2 v3 |
| `projectlm_tests` binary | ✅ Done | `make` → `build/bin/projectlm_tests` |
| La Sarthe lap golden test | ✅ Done | `tests/integration/test_lap_golden.cpp` |
| Multicar integration test | ✅ Done | `tests/integration/test_multicar.cpp` |
| Cross-platform build | ✅ Done | `Makefile` (clang++ on macOS, g++ on Linux) |

### Folder structure

```
projectlm/
  src/
    core/          car_parts, simulation, track, telemetry
    sim/           race, sim_bridge
    config/        config_loader, race_config, class_rules
    app/           main.cpp (CLI harness)
  configs/         part_catalog, physics, car, race, class_rules, entries
  tracks/          *.json circuits
  tests/
    unit/          track, car compile, simulation tick
    integration/   golden lap, multicar session
    helpers/       paths.hpp (PROJECTLM_ROOT)
  third_party/
    catch2/        Catch2 amalgamated
  bindings/        *(Phase 3)* Node N-API
  server/          *(Phase 3)* WS host
  viewer/          *(Phase 3)* Vite app
  docs/
  Makefile         builds build/bin/projectlm + projectlm_tests
```

**Rules**

- New sim code goes under `src/core` or `src/sim`; loaders under `src/config`.
- No test code in `src/`. No networking in `src/`.
- Run tests from repo root: `./projectlm_tests` (or `PROJECTLM_ROOT=/path` if elsewhere).

### Test inventory

| Suite | File | Covers |
|-------|------|--------|
| Unit | `test_track.cpp` | JSON load, lap length, pose, sectors |
| Unit | `test_track_sampler.cpp` | XZ polyline sampling, sector spans |
| Unit | `test_sim_bridge.cpp` | snapshots, events, track geometry API |
| Unit | `test_car_parts.cpp` | `CompileCarArchitecture`, BoP clamp, brakes/trans/hybrid |
| Unit | `test_part_compatibility.cpp` | Assembly rules, attachment point IDs |
| Unit | `test_simulation.cpp` | tick advances state, fuel clamp |
| Integration | `test_lap_golden.cpp` | 1 lap La Sarthe ≈ 294s ±15s |
| Integration | `test_multicar.cpp` | 3-class grid loads and completes |

**Phase 8** extends this with full golden matrix, replay determinism, batch Monte Carlo.

### Milestones

| ID | Deliverable | Status |
|----|-------------|--------|
| **2-1** | `src/` + `configs/` restructure | ✅ |
| **2-2** | Catch2 harness + `projectlm_tests` | ✅ |
| **2-3** | Unit tests (track, car, sim) | ✅ |
| **2-4** | Integration tests (golden lap, multicar) | ✅ |
| **2-5** | `docs/` structure note in roadmap | ✅ |

---

## Phase 3 — API & Web Visualization *(complete)*

**Goal:** Expose the sim through a stable `SimBridge` API and prove it with a browser viewer. Parts expansion → Phase 4. Manager commands → Phase 6.

### Phase 3 overview

| Track | Status | Notes |
|-------|--------|-------|
| **3A — SimBridge API** | ✅ Done | `track_sampler`, `getTrackGeometry()`, `isRaceComplete()` |
| **3B — Node binding + viewer** | ✅ Done | N-API addon, WS server, Vite SVG visualizer (scope B) |

---

### 3A — SimBridge API (C++ only, no networking)

**In scope for Phase 3**

| Method / type | Purpose |
|---------------|---------|
| `initFromRaceConfig(path)` | Load race session |
| `tick(deltaTime)` | Advance simulation |
| `getSnapshots()` | Per-car state incl. spline `position` / `tangent` |
| `drainEvents()` | `SectorCross`, `LapComplete`, `Retirement`, `RaceComplete` |
| `getTrackGeometry()` | Dense XZ polyline + sectors for SVG |
| `isRaceComplete()` | Session end check |
| `track_sampler.hpp/cpp` | Spline sampling helper |

**Explicitly deferred (later phases)**

| Item | Phase | Reason |
|------|-------|--------|
| `submitCommand()` — pit, setup, driver mode | **6** | ✅ Partial — pit, driver mode, setup deltas in dev viewer |
| Pit enter/exit affecting track progress | **6** | ✅ Pit lane + stop time model |
| Save/load `RaceSession` | **8** | Quality / persistence |
| `libprojectlm` static lib packaging | **8** (optional **9**) | Static lib for tooling; UE plugin only if ex-Phase 9 happens |
| JSON schemas for cars / save games | **7 / 8** | Meta save games + tooling |
| Remove all `iostream` from CLI | **8** | Cleanup pass |

---

### 3B — Node binding + Web viewer

**Architecture** — networking stays out of C++:

```
viewer/ (TypeScript + Vite)
    │  WebSocket JSON
server/ (Node.js)
    │  N-API addon
SimBridge (C++) — no sockets, no JSON, no HTTP
```

**Repo layout**

```
bindings/node/     N-API wrapper over SimBridge (read-only Phase 3 API)
server/            WS server + sim tick loop + time-scale / pause
viewer/            Vite + TS — SVG track, car dots, HUD
docs/WS_PROTOCOL.md
```

**Node binding (Phase 3 exports only)**

```typescript
class SimSession {
  initFromRaceConfig(path: string): boolean;
  tick(deltaTime: number): void;
  getSnapshots(): CarSnapshot[];
  drainEvents(): SimEvent[];
  getTrackGeometry(): TrackGeometry;
  isRaceComplete(): boolean;
}
```

No `submitCommand` in Phase 3 binding.

**Wire protocol v1** — `{ "protocol": 1, "type": "...", "payload": {} }`

| Server → client | Client → server (scope B) |
|-----------------|---------------------------|
| `session_init` | `set_time_scale` |
| `track_geometry` | `pause` |
| `tick` | `resume` |
| `events` | |
| `race_complete` | |
| `error` | |

**Deferred to Phase 6 viewer:** `submit_command` (pit requests), `step` (single-tick debug).  
**Deferred to Phase 3 polish / Phase 8:** smooth dot interpolation, click-to-follow car.

**Viewer components (scope B)**

| Component | Shows |
|-----------|-------|
| `SvgTrack.ts` | Spline polyline + sector labels (La Sarthe default) |
| Car dots | `<circle>` per entry, color by `classId` |
| `Leaderboard.ts` | Position, team, lap, speed |
| `EventLog.ts` | Sector cross, lap complete, retirement |
| `PlaybackControls.ts` | Time-scale slider, pause / resume |

**Milestones**

| ID | Deliverable | Status |
|----|-------------|--------|
| **3-0** | `docs/WS_PROTOCOL.md` | ✅ |
| **3-1** | `track_sampler` + `getTrackGeometry()` | ✅ |
| **3-2** | `bindings/node` | ✅ |
| **3-3** | `server/` | ✅ |
| **3-4** | `viewer/` Vite app | ✅ |
| **3-5** | Scope B complete | ✅ |
| **3-6** | Multicar demo | ✅ (`configs/race_config_web.txt`) |

**Build & run**

```bash
make && make test
make native
cd server && npm install && npm run dev      # WS :8765
cd viewer && npm install && npm run dev      # Vite :5173, proxies /ws
```

Web stack defaults to `configs/race_config_web.txt` (3-class grid via `entries.txt`). CLI uses `configs/race_config.txt`.

---

## Phase 4 — Parts & Garage (Lego builder) *(complete)*

**Goal:** Expand the modular part catalog so build choices meaningfully affect endurance outcomes. Sim-side catalog + compilation in this phase; garage UI in `viewer/`; unlock/R&D rules tie into Phase 7 meta.

### Phase 4 overview

| Item | Status |
|------|--------|
| Tires (compound, wear, grip) | ✅ Done early |
| Fuel system (tank capacity, weight) | ✅ Done early |
| Brakes (mass, pressure, fade) | ✅ Done |
| Transmission (ratios, shift delay) | ✅ Done |
| Hybrid / ERS (deploy, regen, battery) | ✅ Done |
| Compatibility matrix (assembly rules) | ✅ Done |
| Attachment point IDs for UE Lego | ✅ Done |

### New part slots (implementation order)

1. **Tires** — compound (soft/med/hard), wear rate, optimal temp window — ✅
2. **Fuel system** — tank capacity (liters), weight when full — ✅
3. **Brakes** — mass, max pressure, fade under heat
4. **Transmission** — gear count, ratios, shift delay
5. **Hybrid / ERS** — deploy power, regen, battery mass, stint deploy budget

Each part: catalog entry in `configs/part_catalog.txt`, enum + struct in `car_parts.hpp`, contribution in `CompileCarArchitecture()`. New stats flow into Phase 3 viewer snapshots automatically (`fuel`, `tireWear` already visible).

### Assembly & compatibility

- **Slot-based model** (current): one chassis, one front aero, one rear aero, one cooling pack, tires, fuel, etc.
- **Compatibility matrix** (next): e.g. ground-effect floor requires wingless rear — extend `permitsWinglessPitch` pattern to a general `part_compatibility.txt` or catalog flags
- **Attachment point IDs**: stable string per slot (`chassis.mount.front_aero`) for Phase 9 UE mesh snapping

*Garage builder UI + live stats panel → `viewer/` (done). 3D part meshes → optional ex-Phase 9. Part designer tool → far future.*

### 🔶 YOUR INPUT: Part unlock model
How do players get parts in the *game* (not sim dev)?

- **A)** All parts available from start (sandbox)
- **B)** Tech tree / R&D unlocks
- **C)** Budget — buy parts per season
- **D)** Hybrid: starter kit + unlocks + budget

### 🔶 YOUR INPUT: Assembly rules
Lego-style implies constraints. Which matter?

- **A)** Slot-based only (one chassis, one front aero, etc.) — *current model*
- **B)** Compatibility matrix (e.g. ground-effect floor requires wingless rear)
- **C)** Physical connectors — parts have attachment points, invalid combos rejected
- **D)** Weight / packaging budget per subsystem

*Recommendation: start **A + B** (cheap to implement, already have `permitsWinglessPitch` precedent).*

### 🔶 YOUR INPUT: Custom part designer (later)
When you add designing parts (not just picking them):

- Stat sliders with tradeoffs (downforce ↔ drag)?
- Geometry/mesh (far future)?
- “Blueprint” cards with fixed stat budgets?

*No implementation until you pick a direction.*

---

## Phase 5 — Multiclass Endurance Race

**Goal:** Multiple cars, multiple classes, one race clock — the core fantasy.

**Already landed (during Phase 1):** `class_rules.txt`, `ApplyClassBoP`, `LoadEntriesFromConfig`, multicar `RaceSession`, viewer will display multiclass grids (Phase 3).

**Still Phase 5**

- Duration-based races (6h / 12h / 24h) instead of lap count only
- Sim-level time compression (viewer slider is Phase 3; sim rules here)
- Procedural AI entries from class templates
- Regulation / BoP change mechanism
- Per-class stint length rules

### Class system (proposed)

```text
class=Hypercar
class=LMGT3
class=LMP2
```

Each `RaceEntry` has `classId`. Classes differ by:
- Part legality lists (which catalog items allowed)
- Performance Balance (BoP): power cap, min/max weight, aero modifiers
- Stint length limits (optional, e.g. LMP2 driver time)

### 🔶 YOUR INPUT: Class definition
- **A)** Config-only (class = tag + BoP numbers in `class_rules.txt`)
- **B)** Class = template car config players inherit and modify
- **C)** Real-world class names (Hypercar, GT3, etc.) with authentic-ish rules
- **D)** Fictional classes you invent

C but let the rules be changed later, well figure out a mechanism for that

### 🔶 YOUR INPUT: AI opponent cars
- **A)** All entries player-designed; AI uses same builder
- **B)** Hand-authored AI cars per class
- **C)** Procedural AI from class templates + random part variance

probably C but dont close out multiplayer options 

### Multiplayer foundation (landed on `main`, Jun 2026)

Parallel track to Phase 5/6 — see [Multiplayer Options Plan](.cursor/plans/multiplayer_options_plan_fd21dc09.plan.md) for full detail.

| Slice | Status | Notes |
|-------|--------|-------|
| **RC-1** Refresh/reconnect | ✅ | `raceActive` in `session_init`, catch-up tick, viewer restores live race |
| **TM-1** Multi-car team manager | ✅ | All fleet cars managed; PitWall; no Drive button |
| **MP-0** Client sessions + identity | ✅ | `join_session`, roles, permissions, viewer join overlay |
| **MP-1** Spectator + roster UI | ✅ | Read-only gating, header roster panel |
| **MP-2** Co-op pit wall | ✅ | Shared `entryIds`, command attribution, `coop-e2e` |
| **MP-3** SQLite + competitive lobby | ⏳ | Not started — required for internet-hosted rooms |

**Agent testing:** `./scripts/session-player.sh` + `.cursor/skills/multiplayer-agent-player/` for human-vs-LLM co-op.

**Next:** MP-3 persistence, then competitive grid/lobby.

### Race format

| Parameter | Proposed default | 🔶 YOUR INPUT |
|-----------|------------------|---------------|
| Race length | 6h / 12h / 24h simulated | Preferred default? |
| Time compression | 1 sim sec = 1 race sec initially | Want accelerated sim (e.g. 60×) for manager? |
| Weather | Dry only → rain in Phase 6 | Static or dynamic weather? |
| Day/night | Cosmetic + grip/temp modifier | Matter for v1 endurance? |
| Safety car | None → later | Important for manager fantasy? |

### Position & timing
- Race distance = class-independent (same track, same lap length)
- Overall position by lap + sector time (tie-break)
- **Class position** displayed separately (multiclass TV overlay style)

---

## Phase 6 — Race Management (Motorsport Manager++)

**Goal:** Player makes decisions during the race; sim responds.

**Status:** 🟡 **In progress** — pit checklist, driver mode, deep suspension/setup, and engineer LLM are in `main`; stint plans and full mechanic skill variance remain.

**Extends Phase 3 stack:** `submitCommand()` added to SimBridge + Node binding; viewer gains pit checklist UI (your choice: granular option B). Phase 3 viewer stays read-only until this phase.

| ID | Deliverable | Status |
|----|-------------|--------|
| **6-1** | `submitCommand()` — pit, driver mode, setup | ✅ |
| **6-2** | Granular pit checklist UI (fuel, tires, repairs, driver swap) | ✅ |
| **6-3** | Deep garage suspension (RH, springs, ARB, dampers, camber/toe, final drive) | ✅ |
| **6-4** | Per-track weekend setup sheet (Race Hub → merged at session start) | ✅ |
| **6-5** | Mid-race setup deltas + live suspension telemetry on pit wall | ✅ |
| **6-6** | Engineer LLM suggestions (skill-gated commands, driver feedback) | ✅ |
| **6-7** | AI grid track setup presets | ✅ |
| **6-8** | Pre-race stint plan UI + strategist integration | ⬜ |
| **6-9** | Mechanic skill → pit duration variance | ⬜ |
| **6-10** | Dynamic weather ↔ setup/strategy coupling in engineer prompts | ⬜ |
| **6-11** | **Setup workbench rework** — UX, diff, hints, driver compromise (see below) | ⬜ |

### Setup workbench rework (6-11)

**Problem today:** Setup is spread across **garage chassis panels** (`CarGarage.ts` — dense sliders), **Pre-Session Briefing** (`PreSessionBriefing.ts` — long slider grid per car), and **pit stop deltas** (`PitStopModal.ts`). No unified visual language. Hard to see **what changed** vs last time. Stat bars exist but don't guide the player toward a good balance. **Drivers don't shape setup** — three-driver endurance rosters are a sim reality with no UI tension. Not yet wired to **part understanding** windows (HQ-5 PD-7/8) or engineer skill.

**Goal:** One **Setup Workbench** experience — visually clear, diff-friendly, hint-driven — used for garage baseline, per-track weekend sheet, and (read-only compare) mid-race pit tweaks.

#### Locked design

| Topic | Choice |
|-------|--------|
| Primary surfaces | **Garage** (platform baseline) + **Race Hub → Pre-Session** (per-track sheet) — same component, different save targets |
| Visual direction | Card-based groups (aero / balance / chassis / alignment), balance **spider or rail diagram**, delta chips on changed fields |
| Previous setup | Always show **diff vs reference** — toggle: garage baseline \| last session \| last saved preset |
| Hints | **Compiled performance rails** (grip, downforce, drag, balance, tyre life) + engineer **understanding window** overlay + short natural-language tip |
| Drivers | Each driver has **preference offsets** per setup axis; multi-driver roster shows **compromise quality** |
| Perfect setup | No single “correct” answer — optimal is **track + weather + stint plan + driver roster** dependent; hints narrow search space |

#### UX requirements

| Area | Requirement |
|------|-------------|
| **Layout** | Left: grouped controls. Centre: live **balance / aero / tyre** summary. Right: **diff panel** + driver roster strip |
| **Diff** | Changed fields highlighted; `−0.02 wing`, `+2 mm front RH` vs selected reference; “revert field” / “revert all” |
| **Hints** | Per-axis: green = inside understanding window, amber = edge, red = outside known-good band; hover shows engineer note |
| **Performance numbers** | Reuse `compileCarStats` bars with **delta vs reference** (+/− on grip, DF, drag, cornering, tyre stress) |
| **High-level tips** | Rule + LLM-light templates: “More front wing — high-speed corners improve, straight loss ~X”; gated by engineer `setupFeedback` skill |
| **Track context** | Track map chip, weather forecast strip, session type (practice / quali / race) affects default bias |
| **Mobile / density** | Collapsible sections; primary axes visible without scroll (wing, bias, rake, one spring pair) |

#### Driver setup preferences (endurance)

Drivers are not identical — each has a **comfort vector** on setup axes (ideal offset per field). **No `adaptability` stat today** — add as part of SU-6 (see below).

```
driverPreference[driverId][axis] = ideal offset + base tolerance band
effectiveTolerance = baseTolerance * adaptabilityFactor(driver.adaptability)
adaptabilityFactor = lerp(0.75, 1.35, adaptability / 100)   # narrow ↔ wide comfort window
```

| Stat | Role (distinct) |
|------|-----------------|
| **`adaptability`** *(new)* | How wide a setup band the driver accepts before pace/comfort suffers — **flexible triers** vs **narrow specialists** |
| **`setupFeedback`** *(exists)* | How **clear/useful** their radio notes are when you change setup — not how wide they tolerate it |
| **`composure`** *(exists)* | Mistakes under pressure — orthogonal to setup tolerance |

High **adaptability** → easier three-driver compromise (less pace penalty off their ideal). Low adaptability + sharp preferences → fast when happy, visibly uncomfortable otherwise.

| UI element | Behaviour |
|------------|-----------|
| **Driver strip** | 1–3 assigned drivers with headshot / name; stint order optional |
| **Per-driver satisfaction** | Icon or bar: happy ↔ uncomfortable on **current** sheet |
| **Compromise meter** | Aggregate when drivers disagree — “Balanced” / “Favours Marco” / “No one happy” |
| **Optimize for** | Dropdown: *All drivers (balanced)* \| *Stint 1 driver* \| *Quali driver* — adjusts weighting |
| **Feedback lines** | In-race + workbench: driver quotes from `setupFeedbackForChange` (sim already has hooks) |

**Three-driver tension (design intent):** Player cannot max every driver. Quali driver may want sharp front; endurance stints want stable tyre life. Choosing a **compromise baseline** is the puzzle — strategist / engineer skill widens acceptable band or suggests which driver to favour for this session.

**Sim hook (proposed):** `paceFactor` and `setupFeedback` quality scale with distance from that driver's preference band; compromise setup uses weighted centre.

#### Integration with part understanding (HQ-5)

- Understanding **centre** → default slider position / suggestion chip
- Understanding **width** → green hint band on each affected axis
- New part fitted → axes tagged in `setup_axes` metadata show widened uncertainty until `partUnderstanding` grows
- `setup_hunt` briefing accelerates **contextFamiliarity** — workbench shows “Spa learning +12%” after practice

#### Deliverables

| ID | Item | Status |
|----|------|--------|
| **SU-1** | `SetupWorkbench` component — shared shell, sections, reference/diff model | ⬜ |
| **SU-2** | Visual redesign (balance diagram, delta chips, collapsible groups) | ⬜ |
| **SU-3** | Reference selector + field-level diff vs garage / last session / saved preset | ⬜ |
| **SU-4** | Performance rails with **delta vs reference** + axis hint bands (understanding); all fields use HX HelpTip | ⬜ |
| **SU-5** | Engineer tips strip (skill-gated; template + optional LLM) | ⬜ |
| **SU-6** | Driver preference model + **`adaptability`** stat + roster strip + compromise meter | ⬜ |
| **SU-7** | Wire into **Garage** (platform) and **Pre-Session Briefing** (per-track) | ⬜ |
| **SU-8** | Pit stop modal: read-only compare + limited deltas consistent with workbench | ⬜ |
| **SU-9** | Sim: driver preference distance → pace / feedback quality | ⬜ |

**Suggested order**

```
SU-1 shell + SU-3 diff  →  SU-4 hints/rails  →  SU-2 visual polish
    →  SU-6 driver compromise  →  SU-7 garage + briefing migration
    →  SU-4 understanding bands (after PD-7)  →  SU-8 pit  →  SU-9 sim
```

*Replaces:* scattered `chassis-setup-panel` / `pre-session-slider-grid` patterns in `CarGarage.ts` and `PreSessionBriefing.ts`.

### Manager actions (proposed MVP set)

| Action | Effect |
|--------|--------|
| **Pit request** | Car enters pit lane next lap; fixed stop time + tasks |
| **Fuel** | Add fuel (weight up); must respect tank capacity |
| **Tires** | Swap compound; resets wear |
| **Repairs** | Restore engine health / bodywork; costs time |
| **Setup change** | Adjust ride height, wing angle, brake bias — between stops or at stop |
| **Driver mode** | Push / normal / conserve (fuel, tires, engine stress) |
| **Stint plan** | Pre-race: target pit lap, fuel target, tire compound per stint |

### Pit stop model (proposed)

```
total_stop = lane_time + fuel_liters * fuel_rate + tire_change? * tire_time + repair_points * repair_rate
```

Cars in pit: no track progress; gap to rivals grows.

### 🔶 YOUR INPUT: Pit stop depth
- **A)** One button “Pit: fuel + tires” with fixed duration
- **B)** Granular checklist (fuel only, 2 tires, full service, …)
- **C)** Timed minigame / skill expression
- **D)** Delegation — chief mechanic skill affects duration variance

i choose option B here, with the possibilty of settings like setup change, driver change, which tire to replace to which etc.

### 🔶 YOUR INPUT: Setup changes
What can player tune mid-race?

- **A)** Current: springs, ride height only
- **B)** + aero levels (DF vs drag), brake bias, gear ratios
- **C)** + per-track presets loaded before race; mid-race = small deltas only
- **D)** Engineer staff quality affects how much setup range is available

option B with a mix of D, staff should give suggetsions, how good these should depend on the staff quality and experience, also drivers should give feedback on the car

**✅ Merged to `main` (Jun 2026):**

- **Garage:** per-axle ride height, springs, ARB, dampers; alignment (camber/toe) and final drive
- **Race weekend:** per-track setup sheet in Pre-Session Briefing (functional but clunky — **6-11 rework** targets this)
- **Mid-race:** pit modal + quick setup buttons (wing, brake bias, suspension deltas); engineer skill gates command magnitude
- **Live telemetry:** wing, bias, ride heights, springs, ARB, camber on pit wall readout
- **AI grid:** track presets applied to AI car configs at race build

### 🔶 YOUR INPUT: Driver model
- **A)** Abstract — car always hits `maxSafeSpeed` for sector (current)
- **B)** Driver stat affects consistency, mistake rate, traffic passing
- **C)** Named drivers with stamina, skill, wet-weather trait
- **D)** Driver + co-driver for endurance (stint swaps)

mix of B, C and D, dbut dont fix on how many drivers are assigned for a car, create racing rules for max drive time etc but let the player do mistakes

*Strong recommendation: **C + D** for endurance manager identity; keep **A** as sim fallback mode.*

### 🔶 YOUR INPUT: Failure & retirement
- Engine health → DNF threshold?
- Crash model (random vs driver-error vs fatigue)?
- “Limps home” degraded performance mode?

---

## Phase 7 — Meta Game (Team / Season)

**Goal:** Loop beyond a single race.

**Status:** 🟡 **In progress** — WEC career stack, calendar, economy, sponsors, and HQ staff slice 1 are on `main`; staff market, salaries, and facilities remain.

### Locked design (HQ & staff)

| Topic | Choice |
|-------|--------|
| Staff scope | **Per car** — engineer, mechanic, strategist assigned per fleet car |
| Progression | Staff gain **experience** (and slow skill growth) over the season |
| Facilities | **Gated part development** — see [Personnel progression](#personnel-progression-hq-3) and [Part development](#part-development--rd-hq-5) |
| Unavailability | **Yes** — ill / injured / poached events with interim cover |
| R&D | **Part projects** on any owned part — player picks focus: **performance**, **reliability**, or **understanding** (not just flat unlocks) |

### HQ & staff slices

| Slice | Status | Notes |
|-------|--------|-------|
| **HQ-1** Per-car roster + UI | ✅ | `staff.ts` migration, Team HQ matrix, Race Hub staff row, entry-scoped `staff.txt` |
| **HQ-2** Economy + market | 🟡 | Salaries, hire/fire, staff market on `main`; unavailability rolls ⬜ |
| **HQ-3** Personnel progression | 🟡 | XP/level loop exists for private tests only — see below |
| **HQ-4** Sim pit/strategy | 🟡 | Mechanic pit variance in sim; strategist stint alerts ⬜ |
| **HQ-5** Part development + facilities | ⬜ | Facility gates, in-house parts, reliability, setup knowledge — see below |
| **HX** In-game help & glossaries | ⬜ | HelpTip + glossary for abbreviations/stats — see below |

*Branch `feature/hq-staff-slice1` merged to `main` (Jun 2026); worktree closed.*

---

### Personnel progression (HQ-3)

**Problem today:** `progression.ts` awards XP → level → stat bumps, but **only on private/joint test completion**. Championship weekends award nothing. Staff bumps are generic `+1 skill`; drivers only alternate `setupFeedback` / `dryPace`. Team HQ “Development Programme” tab is **R&D parts**, not people — confusing label.

**Locked design**

| Topic | Choice |
|-------|--------|
| Primary XP source | **Championship weekends** (practice / quali / race); private tests = bonus multiplier |
| Staff XP | Only crew **assigned to cars that participated** in the session |
| Staff level-ups | **Role-specific** — engineer / mechanic / strategist grow different stats |
| Driver level-ups | Rotate **endurance-relevant** stats (stamina, tire mgmt, wet, consistency, …) — not just dry pace |
| Off-week training | **1–2 slots per off-week** — budget + time actions (no new buildings required for v1) |
| Facilities hook | Simulator / pit lane / data room **multiply** training yields (HQ-5, later) |

**XP awards (proposed)**

| Session | Drivers | Staff (per assigned car) |
|---------|---------|--------------------------|
| Practice | Small | Small |
| Qualifying | Medium (runners) | Small |
| Race | Large (laps + finish + class) | Medium–large |
| DNF / NC | Reduced, not zero | Partial if car ran |

**Staff level-up tracks (auto or pick-one)**

| Role | Gains on level |
|------|----------------|
| Engineer | Setup range, feedback quality, R&D point multiplier |
| Mechanic | Pit speed, repair efficiency, reliability diagnosis |
| Strategist | Briefing/stint quality, fuel model, weather reads |

**Off-week training actions (v1)**

| Action | Effect |
|--------|--------|
| Driver simulator | Driver XP burst or targeted stat |
| Crew pit drills | Mechanic XP / pit variance |
| Data review | Engineer XP / setup feedback |
| Strategy tabletop | Strategist XP / briefing defaults |

**Deliverables**

| ID | Item | Status |
|----|------|--------|
| **HQ-3a** | `applyWeekendProgression()` on practice / quali / race | ⬜ |
| **HQ-3b** | Role-specific staff level rewards | ⬜ |
| **HQ-3c** | Expanded driver stat rotation | ⬜ |
| **HQ-3d** | Off-week training UI + costs in Team HQ | ⬜ |
| **HQ-3e** | Post-race progression overlay for all session kinds | ⬜ |
| **HQ-3f** | Rename/split R&D tab vs “Crew Development” panel | ⬜ |

*Existing:* `progression.ts`, XP bars in Team HQ / Driver Center, `staff.txt` + `drivers.txt` export skill bumps to sim.

---

### Part development & R&D (HQ-5)

**Problem today:** R&D is a flat point shop (`RD_UNLOCKS` — two catalog parts). No facilities, no per-part instance state, no **reliability** stat, no **understanding** (setup windows). Work is not modeled on **parts you already own** — only “unlock new thing”.

**Vision:** Teams don't only **create** parts — they **work on parts already in the garage** (in-house built *or* bought off the shelf). Between weekends the player assigns R&D / homework to a specific **owned part instance** and picks **one focus**:

| Focus | What improves | Player-facing effect |
|-------|----------------|----------------------|
| **Performance** | Part stats toward `part_catalog.txt` ceiling | More downforce, less mass, better cooling, etc. |
| **Reliability** | Failure / wear / damage resistance | Fewer DNFs, slower degradation, safer to push stints |
| **Understanding** | How well the team knows **how the part works** | Better setup **priors** everywhere + tighter windows where the car has run — transfers across tracks and sibling part changes (e.g. new engine, same wing) |

All three apply to the **same owned part** over time. A bought monocoque at 98% catalog performance might still have low **understanding** (wide setup windows) and unknown **reliability** (supplier didn't share failure data) — the player chooses what to work on next.

#### Acquiring parts (how a part enters the garage)

| Path | Starting state | Typical follow-up work |
|------|----------------|------------------------|
| **Develop new in-house** | Below catalog ceiling on performance; reliability/understanding low | Any focus — often performance first, then understanding |
| **Buy shelved / supplier** | Near catalog ceiling on performance; reliability/understanding often partial or unknown | Reliability validation or understanding, not raw pace |
| **License / unlock (current shop)** | Migrate to supplier package or starter kit | Same as bought |

**Facility gates** (required to *start* certain categories — not per focus):

| Facility | Unlocks development on |
|----------|------------------------|
| Wind tunnel | Aero parts (front/rear wing, floor, …) |
| Carbon fabrication + design studio | Monocoque / chassis structures |
| Dyno / test cell | Powertrain, exhaust, hybrid |
| Composite shop | Bodywork, cooling ducts |

#### Part instance state (per owned part)

Each part in the fleet inventory is an **instance**, not just a catalog ID:

```
PartInstance {
  catalogId, source: inhouse | shelved | licensed
  performanceMaturity   # 0..1 toward catalog stat ceiling
  reliabilityMaturity # 0..1 toward safe / durable operation
  partUnderstanding     # 0..1 — intrinsic: how the part behaves (transfers)
  contextFamiliarity    # per (fleetCarId, trackId) — local trim knowledge
}
```

**Understanding is two layers** (not only per-car/per-track):

| Layer | Meaning | Transfers when… |
|-------|---------|-----------------|
| **`partUnderstanding`** | Team knows *how this part works* — sensitivity, operating window, what trim directions usually help | New track (better initial guess), new engine on same car (wing knowledge still helps), second car fitted with same part instance |
| **`contextFamiliarity`** | Team knows *this exact combo* on *this circuit* — tight optimal band | Does **not** fully transfer; grows with `setup_hunt`, races, track-specific R&D |

Example: High **partUnderstanding** on a front wing → at a never-visited track, engineer suggestions start as a **reasonable centred range** (“this wing usually wants lower rake / more front flap”), not random. After **contextFamiliarity** at Spa, that same wing’s Spa window **tightens** further. Swap the engine — **partUnderstanding** on the wing is unchanged; only **cross-coupled** axes (balance, cooling, rake) get a partial familiarity penalty, not a full reset.

**Performance focus**

```
effective_stat = lerp(inhouse_base, catalog_max, performanceMaturity)
performanceMaturity += f(rd_budget, engineer_skill, facility_tier, off_week_slots)
```

**Reliability focus**

```
reliability_score += f(rd_budget, fabrication_skill, facility_tier)
# Pushing performance hard without reliability work = hidden risk (wear, failure rate)
# Active reliability R&D trades time/budget away from pace but hardens the part
```

**Understanding focus**

```
# Per setup axis affected by this part (catalog metadata: aero_part → wing, rake, …)
partUnderstanding     += f(rd_budget, engineer_skill, wind_tunnel, off_week_slots)
contextFamiliarity[car, track] += f(setup_hunt, race_laps, track_specific_rd, partUnderstanding)

# Suggestion window for axis A on track T, car C, build B:
centre_prior  = lerp(generic_default, part_aware_prior, partUnderstanding)
local_trim    = contextFamiliarity[C, T]   # tightens band around centre_prior
window_width  = base_uncertainty * (1 - blend(partUnderstanding, local_trim))

# Dedicated understanding R&D raises partUnderstanding (off-track).
# On-track work mostly raises contextFamiliarity; high partUnderstanding → faster local learning.
```

**Transfer rules (proposed)**

- **New track:** `partUnderstanding` sets centre + moderate width; `contextFamiliarity` starts low for that track.
- **Same part, other car:** copy or scale `partUnderstanding`; `contextFamiliarity` per car.
- **Other part replaced** (e.g. engine): retain `partUnderstanding` on unchanged parts; apply **partial reset** only on setup axes tagged as coupled to the swapped slot in `part_catalog` / compatibility metadata.
- **Engineer skill:** better engineers extract more `partUnderstanding` per R&D week and infer centres on new tracks sooner.

**Player choice example:** Team buys a shelved front wing (fast, 95% performance). Two off-weeks on **Understanding** → `partUnderstanding` rises; at Fuji (never visited) wing suggestions are already usable priors. A **setup_hunt** at Spa tightens Spa-specific windows. Player swaps power unit — wing **partUnderstanding** intact; brake-bias / rake suggestions get a small uncertainty bump only. Next off-week switches to **Reliability** after a puncture scare.

#### UI (R&D garage)

- Pick **owned part** from inventory (grouped by slot: aero, chassis, …)
- Pick **focus**: Performance | Reliability | Understanding
- **Understanding** R&D raises **partUnderstanding** (intrinsic bar); track list shows **contextFamiliarity** per circuit when this part is on a car
- Spend **R&D points + budget + off-week slot**; show both bars (intrinsic + per-track local)
- Setup chips / engineer suggestions use **centre from partUnderstanding**, **width from contextFamiliarity** on that track

**Deliverables**

| ID | Item | Status |
|----|------|--------|
| **PD-1** | Facility model + category gates | ⬜ |
| **PD-2** | `PartInstance` in meta (owned parts, three maturity axes) | ⬜ |
| **PD-3** | Part `reliability` in catalog + compile + sim failure hooks | ⬜ |
| **PD-4** | Shelved-parts market (buy instances near performance ceiling) | ⬜ |
| **PD-5** | In-house **new** part creation (starts low performance) | ⬜ |
| **PD-6** | **Part project** UI — pick part + focus (perf / reliability / understanding) | ⬜ |
| **PD-7** | Two-layer understanding model + setup-axis coupling metadata | ⬜ |
| **PD-8** | Suggestion/preset windows (part prior + per-track familiarity + transfer rules) | ⬜ |
| **PD-9** | Passive `contextFamiliarity` from `setup_hunt` + race weekends | ⬜ |

**Suggested implementation order (within Phase 7)**

```
HQ-3 personnel progression (weekend XP first)
    → PD-1 facilities skeleton
    → PD-2 part instances (three axes on owned parts)
    → PD-3 reliability stat + sim hook
    → PD-6 part project UI (pick part + focus)
    → PD-7 two-layer understanding + axis coupling
    → PD-8 suggestion windows (priors + local familiarity)
    → PD-4 shelved market + PD-5 in-house creation
    → PD-9 passive context familiarity from on-track sessions
```

---

### In-game help & glossaries (HX)

**Problem today:** The UI is dense with **abbreviations and numbers** (DRY, CON, Cl/Cd, ARB, ERS, `×1.04`, etc.) but helper text is **sparse and inconsistent**. `wizard-hint` paragraphs exist in some screens (Team HQ, Driver Center) but many controls have none. Driver stats use native `title=` tooltips only (`DriverCenter.ts` ← `driverStatDefs.description`). `SIM_STAT_BARS`, setup sliders, staff traits, part cards, pit telemetry, timetable columns, and negotiation fields are largely **unexplained**. This blocks new players and makes the garage/setup/R&D layers harder to use — especially as 6-11 and HQ-5 add more concepts.

**Goal:** Every non-obvious label, abbreviation, and metric has a **discoverable explanation** — without cluttering the default view.

#### Locked design

| Topic | Choice |
|-------|--------|
| Default UX | Clean screen; help on **demand** (icon / hover / focus), not walls of text |
| Primary pattern | **`?` HelpTip** next to labels + optional **inline hint** under sections |
| Content source | **Server glossary** in `GameCatalogPayload` (extend `driverStatDefs` pattern) + local field defs where viewer-only |
| Depth | **Short** (one line) in tooltip; **long** (paragraph + example) in click/hover panel |
| Accessibility | Keyboard-focusable help triggers; `aria-describedby`; not hover-only on touch |
| Language | English first; glossary keys stable for future i18n |

#### Help content types

| Type | Use |
|------|-----|
| **Tooltip** | Abbreviation expansion: “ARB — anti-roll bar stiffness” |
| **Metric help** | What a number means + good/bad direction: “Cd — drag coefficient; **lower** is faster on straights” |
| **Concept** | Systems: part understanding, compromise meter, R&D focus, hybrid deploy |
| **Section intro** | 1–2 sentences at top of panel (upgrade `wizard-hint` styling) |
| **Column glossary** | Timetable / leaderboard headers — short `title` + HelpTip on abbreviated headers |

#### Glossary coverage (priority)

| Domain | Examples needing copy |
|--------|------------------------|
| **Driver stats** | All 15+ stats + **`adaptability`**; point pool; tier |
| **Staff** | Role duties, skill, morale, XP, traits, salary |
| **Car perf bars** | Power, grip, cornering, Cl, Cd, mass, tyre life, cooling |
| **Setup workbench** | Every slider (6-11); diff reference modes; driver satisfaction |
| **Garage / parts** | Slot names, catalog stats, compatibility errors, serviceability |
| **Powertrain** | Engine designer fields, hybrid, fuel cell, transmission hints |
| **Race / pit wall** | Driver mode, hybrid strategy, tyre codes, fuel%, stint timer |
| **Meta** | R&D points, facilities, sponsors, regulations, calendar |
| **Multiplayer** | Roles, permissions, co-op pit wall |

#### Implementation pattern

```
viewer/src/components/HelpTip.ts     — reusable ? icon + popover
viewer/src/utils/glossary.ts       — resolve help text by key
server gameCatalog.glossary        — { key, label, short, long, seeAlso? }[]
```

Wire `HelpTip` beside: stat labels, slider names, table headers, badge chips, perf rows. Setup workbench (SU) and R&D (PD) **must** use this — no one-off hint strings.

**Deliverables**

| ID | Item | Status |
|----|------|--------|
| **HX-1** | `HelpTip` component (hover + click, mobile-friendly, a11y) | ⬜ |
| **HX-2** | Glossary schema on `GameCatalogPayload` + server loader | ⬜ |
| **HX-3** | `glossary.ts` resolver + `helpLabel()` helper for tables | ⬜ |
| **HX-4** | **Driver / staff / perf bars** — full glossary copy + wire UI | ⬜ |
| **HX-5** | **Garage + engine/cooling designer** — part stats & slots | ⬜ |
| **HX-6** | **Setup workbench + briefing** — every setup field (pairs with SU) | ⬜ |
| **HX-7** | **Pit wall + telemetry + timetable** — abbreviations & columns | ⬜ |
| **HX-8** | **Team HQ meta** — R&D, facilities, sponsors, negotiations | ⬜ |
| **HX-9** | UI audit checklist — no new screen ships without glossary pass | ⬜ |

**Suggested order:** HX-1 → HX-2/3 → HX-4 (drivers/staff — highest pain) → HX-6 with SU-1 → HX-5/HX-7/HX-8 → HX-9 as ongoing gate.

*Can run in parallel with HQ-3 / PD / SU — copywriting does not block sim work.*

### Proposed systems
- **Team HQ:** budget, staff (engineers, mechanics, strategists)
- **Calendar:** multiclass events, championship points per class
- **R&D / part development:** owned part instances; player focus = performance | reliability | understanding
- **Setup knowledge:** `partUnderstanding` (transfers) + `contextFamiliarity` (per car+track); coupled-axis partial reset on part swaps
- **In-game help:** centralized glossary + `HelpTip` on all dense UI (HX)
- **Regulations:** rule changes per season (BoP shifts)

### 🔶 YOUR INPUT: Scope of v1.0
What’s the minimum shippable manager loop?

- **A)** Single race weekend only
- **B)** One season, one team, one car
- **C)** One season, multiclass grid, AI teams
- **D)** Career mode with transfers, sponsors, facility upgrades

A i think but i wont relesae this game probably for  long time

---

## Phase 8 — Quality & Persistence

| Item | Purpose |
|------|---------|
| Deterministic replay | Same configs → same lap times (regression tests) |
| Golden test configs | `tests/golden/` with expected lap time tolerance |
| Save/load race state | Mid-race save — schema shared with meta/viewer |
| Fixed sub-stepping | Accurate braking zones at 0.1s timestep |
| Headless batch mode | Monte Carlo strategy evaluation |
| Remove `iostream` from core | Events/callbacks only |
| JSON schemas | `CompiledCar`, `RaceState` for save games and tooling |
| Variable timestep contract | Document `tick(dt)` behaviour for server + viewer |

*Unit/integration harness → Phase 2. SimBridge read API → Phase 3. Command queue + pit events → Phase 6. Extended golden matrix → Phase 8.*

---

## Track spline system *(implemented)*

**Source of truth:** `tracks/*.json`

```json
{
  "name": "Sample Circuit",
  "closed": true,
  "lap_length": 13626.0,
  "control_points": [{"x": 0, "y": 0, "z": 0}, ...],
  "sectors": [
    {"name": "Main Straight", "start_t": 0.0, "end_t": 0.0954,
     "max_speed_ms": 85.0, "straight": true}
  ]
}
```

| Field | Sim uses | UE uses |
|-------|----------|---------|
| `control_points` | Builds arc-length spline | `USplineComponent` points (1:1 import) |
| `sectors[].start_t/end_t` | Speed limits along normalized arc length | Sector markers, marshal posts |
| `lap_length` | Optional scale to match real circuit length | Distance labels |
| `TrackPose` (API) | `distance`, `normalizedT`, `sectorIndex` | Actor transform on spline |

**Sim query API** (`track.hpp`): `poseAtDistance(d)` → position, tangent, up, normalizedT.

**3D client workflow (optional):** import `track.json` → spline actor → car actors lerp along spline using snapshot `distance` each tick.

### Default test circuit — Circuit de la Sarthe

`tracks/lemans_la_sarthe.json` — 13.626 km, 25 control points, 17 named sectors:

```
Start ─► Hunaudières ─► Dunlop ─► Esses ─► Tertre Rouge
    ─► Mulsanne (3 straights + 2 chicanes) ─► Mulsanne Corner
    ─► Indianapolis ─► Arnage ─► Porsche Curves ─► Corvette
    ─► Ford Chicane 1/2 ─► Start-Finish
```

Sketch is top-down XZ with light elevation at Dunlop (`y≈6m`). Control points are approximate — refine in UE Editor and re-export JSON. `lap_length` scales arc length to the real 13.626 km figure.

---

## Future / optional — Unreal Engine game *(ex-Phase 9)*

> **Not on the active roadmap.** The browser manager (`viewer/` + `server/`) is the intended ship surface for this project. A separate Unreal Engine game — 3D race view, UMG pit wall, Lego garage meshes — is *maybe later* if you want a premium visual client. Nothing here blocks Phases 5–8.

**Would start after:** Phase 3 (API proven) + Phase 6 (pit commands) + Phase 8 (save/load, static lib if needed).

### UE project milestones *(reference only)*

| Milestone | Depends on sim | UE work |
|-----------|----------------|---------|
| **UE-0: Plugin shell** | `libprojectlm` static lib | ThirdParty plugin, `USimSession` UObject, tick in `AActor` |
| **UE-1: Race playback** | Snapshot + spline export | Cars follow spline, basic UI overlay (lap, pos, fuel) |
| **UE-2: Pit wall** | `submitCommand` + pit logic (Phase 6) | UMG race director, pit checklist UI |
| **UE-3: Garage** | JSON car/catalog schemas | Part picker UI, compiled stats panel |
| **UE-4: Lego assembly** | Part attachment metadata | Skeletal/socket mesh stacking |
| **UE-5: Meta / career** | Save/load race + team state | Menus, season flow |

### Lego builder in UE *(optional vision)*

1. **Sim** defines part slots, stats, compatibility rules, attachment point IDs.
2. **UE** holds meshes per `part_id`, snapped to sockets on chassis base mesh.
3. Player picks parts in UMG → UE builds `CarConfig` JSON → sends to sim `CompileCarArchitecture` → stats panel updates live.
4. Part designer (far future): custom meshes in UE, stats still validated by sim.

*Locked preference (if UE ever ships): **B** — 3D race view + manager UI; garage Lego builder in UE-3/UE-4.*

---

## Suggested implementation order

```
Phase 1 ✅  Foundation (config, telemetry, spline, La Sarthe, multicar skeleton)
    │
    ▼
Phase 2 ✅  Tests & project structure (src/, configs/, Catch2, golden lap)
    │
    ▼
Phase 3 ✅  API & web visualization
    ├── 3A  SimBridge read API + track_sampler
    └── 3B  Node binding → WS server → Vite viewer (scope B)
    │
    ▼
Phase 4 ✅  Parts & garage (brakes, transmission, hybrid, compatibility matrix)
    │
    ▼
Phase 5 ◄── YOU ARE HERE — Multiclass endurance (duration races, AI entries, BoP tooling)
    │
    ▼
Phase 6 🟡  Race management — pits ✅, engineer LLM ✅; setup workbench rework (6-11) + stint plans ⬜
    │
    ▼
Phase 7 🟡  Meta / season — career ✅; HQ-3 + HQ-5 + in-game help (HX) ⬜
    │
    ▼
Phase 8  Quality + persistence (extended golden tests, save/load, schemas)

Optional (ex-Phase 9): Unreal Engine 3D client — only if/when you want it
```

**Consumer map**

```
SimBridge (C++)
    └── bindings/node → server → viewer     Phase 3+ (read + commands from Phase 6)

Optional: UE ThirdParty plugin → same SimBridge API (ex-Phase 9)
```

---

## Config file inventory (target)

| File | Purpose |
|------|---------|
| `configs/part_catalog.txt` | All part stats |
| `configs/physics_config.txt` | Global physics + assembly coeffs |
| `configs/car_config.txt` | One car build |
| `tracks/*.json` | Spline control points + sectors (source of truth) |
| `configs/track_config.txt` | *(legacy)* CSV sectors — auto-generates spline on load |
| `configs/race_config.txt` | Event: track, laps/duration, entries, weather |
| `configs/class_rules.txt` | *(Phase 5)* Per-class BoP and legality |
| `configs/part_compatibility.txt` | *(Phase 4)* Assembly rules between parts |
| `configs/team_config.txt` | *(Phase 7)* Staff, budget, R&D |
| `configs/facilities.txt` | *(Phase 7 PD-1)* Facility tiers and part-category gates |
| `configs/part_development.txt` | *(Phase 7 PD-3)* In-house base stats, maturity curves, shelved catalog |
| meta: `partInstances` | *(Phase 7 PD-2)* Owned parts — performance / reliability / understanding per instance |
| meta: `partUnderstanding` | *(Phase 7 PD-7)* Intrinsic knowledge per owned part instance (transfers) |
| meta: `contextFamiliarity` | *(Phase 7 PD-8)* Per part+car+track local trim knowledge |
| part `setup_axes` metadata | *(Phase 7 PD-7)* Which setup fields a part affects; coupling on swap |
| meta: `driverSetupPreferences` | *(Phase 6 SU-6)* Per-driver ideal offsets on setup axes |
| driver `adaptability` | *(Phase 6 SU-6)* Catalog + sim — widens/narrows setup comfort band |
| meta: `setupSheetHistory` | *(Phase 6 SU-3)* Last session / saved presets for diff in workbench |
| `gameCatalog.glossary` | *(Phase 7 HX-2)* Central help text for stats, abbreviations, systems |

---

## Dev usage (implemented)

```bash
make                    # builds build/bin/projectlm + projectlm_tests
make test               # run tests from repo root (20 cases)
make run RUN_ARGS="--laps 3"   # CLI (default configs/race_config.txt)
make native             # Node N-API addon (bindings/node)
make CXX=clang++        # macOS default; Linux: g++ or g++-12

# Web viewer stack (multiclass default)
cd server && npm run dev    # ws://localhost:8765
cd viewer && npm run dev    # http://localhost:5173

# Multi-car CLI: set entries=configs/entries.txt in configs/race_config.txt
```

See `configs/entries.txt` for multiclass entry format: `entry=team,car_config,class_id,grid`.

---

## Quick feedback template

Copy and fill what you care about now:

```text
Telemetry: A / B / C
Part unlock: A / B / C / D
Assembly rules: A / B / C / D
Classes: A / B / C / D
AI cars: A / B / C
Default race length: ___ hours
Time compression: yes ___× / no real-time
Pit stops: A / B / C / D
Setup tuning: A / B / C / D
Drivers: A / B / C / D
Failures: describe preference
v1.0 scope: A / B / C / D
Unreal launch scope: A / B / C / D
Track authorship: A / B / C
```

---

*Last updated: Jun 2026 — HX in-game help/glossaries; Phase 6 setup workbench (6-11); HQ-5 part projects; HQ-3 personnel XP; UE optional.*
