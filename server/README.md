# ProjectLM WebSocket Server

Hosts the simulation tick loop and broadcasts state to viewers over WebSocket (port **9785** by default).

Uses `@projectlm/native` (`bindings/node`) when built; falls back to a TypeScript mock session for development.

## Setup

From the repo root:

```bash
cd bindings/node && npm install && npm run build   # optional — enables real sim
cd ../server && npm install
```

## Run

```bash
cd server
npm run dev
```

### Dev checkpoint (save / restore mid-session)

While a race session is active:

```bash
curl -X POST http://127.0.0.1:9786/dev/checkpoint/save
```

After rebuilding native or server:

```bash
cd server && npm run start -- --restore
```

Or use `./scripts/dev-reload.sh` to save, rebuild, and restart in one step. See `.cursor/skills/dev-checkpoint-reload/SKILL.md`.

Environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` / `PROJECTLM_WS_PORT` | `9785` | WebSocket listen port |
| `PROJECTLM_ROOT` | repo root | Path to configs/tracks |

Default race config: `configs/race_config.txt`. Set `entries=configs/entries.txt` in that file for multicar mode.
