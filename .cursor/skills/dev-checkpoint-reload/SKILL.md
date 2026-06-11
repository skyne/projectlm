---
name: dev-checkpoint-reload
description: >-
  Save and restore live ProjectLM race sessions across server/native rebuilds.
  Use after sim or server changes when a dev session is in progress — checkpoint
  save, stop, rebuild, and --restore instead of losing mid-race state.
---

# Dev checkpoint reload

Preserve **live race state** (native sim + server overlay) across server restarts and native addon rebuilds.

## When to use

After changing **C++ sim** (`src/sim/`, `bindings/node/`) or **server session logic** (`server/src/sim_host.ts`, pit bot, race builder) while a useful dev session is running:

1. **Save** checkpoint (pauses sim)
2. **Stop** server
3. **Rebuild** native + server
4. **Start** with `--restore`

Do **not** skip this when you were iterating on weather, race control, or pit-wall behavior mid-session — restarting without save loses `RaceSession` and `SimHost` overlay state.

## Quick workflow (script)

```bash
# From repo root — server must be running with an active session
./scripts/dev-reload.sh
```

Options:

```bash
./scripts/dev-reload.sh --save-only          # save only, no restart
./scripts/dev-reload.sh --no-build           # restart + restore, skip rebuild
./scripts/dev-reload.sh --checkpoint /tmp/my.json
```

## Manual workflow

### 1. Save (server running, session active)

```bash
curl -X POST http://127.0.0.1:9786/dev/checkpoint/save
```

Default file: `server/data/dev_checkpoint.json`

Dev API port = `DEV_HTTP_PORT` or `WS_PORT + 1` (default 9786).

### 2. Rebuild

```bash
cd bindings/node && npm run build
cd ../server && npm run build   # optional if using tsx watch
```

### 3. Start with restore

```bash
cd server
npm run start -- --restore
# or explicit path:
npm run start -- --restore server/data/dev_checkpoint.json
```

`npm run dev -- --restore` works with `tsx watch` too.

## What is saved

| Layer | Contents |
|-------|----------|
| **Native sim** | Cars, weather, race control, elapsed time, hazards, flags |
| **Server host** | Pause/time scale, runtime config path, entries, pit bot AI state, stint plans, briefings, in-memory session log |

Meta/career (`data/game_save.json`) is separate and still loads automatically.

## Agent checklist (end of sim/server task)

Before telling the user a sim/server change is done:

1. If a **live session was used** for verification → run `./scripts/dev-reload.sh` or manual save/rebuild/restore
2. Confirm restore logs: `[sim_host] Dev checkpoint restored`
3. Re-run targeted tests (`build/bin/projectlm_tests`, `cd server && npm run test`)
4. If no server was running, note that checkpoint was not exercised

## Limitations

- Requires **native** backend (`@projectlm/native`); mock session has no checkpoint.
- Checkpoint **version** must match; breaking sim schema changes may invalidate old files.
- `new_game` / clearing `configs/runtime/` before restore will break session re-init.
- WebSocket clients must reconnect after restart (server broadcasts catch-up tick on connect).

## API reference

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/dev/checkpoint/save` | Pause + write checkpoint file |
| `GET` | `/dev/checkpoint` | Status (path, raceActive, raceTime) |
| `GET` | `/dev/session-logs` | Post-mortem logs (unchanged) |
