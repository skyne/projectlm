# ProjectLM — Engineering / Manager Game Roadmap

> **Vision:** Players build cars from modular parts (Lego-style assembly now; custom part designer later), then compete in multiclass endurance races while managing strategy — setup, stints, pit stops, reliability, and class rules — deeper than a typical motorsport manager. **The shipped game runs in Unreal Engine; this repo is the simulation core that UE consumes.**

This document is the living design plan. Sections marked **🔶 YOUR INPUT** are deliberate decision points — please comment with preferences before we lock implementation.

### ✅ Locked decisions

| Topic | Choice |
|-------|--------|
| **Unreal scope at launch** | **B** — 3D race view + manager UI (pit wall, race director); garage Lego builder → Phase 9 UE-3/UE-4 |
| **Track authorship** | **C** — shared `track.json` is single source of truth for sim and UE |
| **Track geometry** | Real Catmull-Rom spline; sim progress = arc length; UE renders same control points |
| **Phase 3 viewer stack** | **TypeScript + Vite** in `viewer/` |
| **Phase 3 viewer scope** | **B** — SVG track, car dots, leaderboard, event log, time-scale, pause/resume |
| **Phase 3 transport** | **Node native binding** → WebSocket in Node only; **no networking in C++ sim** |

---

## Two-project architecture (sim core + Unreal game)

```
┌──────────────────────────────────────────────────────────────────┐
│  UNREAL ENGINE GAME (separate repo / sibling project)            │
│  — garage UI, Lego part meshes, race director, pit wall          │
│  — track & car rendering, cameras, audio, menus, save UI          │
│  — interpolates visuals between sim ticks                       │
└───────────────────────────┬──────────────────────────────────────┘
                            │  C++ API / events / serialized state
┌───────────────────────────▼──────────────────────────────────────┐
│  PROJECTLM SIM CORE (this repo)                                  │
│  — physics, timing, multiclass rules, wear, fuel, pits           │
│  — car compiler, part catalog logic, AI strategy resolution      │
│  — headless CLI for dev, testing, batch balance runs             │
└──────────────────────────────────────────────────────────────────┘
```

**Division of labour**

| Sim core (this repo) | Unreal game |
|----------------------|-------------|
| Tick physics, lap timing, positions | 3D track, car meshes, VFX |
| Part stats, legality, BoP, compilation | Lego garage builder UI |
| Pit/stint/strategy resolution | Pit wall & race manager screens |
| AI opponent logic | Presentation, animation, sound |
| Deterministic race state | Save/load UI, career/meta screens |
| Config → compiled car data | DataTables / assets fed from sim schemas |

