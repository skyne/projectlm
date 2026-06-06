import * as fs from "fs";
import * as path from "path";
import { defaultTrackPreset } from "./weekend_setup";

/** Patch an on-disk car config with AI grid baseline for this track. */
export function applyAiTrackSetupToConfig(
  repoRoot: string,
  carConfigPath: string,
  trackId: string,
  classId: string,
): void {
  const abs = path.join(repoRoot, carConfigPath);
  if (!fs.existsSync(abs)) return;

  const preset = defaultTrackPreset(trackId);
  const lines = fs.readFileSync(abs, "utf8").split("\n");
  const out: string[] = [];
  const replaced = new Set<string>();

  const setLine = (key: string, value: string) => {
    replaced.add(key);
    out.push(`${key}=${value}`);
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      out.push(line);
      continue;
    }
    const key = trimmed.slice(0, eq);
    if (
      key === "duct_airflow" ||
      key === "starting_wing_delta" ||
      key === "starting_brake_bias"
    ) {
      continue;
    }
    // Only strip suspension keys when the track preset supplies a replacement.
    const stripIfPreset = (presetKey: keyof typeof preset, lineKey: string) => {
      if (key === lineKey && preset[presetKey] != null) return true;
      return false;
    };
    if (
      stripIfPreset("frontRideHeightMm", "front_ride_height_m") ||
      stripIfPreset("rearRideHeightMm", "rear_ride_height_m") ||
      (key === "ride_height" &&
        preset.frontRideHeightMm != null &&
        preset.rearRideHeightMm != null) ||
      stripIfPreset("frontSpringNm", "front_spring_stiffness") ||
      stripIfPreset("rearSpringNm", "rear_spring_stiffness") ||
      stripIfPreset("frontArbStiffness", "front_arb_stiffness") ||
      stripIfPreset("rearArbStiffness", "rear_arb_stiffness") ||
      stripIfPreset("frontDamperBump", "front_damper_bump") ||
      stripIfPreset("frontDamperRebound", "front_damper_rebound") ||
      stripIfPreset("rearDamperBump", "rear_damper_bump") ||
      stripIfPreset("rearDamperRebound", "rear_damper_rebound")
    ) {
      continue;
    }
    out.push(line);
  }

  if (preset.frontRideHeightMm != null) {
    setLine("front_ride_height_m", (preset.frontRideHeightMm / 1000).toFixed(4));
  }
  if (preset.rearRideHeightMm != null) {
    setLine("rear_ride_height_m", (preset.rearRideHeightMm / 1000).toFixed(4));
  }
  if (preset.frontRideHeightMm != null && preset.rearRideHeightMm != null) {
    setLine(
      "ride_height",
      (
        (preset.frontRideHeightMm + preset.rearRideHeightMm) /
        2 /
        1000
      ).toFixed(4),
    );
  }
  if (preset.frontSpringNm != null) {
    setLine("front_spring_stiffness", String(preset.frontSpringNm));
  }
  if (preset.rearSpringNm != null) {
    setLine("rear_spring_stiffness", String(preset.rearSpringNm));
  }
  if (preset.frontArbStiffness != null) {
    setLine("front_arb_stiffness", preset.frontArbStiffness.toFixed(2));
  }
  if (preset.rearArbStiffness != null) {
    setLine("rear_arb_stiffness", preset.rearArbStiffness.toFixed(2));
  }
  if (preset.frontDamperBump != null) {
    setLine("front_damper_bump", String(preset.frontDamperBump));
  }
  if (preset.frontDamperRebound != null) {
    setLine("front_damper_rebound", String(preset.frontDamperRebound));
  }
  if (preset.rearDamperBump != null) {
    setLine("rear_damper_bump", String(preset.rearDamperBump));
  }
  if (preset.rearDamperRebound != null) {
    setLine("rear_damper_rebound", String(preset.rearDamperRebound));
  }
  if (preset.ductAirflow != null) {
    setLine("duct_airflow", preset.ductAirflow.toFixed(2));
  }
  if (preset.wingBaseline != null) {
    setLine("starting_wing_delta", preset.wingBaseline.toFixed(3));
  }
  if (preset.brakeBiasBaseline != null) {
    setLine("starting_brake_bias", preset.brakeBiasBaseline.toFixed(3));
  }

  // Class-specific small jitter so AI cars aren't identical
  const jitter = classId === "LMGT3" ? 0 : classId === "LMP2" ? 1 : 2;
  if (!replaced.has("front_damper_bump") && jitter) {
    const base = readNumeric(lines, "front_damper_bump") ?? 8;
    setLine("front_damper_bump", String(Math.min(15, base + jitter)));
  }

  out.push(`# AI track setup: ${trackId}`);
  fs.writeFileSync(abs, out.join("\n") + "\n");
}

function readNumeric(lines: string[], key: string): number | null {
  for (const line of lines) {
    if (line.startsWith(`${key}=`)) {
      const v = parseFloat(line.slice(key.length + 1));
      return Number.isFinite(v) ? v : null;
    }
  }
  return null;
}

/** Apply per-track AI baselines to runtime grid configs. */
export function materializeAiGridConfigs(
  repoRoot: string,
  entries: Array<{ carConfigPath: string; classId: string; isPlayer: boolean }>,
  trackId: string,
): void {
  for (const entry of entries) {
    if (entry.isPlayer) continue;
    applyAiTrackSetupToConfig(
      repoRoot,
      entry.carConfigPath,
      trackId,
      entry.classId,
    );
  }
}
