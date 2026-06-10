import type { EngineBuildPayload } from "../ws/protocol";

export const HP_CONVERSION = 7127;
export const ENGINE_WEIGHT_COEFF = 30;
export const ENGINE_WEIGHT_CYL_FACTOR = 5;

export type FuelType = "Gasoline" | "Diesel" | "Hydrogen" | "Electric";
export type EnergyConverterId = "Combustion" | "FuelCell";
export type AspirationId =
  | "NA"
  | "Single"
  | "TwinParallel"
  | "TwinSequential"
  | "Quad"
  | "EBoost";
export type DrivetrainId =
  | "Mechanical"
  | "ParallelHybrid"
  | "FrontAxleHybrid"
  | "RangeExtender"
  | "FullEV";
export type LayoutId =
  | "I4"
  | "I6"
  | "V6"
  | "V8"
  | "V10"
  | "V12"
  | "Flat4"
  | "Flat6"
  | "Rotary"
  | "LMP2Spec";

export interface LayoutDef {
  id: LayoutId;
  label: string;
  cylinders: number;
  dispMinL: number;
  dispMaxL: number;
  massMult: number;
  revMult: number;
  torqueMult: number;
  throttleMult: number;
  cgBonus: number;
  stressMult: number;
  thermalMult: number;
}

export interface TraitModifiers {
  massMult: number;
  torqueMult: number;
  revMult: number;
  fuelBurnMult: number;
  throttleMult: number;
  thermalMult: number;
  stressMult: number;
  torquePeakRatio: number;
  torqueFalloff: number;
  throttleLagTau: number;
  serviceabilityMult: number;
}

export interface PowertrainTraits extends TraitModifiers {
  layout: LayoutId;
  fuel: FuelType;
  aspiration: AspirationId;
  drivetrain: DrivetrainId;
  displacementL: number;
  maxRpm: number;
  peakTorqueNm: number;
  peakTorqueRpm: number;
  peakHp: number;
  engineMassKg: number;
  drivetrainExtraMassKg: number;
  deployKw: number;
  regenRate: number;
  stintBudgetMj: number;
  isGeneratorOnly: boolean;
  isElectricDrive: boolean;
  isFuelCell: boolean;
  generatorKw: number;
  drivetrainEfficiency: number;
  cgCorneringBonus: number;
  fuelSystemHint: string | null;
  hybridHint: string | null;
  transmissionHint: string | null;
}

export interface PowertrainUiState {
  fuel: FuelType;
  energyConverter: EnergyConverterId;
  layout: LayoutId;
  aspiration: AspirationId;
  drivetrain: DrivetrainId;
  powerTargetHp: number;
  revCharacter: number;
  blockSize: number;
  generatorSize: number;
  bufferSize: number;
}

export const FUEL_TYPES: FuelType[] = ["Gasoline", "Diesel", "Hydrogen", "Electric"];

export const LAYOUTS: LayoutDef[] = [
  { id: "I4", label: "Inline-4", cylinders: 4, dispMinL: 1.6, dispMaxL: 2.4, massMult: 0.82, revMult: 1.05, torqueMult: 0.92, throttleMult: 1.04, cgBonus: 1.0, stressMult: 0.88, thermalMult: 1.05 },
  { id: "I6", label: "Inline-6", cylinders: 6, dispMinL: 2.8, dispMaxL: 3.6, massMult: 0.94, revMult: 1.0, torqueMult: 1.02, throttleMult: 1.02, cgBonus: 1.0, stressMult: 1.05, thermalMult: 0.98 },
  { id: "V6", label: "V6", cylinders: 6, dispMinL: 2.6, dispMaxL: 3.4, massMult: 1.0, revMult: 1.0, torqueMult: 1.0, throttleMult: 1.0, cgBonus: 1.0, stressMult: 1.0, thermalMult: 1.0 },
  { id: "V8", label: "V8", cylinders: 8, dispMinL: 3.6, dispMaxL: 4.6, massMult: 1.12, revMult: 0.96, torqueMult: 1.14, throttleMult: 0.98, cgBonus: 0.99, stressMult: 1.06, thermalMult: 1.02 },
  { id: "V10", label: "V10", cylinders: 10, dispMinL: 4.8, dispMaxL: 5.5, massMult: 1.18, revMult: 1.08, torqueMult: 1.06, throttleMult: 1.06, cgBonus: 0.98, stressMult: 0.9, thermalMult: 1.12 },
  { id: "V12", label: "V12", cylinders: 12, dispMinL: 5.5, dispMaxL: 6.5, massMult: 1.28, revMult: 1.04, torqueMult: 1.1, throttleMult: 1.04, cgBonus: 0.97, stressMult: 0.92, thermalMult: 1.15 },
  { id: "Flat4", label: "Boxer-4", cylinders: 4, dispMinL: 1.8, dispMaxL: 2.6, massMult: 0.88, revMult: 1.02, torqueMult: 0.96, throttleMult: 1.0, cgBonus: 1.06, stressMult: 0.94, thermalMult: 1.0 },
  { id: "Flat6", label: "Boxer-6", cylinders: 6, dispMinL: 3.2, dispMaxL: 4.2, massMult: 0.96, revMult: 0.98, torqueMult: 1.04, throttleMult: 0.99, cgBonus: 1.05, stressMult: 1.02, thermalMult: 0.96 },
  { id: "Rotary", label: "Wankel", cylinders: 2, dispMinL: 1.3, dispMaxL: 1.3, massMult: 0.72, revMult: 1.18, torqueMult: 0.78, throttleMult: 1.1, cgBonus: 1.03, stressMult: 0.72, thermalMult: 1.25 },
  { id: "LMP2Spec", label: "Gibson V8", cylinders: 8, dispMinL: 4.2, dispMaxL: 4.2, massMult: 1.1, revMult: 0.98, torqueMult: 1.08, throttleMult: 1.0, cgBonus: 1.0, stressMult: 1.04, thermalMult: 1.0 },
];

