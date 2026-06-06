import type { CarBuildPayload, CoolingBuildPayload, EngineBuildPayload } from "../ws/protocol";
import { resolvePowertrainTraits } from "./engineModel";

export interface CoolingLayout {
  engineRadiator: number;
  oilCooler: number;
  chargeAirCooler: number;
  gearboxCooler: number;
}

export interface CoolingCircuitBalance {
  id: string;
  label: string;
  demand: number;
  supply: number;
  active: boolean;
}

export interface CoolingComputed {
  massKg: number;
  dragCd: number;
  dissipation: number;
  circuits: CoolingCircuitBalance[];
  totalDemand: number;
  totalSupply: number;
  margin: number;
}

export const COOLING_PRESETS: Record<string, CoolingLayout> = {
  SprintSlimline: {
    engineRadiator: 0.35,
    oilCooler: 0.25,
    chargeAirCooler: 0.2,
    gearboxCooler: 0.15,
  },
  EnduranceHeavyDuty: {
    engineRadiator: 0.65,
    oilCooler: 0.55,
    chargeAirCooler: 0.5,
    gearboxCooler: 0.4,
  },
  DuctedRacing: {
    engineRadiator: 0.75,
    oilCooler: 0.6,
    chargeAirCooler: 0.85,
    gearboxCooler: 0.45,
  },
  MaxFlowEndurance: {
    engineRadiator: 0.95,
    oilCooler: 0.85,
    chargeAirCooler: 0.9,
    gearboxCooler: 0.7,
  },
};

export const DEFAULT_COOLING_LAYOUT: CoolingLayout = {
  ...COOLING_PRESETS.EnduranceHeavyDuty,
};

const CHARGE_AIR_DEMAND: Record<string, number> = {
  NA: 0,
  Single: 0.55,
  TwinParallel: 0.75,
  TwinSequential: 0.82,
  Quad: 1.0,
  EBoost: 0.65,
};

const COOLER = {
  engineRadiator: { massBase: 4, massScale: 18, dragBase: 0.02, dragScale: 0.09, dissipationMax: 1.35 },
  oilCooler: { massBase: 2, massScale: 8, dragBase: 0.008, dragScale: 0.035, dissipationMax: 0.45 },
  chargeAirCooler: { massBase: 3, massScale: 14, dragBase: 0.015, dragScale: 0.065, dissipationMax: 0.95 },
  gearboxCooler: { massBase: 2, massScale: 10, dragBase: 0.012, dragScale: 0.04, dissipationMax: 0.35 },
} as const;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function coolerMass(size: number, c: (typeof COOLER)[keyof typeof COOLER]): number {
  const s = clamp01(size);
  return c.massBase + Math.pow(s, 1.3) * c.massScale;
}

function coolerDrag(size: number, c: (typeof COOLER)[keyof typeof COOLER]): number {
  const s = clamp01(size);
  return c.dragBase + Math.pow(s, 1.2) * c.dragScale;
}

function coolerDissipation(size: number, c: (typeof COOLER)[keyof typeof COOLER]): number {
  const s = clamp01(size);
  return Math.pow(s, 0.85) * c.dissipationMax;
}

export function decodeCoolingLayout(build: CarBuildPayload): CoolingLayout {
  if (build.cooling) {
    return {
      engineRadiator: clamp01(build.cooling.engine_radiator ?? DEFAULT_COOLING_LAYOUT.engineRadiator),
      oilCooler: clamp01(build.cooling.oil_cooler ?? DEFAULT_COOLING_LAYOUT.oilCooler),
      chargeAirCooler: clamp01(build.cooling.charge_air_cooler ?? DEFAULT_COOLING_LAYOUT.chargeAirCooler),
      gearboxCooler: clamp01(build.cooling.gearbox_cooler ?? DEFAULT_COOLING_LAYOUT.gearboxCooler),
    };
  }
  const preset = COOLING_PRESETS[build.cooling_pack];
  return preset ? { ...preset } : { ...DEFAULT_COOLING_LAYOUT };
}

export function encodeCoolingBuild(
  layout: CoolingLayout,
  presetId?: string,
): Pick<CarBuildPayload, "cooling_pack" | "cooling"> {
  const cooling: CoolingBuildPayload = {
    engine_radiator: layout.engineRadiator,
    oil_cooler: layout.oilCooler,
    charge_air_cooler: layout.chargeAirCooler,
    gearbox_cooler: layout.gearboxCooler,
  };
  return {
    cooling_pack: presetId ?? "Custom",
    cooling,
  };
}

