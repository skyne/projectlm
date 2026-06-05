# ProjectLM WebSocket Server

Hosts the simulation tick loop and broadcasts state to viewers over WebSocket (port **8765**).

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

Environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8765` | WebSocket listen port |
| `PROJECTLM_ROOT` | repo root | Path to configs/tracks |

Default race config: `configs/race_config.txt`. Set `entries=configs/entries.txt` in that file for multicar mode.
