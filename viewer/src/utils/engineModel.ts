import type { EngineBuildPayload } from "../ws/protocol";
import {
  effectiveHorsepower,
  resolvePowertrainTraits,
  HP_CONVERSION,
  ENGINE_WEIGHT_COEFF,
  ENGINE_WEIGHT_CYL_FACTOR,
  LAYOUTS,
  FUEL_TYPES,
  cylindersForLayout,
} from "./powertrain_traits";

export {
  HP_CONVERSION,
  ENGINE_WEIGHT_COEFF,
  ENGINE_WEIGHT_CYL_FACTOR,
  effectiveHorsepower,
  resolvePowertrainTraits,
  cylindersForLayout,
};

export const ENGINE_LAYOUTS = LAYOUTS.map((l) => ({
  id: l.id,
  label: l.label,
  cylinders: l.cylinders,
}));

export { FUEL_TYPES };

export function displacementLiters(engine: EngineBuildPayload): number {
  if (engine.bore <= 0 || engine.stroke <= 0 || engine.cylinders <= 0) return 0;
  const radius = engine.bore / 2;
  return engine.cylinders * Math.PI * radius * radius * engine.stroke * 1000;
}

export function peakTorqueNm(engine: EngineBuildPayload): number {
  if (engine.peak_torque_nm > 0) return engine.peak_torque_nm;
  const disp = displacementLiters(engine);
  return disp * 105;
}

export function peakHorsepower(engine: EngineBuildPayload, classId = "Hypercar"): number {
  return resolvePowertrainTraits(engine, classId).peakHp;
}

export function engineMassKg(engine: EngineBuildPayload, classId = "Hypercar"): number {
  const traits = resolvePowertrainTraits(engine, classId);
  return traits.engineMassKg + traits.drivetrainExtraMassKg;
}
