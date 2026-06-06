# WebSocket Protocol v1

ProjectLM viewer ↔ server messages. All frames are JSON text:

```json
{ "protocol": 1, "type": "<message_type>", "payload": { } }
```

## Server → client

| Type | When | Payload |
|------|------|---------|
| `session_init` | On connect | `SessionInitPayload` |
| `client_assignment` | After `join_session` | `ClientAssignmentPayload` |
| `roster_update` | Join, leave, or roster change | `RosterUpdatePayload` |
| `track_geometry` | Once after init | `TrackGeometryPayload` |
| `tick` | Each sim step | `TickPayload` |
| `events` | When sim emits events | `EventsPayload` |
| `race_complete` | Race finished | `RaceCompletePayload` |
| `error` | Failure | `{ message: string; code?: "join_required" \| "forbidden" \| "invalid_message" }` |

## Client → server

| Type | Payload |
|------|---------|
| `join_session` | `{ displayName, playerId?, requestedRole?, joinCode?, reconnectClientId? }` — **required** before mutating commands |
| `set_time_scale` | `{ timeScale: number }` — multiplier ≥ 0 (0 = paused) |
| `pause` | `{}` |
| `resume` | `{}` |
| `restart_race` | `{}` — reset race progress with current definitions |
| `reload_definitions` | `{}` — reload track/car configs from disk, then restart; server broadcasts fresh `session_init` and `track_geometry` |

## Types

### Vec3

```ts
{ x: number; y: number; z: number }
```

### CarSnapshot

```ts
{
  entryId: string;
  teamName: string;
  classId: string;
  lap: number;
  distance: number;
  normalizedT: number;
  speed: number;
  rpm: number;
  fuel: number;
  tireWear: number;
  engineHealth: number;
  sectorIndex: number;
  racePosition: number;
  inPit: boolean;
  retired: boolean;
  position: Vec3;
  tangent: Vec3;
}
```

### SimEventType

`SectorCross` | `LapComplete` | `PitEnter` | `PitExit` | `Retirement` | `RaceComplete`

### SimEvent

```ts
{
  type: SimEventType;
  entryId?: string;
  lap?: number;
  sectorIndex?: number;
  timestamp: number;
  message: string;
}
```

### TrackSectorGeometry

```ts
{
  name: string;
  startT: number;
  endT: number;
  labelX: number;
  labelZ: number;
}
```

### TrackGeometryPayload

```ts
{
  name: string;
  lapLength: number;
  closed: boolean;
  polyline: Array<{ x: number; z: number }>;
  sectors: TrackSectorGeometry[];
}
```

### SessionInitPayload

```ts
{
  trackName: string;
  targetLaps: number;
  targetDurationSeconds?: number;
  raceFormat?: string;
  roundNumber?: number;
  simTimestep: number;
  entries: Array<{
    entryId: string;
    teamName: string;
    carNumber: string;
    classId: string;
  }>;
  carNumberByEntryId: Record<string, string>;
  playerEntryId?: string;
  paused?: boolean;
  /** True when a race weekend session is in progress (live or paused). */
  raceActive: boolean;
  /** Present when raceActive — true if the race has finished. */
  raceComplete?: boolean;
  /** Present when raceActive — elapsed race time in seconds (reconnect catch-up). */
  raceTime?: number;
  /** Present when raceActive — server time compression multiplier (reconnect catch-up). */
  timeScale?: number;
}
```

On connect, if `raceActive` is true the server immediately sends a `tick` with current snapshots so reconnecting clients can restore live race state without waiting for the next sim step.

### ClientAssignmentPayload

```ts
{
  clientId: string;
  displayName: string;
  playerId?: string;
  role: "host" | "player" | "spectator";
  entryIds: string[];
  permissions: string[];  // allowed ClientMessageType values
  sessionMode: "solo" | "coop" | "competitive" | "spectator_only";
}
```

First client becomes `host` with full permissions. Spectators receive read-only permissions (`get_track_preview`, `get_engineer_status`). Clients that do not send `join_session` within ~150ms are auto-joined as `"Player"` / `host` for backward compatibility.

### RosterUpdatePayload

```ts
{
  clients: Array<{
    clientId: string;
    displayName: string;
    role: "host" | "player" | "spectator";
    entryIds: string[];
  }>;
  sessionMode?: "solo" | "coop" | "competitive" | "spectator_only";
}
```

When two or more `host`/`player` clients are connected, `sessionMode` is `"coop"`. All pit-crew clients share the same `entryIds` (team managed cars). `submit_command` is authorized per client against their `entryIds`; co-op commands are attributed in `CommandAck` event messages.

### TickPayload

```ts
{
  raceTime: number;
  snapshots: CarSnapshot[];
}
```

### EventsPayload

```ts
{ events: SimEvent[] }
```

### RaceCompletePayload

```ts
{
  raceTime: number;
  results: Array<{
    entryId: string;
    teamName: string;
    classId: string;
    position: number;
  }>;
}
```