const FUEL_MOD: Record<FuelType, TraitModifiers & { fuelMassMult: number }> = {
  Gasoline: { massMult: 1, torqueMult: 1, revMult: 1, fuelBurnMult: 1, throttleMult: 1, thermalMult: 1, stressMult: 1, torquePeakRatio: 1, torqueFalloff: 1, throttleLagTau: 1, serviceabilityMult: 1, fuelMassMult: 1 },
  Diesel: { massMult: 1.14, torqueMult: 1.18, revMult: 0.90, fuelBurnMult: 0.78, throttleMult: 0.94, thermalMult: 1.2, stressMult: 1.05, torquePeakRatio: 1, torqueFalloff: 1, throttleLagTau: 1, serviceabilityMult: 1, fuelMassMult: 1.14 },
  Hydrogen: { massMult: 0.88, torqueMult: 0.94, revMult: 1.06, fuelBurnMult: 1.05, throttleMult: 1.02, thermalMult: 0.85, stressMult: 1.02, torquePeakRatio: 1, torqueFalloff: 1, throttleLagTau: 1, serviceabilityMult: 0.94, fuelMassMult: 0.88 },
  Electric: { massMult: 0.92, torqueMult: 1, revMult: 1, fuelBurnMult: 0.88, throttleMult: 1.1, thermalMult: 0.75, stressMult: 0.88, torquePeakRatio: 1, torqueFalloff: 1, throttleLagTau: 0.03, serviceabilityMult: 0.82, fuelMassMult: 0.92 },
};

const ASPIRATION_MOD: Record<AspirationId, TraitModifiers & { specificTorqueMult: number }> = {
  NA: { massMult: 0.96, torqueMult: 0.92, revMult: 1.06, fuelBurnMult: 1, throttleMult: 1.08, thermalMult: 0.9, stressMult: 0.92, torquePeakRatio: 0.78, torqueFalloff: 2.0, throttleLagTau: 0.05, serviceabilityMult: 1.04, specificTorqueMult: 0.92 },
  Single: { massMult: 1.04, torqueMult: 1.08, revMult: 1, fuelBurnMult: 1.02, throttleMult: 0.94, thermalMult: 1.08, stressMult: 1, torquePeakRatio: 0.68, torqueFalloff: 2.4, throttleLagTau: 0.12, serviceabilityMult: 1, specificTorqueMult: 1.08 },
  TwinParallel: { massMult: 1.1, torqueMult: 1.14, revMult: 0.98, fuelBurnMult: 1.06, throttleMult: 0.9, thermalMult: 1.14, stressMult: 1.04, torquePeakRatio: 0.65, torqueFalloff: 2.6, throttleLagTau: 0.16, serviceabilityMult: 0.98, specificTorqueMult: 1.14 },
  TwinSequential: { massMult: 1.16, torqueMult: 1.18, revMult: 0.96, fuelBurnMult: 1.08, throttleMult: 0.82, thermalMult: 1.18, stressMult: 1.1, torquePeakRatio: 0.62, torqueFalloff: 2.2, throttleLagTau: 0.22, serviceabilityMult: 0.9, specificTorqueMult: 1.18 },
  Quad: { massMult: 1.24, torqueMult: 1.22, revMult: 0.94, fuelBurnMult: 1.12, throttleMult: 0.78, thermalMult: 1.26, stressMult: 1.16, torquePeakRatio: 0.58, torqueFalloff: 2.8, throttleLagTau: 0.3, serviceabilityMult: 0.85, specificTorqueMult: 1.22 },
  EBoost: { massMult: 1.12, torqueMult: 1.12, revMult: 1.02, fuelBurnMult: 1.04, throttleMult: 1.04, thermalMult: 1.06, stressMult: 1.02, torquePeakRatio: 0.7, torqueFalloff: 2.2, throttleLagTau: 0.06, serviceabilityMult: 0.94, specificTorqueMult: 1.12 },
};

