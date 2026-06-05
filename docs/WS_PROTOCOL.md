# WebSocket Protocol v1

ProjectLM viewer ↔ server messages. All frames are JSON text:

```json
{ "protocol": 1, "type": "<message_type>", "payload": { } }
```

## Server → client

| Type | When | Payload |
|------|------|---------|
| `session_init` | On connect | `SessionInitPayload` |
| `track_geometry` | Once after init | `TrackGeometryPayload` |
| `tick` | Each sim step | `TickPayload` |
| `events` | When sim emits events | `EventsPayload` |
| `race_complete` | Race finished | `RaceCompletePayload` |
| `error` | Failure | `{ message: string }` |

## Client → server

| Type | Payload |
|------|---------|
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
  simTimestep: number;
  entries: Array<{ entryId: string; teamName: string; classId: string }>;
}
```

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
