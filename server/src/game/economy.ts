import type {
  EmploymentContractPayload,
  FleetEntryMode,
  StaffMemberPayload,
} from "../ws_protocol";
import {
  EXP_OPS_FEE,
  EXP_RD_MULTIPLIER,
  EXP_SPONSOR_BONUS_FACTOR,
  computePrototypeExposureFee,
} from "./experimental_entry";

/** Inflated for development — enough for full manufacturer programmes + staff. */
export const STARTING_BUDGET = 500_000_000;
export const MAX_SPONSOR_SLOTS = 3;
export const RACE_ENTRY_FEE = 35_000;
export const APPEARANCE_FEE = 75_000;

const POSITION_PRIZE_SHARE = [
  1.0, 0.65, 0.45, 0.32, 0.24, 0.18, 0.14, 0.11, 0.09, 0.07,
];

const FORMAT_BASE_POOL: Record<string, number> = {
  "24h": 900_000,
  "12h": 450_000,
  "8h": 380_000,
  "6h": 280_000,
  "1812km": 520_000,
  test: 0,
};

const CLASS_PRIZE_MULTIPLIER: Record<string, number> = {
  Hypercar: 1.0,
  LMP2: 0.55,
  LMGT3: 0.42,
};

const CHAMPIONSHIP_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export interface SponsorOffer {
  id: string;
  name: string;
  tagline: string;
  signingFee: number;
  perRaceIncome: number;
  podiumBonus: number;
  winBonus: number;
  topFiveBonus: number;
  rdPointsPerRace: number;
}

export interface SponsorContract {
  offerId: string;
  name: string;
  signedRound: number;
}

export interface FinanceLineItem {
  label: string;
  amount: number;
}

export interface RaceFinances {
  prizeMoney: number;
  appearanceFee: number;
  sponsorIncome: number;
  entryFee: number;
  staffPayroll: number;
  driverPayroll: number;
  netEarnings: number;
  championshipPoints: number;
  rdPointsEarned: number;
  breakdown: FinanceLineItem[];
}

export const SPONSOR_OFFERS: SponsorOffer[] = [
  {
    id: "aurora_energy",
    name: "Aurora Energy",
    tagline: "Title partner — high visibility, win bonuses",
    signingFee: 200_000,
    perRaceIncome: 50_000,
    podiumBonus: 0,
    winBonus: 100_000,
    topFiveBonus: 0,
    rdPointsPerRace: 0,
  },
  {
    id: "chronos",
    name: "Chronos Watches",
    tagline: "Luxury timing partner — podium bonuses",
    signingFee: 150_000,
    perRaceIncome: 20_000,
    podiumBonus: 75_000,
    winBonus: 0,
    topFiveBonus: 0,
    rdPointsPerRace: 0,
  },
  {
    id: "titan_lube",
    name: "Titan Lubricants",
    tagline: "Steady technical partner income",
    signingFee: 100_000,
    perRaceIncome: 35_000,
    podiumBonus: 0,
    winBonus: 0,
    topFiveBonus: 0,
    rdPointsPerRace: 0,
  },
  {
    id: "velocity",
    name: "Velocity Apparel",
    tagline: "Fan-facing brand — rewards top-five finishes",
    signingFee: 80_000,
    perRaceIncome: 25_000,
    podiumBonus: 0,
    winBonus: 0,
    topFiveBonus: 40_000,
    rdPointsPerRace: 0,
  },
  {
    id: "griddata",
    name: "GridData Analytics",
    tagline: "Data partner — modest cash, R&D each race",
    signingFee: 120_000,
    perRaceIncome: 15_000,
    podiumBonus: 0,
    winBonus: 0,
    topFiveBonus: 0,
    rdPointsPerRace: 5,
  },
  {
    id: "heritage_auto",
    name: "Heritage Automotive",
    tagline: "Premium title sponsor — largest payouts",
    signingFee: 350_000,
    perRaceIncome: 80_000,
    podiumBonus: 50_000,
    winBonus: 150_000,
    topFiveBonus: 0,
    rdPointsPerRace: 0,
  },
];

export function sponsorOfferById(id: string): SponsorOffer | undefined {
  return SPONSOR_OFFERS.find((o) => o.id === id);
}

export function computeChampionshipPoints(position: number): number {
  if (position < 1) return 0;
  if (position <= CHAMPIONSHIP_POINTS.length) {
    return CHAMPIONSHIP_POINTS[position - 1];
  }
  return 0;
}

function positionPrizeShare(position: number): number {
  const idx = position - 1;
  if (idx < POSITION_PRIZE_SHARE.length) return POSITION_PRIZE_SHARE[idx];
  return Math.max(0.02, 0.07 - (idx - 9) * 0.004);
}

export function computePrizeMoney(
  position: number,
  classId: string,
  format: string,
): number {
  const basePool = FORMAT_BASE_POOL[format.toLowerCase()] ?? 250_000;
  const classMul = CLASS_PRIZE_MULTIPLIER[classId] ?? 0.5;
  return Math.round(basePool * classMul * positionPrizeShare(position));
}

export function staffSigningCost(skill: number): number {
  return 120_000 + skill * 1500;
}

export function staffSalaryPerRound(skill: number): number {
  return 25_000 + skill * 200;
}

export function computeStaffPayroll(staff: StaffMemberPayload[]): number {
  return staff.reduce(
    (sum, m) => sum + (m.salaryPerRace ?? staffSalaryPerRound(m.skill)),
    0,
  );
}