const DRIVETRAIN_MOD: Record<
  DrivetrainId,
  {
    extraMassKg: number;
    deployKw: number;
    regenRate: number;
    stintBudgetMj: number;
    throttleMult: number;
    serviceabilityMult: number;
    stressMult: number;
    isGeneratorOnly: boolean;
    isElectricDrive: boolean;
    generatorKw: number;
    efficiency: number;
    hybridHint: string | null;
    transmissionHint: string | null;
  }
> = {
  Mechanical: { extraMassKg: 0, deployKw: 0, regenRate: 0, stintBudgetMj: 0, throttleMult: 1, serviceabilityMult: 1, stressMult: 1, isGeneratorOnly: false, isElectricDrive: false, generatorKw: 0, efficiency: 1, hybridHint: "None", transmissionHint: null },
  ParallelHybrid: { extraMassKg: 36, deployKw: 50, regenRate: 0.35, stintBudgetMj: 8, throttleMult: 1.04, serviceabilityMult: 0.94, stressMult: 0.96, isGeneratorOnly: false, isElectricDrive: false, generatorKw: 0, efficiency: 1, hybridHint: "LMDh50kW", transmissionHint: null },
  FrontAxleHybrid: { extraMassKg: 32, deployKw: 200, regenRate: 0.5, stintBudgetMj: 4.5, throttleMult: 1.06, serviceabilityMult: 0.92, stressMult: 0.94, isGeneratorOnly: false, isElectricDrive: false, generatorKw: 0, efficiency: 1, hybridHint: "HypercarHV", transmissionHint: null },
  RangeExtender: { extraMassKg: 125, deployKw: 0, regenRate: 0.4, stintBudgetMj: 2.5, throttleMult: 1.04, serviceabilityMult: 0.82, stressMult: 0.88, isGeneratorOnly: true, isElectricDrive: true, generatorKw: 280, efficiency: 0.88, hybridHint: "None", transmissionHint: "SingleSpeedEDrive" },
  FullEV: { extraMassKg: 130, deployKw: 350, regenRate: 0.55, stintBudgetMj: 6, throttleMult: 1.15, serviceabilityMult: 0.78, stressMult: 0.85, isGeneratorOnly: false, isElectricDrive: true, generatorKw: 0, efficiency: 0.92, hybridHint: "None", transmissionHint: "SingleSpeedEDrive" },
};

const CLASS_REV_BAND: Record<string, { min: number; max: number }> = {
  Hypercar: { min: 6800, max: 9200 },
  LMGT3: { min: 7500, max: 9500 },
  LMP2: { min: 8000, max: 9200 },
};

export const CLASS_POWER_BAND: Record<string, { min: number; max: number; cap: number }> = {
  Hypercar: { min: 600, max: 720, cap: 680 },
  LMGT3: { min: 460, max: 560, cap: 520 },
  LMP2: { min: 440, max: 500, cap: 480 },
};

export const LAYOUT_BY_CLASS: Record<string, LayoutId[]> = {
  Hypercar: ["I4", "I6", "V6", "V8", "V10", "V12", "Flat4", "Flat6", "Rotary"],
  LMGT3: ["I4", "I6", "V6", "V8", "Flat4", "Flat6"],
  LMP2: ["LMP2Spec"],
};

export const FUEL_BY_CLASS: Record<string, FuelType[]> = {
  Hypercar: ["Gasoline", "Diesel", "Hydrogen", "Electric"],
  LMGT3: ["Gasoline"],
  LMP2: ["Gasoline"],
};

export const ASPIRATION_BY_CLASS: Record<string, AspirationId[]> = {
  Hypercar: ["NA", "Single", "TwinParallel", "TwinSequential", "Quad", "EBoost"],
  LMGT3: ["NA", "Single", "TwinParallel"],
  LMP2: ["NA"],
};

