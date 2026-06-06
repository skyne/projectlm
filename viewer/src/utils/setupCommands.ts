/** Pit / live setup deltas — mirrors src/sim/commands.cpp keys. */

export const PIT_SETUP_SEC = 6;

export interface PitSetupDelta {
  wing?: number;
  brakeBias?: number;
  frontRideHeight?: number;
  rearRideHeight?: number;
  frontSpring?: number;
  rearSpring?: number;
  frontArb?: number;
  rearArb?: number;
  frontDamperBump?: number;
  frontDamperRebound?: number;
  rearDamperBump?: number;
  rearDamperRebound?: number;
}

export function hasSetupDelta(setup: PitSetupDelta): boolean {
  return Object.values(setup).some(
    (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) > 1e-9,
  );
}

export function appendSetupParts(parts: string[], setup: PitSetupDelta): void {
  if (setup.wing != null && Math.abs(setup.wing) > 1e-9) {
    parts.push(`wing=${setup.wing}`);
  }
  if (setup.brakeBias != null && Math.abs(setup.brakeBias) > 1e-9) {
    parts.push(`brake_bias=${setup.brakeBias}`);
  }
  if (setup.frontRideHeight != null && Math.abs(setup.frontRideHeight) > 1e-9) {
    parts.push(`front_ride_height=${setup.frontRideHeight}`);
  }
  if (setup.rearRideHeight != null && Math.abs(setup.rearRideHeight) > 1e-9) {
    parts.push(`rear_ride_height=${setup.rearRideHeight}`);
  }
  if (setup.frontSpring != null && Math.abs(setup.frontSpring) > 1e-9) {
    parts.push(`front_spring=${setup.frontSpring}`);
  }
  if (setup.rearSpring != null && Math.abs(setup.rearSpring) > 1e-9) {
    parts.push(`rear_spring=${setup.rearSpring}`);
  }
  if (setup.frontArb != null && Math.abs(setup.frontArb) > 1e-9) {
    parts.push(`front_arb=${setup.frontArb}`);
  }
  if (setup.rearArb != null && Math.abs(setup.rearArb) > 1e-9) {
    parts.push(`rear_arb=${setup.rearArb}`);
  }
  if (setup.frontDamperBump != null && setup.frontDamperBump !== 0) {
    parts.push(`front_damper_bump=${setup.frontDamperBump}`);
  }
  if (setup.frontDamperRebound != null && setup.frontDamperRebound !== 0) {
    parts.push(`front_damper_rebound=${setup.frontDamperRebound}`);
  }
  if (setup.rearDamperBump != null && setup.rearDamperBump !== 0) {
    parts.push(`rear_damper_bump=${setup.rearDamperBump}`);
  }
  if (setup.rearDamperRebound != null && setup.rearDamperRebound !== 0) {
    parts.push(`rear_damper_rebound=${setup.rearDamperRebound}`);
  }
}

/** Live pit-lane tweak (car must be in pit or pit queued). */
export function buildSetupCommand(setup: PitSetupDelta): string {
  const parts = ["setup"];
  appendSetupParts(parts, setup);
  return parts.length > 1 ? parts.join("|") : "";
}

export function formatSetupSummary(setup: PitSetupDelta): string {
  const bits: string[] = [];
  if (setup.wing != null && Math.abs(setup.wing) > 1e-9) {
    bits.push(setup.wing > 0 ? "more DF" : "less drag");
  }
  if (setup.brakeBias != null && Math.abs(setup.brakeBias) > 1e-9) {
    bits.push(`bias ${setup.brakeBias > 0 ? "+" : ""}${setup.brakeBias.toFixed(2)}`);
  }
  if (setup.frontRideHeight != null && Math.abs(setup.frontRideHeight) > 1e-9) {
    bits.push(`F RH ${(setup.frontRideHeight * 1000).toFixed(0)}mm`);
  }
  if (setup.rearRideHeight != null && Math.abs(setup.rearRideHeight) > 1e-9) {
    bits.push(`R RH ${(setup.rearRideHeight * 1000).toFixed(0)}mm`);
  }
  if (setup.frontSpring != null && Math.abs(setup.frontSpring) > 1e-9) {
    bits.push(`F spring ${setup.frontSpring > 0 ? "+" : ""}${setup.frontSpring}`);
  }
  if (setup.rearSpring != null && Math.abs(setup.rearSpring) > 1e-9) {
    bits.push(`R spring ${setup.rearSpring > 0 ? "+" : ""}${setup.rearSpring}`);
  }
  if (setup.frontArb != null && Math.abs(setup.frontArb) > 1e-9) {
    bits.push(`F ARB ${setup.frontArb > 0 ? "+" : ""}${setup.frontArb.toFixed(2)}`);
  }
  if (setup.rearArb != null && Math.abs(setup.rearArb) > 1e-9) {
    bits.push(`R ARB ${setup.rearArb > 0 ? "+" : ""}${setup.rearArb.toFixed(2)}`);
  }
  const damperKeys = [
    ["FB", setup.frontDamperBump],
    ["FRb", setup.frontDamperRebound],
    ["RB", setup.rearDamperBump],
    ["RRb", setup.rearDamperRebound],
  ] as const;
  for (const [label, v] of damperKeys) {
    if (v != null && v !== 0) bits.push(`${label} ${v > 0 ? "+" : ""}${v}`);
  }
  return bits.length ? bits.join(" · ") : "none";
}
