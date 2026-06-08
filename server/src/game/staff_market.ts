import type { StaffRole } from "./staff";
import { staffSigningCost, staffSalaryPerRound } from "./economy";

export type StaffMarketSource = "veteran" | "experienced" | "prospect";

export interface StaffMarketListing {
  id: string;
  source: StaffMarketSource;
  role: StaffRole;
  name: string;
  skill: number;
  experience: number;
  morale: number;
  traits: string[];
  signingFee: number;
  salaryPerRace: number;
  tagline: string;
}

export const STAFF_MARKET_REFRESH_COST = 25_000;
const MARKET_VETERAN_SLOTS = 6;
const MARKET_EXPERIENCED_SLOTS = 10;
const MARKET_PROSPECT_SLOTS = 8;

const FIRST_NAMES = [
  "Marie", "Luca", "Yuki", "Elena", "Marcus", "Sofia", "Jean", "Oliver",
  "Priya", "Tom", "Ines", "Kai", "Nina", "Antoine", "Hannah", "Ravi",
  "Clara", "Finn", "Amélie", "Diego", "Sven", "Mei", "Bruno", "Anika",
];

const LAST_NAMES = [
  "Chen", "Rossi", "Tanaka", "Voss", "Webb", "Reyes", "Dupont", "Kent",
  "Okoye", "Sharma", "Alvarez", "Becker", "Novak", "Santos", "Kowalski",
  "Fischer", "Moreau", "Nakamura", "Silva", "Hartmann", "Lindqvist", "Park",
];

const TRAITS_BY_ROLE: Record<StaffRole, string[]> = {
  engineer: [
    "Setup wizard",
    "Aero specialist",
    "Data-driven",
    "Tyre whisperer",
    "Night stint focus",
    "Fuel-map expert",
    "Brake balance guru",
  ],
  mechanic: [
    "Pit-stop ace",
    "Reliability hawk",
    "Hybrid specialist",
    "Quick turnaround",
    "Meticulous",
    "Gearbox whisperer",
    "Cooling expert",
  ],
  strategist: [
    "Safety-car gambler",
    "Weather reader",
    "Fuel saver",
    "Aggressive caller",
    "Double-stint mind",
    "Traffic tactician",
    "Cool under pressure",
  ],
};

interface VeteranTemplate {
  role: StaffRole;
  name: string;
  skill: number;
  experience: number;
  traits: string[];
  tagline: string;
}

const VETERAN_TEMPLATES: VeteranTemplate[] = [
  {
    role: "engineer",
    name: "Paolo Catone",
    skill: 88,
    experience: 22,
    traits: ["Setup wizard", "Data-driven"],
    tagline: "Former factory LMP1 race engineer — calm under pressure",
  },
  {
    role: "engineer",
    name: "Jörg Zander",
    skill: 86,
    experience: 20,
    traits: ["Aero specialist", "Tyre whisperer"],
    tagline: "Hybrid era veteran with Le Mans pedigree",
  },
  {
    role: "engineer",
    name: "Leena Okonkwo",
    skill: 84,
    experience: 16,
    traits: ["Night stint focus", "Fuel-map expert"],
    tagline: "GT-to-hypercar crossover with strong stint planning",
  },
  {
    role: "mechanic",
    name: "Gianni Marchetti",
    skill: 87,
    experience: 19,
    traits: ["Pit-stop ace", "Reliability hawk"],
    tagline: "Sub-3s pit crew lead from the WEC front row",
  },
  {
    role: "mechanic",
    name: "Henrik Lindström",
    skill: 85,
    experience: 17,
    traits: ["Hybrid specialist", "Quick turnaround"],
    tagline: "Powertrain technician who rarely misses a rebuild window",
  },
  {
    role: "strategist",
    name: "Catherine Dubois",
    skill: 86,
    experience: 18,
    traits: ["Weather reader", "Safety-car gambler"],
    tagline: "Endurance strategist famed for bold SC calls",
  },
  {
    role: "strategist",
    name: "Raj Mehta",
    skill: 83,
    experience: 14,
    traits: ["Fuel saver", "Double-stint mind"],
    tagline: "Fuel-window specialist from the hybrid era",
  },
  {
    role: "engineer",
    name: "Elena Voss",
    skill: 82,
    experience: 12,
    traits: ["Brake balance guru", "Setup wizard"],
    tagline: "Rising factory engineer available on a freelance contract",
  },
];

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function shuffle<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pick<T>(items: T[], rnd: () => number): T {
  return items[Math.floor(rnd() * items.length)];
}

function slugId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function uniqueName(used: Set<string>, rnd: () => number): string {
  for (let attempt = 0; attempt < 40; attempt++) {
    const name = `${pick(FIRST_NAMES, rnd)} ${pick(LAST_NAMES, rnd)}`;
    const key = name.toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      return name;
    }
  }
  const fallback = `Crew ${Math.floor(rnd() * 9000) + 1000}`;
  used.add(fallback.toLowerCase());
  return fallback;
}