export const DRIVETRAIN_BY_CLASS: Record<string, DrivetrainId[]> = {
  Hypercar: ["Mechanical", "ParallelHybrid", "FrontAxleHybrid", "RangeExtender", "FullEV"],
  LMGT3: ["Mechanical"],
  LMP2: ["Mechanical"],
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Fuel-cell buffer sizing: burst power vs mass, burn, and burst duration. */
export function fuelCellBufferTraits(buffer: number, stackKw = 420) {
  const t = Math.max(0, Math.min(1, buffer));
  const burstKw = 75 + t * 75;
  const bufferMassKg = 14 + t * 42;
  const stintBudgetMj = 3.0 + t * 5.5;
  const stackMassKg = 52 + stackKw * 0.088;
  return {
    burstKw,
    bufferMassKg,
    stackMassKg,
    fuelBurnMult: 0.86 + t * 0.16,
    serviceabilityMult: 0.9 - t * 0.08,
    regenRate: 0.45 - t * 0.08,
    stintBudgetMj,
    drivetrainExtraMassKg: 174 + stackKw * 0.062 + bufferMassKg,
    burstSecondsAtFull: burstKw > 0 ? stintBudgetMj / (burstKw / 1000) : 0,
  };
}

function layoutDef(id: LayoutId): LayoutDef {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[2];
}

function cylindersForLayout(id: string): number {
  return layoutDef(id as LayoutId).cylinders;
}

function boreStrokeFromDisplacement(dispL: number, cylinders: number): { bore: number; stroke: number } {
  const dispM3 = dispL / 1000;
  const stroke = 0.078;
  const radius = Math.sqrt(dispM3 / (cylinders * Math.PI * stroke));
  return { bore: radius * 2, stroke };
}

export function isChoiceLegal(
  classId: string,
  kind: "fuel" | "layout" | "aspiration" | "drivetrain",
  value: string,
): boolean {
  const map = {
    fuel: FUEL_BY_CLASS[classId] ?? FUEL_BY_CLASS.Hypercar,
    layout: LAYOUT_BY_CLASS[classId] ?? LAYOUT_BY_CLASS.Hypercar,
    aspiration: ASPIRATION_BY_CLASS[classId] ?? ASPIRATION_BY_CLASS.Hypercar,
    drivetrain: DRIVETRAIN_BY_CLASS[classId] ?? DRIVETRAIN_BY_CLASS.Hypercar,
  };
  return map[kind].includes(value as never);
}

export function isElectricFuelBuild(engine: EngineBuildPayload): boolean {
  return engine.fuel_type === "Electric";
}

export function isComboLegal(
  classId: string,
  layout: LayoutId,
  aspiration: AspirationId,
  drivetrain: DrivetrainId,
  fuel: FuelType,
  energyConverter: EnergyConverterId = "Combustion",
): string | null {
  if (fuel === "Hydrogen" && energyConverter === "FuelCell") {
    if (classId !== "Hypercar") return "Fuel cell is Hypercar only";
    if (drivetrain !== "FullEV") return "Fuel cell requires e-drive (FullEV)";
    return null;
  }
  if (fuel === "Electric") {
    if (classId !== "Hypercar") return "Electric is Hypercar only";
    if (drivetrain !== "FullEV" && drivetrain !== "RangeExtender") {
      return "Electric requires battery e-drive or REX";
    }
    if (!isChoiceLegal(classId, "layout", layout) && drivetrain === "RangeExtender") {
      return "Layout not legal in this class";
    }
    return null;
  }
  if (!isChoiceLegal(classId, "layout", layout)) return "Layout not legal in this class";
  if (!isChoiceLegal(classId, "fuel", fuel)) return "Fuel not legal in this class";
  if (!isChoiceLegal(classId, "aspiration", aspiration)) return "Aspiration not legal in this class";
  if (!isChoiceLegal(classId, "drivetrain", drivetrain)) return "Drivetrain not legal in this class";
  if (layout === "Rotary" && aspiration === "Quad") return "Rotary cannot run quad turbos";
  if (aspiration === "EBoost" && drivetrain === "Mechanical") return "E-Boost needs a battery (hybrid or REX drivetrain)";
  if (drivetrain === "FullEV") return "Full EV is configured via Electric fuel";
  if (fuel === "Hydrogen" && drivetrain === "RangeExtender") {
    return "Hydrogen range-extender is not supported; use fuel cell instead";
  }
  return null;
}

export function defaultUiState(classId: string): PowertrainUiState {
  const band = CLASS_POWER_BAND[classId] ?? CLASS_POWER_BAND.Hypercar;
  const layouts = LAYOUT_BY_CLASS[classId] ?? LAYOUT_BY_CLASS.Hypercar;
  return {
    fuel: "Gasoline",
    energyConverter: "Combustion",
    layout: layouts.includes("V6") ? "V6" : layouts[0],
    aspiration: classId === "LMP2" ? "NA" : "TwinParallel",
    drivetrain: "Mechanical",
    powerTargetHp: band.cap - 20,
    revCharacter: 0.55,
    blockSize: 0.5,
    generatorSize: 0.5,
    bufferSize: 0.5,
  };
}

function derivePowerTargetHp(engine: EngineBuildPayload, classId: string): number {
  const band = CLASS_POWER_BAND[classId] ?? CLASS_POWER_BAND.Hypercar;
  if (engine.power_target != null && engine.power_target > 0) {
    return engine.power_target;
  }
  const peakTorqueRpm =
    engine.peak_torque_rpm > 0
      ? engine.peak_torque_rpm
      : Math.round(engine.max_rpm * 0.65);
  const hp = Math.round((engine.peak_torque_nm * peakTorqueRpm) / HP_CONVERSION);
  return Math.min(Math.max(hp, band.min), band.max);
}

export function decodePowertrainUi(engine: EngineBuildPayload, classId: string): PowertrainUiState {
  const layout = (engine.engine_layout as LayoutId) || "V6";
  const energyConverter: EnergyConverterId =
    engine.energy_converter === "FuelCell" ? "FuelCell" : "Combustion";
  const bufferSize =
    energyConverter === "FuelCell" && engine.buffer_size != null
      ? engine.buffer_size
      : 0.5;
  let fuel = (engine.fuel_type as FuelType) || "Gasoline";
  if (
    fuel !== "Hydrogen" &&
    fuel !== "Electric" &&
    engine.drivetrain === "FullEV"
  ) {
    fuel = "Electric";
  }
  return {
    fuel,
    energyConverter,
    layout: LAYOUTS.some((l) => l.id === layout) ? layout : "V6",
    aspiration: (engine.aspiration as AspirationId) || (classId === "LMP2" ? "NA" : "TwinParallel"),
    drivetrain: (engine.drivetrain as DrivetrainId) || "Mechanical",
    powerTargetHp: derivePowerTargetHp(engine, classId),
    revCharacter: engine.rev_character ?? 0.5,
    blockSize: engine.block_size ?? 0.5,
    generatorSize: engine.generator_size ?? 0.5,
    bufferSize,
  };
}

export function isFuelCellBuild(engine: EngineBuildPayload): boolean {
  return engine.fuel_type === "Hydrogen" && engine.energy_converter === "FuelCell";
}

export function encodePowertrainBuild(
  ui: PowertrainUiState,
  classId: string,
): EngineBuildPayload {
  const band = CLASS_POWER_BAND[classId] ?? CLASS_POWER_BAND.Hypercar;
  const targetHp = Math.min(ui.powerTargetHp, band.cap > 0 ? band.cap : ui.powerTargetHp);

  if (ui.fuel === "Hydrogen" && ui.energyConverter === "FuelCell") {
    const stackKw = Math.round(lerp(320, 520, ui.generatorSize));
    const burstKw = Math.round(fuelCellBufferTraits(ui.bufferSize, stackKw).burstKw);
    return {
      engine_layout: "V6",
      fuel_type: "Hydrogen",
      energy_converter: "FuelCell",
      cylinders: 6,
      bore: 0.08,
      stroke: 0.06,
      max_rpm: 12000,
      peak_torque_nm: Math.round(burstKw * 4.2),
      peak_torque_rpm: 10200,
      base_vibration: 0.2,
      aspiration: "NA",
      drivetrain: "FullEV",
      power_target: targetHp,
      rev_character: ui.revCharacter,
      block_size: ui.blockSize,
      generator_size: ui.generatorSize,
      buffer_size: ui.bufferSize,
      generator_kw: stackKw,
    };
  }

  if (ui.fuel === "Electric") {
    const lay = layoutDef(ui.layout);
    const revBand = CLASS_REV_BAND[classId] ?? CLASS_REV_BAND.Hypercar;

    if (ui.drivetrain === "RangeExtender") {
      let displacementL = lerp(lay.dispMinL, lay.dispMaxL, ui.blockSize);
      if (ui.layout === "Rotary") displacementL = lerp(0.8, 1.3, ui.blockSize);
      const maxRpm = Math.round(lerp(4000, 5500, ui.revCharacter));
      const generatorKw = lerp(180, 400, ui.generatorSize);
      const geom = boreStrokeFromDisplacement(displacementL, lay.cylinders);
      return {
        engine_layout: ui.layout,
        fuel_type: "Electric",
        cylinders: lay.cylinders,
        bore: geom.bore,
        stroke: geom.stroke,
        max_rpm: maxRpm,
        peak_torque_nm: Math.round(generatorKw * 3.2),
        peak_torque_rpm: Math.round(maxRpm * 0.72),
        base_vibration: lay.stressMult * 0.92,
        aspiration: "NA",
        drivetrain: "RangeExtender",
        power_target: targetHp,
        rev_character: ui.revCharacter,
        block_size: ui.blockSize,
        generator_size: ui.generatorSize,
        generator_kw: Math.round(generatorKw),
      };
    }

    return {
      engine_layout: "V6",
      fuel_type: "Electric",
      cylinders: 6,
      bore: 0,
      stroke: 0,
      max_rpm: 12000,
      peak_torque_nm: Math.round(ui.powerTargetHp * 4.2),
      peak_torque_rpm: 10200,
      base_vibration: 0.2,
      aspiration: "NA",
      drivetrain: "FullEV",
      power_target: targetHp,
      rev_character: ui.revCharacter,
      block_size: ui.blockSize,
      generator_size: ui.generatorSize,
    };
  }

  const lay = layoutDef(ui.layout);
  const fuel = FUEL_MOD[ui.fuel];
  const asp = ASPIRATION_MOD[ui.aspiration];
  const drv = DRIVETRAIN_MOD[ui.drivetrain];
  const revBand = CLASS_REV_BAND[classId] ?? CLASS_REV_BAND.Hypercar;

  let displacementL = lerp(lay.dispMinL, lay.dispMaxL, ui.blockSize);
  if (ui.layout === "Rotary") displacementL = 1.3;

  let maxRpm = Math.round(lerp(revBand.min, revBand.max, ui.revCharacter) * lay.revMult * fuel.revMult * asp.revMult);
  let generatorKw = 0;

  if (ui.drivetrain === "RangeExtender") {
    maxRpm = Math.round(lerp(4000, 5500, ui.revCharacter));
    generatorKw = lerp(180, 400, ui.generatorSize);
    displacementL = lerp(0.8, 3.5, ui.generatorSize) * lay.massMult;
    if (ui.layout === "Rotary") displacementL = lerp(0.8, 1.3, ui.generatorSize);
  } else if (ui.drivetrain === "FullEV") {
    maxRpm = 12000;
    displacementL = 0;
  }

  const torquePeakRatio = asp.torquePeakRatio;
  const peakTorqueRpm = Math.round(maxRpm * torquePeakRatio);

  const baseSpecific = 105 * asp.specificTorqueMult * lay.torqueMult * fuel.torqueMult;
  let peakTorqueNm =
    displacementL > 0
      ? displacementL * baseSpecific * Math.sqrt(1.1)
      : 0;

  if (ui.drivetrain === "RangeExtender") {
    peakTorqueNm = generatorKw * 3.2;
  } else if (ui.drivetrain === "FullEV") {
    peakTorqueNm = ui.powerTargetHp * 4.2;
  } else {
    const targetHp = ui.powerTargetHp;
    peakTorqueNm = (targetHp * HP_CONVERSION) / Math.max(peakTorqueRpm, 3000);
    const dispTorque = displacementL * baseSpecific;
    peakTorqueNm = Math.max(peakTorqueNm, dispTorque * 0.85);
  }

  const stress =
    lay.stressMult * fuel.stressMult * asp.stressMult * drv.stressMult;

  const geom =
    displacementL > 0
      ? boreStrokeFromDisplacement(displacementL, lay.cylinders)
      : { bore: 0.08, stroke: 0.06 };

  return {
    engine_layout: ui.layout,
    fuel_type: ui.fuel,
    cylinders: lay.cylinders,
    bore: geom.bore,
    stroke: geom.stroke,
    max_rpm: maxRpm,
    peak_torque_nm: Math.round(peakTorqueNm),
    peak_torque_rpm: peakTorqueRpm,
    base_vibration: stress,
    aspiration: ui.aspiration,
    drivetrain: ui.drivetrain,
    power_target: ui.powerTargetHp,
    rev_character: ui.revCharacter,
    block_size: ui.blockSize,
    generator_size: ui.generatorSize,
    generator_kw: generatorKw > 0 ? generatorKw : undefined,
  };
}

/** Engine + drivetrain mass for compile; ICE hybrid hardware lives in hybrid part slot. */
export function resolveEngineAssemblyMassKg(
  traits: PowertrainTraits,
  hybridPartMass = 0,
): number {
  let drivetrainMass = traits.drivetrainExtraMassKg;
  if (hybridPartMass > 0 && drivetrainMass > 0 && !traits.isElectricDrive) {
    drivetrainMass = 0;
  }
  return traits.engineMassKg + drivetrainMass;
}

export function resolvePowertrainTraits(
  engine: EngineBuildPayload,
  classId = "Hypercar",
): PowertrainTraits {
  if (isFuelCellBuild(engine)) {
    const stackKw = engine.generator_kw ?? 420;
    const buffer = engine.buffer_size ?? 0.5;
    const buf = fuelCellBufferTraits(buffer, stackKw);
    const peakHp = stackKw * 1.34;
    return {
      layout: "V6",
      fuel: "Hydrogen",
      aspiration: "NA",
      drivetrain: "FullEV",
      displacementL: 0,
      maxRpm: engine.max_rpm,
      peakTorqueNm: engine.peak_torque_nm,
      peakTorqueRpm: engine.peak_torque_rpm,
      peakHp,
      engineMassKg: buf.stackMassKg,
      drivetrainExtraMassKg: buf.drivetrainExtraMassKg,
      massMult: 0.88,
      torqueMult: 0.94,
      revMult: 1.06,
      fuelBurnMult: buf.fuelBurnMult,
      throttleMult: 1.02,
      thermalMult: 0.7,
      stressMult: 0.2,
      torquePeakRatio: 0.85,
      torqueFalloff: 0.8,
      throttleLagTau: 0.04,
      serviceabilityMult: buf.serviceabilityMult,
      deployKw: buf.burstKw,
      regenRate: buf.regenRate,
      stintBudgetMj: buf.stintBudgetMj,
      isGeneratorOnly: false,
      isElectricDrive: true,
      isFuelCell: true,
      generatorKw: stackKw,
      drivetrainEfficiency: 0.55,
      cgCorneringBonus: 1,
      fuelSystemHint: "HydrogenTank",
      hybridHint: "None",
      transmissionHint: "SingleSpeedEDrive",
    };
  }

  const ui = decodePowertrainUi(engine, classId);
  const lay = layoutDef(ui.layout);
  const fuel = FUEL_MOD[ui.fuel];
  const asp = ASPIRATION_MOD[ui.aspiration];
  const drv = DRIVETRAIN_MOD[ui.drivetrain];

  const displacementL =
    engine.bore > 0 && engine.stroke > 0 && engine.cylinders > 0
      ? engine.cylinders * Math.PI * (engine.bore / 2) ** 2 * engine.stroke * 1000
      : lerp(lay.dispMinL, lay.dispMaxL, ui.blockSize);

  let engineMass =
    displacementL * ENGINE_WEIGHT_COEFF * lay.massMult * fuel.fuelMassMult * asp.massMult;
  engineMass += engine.cylinders * ENGINE_WEIGHT_CYL_FACTOR;
  if (ui.drivetrain === "FullEV") engineMass = 12;
  // Hypercar ICE unit mass floor — matches real PU + ancillaries; stops tiny layouts gaming BoP.
  if (classId === "Hypercar" && ui.energyConverter !== "FuelCell" && !drv.isElectricDrive) {
    engineMass = Math.max(178, engineMass);
  }

  const peakTorqueNm = engine.peak_torque_nm;
  const peakTorqueRpm = engine.peak_torque_rpm || Math.round(engine.max_rpm * asp.torquePeakRatio);
  let peakHp = (peakTorqueNm * peakTorqueRpm) / HP_CONVERSION;

  let deployKw = drv.deployKw;
  let generatorKw = engine.generator_kw ?? drv.generatorKw;

  let fuelBurnMult = fuel.fuelBurnMult * asp.fuelBurnMult;
  if (ui.fuel === "Electric" && ui.drivetrain === "RangeExtender") {
    const elecKw = generatorKw * drv.efficiency;
    peakHp = elecKw * 1.34;
    deployKw = Math.round(lerp(80, 200, ui.generatorSize));
    fuelBurnMult = lerp(0.78, 1.12, ui.generatorSize);
  } else if (ui.drivetrain === "RangeExtender") {
    const elecKw = generatorKw * drv.efficiency;
    peakHp = elecKw * 1.34;
    deployKw = Math.round(lerp(80, 200, ui.generatorSize));
    fuelBurnMult *= lerp(0.82, 1.28, ui.generatorSize);
  } else if (ui.drivetrain === "FullEV" && ui.fuel === "Electric") {
    peakHp = ui.powerTargetHp;
    deployKw = Math.round(Math.min(520, Math.max(260, ui.powerTargetHp / 1.34)));
    fuelBurnMult = fuel.fuelBurnMult;
  } else if (ui.drivetrain === "FullEV") {
    peakHp = ui.powerTargetHp;
    deployKw = ui.powerTargetHp * 0.75;
  } else if (ui.drivetrain === "ParallelHybrid" || ui.drivetrain === "FrontAxleHybrid") {
    peakHp += deployKw * 0.35;
  }

  const fuelSystemHint =
    ui.fuel === "Hydrogen"
      ? "HydrogenTank"
      : ui.fuel === "Electric"
        ? "BatteryPackStandard"
        : null;

  return {
    layout: ui.layout,
    fuel: ui.fuel,
    aspiration: ui.aspiration,
    drivetrain: ui.drivetrain,
    displacementL,
    maxRpm: engine.max_rpm,
    peakTorqueNm,
    peakTorqueRpm,
    peakHp,
    engineMassKg: engineMass,
    drivetrainExtraMassKg: drv.extraMassKg,
    massMult: lay.massMult * fuel.massMult * asp.massMult,
    torqueMult: lay.torqueMult * fuel.torqueMult * asp.torqueMult,
    revMult: lay.revMult * fuel.revMult * asp.revMult,
    fuelBurnMult,
    throttleMult: lay.throttleMult * fuel.throttleMult * asp.throttleMult * drv.throttleMult,
    thermalMult: lay.thermalMult * fuel.thermalMult * asp.thermalMult,
    stressMult: lay.stressMult * fuel.stressMult * asp.stressMult * drv.stressMult,
    torquePeakRatio: asp.torquePeakRatio,
    torqueFalloff: asp.torqueFalloff,
    throttleLagTau: asp.throttleLagTau,
    serviceabilityMult: asp.serviceabilityMult * drv.serviceabilityMult,
    deployKw,
    regenRate: drv.regenRate,
    stintBudgetMj: drv.stintBudgetMj,
    isGeneratorOnly: drv.isGeneratorOnly,
    isElectricDrive: drv.isElectricDrive,
    isFuelCell: false,
    generatorKw,
    drivetrainEfficiency: drv.efficiency,
    cgCorneringBonus: lay.cgBonus,
    fuelSystemHint,
    hybridHint: drv.hybridHint,
    transmissionHint: drv.transmissionHint,
  };
}

export function traitChips(traits: PowertrainTraits): Array<{ label: string; tone: "pro" | "con" | "neutral" }> {
  const chips: Array<{ label: string; tone: "pro" | "con" | "neutral" }> = [];
  if (traits.fuel === "Electric" && traits.drivetrain === "FullEV") {
    chips.push({ label: "Battery EV", tone: "neutral" });
    chips.push({ label: "No ICE wear", tone: "pro" });
    if (traits.deployKw > 0) chips.push({ label: `${Math.round(traits.deployKw)} kW deploy`, tone: "pro" });
    if (traits.fuelBurnMult < 0.92) chips.push({ label: "Efficient pack", tone: "pro" });
    if (traits.throttleMult >= 1.08) chips.push({ label: "Instant torque", tone: "pro" });
    if (traits.drivetrainExtraMassKg > 120) chips.push({ label: "Heavy pack", tone: "con" });
    if (traits.serviceabilityMult < 0.86) chips.push({ label: "Slow pit work", tone: "con" });
    return chips;
  }
  if (traits.isFuelCell) {
    chips.push({ label: "H₂ fuel cell", tone: "neutral" });
    chips.push({ label: `${Math.round(traits.generatorKw)} kW stack`, tone: "neutral" });
    chips.push({ label: "No ICE wear", tone: "pro" });
    if (traits.fuelBurnMult < 0.9) chips.push({ label: "Efficient H₂", tone: "pro" });
    if (traits.fuelBurnMult >= 0.98) chips.push({ label: "Buffer overhead", tone: "con" });
    if (traits.deployKw > 0) {
      const burstSec =
        traits.deployKw > 0 ? traits.stintBudgetMj / (traits.deployKw / 1000) : 0;
      chips.push({
        label: `+${Math.round(traits.deployKw)} kW · ~${burstSec.toFixed(0)}s burst`,
        tone: "pro",
      });
    }
    if (traits.stintBudgetMj >= 7) chips.push({ label: "Long burst window", tone: "pro" });
    if (traits.drivetrainExtraMassKg > 195) chips.push({ label: "Heavy buffer", tone: "con" });
    if (traits.serviceabilityMult < 0.86) chips.push({ label: "Slow pit work", tone: "con" });
    return chips;
  }
  if (traits.throttleMult >= 1.05) chips.push({ label: "Sharp throttle", tone: "pro" });
  if (traits.throttleMult < 0.92) chips.push({ label: "Turbo lag", tone: "con" });
  if (traits.fuelBurnMult < 0.85) chips.push({ label: "Long stints", tone: "pro" });
  if (traits.fuelBurnMult > 1.2) chips.push({ label: "Thirsty", tone: "con" });
  if (traits.engineMassKg < 130) chips.push({ label: "Light block", tone: "pro" });
  if (traits.engineMassKg > 175) chips.push({ label: "Heavy block", tone: "con" });
  if (traits.cgCorneringBonus > 1.03) chips.push({ label: "Low CG", tone: "pro" });
  if (traits.stressMult < 0.95) chips.push({ label: "Reliable", tone: "pro" });
  if (traits.stressMult > 1.08) chips.push({ label: "High wear", tone: "con" });
  if (traits.thermalMult > 1.1) chips.push({ label: "Runs hot", tone: "con" });
  if (traits.isGeneratorOnly && traits.generatorKw > 0) {
    const genLabel =
      traits.fuel === "Electric"
        ? `${Math.round(traits.generatorKw)} kW charge`
        : `${Math.round(traits.generatorKw)} kW generator`;
    chips.push({ label: genLabel, tone: "neutral" });
    if (traits.generatorKw < 240) chips.push({ label: "Light ICE unit", tone: "pro" });
    else if (traits.generatorKw > 340) chips.push({ label: "Sustained pace", tone: "pro" });
    if (traits.generatorKw > 340) chips.push({ label: "Heavy ICE unit", tone: "con" });
    if (traits.deployKw > 0) chips.push({ label: `+${traits.deployKw} kW battery burst`, tone: "pro" });
  } else if (traits.deployKw > 0) {
    chips.push({ label: `+${traits.deployKw} kW deploy`, tone: "pro" });
  }
  if (traits.isGeneratorOnly) chips.push({ label: "Generator ICE", tone: "neutral" });
  if (traits.isElectricDrive) chips.push({ label: "E-drive", tone: "neutral" });
  if (traits.drivetrainExtraMassKg > 120) chips.push({ label: "Heavy drivetrain", tone: "con" });
  if (traits.serviceabilityMult < 0.9) chips.push({ label: "Slow pit work", tone: "con" });
  return chips;
}

export function effectiveHorsepower(
  engine: EngineBuildPayload,
  powerCapHp: number,
  classId = "Hypercar",
): number {
  const traits = resolvePowertrainTraits(engine, classId);
  const raw = traits.peakHp;
  if (powerCapHp > 0 && raw > powerCapHp) return powerCapHp;
  return raw;
}

export { cylindersForLayout };
