---
name: multiplayer-agent-player
description: >-
  Join a live ProjectLM multiplayer session as an agent player (pit crew, host,
  or spectator). Use for human-vs-LLM co-op pit wall testing, roster inspection,
  shared team car commands, and multiplayer race control alongside a browser viewer.
---

# Multiplayer Agent Player

Play ProjectLM alongside a human in the browser — co-op pit wall, spectator, or host.

## Prerequisites

1. **Server running** (multiplayer branch / worktree):
   ```bash
   cd .worktrees/multiplayer-foundation/server && PORT=9785 npm run dev
   ```
2. **Viewer** (human client):
   ```bash
   cd .worktrees/multiplayer-foundation/viewer && npm run dev
   ```
   Open the viewer URL, pick a **display name** and role on the join overlay.

3. **Session player CLI** (agent client):
   ```bash
   ./scripts/session-player.sh ping
   ```
   From repo root, or use the worktree copy at `.worktrees/multiplayer-foundation/scripts/session-player.sh`.

Default WebSocket: `ws://localhost:9785` (`--url`, `PROJECTLM_WS_URL`, or `PROJECTLM_WS_PORT`).

## Human vs LLM setup (recommended)

| Client | How | Role | Name example |
|--------|-----|------|--------------|
| Human | Browser viewer join overlay | **Host** | `Daniel` |
| LLM agent | `session-player.sh` | **Player** (pit crew) | `PitBot` |

**Flow:**

1. Human opens viewer → join as **Host** with their display name.
2. Human runs career setup if needed: create team, start round, resume race.
3. Agent joins as pit crew:
   ```bash
   ./scripts/session-player.sh roster \
     --url ws://localhost:9785 \
     --name "PitBot" \
     --role player \
     --pretty
   ```
4. Confirm `sessionMode: "coop"` and shared `entryIds` in roster output.
5. Agent controls team cars while human watches the map / roster header.

**Reverse setup** (agent hosts, human joins as player):

```bash
# Agent bootstraps career + race
./scripts/session-player.sh e2e --name "Agent Host" --role host --pretty

# Human opens viewer → join as Pit crew (player)
```

## Join identity

Every connection must send `join_session` with a display name (2–24 chars).

| Flag | Purpose |
|------|---------|
| `--name "PitBot"` | Display name on roster and command attribution |
| `--role host` | Full control (first joiner only; demoted if host exists) |
| `--role player` | Race + pit commands for team cars (co-op pit wall) |
| `--role spectator` | Read-only (no pause, pit, or garage) |

```bash
PLAYER="./scripts/session-player.sh"

$PLAYER roster --name "PitBot" --role player --pretty
$PLAYER status --name "PitBot" --role player --pretty
$PLAYER leaderboard --name "PitBot" --role player
```

## Co-op pit wall commands

In **coop** mode, host and player share `managedEntryIds`. Either client can:

```bash
# Pit the team's car (uses playerEntryId or --entry)
$PLAYER pit --name "PitBot" --role player

# Driver mode / strategy
$PLAYER submit "driver_mode=push" --name "PitBot" --role player
$PLAYER submit "driver_mode=conserve" --name "PitBot" --role player

# Playback (both host and player)
$PLAYER resume --name "PitBot" --role player
$PLAYER time-scale 20 --name "PitBot" --role player
$PLAYER pause --name "PitBot" --role player
```

Resolve cars by `--entry`, `--car`, or `--team` (see live-session-player skill).

Commands are attributed in the sim log: `PitBot: Command accepted: …`

## Spectator agent (observe only)

Useful for a second LLM watching without interfering:

```bash
./scripts/session-player.sh watch --seconds 10 \
  --name "Observer" --role spectator --pretty
```

Spectator `pause`, `pit`, and `new-game` return **forbidden**.

## Multiplayer smoke tests

Run after protocol or auth changes:

```bash
./scripts/session-player.sh spectator-e2e --pretty
./scripts/session-player.sh coop-e2e --pretty
./scripts/session-player.sh reconnect-e2e --pretty
```

## Full weekend automation (practice → quali → race)

**Co-op** (you host in browser, agent drives pit wall):

```bash
./scripts/session-player.sh weekend --name "PitBot" --role player
```

Default `--advance host`: **you** click **Continue to Qualifying / Race** in the post-session overlay after each step. PitBot waits for `session_init` and only drives cars — it does **not** send `continue_weekend_session`, so double-starting the sim is avoided.

**Solo** (agent is host — auto-advances between sessions):

```bash
./scripts/session-player.sh weekend --name "PitBot" --role host
# or explicitly: --advance auto
```

**Advance one step manually** (player permission):

```bash
./scripts/session-player.sh continue-weekend --name "PitBot" --role player --pretty
```

The orchestrator (`tools/session-player/src/weekend_orchestrator.ts`):

1. Waits for host to start each session (`--advance host`) or calls `start_round` / `continue_weekend_session` itself (`--advance auto`)
2. Releases cars from garage (`release`) in open sessions
3. Runs fuel-aware pit strategy per session type
4. Waits for `race_complete.nextWeekendSession` and loops until the race finishes

**Practice/qualifying** results are sorted by **best lap** per class. **Race** targets **class wins** in Hypercar and LMGT3.

| Symptom | Fix |
|---------|-----|
| Sim breaks after clicking Continue | Ensure PitBot uses default `--advance host`; only click Continue **once** per session |
| Viewer stuck on post-race overlay | Refresh viewer — `session_init` now auto-switches to map when a session starts |

## Typical agent loop during a live race

```bash
PLAYER="./scripts/session-player.sh --name PitBot --role player"

$PLAYER status --pretty          # race time, paused?, managed entries
$PLAYER leaderboard               # who is leading
$PLAYER car --team "Cursor"       # your team car snapshot
$PLAYER weather                   # track state
$PLAYER events --seconds 5        # recent pits / incidents

# Decide and act
$PLAYER submit "driver_mode=push"
$PLAYER pit
```

Repeat status → decide → submit as the race progresses.

## Roles & permissions (quick reference)

| Action | Host | Player | Spectator |
|--------|------|--------|-----------|
| Pause / resume / time scale | ✓ | ✓ | ✗ |
| Pit / driver commands | ✓ | ✓ | ✗ |
| Create team / new game / garage | ✓ | ✗ | ✗ |
| Watch ticks / leaderboard | ✓ | ✓ | ✓ |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Human auto-named "Player" | Clear site data or click **Identity** in header to re-join |
| Agent always becomes host | Pass `--role player`; ensure human joined as host first |
| `Not authorized for this car` | Use `--entry` from `managedEntryIds` in `roster` output |
| `Not permitted for your role` | Use `--role player` or `--role host`, not spectator |
| No `coop` mode | Need 2+ host/player clients connected simultaneously |
| Connection refused | Start server on matching `--url` port |

## See also

- [live-session-player](../live-session-player/SKILL.md) — solo e2e, team creation, catalog
- `docs/WS_PROTOCOL.md` — `join_session`, `client_assignment`, `roster_update`
