"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_DRIVER_ROSTER = exports.DRIVER_MARKET_REFRESH_COST = void 0;
exports.computeDriverSigningFee = computeDriverSigningFee;
exports.buildDriverMarket = buildDriverMarket;
exports.buildDriverMarketPreview = buildDriverMarketPreview;
exports.marketSeedForRound = marketSeedForRound;
exports.findMarketListing = findMarketListing;
exports.sourceLabel = sourceLabel;
const driver_catalog_1 = require("./driver_catalog");
exports.DRIVER_MARKET_REFRESH_COST = 50000;
exports.MAX_DRIVER_ROSTER = 12;
const MARKET_WEC_SLOTS = 14;
const MARKET_RETIRED_SLOTS = 6;
const MARKET_PROSPECT_SLOTS = 6;
const RETIRED_WEC_LEGENDS = [
    {
        tagline: "9× Le Mans winner · WEC legend",
        driver: {
            name: "Tom Kristensen", nationality: "DK", tier: "Platinum",
            dryPace: 92, wetPace: 88, consistency: 95, overtaking: 88, defending: 86,
            trafficManagement: 90, rollingStart: 88, standingStart: 86, setupFeedback: 84,
            tireManagement: 88, fuelSaving: 86, composure: 94, nightPace: 90, rainRadar: 86,
            stamina: 88, maxStintHours: 3.5,
        },
    },
    {
        tagline: "3× Le Mans winner · former WEC champion",
        driver: {
            name: "Allan McNish", nationality: "GB", tier: "Platinum",
            dryPace: 91, wetPace: 90, consistency: 92, overtaking: 90, defending: 88,
            trafficManagement: 92, rollingStart: 88, standingStart: 86, setupFeedback: 88,
            tireManagement: 90, fuelSaving: 88, composure: 90, nightPace: 88, rainRadar: 90,
            stamina: 86, maxStintHours: 3,
        },
    },
    {
        tagline: "Audi era icon · now available as endurance consultant-driver",
        driver: {
            name: "André Lotterer", nationality: "DE", tier: "Platinum",
            dryPace: 90, wetPace: 86, consistency: 90, overtaking: 88, defending: 86,
            trafficManagement: 88, rollingStart: 86, standingStart: 84, setupFeedback: 86,
            tireManagement: 88, fuelSaving: 84, composure: 88, nightPace: 86, rainRadar: 82,
            stamina: 84, maxStintHours: 3,
        },
    },
    {
        tagline: "Porsche factory pedigree · retired from full-season WEC",
        driver: {
            name: "Timo Bernhard", nationality: "DE", tier: "Platinum",
            dryPace: 90, wetPace: 88, consistency: 91, overtaking: 86, defending: 88,
            trafficManagement: 88, rollingStart: 86, standingStart: 84, setupFeedback: 84,
            tireManagement: 90, fuelSaving: 88, composure: 90, nightPace: 88, rainRadar: 86,
            stamina: 86, maxStintHours: 3,
        },
    },
    {
        tagline: "LMP1 hybrid specialist · endurance race engineer favourite",
        driver: {
            name: "Anthony Davidson", nationality: "GB", tier: "Gold",
            dryPace: 88, wetPace: 90, consistency: 90, overtaking: 84, defending: 86,
            trafficManagement: 90, rollingStart: 84, standingStart: 82, setupFeedback: 92,
            tireManagement: 88, fuelSaving: 86, composure: 88, nightPace: 86, rainRadar: 92,
            stamina: 82, maxStintHours: 2.5,
        },
    },
    {
        tagline: "Former Toyota factory driver · night-stint specialist",
        driver: {
            name: "Kazuki Nakajima", nationality: "JP", tier: "Gold",
            dryPace: 88, wetPace: 84, consistency: 88, overtaking: 82, defending: 84,
            trafficManagement: 86, rollingStart: 84, standingStart: 82, setupFeedback: 80,
            tireManagement: 86, fuelSaving: 84, composure: 86, nightPace: 90, rainRadar: 78,
            stamina: 88, maxStintHours: 3.5,
        },
    },
    {
        tagline: "Corvette factory ace · GT prototype crossover experience",
        driver: {
            name: "Antonio García", nationality: "ES", tier: "Gold",
            dryPace: 87, wetPace: 86, consistency: 88, overtaking: 86, defending: 88,
            trafficManagement: 88, rollingStart: 84, standingStart: 82, setupFeedback: 82,
            tireManagement: 88, fuelSaving: 86, composure: 88, nightPace: 84, rainRadar: 84,
            stamina: 84, maxStintHours: 3,
        },
    },
    {
        tagline: "Peugeot hypercar development driver · recently stepped back",
        driver: {
            name: "Loïc Duval", nationality: "FR", tier: "Gold",
            dryPace: 87, wetPace: 88, consistency: 86, overtaking: 84, defending: 82,
            trafficManagement: 86, rollingStart: 84, standingStart: 82, setupFeedback: 84,
            tireManagement: 84, fuelSaving: 82, composure: 84, nightPace: 82, rainRadar: 88,
            stamina: 80, maxStintHours: 2.5,
        },
    },
    {
        tagline: "Audi Sport programme · now mentoring privateer programmes",
        driver: {
            name: "Oliver Jarvis", nationality: "GB", tier: "Gold",
            dryPace: 86, wetPace: 84, consistency: 86, overtaking: 82, defending: 84,
            trafficManagement: 86, rollingStart: 82, standingStart: 80, setupFeedback: 82,
            tireManagement: 86, fuelSaving: 84, composure: 84, nightPace: 84, rainRadar: 80,
            stamina: 86, maxStintHours: 3,
        },
    },
    {
        tagline: "Ferrari AF Corse factory · endurance tyre whisperer",
        driver: {
            name: "Davide Rigon", nationality: "IT", tier: "Gold",
            dryPace: 86, wetPace: 82, consistency: 86, overtaking: 80, defending: 82,
            trafficManagement: 84, rollingStart: 80, standingStart: 78, setupFeedback: 80,
            tireManagement: 90, fuelSaving: 88, composure: 84, nightPace: 82, rainRadar: 78,
            stamina: 88, maxStintHours: 3.5,
        },
    },
    {
        tagline: "Rebellion Racing LMP1 · prototype traffic veteran",
        driver: {
            name: "Bruno Senna", nationality: "BR", tier: "Gold",
            dryPace: 86, wetPace: 84, consistency: 84, overtaking: 86, defending: 84,
            trafficManagement: 88, rollingStart: 82, standingStart: 80, setupFeedback: 78,
            tireManagement: 84, fuelSaving: 82, composure: 82, nightPace: 80, rainRadar: 76,
            stamina: 82, maxStintHours: 2.5,
        },
    },
    {
        tagline: "GTE era factory driver · solid bronze-tier mentor",
        driver: {
            name: "Richard Lietz", nationality: "DE", tier: "Silver",
            dryPace: 82, wetPace: 80, consistency: 84, overtaking: 78, defending: 80,
            trafficManagement: 82, rollingStart: 78, standingStart: 76, setupFeedback: 76,
            tireManagement: 84, fuelSaving: 82, composure: 82, nightPace: 78, rainRadar: 74,
            stamina: 84, maxStintHours: 3,
        },
    },
];
function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xffffffff;
    };
}
function shuffle(arr, rnd) {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}
function slugId(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function tierMultiplier(tier) {
    switch (tier) {
        case "Platinum":
            return 2.4;
        case "Gold":
            return 1.5;
        case "Silver":
            return 1.0;
        default:
            return 0.75;
    }
}
function sourceMultiplier(source) {
    switch (source) {
        case "wec_active":
            return 1.75;
        case "wec_retired":
            return 1.25;
        default:
            return 0.7;
    }
}
function computeDriverSigningFee(driver, source) {
    const points = (0, driver_catalog_1.computeDriverPointCost)(driver);
    const base = 40000 + points * 650;
    const signingFee = Math.round(base * tierMultiplier(driver.tier) * sourceMultiplier(source));
    const salaryPerRace = Math.round(signingFee * 0.06);
    return { signingFee, salaryPerRace };
}
function normalizeDriver(driver) {
    return {
        ...driver,
        tier: (0, driver_catalog_1.inferTier)(driver),
    };
}
function rosterNameSet(roster) {
    return new Set(roster.map((d) => d.name.trim().toLowerCase()).filter(Boolean));
}
function buildDriverMarket(repoRoot, options) {
    const rnd = seeded(options.seed);
    const taken = rosterNameSet([
        ...(options.existingRoster ?? []),
        ...(options.marketRoster ?? []),
    ]);
    const listings = [];
    const lemans = (0, driver_catalog_1.loadLeMansDriverCatalog)(repoRoot);
    const wecPool = [];
    for (const [key, roster] of lemans) {
        const comma = key.lastIndexOf("#");
        const team = key.slice(0, comma);
        if (team.toLowerCase() === options.playerTeamName.trim().toLowerCase()) {
            continue;
        }
        for (const driver of roster) {
            const nameKey = driver.name.trim().toLowerCase();
            if (taken.has(nameKey))
                continue;
            wecPool.push({ team, driver: normalizeDriver(driver) });
        }
    }
    for (const entry of shuffle(wecPool, rnd).slice(0, MARKET_WEC_SLOTS)) {
        const id = `wec-${slugId(entry.team)}-${slugId(entry.driver.name)}`;
        const fees = computeDriverSigningFee(entry.driver, "wec_active");
        listings.push({
            id,
            source: "wec_active",
            driver: { ...entry.driver },
            contractedTeam: entry.team,
            ...fees,
            tagline: `Under contract with ${entry.team} — buyout required`,
        });
        taken.add(entry.driver.name.trim().toLowerCase());
    }
    for (const legend of shuffle(RETIRED_WEC_LEGENDS, rnd).slice(0, MARKET_RETIRED_SLOTS)) {
        const driver = normalizeDriver({ ...legend.driver });
        const nameKey = driver.name.trim().toLowerCase();
        if (taken.has(nameKey))
            continue;
        const fees = computeDriverSigningFee(driver, "wec_retired");
        listings.push({
            id: `retired-${slugId(driver.name)}`,
            source: "wec_retired",
            driver,
            ...fees,
            tagline: legend.tagline,
        });
        taken.add(nameKey);
    }
    for (let i = 0; i < MARKET_PROSPECT_SLOTS; i++) {
        const seed = (options.seed + i * 7919) >>> 0;
        let driver = normalizeDriver((0, driver_catalog_1.generateRandomDriver)(seed));
        let attempts = 0;
        while (taken.has(driver.name.trim().toLowerCase()) && attempts < 8) {
            driver = normalizeDriver((0, driver_catalog_1.generateRandomDriver)(seed + attempts * 997));
            attempts++;
        }
        if (taken.has(driver.name.trim().toLowerCase()))
            continue;
        const fees = computeDriverSigningFee(driver, "prospect");
        listings.push({
            id: `prospect-${slugId(driver.name)}-${seed.toString(36)}`,
            source: "prospect",
            driver,
            ...fees,
            tagline: "Free agent · scouting report from driver market",
        });
        taken.add(driver.name.trim().toLowerCase());
    }
    return listings.sort((a, b) => b.signingFee - a.signingFee);
}
/** Static sample for team creation wizard and catalog — no buyout teams. */
function buildDriverMarketPreview(repoRoot) {
    return buildDriverMarket(repoRoot, {
        seed: 20260605,
        playerTeamName: "",
        existingRoster: [],
    }).slice(0, 18);
}
function marketSeedForRound(teamName, round, refreshCount) {
    let hash = round * 2654435761;
    for (let i = 0; i < teamName.length; i++) {
        hash = (hash * 31 + teamName.charCodeAt(i)) >>> 0;
    }
    return (hash + refreshCount * 9749) >>> 0;
}
function findMarketListing(market, listingId) {
    return market?.find((l) => l.id === listingId) ?? null;
}
function sourceLabel(source) {
    switch (source) {
        case "wec_active":
            return "WEC grid";
        case "wec_retired":
            return "Retired legend";
        default:
            return "Prospect";
    }
}