export function layoutMatchesPreset(layout: CoolingLayout): string | null {
  for (const [id, preset] of Object.entries(COOLING_PRESETS)) {
    const match =
      Math.abs(layout.engineRadiator - preset.engineRadiator) < 0.02 &&
      Math.abs(layout.oilCooler - preset.oilCooler) < 0.02 &&
      Math.abs(layout.chargeAirCooler - preset.chargeAirCooler) < 0.02 &&
      Math.abs(layout.gearboxCooler - preset.gearboxCooler) < 0.02;
    if (match) return id;
  }
  return null;
}

function computeDemand(
  engine: EngineBuildPayload | undefined,
  classId: string,
): { engine: number; oil: number; chargeAir: number; gearbox: number } {
  if (!engine) {
    return { engine: 0.85, oil: 0.4, chargeAir: 0.35, gearbox: 0.28 };
  }
  const traits = resolvePowertrainTraits(engine, classId);
  const revChar = engine.rev_character ?? 0.5;
  const blockSize = engine.block_size ?? 0.5;
  const powerNorm = Math.min(1.2, traits.peakHp / 680);

  const engineDemand =
    traits.thermalMult * (0.5 + 0.25 * revChar + 0.15 * blockSize);
  const oilDemand = traits.stressMult * (0.3 + 0.12 * traits.thermalMult);
  const chargeAirDemand =
    CHARGE_AIR_DEMAND[traits.aspiration] * (0.35 + 0.25 * powerNorm);
  const gearboxDemand = 0.25 + 0.15 * traits.stressMult;

  return { engine: engineDemand, oil: oilDemand, chargeAir: chargeAirDemand, gearbox: gearboxDemand };
}

export function computeCoolingStats(
  layout: CoolingLayout,
  ductAirflow: number,
  engine: EngineBuildPayload | undefined,
  classId: string,
): CoolingComputed {
  const airflow = clamp01(ductAirflow);

  const engineSupply = coolerDissipation(layout.engineRadiator, COOLER.engineRadiator);
  const oilSupply = coolerDissipation(layout.oilCooler, COOLER.oilCooler);
  const chargeAirSupply = coolerDissipation(layout.chargeAirCooler, COOLER.chargeAirCooler);
  const gearboxSupply = coolerDissipation(layout.gearboxCooler, COOLER.gearboxCooler);

  const demand = computeDemand(engine, classId);
  const chargeAirActive = demand.chargeAir > 0.05;

  const circuits: CoolingCircuitBalance[] = [
    {
      id: "engine",
      label: "Engine radiator",
      demand: demand.engine,
      supply: engineSupply * airflow,
      active: true,
    },
    {
      id: "oil",
      label: "Oil cooler",
      demand: demand.oil,
      supply: oilSupply * airflow,
      active: true,
    },
    {
      id: "charge_air",
      label: "Charge-air cooler",
      demand: demand.chargeAir,
      supply: chargeAirSupply * airflow,
      active: chargeAirActive,
    },
    {
      id: "gearbox",
      label: "Gearbox cooler",
      demand: demand.gearbox,
      supply: gearboxSupply * airflow,
      active: true,
    },
  ];

  const activeCircuits = circuits.filter((c) => c.active);
  const totalDemand = activeCircuits.reduce((s, c) => s + c.demand, 0);
  const totalSupply = activeCircuits.reduce((s, c) => s + c.supply, 0);

  const massKg =
    coolerMass(layout.engineRadiator, COOLER.engineRadiator) +
    coolerMass(layout.oilCooler, COOLER.oilCooler) +
    coolerMass(layout.chargeAirCooler, COOLER.chargeAirCooler) +
    coolerMass(layout.gearboxCooler, COOLER.gearboxCooler);

  const dragCd =
    coolerDrag(layout.engineRadiator, COOLER.engineRadiator) +
    coolerDrag(layout.oilCooler, COOLER.oilCooler) +
    coolerDrag(layout.chargeAirCooler, COOLER.chargeAirCooler) +
    coolerDrag(layout.gearboxCooler, COOLER.gearboxCooler);

  return {
    massKg,
    dragCd,
    dissipation: totalSupply,
    circuits,
    totalDemand,
    totalSupply,
    margin: totalSupply - totalDemand,
  };
}

export function coolingBalanceTone(margin: number): "ok" | "warn" | "hot" {
  if (margin < -0.15) return "hot";
  if (margin < 0.1) return "warn";
  return "ok";
}
