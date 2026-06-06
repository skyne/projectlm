import type { CarSnapshot } from "../ws_protocol";

export interface TelemetrySummary {
  entryId: string;
  teamName: string;
  carNumber: string;
  classId: string;
  lap: number;
  racePosition: number;
  classPosition?: number;
  gapToLeaderSec: number | null;
  fuelLiters: number;
  fuelTankLiters: number;
  fuelPercent: number;
  engineHealth: number;
  coolantTempC: number;
  driverName: string;
  driverMode: string;
  driverStamina: number;
  driverStintMinutes: number;
  maxTireWear: number;
  tireWear: { FL?: number; FR?: number; RL?: number; RR?: number };
  tireTempC: { FL?: number; FR?: number; RL?: number; RR?: number };
  bestLapSec: number | null;
  lastLapSec: number | null;
  currentLapSec: number | null;
  inPit: boolean;
  pitQueued: boolean;
  retired: boolean;
  setupFeedback: string | null;
  wingAngle: number;
  brakeBias: number;
  recentLaps: Array<{ lap: number; timeSec: number }>;
}

function finiteOrNull(v: number | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function summarizeTelemetry(
  snap: CarSnapshot,
  raceTimeSec = 0,
): TelemetrySummary {
  const tank =
    typeof snap.fuelTankCapacity === "number" && snap.fuelTankCapacity > 0
      ? snap.fuelTankCapacity
      : snap.classId === "LMGT3"
        ? 120
        : snap.classId === "LMP2"
          ? 75
          : 90;

  const wears = [
    snap.tireWearFL,
    snap.tireWearFR,
    snap.tireWearRL,
    snap.tireWearRR,
    snap.tireWear,
  ].filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const recentLaps = (snap.lapHistory ?? [])
    .slice(-5)
    .map((row) => ({ lap: row.lapNumber, timeSec: row.lapTime }))
    .filter((row) => row.timeSec > 0);

  return {
    entryId: snap.entryId,
    teamName: snap.teamName,
    carNumber: snap.carNumber,
    classId: snap.classId,
    lap: snap.lap,
    racePosition: snap.racePosition,
    classPosition: snap.classPosition,
    gapToLeaderSec: finiteOrNull(snap.gapToLeader),
    fuelLiters: snap.fuel,
    fuelTankLiters: tank,
    fuelPercent: tank > 0 ? (snap.fuel / tank) * 100 : 0,
    engineHealth: snap.engineHealth,
    coolantTempC: snap.coolantTempC ?? 70,
    driverName: snap.driverName ?? "Driver",
    driverMode: snap.driverMode ?? "normal",
    driverStamina: snap.driverStamina ?? 100,
    driverStintMinutes: (snap.driverStintSeconds ?? 0) / 60,
    maxTireWear: wears.length ? Math.max(...wears) : snap.tireWear,
    tireWear: {
      FL: snap.tireWearFL,
      FR: snap.tireWearFR,
      RL: snap.tireWearRL,
      RR: snap.tireWearRR,
    },
    tireTempC: {
      FL: snap.tireTempFL,
      FR: snap.tireTempFR,
      RL: snap.tireTempRL,
      RR: snap.tireTempRR,
    },
    bestLapSec: finiteOrNull(snap.bestLapTime),
    lastLapSec: finiteOrNull(snap.lastLapTime),
    currentLapSec: finiteOrNull(snap.currentLapTime),
    inPit: snap.inPit,
    pitQueued: snap.pitQueued ?? false,
    retired: snap.retired,
    setupFeedback: snap.setupFeedback ?? null,
    wingAngle: snap.wingAngle ?? 0,
    brakeBias: snap.brakeBias ?? 0.5,
    recentLaps,
    ...(raceTimeSec > 0 ? { raceTimeSec: Math.round(raceTimeSec) } : {}),
  };
}

export function summaryForPrompt(summary: TelemetrySummary): string {
  return JSON.stringify(summary, null, 2);
}