**Principle:** Simulation stays pure, deterministic, and **UI-agnostic** — no `std::cout` in core paths, no rendering assumptions. Manager decisions arrive as **commands**; results leave as **state snapshots + events** that UE consumes each tick.

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
│  Data Layer (text configs → JSON schemas → UE DataTables)   │
└─────────────────────────────────────────────────────────────┘
```

CLI (`main.cpp`) becomes a **thin dev harness** over the same API Unreal will call.

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

**Goal:** Organize the growing codebase and lock in regression safety before any web/Node work. API consumers (Phase 3 viewer, Phase 9 UE) should build on a tested, navigable layout.

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

**Goal:** Expose the sim through a stable `SimBridge` API and prove it with a browser viewer. Delivers the **same read-only C++ surface** UE will link. Parts expansion → Phase 4. Manager commands → Phase 6.

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
| `submitCommand()` — pit, setup, driver mode | **6** | Race management not built yet |
| Pit enter/exit affecting track progress | **6** | Pit lane logic |
| Save/load `RaceSession` | **8** | Quality / persistence |
| `libprojectlm` static lib packaging | **8 / 9** | UE ThirdParty build |
| JSON schemas for cars / save games | **7 / 9** | Meta + UE DataTables |
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

**Goal:** Expand the modular part catalog so build choices meaningfully affect endurance outcomes. Sim-side catalog + compilation only in this phase — garage *UI* ships in Phase 9 (UE); unlock/R&D rules tie into Phase 7 meta.

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

*Garage builder UI, part meshes, live stats panel → Phase 9 UE. Part designer tool → far future.*

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

**Extends Phase 3 stack:** `submitCommand()` added to SimBridge + Node binding; viewer gains pit checklist UI (your choice: granular option B). Phase 3 viewer stays read-only until this phase.

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

**Dev viewer status (2026):** Implemented in `feature/suspension-setup` worktree:

- **Garage:** per-axle ride height, springs, ARB, dampers; alignment (camber/toe) and final drive
- **Race weekend:** per-track setup sheet in Race Hub (merged onto garage build at session start, not saved to garage)
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

### Proposed systems
- **Team HQ:** budget, staff (engineers, mechanics, strategists)
- **Calendar:** multiclass events, championship points per class
- **R&D:** unlock parts, improve reliability
- **Regulations:** rule changes per season (BoP shifts)

### 🔶 YOUR INPUT: Scope of v1.0
What’s the minimum shippable manager loop?

- **A)** Single race weekend only
- **B)** One season, one team, one car
- **C)** One season, multiclass grid, AI teams
- **D)** Career mode with transfers, sponsors, facility upgrades

A i think but i wont relesae this game probably for  long time

---

## Phase 8 — Quality, Persistence & UE Packaging

| Item | Purpose |
|------|---------|
| Deterministic replay | Same configs → same lap times (regression tests) |
| Golden test configs | `tests/golden/` with expected lap time tolerance |
| Save/load race state | Mid-race save — schema shared with UE |
| Fixed sub-stepping | Accurate braking zones at 0.1s timestep |
| Headless batch mode | Monte Carlo strategy evaluation |
| Remove `iostream` from core | Events/callbacks only |
| **`libprojectlm` static lib** | UE ThirdParty plugin links same code as Node addon |
| JSON schemas | `CompiledCar`, `RaceState` for UE DataTables |
| Variable timestep contract | Document `tick(dt)` behaviour for UE + viewer |

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

**UE workflow (Phase 9):** import `track.json` → spawn spline actor → place sector billboard actors at `start_t` → car actors lerp along spline using snapshot `distance` each tick.

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

## Phase 9 — Unreal Engine Game

**Starts after Phase 3 (API proven in viewer) + Phase 6 (pit commands) + Phase 8 (static lib).**

### UE project milestones

| Milestone | Depends on sim | UE work |
|-----------|----------------|---------|
| **UE-0: Plugin shell** | Static lib builds | ThirdParty plugin, `USimSession` UObject, tick in `AActor` |
| **UE-1: Race playback** | Snapshot + spline export | Cars follow spline, basic UI overlay (lap, pos, fuel) |
| **UE-2: Pit wall** | `submitCommand` + pit logic (Phase 6) | UMG race director, pit checklist UI |
| **UE-3: Garage** | JSON car/catalog schemas | Part picker UI, compiled stats panel |
| **UE-4: Lego assembly** | Part attachment metadata | Skeletal/socket mesh stacking |
| **UE-5: Meta / career** | Save/load race + team state | Menus, season flow |

### Lego builder in UE (aligns with your vision)

1. **Sim** defines part slots, stats, compatibility rules, attachment point IDs.
2. **UE** holds meshes per `part_id`, snapped to sockets on chassis base mesh.
3. Player picks parts in UMG → UE builds `CarConfig` JSON → sends to sim `CompileCarArchitecture` → stats panel updates live.
4. Part designer (far future): custom meshes in UE, stats still validated by sim.

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
Phase 6  Race management (pits, submitCommand, drivers, setup — viewer pit UI)
    │
    ▼
Phase 7  Meta / season (staff, R&D, calendar — light per your preference)
    │
    ▼
Phase 8  Quality + UE packaging (extended golden tests, save/load, static lib)
    │
    ▼
Phase 9  Unreal game (3D race + UMG manager + garage)
```

**Consumer map**

```
SimBridge (C++)
    ├── bindings/node → server → viewer     Phase 3 (read-only)
    └── UE ThirdParty plugin                Phase 9 (read + commands from Phase 6)
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

*Last updated: Phase 4 Parts & garage complete (brakes, transmission, hybrid/ERS, compatibility matrix, UE attachment point IDs)*
