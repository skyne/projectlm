import type { EngineBuildPayload } from "../ws_protocol";

export const HP_CONVERSION = 7127;
export const ENGINE_WEIGHT_COEFF = 35;
export const ENGINE_WEIGHT_CYL_FACTOR = 5;
export const DIESEL_WEIGHT_MULT = 1.3;

export const ENGINE_LAYOUTS = [
  "I4", "I6", "V6", "V8", "V10", "V12", "Flat4", "Flat6", "Rotary", "LMP2Spec",
] as const;
export const FUEL_TYPES = ["Gasoline", "Diesel", "Hydrogen"] as const;
export const ASPIRATION_TYPES = [
  "NA", "Single", "TwinParallel", "TwinSequential", "Quad", "EBoost",
] as const;
export const DRIVETRAIN_TYPES = [
  "Mechanical", "ParallelHybrid", "FrontAxleHybrid", "RangeExtender", "FullEV",
] as const;

const LAYOUT_CYLINDERS: Record<string, number> = {
  I4: 4, I6: 6, V6: 6, V8: 8, V10: 10, V12: 12, Flat4: 4, Flat6: 6, Rotary: 2, LMP2Spec: 8,
};

export function cylindersForLayout(layout: string): number {
  return LAYOUT_CYLINDERS[layout] ?? 6;
}

export function displacementLiters(engine: EngineBuildPayload): number {
  const radius = engine.bore / 2;
  const volume =
    engine.cylinders * Math.PI * radius * radius * engine.stroke;
  return volume * 1000;
}

export function peakTorqueNm(engine: EngineBuildPayload): number {
  if (engine.peak_torque_nm > 0) return engine.peak_torque_nm;
  const disp = displacementLiters(engine);
  const boreStroke = engine.bore / Math.max(engine.stroke, 0.001);
  return disp * 105 * Math.sqrt(Math.max(0.5, boreStroke));
}

export function peakHorsepower(engine: EngineBuildPayload): number {
  const torque = peakTorqueNm(engine);
  const rpm = engine.peak_torque_rpm > 0 ? engine.peak_torque_rpm : engine.max_rpm;
  return (torque * rpm) / HP_CONVERSION;
}

export function engineMassKg(engine: EngineBuildPayload): number {
  let mass =
    displacementLiters(engine) * ENGINE_WEIGHT_COEFF +
    engine.cylinders * ENGINE_WEIGHT_CYL_FACTOR;
  if (engine.fuel_type === "Diesel") mass *= DIESEL_WEIGHT_MULT;
  if (engine.drivetrain === "FullEV") return 12;
  if (engine.drivetrain === "RangeExtender") mass *= 0.85;
  return mass;
}

export function validateEngineBuild(engine: EngineBuildPayload): string | null {
  if (!ENGINE_LAYOUTS.includes(engine.engine_layout as (typeof ENGINE_LAYOUTS)[number])) {
    return "Invalid engine layout";
  }
  if (!FUEL_TYPES.includes(engine.fuel_type as (typeof FUEL_TYPES)[number])) {
    return "Invalid fuel type";
  }
  if (engine.aspiration && !ASPIRATION_TYPES.includes(engine.aspiration as (typeof ASPIRATION_TYPES)[number])) {
    return "Invalid aspiration";
  }
  if (engine.drivetrain && !DRIVETRAIN_TYPES.includes(engine.drivetrain as (typeof DRIVETRAIN_TYPES)[number])) {
    return "Invalid drivetrain";
  }
  const expectedCyl = cylindersForLayout(engine.engine_layout);
  if (engine.cylinders !== expectedCyl) {
    return `${engine.engine_layout} requires ${expectedCyl} cylinders`;
  }
  if (engine.drivetrain !== "FullEV") {
    if (engine.bore < 0.04 || engine.bore > 0.12) return "Bore out of range";
    if (engine.stroke < 0.03 || engine.stroke > 0.12) return "Stroke out of range";
  }
  if (engine.max_rpm < 3500 || engine.max_rpm > 13000) return "Max RPM out of range";
  if (engine.peak_torque_nm < 100 || engine.peak_torque_nm > 1200) {
    return "Peak torque out of range";
  }
  if (engine.peak_torque_rpm < 2500 || engine.peak_torque_rpm > 10000) {
    return "Peak torque RPM out of range";
  }
  if (engine.base_vibration < 0.5 || engine.base_vibration > 1.6) {
    return "Engine stress factor out of range";
  }
  if (engine.engine_layout === "Rotary" && engine.aspiration === "Quad") {
    return "Rotary cannot use quad turbos";
  }
  if (engine.aspiration === "EBoost" && engine.drivetrain === "Mechanical") {
    return "E-Boost requires hybrid or REX drivetrain";
  }
  return null;
}
