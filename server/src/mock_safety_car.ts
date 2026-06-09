import type { CarSnapshot } from "./ws_protocol";

export const SAFETY_CAR_ENTRY_ID = "safety-car";

const PIT_LANE_FRACTION = 0.06;
const PIT_LANE_SPEED_MS = 60 / 3.6;
const SC_TRAIN_SPEED_MS = 60 / 3.6;
const FORMATION_CATCH_UP_SPEED_MS = 90 / 3.6;
const SC_LEAD_GAP_M = 75;
const SC_TRAIN_FOLLOW_GAP_M = 30;
const SC_ACCEL_MS2 = 4.5;
const SC_GAP_SPEED_GAIN = 0.12;
const PIT_LATERAL_OFFSET_M = 3.5;

export type MockSafetyCarPhase = "parked" | "exiting_pit" | "on_track" | "entering_pit";

export interface MockSafetyCarState {
  phase: MockSafetyCarPhase;
  inPit: boolean;
  pitLaneDistance: number;
  distance: number;
  lap: number;
  speed: number;
}

export interface MockTrackSample {
  distance: number;
  normalizedT: number;
  x: number;
  z: number;
  tangentX: number;
  tangentZ: number;
}

function pitLaneLengthM(lapLength: number): number {
  return lapLength * PIT_LANE_FRACTION;
}

function pitBoxDistanceM(lapLength: number): number {
  return pitLaneLengthM(lapLength) * 0.48;
}

function modLap(distance: number, lapLength: number): number {
  if (lapLength <= 0) return 0;
  let d = distance % lapLength;
  if (d < 0) d += lapLength;
  return d;
}

/** Signed metres SC is ahead of the leader on the current lap (+ = ahead). */
function signedScAheadOfLeaderOnLap(
  leaderOnLap: number,
  scOnLap: number,
  lapLength: number,
): number {
  leaderOnLap = modLap(leaderOnLap, lapLength);
  scOnLap = modLap(scOnLap, lapLength);
  if (scOnLap >= leaderOnLap) return scOnLap - leaderOnLap;
  const behind = leaderOnLap - scOnLap;
  if (behind < lapLength * 0.5) return -behind;
  return lapLength - behind;
}

export function createParkedMockSafetyCar(lapLength: number): MockSafetyCarState {
  return {
    phase: "parked",
    inPit: true,
    pitLaneDistance: pitBoxDistanceM(lapLength),
    distance: 0,
    lap: 1,
    speed: 0,
  };
}

export function deployMockSafetyCar(sc: MockSafetyCarState, lapLength: number): void {
  if (sc.phase === "on_track" || sc.phase === "exiting_pit") return;
  sc.phase = "exiting_pit";
  sc.inPit = true;
  sc.speed = 0;
  sc.pitLaneDistance = pitBoxDistanceM(lapLength);
}

export function peelOffMockSafetyCar(sc: MockSafetyCarState): void {
  if (sc.phase === "parked" || sc.phase === "entering_pit") return;
  sc.phase = "entering_pit";
}

export function parkMockSafetyCar(sc: MockSafetyCarState, lapLength: number): void {
  sc.phase = "parked";
  sc.inPit = true;
  sc.speed = 0;
  sc.pitLaneDistance = pitBoxDistanceM(lapLength);
}

