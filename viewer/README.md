# ProjectLM Viewer

Browser viewer for live race simulation. Connects to the WebSocket server via Vite dev proxy.

## Setup

```bash
cd viewer
npm install
```

Start the **server** first (see `../server/README.md`).

## Run

```bash
cd viewer
npm run dev
```

Open **http://localhost:5173**. WebSocket traffic is proxied from `/ws` → `ws://localhost:8765`.

## UI

- **SVG track** — polyline + sector labels, car dots colored by class
- **Leaderboard** — position, team, lap, speed
- **Event log** — sector crosses, lap completes, race finish
- **Playback** — time-scale slider (0–20×), pause / resume

Class colors: Hypercar `#e74c3c`, LMGT3 `#3498db`, LMP2 `#2ecc71`.