function computeListingFees(skill: number): {
  signingFee: number;
  salaryPerRace: number;
} {
  return {
    signingFee: staffSigningCost(skill),
    salaryPerRace: staffSalaryPerRound(skill),
  };
}

function sourceMultiplier(source: StaffMarketSource): number {
  switch (source) {
    case "veteran":
      return 1.35;
    case "experienced":
      return 1.0;
    default:
      return 0.82;
  }
}

function buildGeneratedListing(
  role: StaffRole,
  source: StaffMarketSource,
  rnd: () => number,
  usedNames: Set<string>,
  index: number,
): StaffMarketListing {
  const name = uniqueName(usedNames, rnd);
  const skillBase =
    source === "veteran" ? 78 : source === "experienced" ? 68 : 58;
  const skillSpread = source === "veteran" ? 12 : source === "experienced" ? 14 : 12;
  const skill = Math.min(
    96,
    Math.max(52, Math.round(skillBase + (rnd() - 0.5) * skillSpread)),
  );
  const experience = Math.round(
    skill * 0.2 + (source === "veteran" ? 8 : source === "experienced" ? 4 : 1),
  );
  const traitPool = TRAITS_BY_ROLE[role];
  const traits = shuffle(traitPool, rnd).slice(0, rnd() > 0.6 ? 2 : 1);
  const fees = computeListingFees(skill);
  const signingFee = Math.round(fees.signingFee * sourceMultiplier(source));
  const salaryPerRace = Math.round(fees.salaryPerRace * sourceMultiplier(source));
  const taglines: Record<StaffMarketSource, string> = {
    veteran: "Seasoned WEC paddock hire — premium signing fee",
    experienced: "Solid endurance crew member looking for a new garage",
    prospect: "Hungry junior from national series — budget friendly",
  };

  return {
    id: `${source}-${role}-${slugId(name)}-${index}`,
    source,
    role,
    name,
    skill,
    experience,
    morale: Math.round(68 + rnd() * 22),
    traits,
    signingFee,
    salaryPerRace,
    tagline: taglines[source],
  };
}

export function buildStaffMarket(options: {
  seed: number;
  existingStaff?: Array<{ name: string }>;
}): StaffMarketListing[] {
  const rnd = seeded(options.seed);
  const usedNames = new Set(
    (options.existingStaff ?? []).map((s) => s.name.trim().toLowerCase()),
  );
  const listings: StaffMarketListing[] = [];
  let index = 0;

  for (const vet of shuffle(VETERAN_TEMPLATES, rnd).slice(0, MARKET_VETERAN_SLOTS)) {
    const key = vet.name.toLowerCase();
    if (usedNames.has(key)) continue;
    usedNames.add(key);
    const fees = computeListingFees(vet.skill);
    listings.push({
      id: `veteran-${vet.role}-${slugId(vet.name)}`,
      source: "veteran",
      role: vet.role,
      name: vet.name,
      skill: vet.skill,
      experience: vet.experience,
      morale: 82,
      traits: [...vet.traits],
      signingFee: Math.round(fees.signingFee * sourceMultiplier("veteran")),
      salaryPerRace: Math.round(fees.salaryPerRace * sourceMultiplier("veteran")),
      tagline: vet.tagline,
    });
    index++;
  }

  const roles: StaffRole[] = ["engineer", "mechanic", "strategist"];
  for (let i = 0; i < MARKET_EXPERIENCED_SLOTS; i++) {
    listings.push(
      buildGeneratedListing(
        pick(roles, rnd),
        "experienced",
        rnd,
        usedNames,
        index++,
      ),
    );
  }
  for (let i = 0; i < MARKET_PROSPECT_SLOTS; i++) {
    listings.push(
      buildGeneratedListing(pick(roles, rnd), "prospect", rnd, usedNames, index++),
    );
  }

  return shuffle(listings, rnd);
}

export function staffMarketSeedForRound(
  teamName: string,
  round: number,
  refreshCount: number,
): number {
  let hash = (round + 7919) * 2654435761;
  for (let i = 0; i < teamName.length; i++) {
    hash = (hash * 37 + teamName.charCodeAt(i)) >>> 0;
  }
  return (hash + refreshCount * 6151) >>> 0;
}

export function findStaffMarketListing(
  market: StaffMarketListing[] | undefined,
  listingId: string,
): StaffMarketListing | null {
  return market?.find((l) => l.id === listingId) ?? null;
}

export function staffSourceLabel(source: StaffMarketSource): string {
  switch (source) {
    case "veteran":
      return "Veteran";
    case "experienced":
      return "Experienced";
    default:
      return "Prospect";
  }
}
