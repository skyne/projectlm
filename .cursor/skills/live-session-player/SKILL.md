---
name: live-session-player
description: >-
  Connect to a running ProjectLM WebSocket session as a player client. Use when
  creating teams, running full e2e race tests, inspecting live race state,
  reading leaderboards/weather, submitting pit commands, or controlling playback.
  For multiplayer / human-vs-LLM co-op, also read the multiplayer-agent-player skill.
---

# Live Session Player

Query and control a running ProjectLM sim through the WebSocket server.

For **multiplayer** (co-op pit wall, human vs LLM agent, spectator), use the dedicated skill: [multiplayer-agent-player](../multiplayer-agent-player/SKILL.md).

## Prerequisites

1. Server must be running:
   ```bash
   ./dev-viewer.sh
   # or: cd server && npm run dev
   ```
2. Wrapper script (installs deps on first run):
   ```bash
   ./scripts/session-player.sh ping
   ```

Default WebSocket URL: `ws://localhost:9785` (override with `--url`, `PROJECTLM_WS_URL`, or `PROJECTLM_WS_PORT`).

Global join flags: `--name <displayName>`, `--role host|player|spectator`.

## Full E2E test (preferred)

Runs the entire player journey in one command:

```bash
./scripts/session-player.sh e2e --pretty
```

Flow: `new_game` → `create_team` (LMP2 privateer preset) → `start_round` → `resume` @ 20× → watch 8s.

Options:
```bash
./scripts/session-player.sh e2e \
  --name "Agent Motorsport" \
  --preset lmp2-privateer \
  --platform oreca_07_gibson \
  --watch-seconds 15 \
  --time-scale 30 \
  --pretty
```

Exit code `0` = all steps passed. Output includes `steps[]`, `leaderboard`, `playerCar`, `events`.

Presets: `lmp2-privateer` (default), `lmgt3-privateer`, `hypercar-manufacturer`.

## Team creation (step by step)

```bash
# 1. Reset career lobby
./scripts/session-player.sh new-game

# 2. Inspect available platforms / classes
./scripts/session-player.sh catalog --pretty

# 3. Found team
./scripts/session-player.sh create-team \
  --preset lmp2-privateer \
  --name "Cursor Racing" \
  --pretty

# 4. Start official test at Paul Ricard
./scripts/session-player.sh start-round --pretty

# 5. Unpause and accelerate
./scripts/session-player.sh resume
./scripts/session-player.sh time-scale 20

# 6. Watch live state
./scripts/session-player.sh watch --seconds 10 --pretty
```

Or load a custom payload:
```bash
./scripts/session-player.sh create-team --file ./my-team.json --pretty
```

## Live race commands

```bash
PLAYER="./scripts/session-player.sh"

$PLAYER ping
$PLAYER session
$PLAYER meta
$PLAYER roster
$PLAYER status
$PLAYER leaderboard
$PLAYER car --team "Cursor"
$PLAYER pit
$PLAYER events --seconds 5
```

## Typical agent workflows

**Run a full smoke test after code changes**
```bash
./scripts/session-player.sh e2e --pretty
```

**Check whether a session is live**
```bash
./scripts/session-player.sh ping
```

**Answer "who is leading?"**
```bash
./scripts/session-player.sh leaderboard
```

**Pit the player's car**
```bash
./scripts/session-player.sh pit
```

**Run a full WEC weekend (practice → quali → race)**
```bash
# Co-op: host clicks Continue between sessions (default --advance host)
./scripts/session-player.sh weekend --name "PitBot" --role player

# Solo: agent auto-advances
./scripts/session-player.sh weekend --name "PitBot" --role host
```

See [multiplayer-agent-player](../multiplayer-agent-player/SKILL.md) for co-op vs solo host setup.

## Entry lookup

During an active race, resolve cars by:

| Flag | Example |
|------|---------|
| *(default)* | uses `playerEntryId` / `managedEntryIds` from session |
| `--car` | `--car 7` |
| `--team` | `--team "Cursor"` (substring match) |
| `--entry` | `--entry <entryId from session_init>` |

## Protocol notes

- Game-mode server starts **paused** until `resume`.
- `create_team` requires `setupComplete === false` (use `new-game` first).
- `start-round` requires `setupComplete === true` and a valid fleet.
- Player commands use `submit_command` with `{ entryId, command }`.
- Server accepts commands for any **managed team car** (`managedEntryIds`).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Connection refused | Start server: `./dev-viewer.sh` |
| `Team already founded` | `./scripts/session-player.sh new-game` |
| `Complete team setup first` | Run `create-team` or `e2e` |
| `No ticks received` | `resume` + `time-scale 20` |
| `start_round` failed | Check `meta` fleet; inspect server logs |
