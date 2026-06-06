export interface RegulatoryProfile {
  maxDriverStintHours: number;
  powerCapHp: number;
}

const DEFAULTS: RegulatoryProfile = {
  maxDriverStintHours: 4.5,
  powerCapHp: 700,
};

const BY_CLASS: Record<string, RegulatoryProfile> = {
  Hypercar: { maxDriverStintHours: 4.5, powerCapHp: 700 },
  LMP2: { maxDriverStintHours: 4.5, powerCapHp: 440 },
  LMGT3: { maxDriverStintHours: 4.0, powerCapHp: 420 },
};

export function regulatoryProfile(classId: string): RegulatoryProfile {
  return BY_CLASS[classId] ?? DEFAULTS;
}

export function maxDriverStintSeconds(classId: string): number {
  return regulatoryProfile(classId).maxDriverStintHours * 3600;
}
