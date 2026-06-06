"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SPONSOR_OFFERS = exports.APPEARANCE_FEE = exports.RACE_ENTRY_FEE = exports.MAX_SPONSOR_SLOTS = exports.STARTING_BUDGET = void 0;
exports.sponsorOfferById = sponsorOfferById;
exports.computeChampionshipPoints = computeChampionshipPoints;
exports.computePrizeMoney = computePrizeMoney;
exports.staffSigningCost = staffSigningCost;
exports.staffSalaryPerRound = staffSalaryPerRound;
exports.computeStaffPayroll = computeStaffPayroll;
exports.computeRaceFinances = computeRaceFinances;
exports.sponsorOffersPayload = sponsorOffersPayload;
/** Inflated for development — enough for full manufacturer programmes + staff. */
exports.STARTING_BUDGET = 500000000;
exports.MAX_SPONSOR_SLOTS = 3;
exports.RACE_ENTRY_FEE = 35000;
exports.APPEARANCE_FEE = 75000;
const POSITION_PRIZE_SHARE = [
    1.0, 0.65, 0.45, 0.32, 0.24, 0.18, 0.14, 0.11, 0.09, 0.07,
];
const FORMAT_BASE_POOL = {
    "24h": 900000,
    "12h": 450000,
    "8h": 380000,
    "6h": 280000,
    "1812km": 520000,
    test: 0,
};
const CLASS_PRIZE_MULTIPLIER = {
    Hypercar: 1.0,
    LMP2: 0.55,
    LMGT3: 0.42,
};
const CHAMPIONSHIP_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
exports.SPONSOR_OFFERS = [
    {
        id: "aurora_energy",
        name: "Aurora Energy",
        tagline: "Title partner — high visibility, win bonuses",
        signingFee: 200000,
        perRaceIncome: 50000,
        podiumBonus: 0,
        winBonus: 100000,
        topFiveBonus: 0,
        rdPointsPerRace: 0,
    },
    {
        id: "chronos",
        name: "Chronos Watches",
        tagline: "Luxury timing partner — podium bonuses",
        signingFee: 150000,
        perRaceIncome: 20000,
        podiumBonus: 75000,
        winBonus: 0,
        topFiveBonus: 0,
        rdPointsPerRace: 0,
    },
    {
        id: "titan_lube",
        name: "Titan Lubricants",
        tagline: "Steady technical partner income",
        signingFee: 100000,
        perRaceIncome: 35000,
        podiumBonus: 0,
        winBonus: 0,
        topFiveBonus: 0,
        rdPointsPerRace: 0,
    },
    {
        id: "velocity",
        name: "Velocity Apparel",
        tagline: "Fan-facing brand — rewards top-five finishes",
        signingFee: 80000,
        perRaceIncome: 25000,
        podiumBonus: 0,
        winBonus: 0,
        topFiveBonus: 40000,
        rdPointsPerRace: 0,
    },
    {
        id: "griddata",
        name: "GridData Analytics",
        tagline: "Data partner — modest cash, R&D each race",
        signingFee: 120000,
        perRaceIncome: 15000,
        podiumBonus: 0,
        winBonus: 0,
        topFiveBonus: 0,
        rdPointsPerRace: 5,
    },
    {
        id: "heritage_auto",
        name: "Heritage Automotive",
        tagline: "Premium title sponsor — largest payouts",
        signingFee: 350000,
        perRaceIncome: 80000,
        podiumBonus: 50000,
        winBonus: 150000,
        topFiveBonus: 0,
        rdPointsPerRace: 0,
    },
];
function sponsorOfferById(id) {
    return exports.SPONSOR_OFFERS.find((o) => o.id === id);
}
function computeChampionshipPoints(position) {
    if (position < 1)
        return 0;
    if (position <= CHAMPIONSHIP_POINTS.length) {
        return CHAMPIONSHIP_POINTS[position - 1];
    }
    return 0;
}
function positionPrizeShare(position) {
    const idx = position - 1;
    if (idx < POSITION_PRIZE_SHARE.length)
        return POSITION_PRIZE_SHARE[idx];
    return Math.max(0.02, 0.07 - (idx - 9) * 0.004);
}
function computePrizeMoney(position, classId, format) {
    const basePool = FORMAT_BASE_POOL[format.toLowerCase()] ?? 250000;
    const classMul = CLASS_PRIZE_MULTIPLIER[classId] ?? 0.5;
    return Math.round(basePool * classMul * positionPrizeShare(position));
}
function staffSigningCost(skill) {
    return 120000 + skill * 1500;
}
function staffSalaryPerRound(skill) {
    return 25000 + skill * 200;
}
function computeStaffPayroll(staff) {
    return staff.reduce((sum, m) => sum + staffSalaryPerRound(m.skill), 0);
}
function computeRaceFinances(position, classId, format, sponsors, staff, options) {
    const scoring = options?.scoring ?? format.toLowerCase() !== "test";
    const prizeMoney = scoring ? computePrizeMoney(position, classId, format) : 0;
    const staffPayroll = computeStaffPayroll(staff);
    let sponsorIncome = 0;
    let rdPointsEarned = 0;
    const breakdown = [];
    if (scoring) {
        breakdown.push({
            label: `Prize money (P${position})`,
            amount: prizeMoney,
        });
        breakdown.push({ label: "WEC appearance fee", amount: exports.APPEARANCE_FEE });
        breakdown.push({ label: "Race operations", amount: -exports.RACE_ENTRY_FEE });
    }
    else {
        breakdown.push({ label: "Pre-season test (no prize money)", amount: 0 });
        breakdown.push({ label: "Test operations", amount: -15000 });
    }
    for (const contract of sponsors) {
        const offer = sponsorOfferById(contract.offerId);
        if (!offer)
            continue;
        if (offer.perRaceIncome > 0) {
            sponsorIncome += offer.perRaceIncome;
            breakdown.push({
                label: `${offer.name} stipend`,
                amount: offer.perRaceIncome,
            });
        }
        if (position <= 3 && offer.podiumBonus > 0) {
            sponsorIncome += offer.podiumBonus;
            breakdown.push({
                label: `${offer.name} podium bonus`,
                amount: offer.podiumBonus,
            });
        }
        if (position === 1 && offer.winBonus > 0) {
            sponsorIncome += offer.winBonus;
            breakdown.push({
                label: `${offer.name} win bonus`,
                amount: offer.winBonus,
            });
        }
        if (position <= 5 && offer.topFiveBonus > 0) {
            sponsorIncome += offer.topFiveBonus;
            breakdown.push({
                label: `${offer.name} top-5 bonus`,
                amount: offer.topFiveBonus,
            });
        }
        rdPointsEarned += offer.rdPointsPerRace;
    }
    if (staffPayroll > 0) {
        breakdown.push({ label: "Staff payroll", amount: -staffPayroll });
    }
    const appearanceFee = scoring ? exports.APPEARANCE_FEE : 0;
    const entryFee = scoring ? -exports.RACE_ENTRY_FEE : -15000;
    const netEarnings = prizeMoney + appearanceFee + sponsorIncome + entryFee - staffPayroll;
    return {
        prizeMoney,
        appearanceFee,
        sponsorIncome,
        entryFee,
        staffPayroll,
        netEarnings,
        championshipPoints: scoring ? computeChampionshipPoints(position) : 0,
        rdPointsEarned: scoring ? rdPointsEarned : Math.max(1, Math.floor(rdPointsEarned / 2)),
        breakdown,
    };
}
function sponsorOffersPayload() {
    return exports.SPONSOR_OFFERS.map((o) => ({ ...o }));
}