export function computeDriverPayrollFromContracts(
  contracts: EmploymentContractPayload[] | undefined,
  teamName: string,
): number {
  const key = teamName.trim().toLowerCase();
  return (contracts ?? [])
    .filter(
      (c) =>
        c.entityKind === "driver" &&
        c.teamName.trim().toLowerCase() === key,
    )
    .reduce((sum, c) => sum + c.salaryPerRace, 0);
}

export function computeRaceFinances(
  position: number,
  classId: string,
  format: string,
  sponsors: SponsorContract[],
  staff: StaffMemberPayload[],
  options?: {
    scoring?: boolean;
    entryMode?: FleetEntryMode;
    racePosition?: number;
    employmentContracts?: EmploymentContractPayload[];
    teamName?: string;
  },
): RaceFinances {
  const scoring = options?.scoring ?? format.toLowerCase() !== "test";
  const experimental = options?.entryMode === "experimental";
  const prizeMoney =
    scoring && !experimental ? computePrizeMoney(position, classId, format) : 0;
  const staffPayroll = computeStaffPayroll(staff);
  const driverPayroll = options?.teamName
    ? computeDriverPayrollFromContracts(
        options.employmentContracts,
        options.teamName,
      )
    : 0;
  let sponsorIncome = 0;
  let rdPointsEarned = 0;
  let prototypeExposure = 0;
  const breakdown: FinanceLineItem[] = [];
  const bonusFactor = experimental ? EXP_SPONSOR_BONUS_FACTOR : 1;

  if (scoring && experimental) {
    breakdown.push({ label: "EXP entry (no class prize money)", amount: 0 });
    breakdown.push({ label: "WEC appearance fee", amount: APPEARANCE_FEE });
    breakdown.push({ label: "Prototype operations", amount: -EXP_OPS_FEE });
    prototypeExposure = computePrototypeExposureFee(
      options?.racePosition ?? position,
    );
    if (prototypeExposure > 0) {
      breakdown.push({
        label: "Prototype media exposure",
        amount: prototypeExposure,
      });
    }
  } else if (scoring) {
    breakdown.push({
      label: `Prize money (P${position})`,
      amount: prizeMoney,
    });
    breakdown.push({ label: "WEC appearance fee", amount: APPEARANCE_FEE });
    breakdown.push({ label: "Race operations", amount: -RACE_ENTRY_FEE });
  } else {
    breakdown.push({ label: "Pre-season test (no prize money)", amount: 0 });
    breakdown.push({ label: "Test operations", amount: -15_000 });
  }

  for (const contract of sponsors) {
    const offer = sponsorOfferById(contract.offerId);
    if (!offer) continue;

    if (offer.perRaceIncome > 0) {
      sponsorIncome += offer.perRaceIncome;
      breakdown.push({
        label: `${offer.name} stipend`,
        amount: offer.perRaceIncome,
      });
    }
    if (position <= 3 && offer.podiumBonus > 0) {
      const amount = Math.round(offer.podiumBonus * bonusFactor);
      if (amount > 0) {
        sponsorIncome += amount;
        breakdown.push({
          label: `${offer.name} podium bonus`,
          amount,
        });
      }
    }
    if (position === 1 && offer.winBonus > 0) {
      const amount = Math.round(offer.winBonus * bonusFactor);
      if (amount > 0) {
        sponsorIncome += amount;
        breakdown.push({
          label: `${offer.name} win bonus`,
          amount,
        });
      }
    }
    if (position <= 5 && offer.topFiveBonus > 0) {
      const amount = Math.round(offer.topFiveBonus * bonusFactor);
      if (amount > 0) {
        sponsorIncome += amount;
        breakdown.push({
          label: `${offer.name} top-5 bonus`,
          amount,
        });
      }
    }
    rdPointsEarned += offer.rdPointsPerRace;
  }

  if (staffPayroll > 0) {
    breakdown.push({ label: "Staff payroll", amount: -staffPayroll });
  }
  if (driverPayroll > 0) {
    breakdown.push({ label: "Driver payroll", amount: -driverPayroll });
  }

  const appearanceFee = scoring ? APPEARANCE_FEE : 0;
  const entryFee = scoring
    ? experimental
      ? -EXP_OPS_FEE
      : -RACE_ENTRY_FEE
    : -15_000;
  const netEarnings =
    prizeMoney +
    appearanceFee +
    sponsorIncome +
    prototypeExposure +
    entryFee -
    staffPayroll -
    driverPayroll;

  let championshipPoints = 0;
  if (scoring && !experimental) {
    championshipPoints = computeChampionshipPoints(position);
  }

  let rdOut = rdPointsEarned;
  if (scoring) {
    if (experimental && rdPointsEarned > 0) {
      rdOut = Math.round(rdPointsEarned * EXP_RD_MULTIPLIER);
    }
  } else {
    rdOut = Math.max(1, Math.floor(rdPointsEarned / 2));
  }

  return {
    prizeMoney,
    appearanceFee,
    sponsorIncome,
    entryFee,
    staffPayroll,
    driverPayroll,
    netEarnings,
    championshipPoints,
    rdPointsEarned: rdOut,
    breakdown,
  };
}

export function sponsorOffersPayload(): Array<{
  id: string;
  name: string;
  tagline: string;
  signingFee: number;
  perRaceIncome: number;
  podiumBonus: number;
  winBonus: number;
  topFiveBonus: number;
  rdPointsPerRace: number;
}> {
  return SPONSOR_OFFERS.map((o) => ({ ...o }));
}