export function tickMockSafetyCar(
  sc: MockSafetyCarState,
  lapLength: number,
  frontPackRaceDistance: number,
  deltaTime: number,
): void {
  if (deltaTime <= 0 || sc.phase === "parked") return;

  const laneLen = pitLaneLengthM(lapLength);
  const boxDist = pitBoxDistanceM(lapLength);
  const mergeDist = laneLen;

  switch (sc.phase) {
    case "exiting_pit":
      sc.inPit = true;
      sc.speed = PIT_LANE_SPEED_MS;
      sc.pitLaneDistance += sc.speed * deltaTime;
      if (sc.pitLaneDistance < laneLen) return;
      sc.pitLaneDistance = laneLen;
      sc.inPit = false;
      sc.distance = mergeDist;
      sc.speed = PIT_LANE_SPEED_MS * 0.85;
      sc.phase = "on_track";
      return;

    case "on_track": {
      sc.inPit = false;
      const leaderOnLap = modLap(frontPackRaceDistance, lapLength);
      const scOnLap = modLap(sc.distance, lapLength);
      let delta = scOnLap - leaderOnLap;
      while (delta > lapLength * 0.5) delta -= lapLength;
      while (delta < -lapLength * 0.5) delta += lapLength;
      const spacingError = delta - SC_LEAD_GAP_M;

      const leaderSpeed = SC_TRAIN_SPEED_MS * 0.85;
      let desired = leaderSpeed - spacingError * SC_GAP_SPEED_GAIN;
      desired = Math.max(0, Math.min(SC_TRAIN_SPEED_MS, desired));
      sc.speed += Math.max(
        -SC_ACCEL_MS2 * deltaTime,
        Math.min(SC_ACCEL_MS2 * deltaTime, desired - sc.speed),
      );

      sc.distance += sc.speed * deltaTime;
      if (sc.distance >= lapLength) {
        sc.distance -= lapLength;
        sc.lap += 1;
      }
      return;
    }

    case "entering_pit":
      if (!sc.inPit) {
        const entranceDist = 0;
        let forward = entranceDist - sc.distance;
        if (forward < 0) forward += lapLength;
        if (forward > 40) {
          sc.speed = Math.min(SC_TRAIN_SPEED_MS, PIT_LANE_SPEED_MS);
          sc.distance += sc.speed * deltaTime;
          if (sc.distance >= lapLength) {
            sc.distance -= lapLength;
            sc.lap += 1;
          }
          return;
        }
        sc.inPit = true;
        sc.distance = entranceDist;
        sc.pitLaneDistance = 0;
        sc.speed = PIT_LANE_SPEED_MS;
        return;
      }
      sc.speed = PIT_LANE_SPEED_MS;
      sc.pitLaneDistance += sc.speed * deltaTime;
      if (sc.pitLaneDistance < boxDist) return;
      sc.pitLaneDistance = boxDist;
      sc.speed = 0;
      sc.phase = "parked";
      return;

    default:
      return;
  }
}

function sampleAtRaceDistance(
  distance: number,
  samples: MockTrackSample[],
): MockTrackSample {
  const start = samples[0];
  if (!start) {
    return {
      distance: 0,
      normalizedT: 0,
      x: 0,
      z: 0,
      tangentX: 1,
      tangentZ: 0,
    };
  }
  const lapLength = samples[samples.length - 1]?.distance ?? 1;
  const d = ((distance % lapLength) + lapLength) % lapLength;
  return samples.find((s) => s.distance >= d) ?? start;
}

export function buildMockSafetyCarSnapshot(
  sc: MockSafetyCarState,
  lapLength: number,
  samples: MockTrackSample[],
): CarSnapshot | null {
  if (sc.phase === "parked") return null;

  const d = sc.inPit
    ? sc.pitLaneDistance
    : sc.distance + (sc.lap - 1) * lapLength;
  const sample = sc.inPit
    ? samples.find((s) => s.distance >= d) ?? samples[0]
    : sampleAtRaceDistance(d, samples);
  if (!sample) return null;

  const lateralOffset = sc.inPit ? PIT_LATERAL_OFFSET_M : 0;
  const perpX = -sample.tangentZ;
  const perpZ = sample.tangentX;

  return {
    entryId: SAFETY_CAR_ENTRY_ID,
    teamName: "Race Control",
    carNumber: "SC",
    classId: "SafetyCar",
    lap: sc.lap,
    distance: sc.distance,
    normalizedT: sample.normalizedT,
    speed: sc.speed,
    rpm: 0,
    fuel: 1,
    tireWear: 0,
    tireWearFL: 0,
    tireWearFR: 0,
    tireWearRL: 0,
    tireWearRR: 0,
    tireCompound: "medium",
    tireTempC: 0,
    coolantTempC: 0,
    engineHealth: 100,
    sectorIndex: 0,
    racePosition: 0,
    classPosition: 0,
    inGarage: false,
    inPit: sc.inPit,
    pitQueued: false,
    retired: false,
    pitLaneDistance: sc.inPit ? sc.pitLaneDistance : undefined,
    driverName: "Safety Car",
    currentLapTime: 0,
    currentSectorTime: 0,
    lastLapTime: 0,
    bestLapTime: 0,
    gapToLeader: 0,
    currentLapSectorTimes: [],
    lapHistory: [],
    position: {
      x: sample.x + perpX * lateralOffset,
      y: 0,
      z: sample.z + perpZ * lateralOffset,
    },
    tangent: { x: sample.tangentX, y: 0, z: sample.tangentZ },
    carLengthM: 4.8,
    carWidthM: 1.95,
  };
}
