"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.driverIdentityKey = driverIdentityKey;
exports.initDriverStandings = initDriverStandings;
exports.syncPlayerDriversToStandings = syncPlayerDriversToStandings;
exports.applyPlayerTeamRoundResult = applyPlayerTeamRoundResult;
exports.initAiRivalSeason = initAiRivalSeason;
exports.classPositions = classPositions;
exports.buildOffWeekHeadline = buildOffWeekHeadline;
exports.resolveAiSeasonTick = resolveAiSeasonTick;
exports.resolveDriverChampionshipTick = resolveDriverChampionshipTick;
exports.rivalModifiersForTeam = rivalModifiersForTeam;
exports.resolveAiDriverMarketBids = resolveAiDriverMarketBids;
exports.topRivalsByClass = topRivalsByClass;
exports.topDriversByClass = topDriversByClass;
exports.standingsTeamsForClass = standingsTeamsForClass;
exports.playerDriversForClass = playerDriversForClass;
const driver_catalog_1 = require("./driver_catalog");
const economy_1 = require("./economy");
const grid_generator_1 = require("./grid_generator");
const DEFAULT_MODIFIERS = {
    wingDelta: 0,
    damperBumpDelta: 0,
    ductAirflowDelta: 0,
    pitAggression: 1,
};
const FACTORY_HINTS = [
    "toyota",
    "ferrari",
    "porsche",
    "cadillac",
    "peugeot",
    "bmw",
    "lamborghini",
    "alpine",
    "aston",
    "corvette",
];
function hashTeam(teamName, seasonYear) {
    let h = seasonYear >>> 0;
    for (let i = 0; i < teamName.length; i++) {
        h = (Math.imul(31, h) + teamName.charCodeAt(i)) >>> 0;
    }
    return h;
}
function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(1664525, s) + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}
function isFactoryTeam(teamName) {
    const lower = teamName.toLowerCase();
    return FACTORY_HINTS.some((hint) => lower.includes(hint));
}
function driverIdentityKey(name, nationality) {
    return `${name.trim().toLowerCase()}|${nationality.trim().toUpperCase()}`;
}
function upsertDriverStanding(season, profile, teamName, classId, isPlayerDriver = false) {
    const key = (0, driver_catalog_1.driverStandingKey)(profile);
    let row = season.drivers.find((d) => d.driverKey === key);
    if (!row) {
        row = {
            driverKey: key,
            name: profile.name,
            nationality: profile.nationality,
            teamName,
            classId,
            championshipPoints: 0,
            lastRoundPoints: 0,
            racesScored: 0,
            isPlayerDriver,
        };
        season.drivers.push(row);
    }
    else {
        row.teamName = teamName;
        row.classId = classId;
        if (isPlayerDriver)
            row.isPlayerDriver = true;
    }
    return row;
}
/** Seed driver championship from the Le Mans catalog (+ optional player roster). */
function initDriverStandings(repoRoot, playerTeamName, playerRoster = [], playerFleet = []) {
    const catalog = (0, driver_catalog_1.loadLeMansDriverCatalog)(repoRoot);
    const playerKey = playerTeamName.trim().toLowerCase();
    const byKey = new Map();
    for (const entry of (0, grid_generator_1.loadLeMansEntries)(repoRoot)) {
        if (entry.teamName.trim().toLowerCase() === playerKey)
            continue;
        const roster = catalog.get(`${entry.teamName}#${entry.carNumber}`) ?? [];
        for (const profile of roster) {
            const key = (0, driver_catalog_1.driverStandingKey)((0, driver_catalog_1.ensureCatalogDriverId)(profile));
            if (byKey.has(key))
                continue;
            byKey.set(key, {
                driverKey: key,
                name: profile.name,
                nationality: profile.nationality,
                teamName: entry.teamName,
                classId: entry.classId,
                championshipPoints: 0,
                lastRoundPoints: 0,
                racesScored: 0,
            });
        }
    }
    const primaryClass = playerFleet[0]?.classId ?? "Hypercar";
    for (const profile of playerRoster) {
        const key = (0, driver_catalog_1.driverStandingKey)(profile);
        byKey.set(key, {
            driverKey: key,
            name: profile.name,
            nationality: profile.nationality,
            teamName: playerTeamName,
            classId: primaryClass,
            championshipPoints: 0,
            lastRoundPoints: 0,
            racesScored: 0,
            isPlayerDriver: true,
        });
    }
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function syncPlayerDriversToStandings(season, playerTeamName, playerRoster, playerFleet) {
    if (!playerRoster.length)
        return;
    const primaryClass = playerFleet[0]?.classId ?? "Hypercar";
    for (const profile of playerRoster) {
        upsertDriverStanding(season, profile, playerTeamName, primaryClass, true);
    }
}
function rosterKey(teamName, carNumber) {
    return (0, driver_catalog_1.sessionEntryKey)(teamName, carNumber);
}
function primaryCarNumber(repoRoot, teamName) {
    const entry = (0, grid_generator_1.loadLeMansEntries)(repoRoot).find((e) => e.teamName.toLowerCase() === teamName.toLowerCase());
    return entry?.carNumber ?? "1";
}
function mergeRosterOverride(repoRoot, season, teamName, carNumber, driver) {
    if (!season.rosterOverrides)
        season.rosterOverrides = {};
    const key = rosterKey(teamName, carNumber);
    const catalog = (0, driver_catalog_1.loadLeMansDriverCatalog)(repoRoot);
    const base = season.rosterOverrides[key] ?? catalog.get(key) ?? [];
    const signed = (0, driver_catalog_1.ensureCatalogDriverId)(driver);
    const driverId = signed.id;
    if (base.some((d) => (0, driver_catalog_1.ensureCatalogDriverId)(d).id === driverId)) {
        season.rosterOverrides[key] = base.map((d) => ({ ...d }));
        return;
    }
    let roster = [...base.map((d) => ({ ...d })), { ...signed }];
    if (roster.length > 3)
        roster = roster.slice(-3);
    season.rosterOverrides[key] = roster;
}
/** Track player team points alongside AI rivals (per class). */
function applyPlayerTeamRoundResult(season, teamName, classId, points) {
    if (points <= 0)
        return;
    let team = season.teams.find((t) => t.isPlayerTeam &&
        t.teamName === teamName &&
        t.primaryClassId === classId);
    if (!team) {
        team = initTeamState(teamName, classId, season.seasonYear);
        team.isPlayerTeam = true;
        season.teams.push(team);
    }
    team.lastRoundPoints = points;
    team.championshipPoints += points;
    team.racesScored += 1;
}
function sessionRosterForResult(result, sessionEntryRosters) {
    return sessionEntryRosters[rosterKey(result.teamName, result.carNumber)]?.map((d) => ({ ...d })) ?? [];
}
function classBudgetBase(classId, factory) {
    if (classId === "Hypercar")
        return factory ? 95000000 : 55000000;
    if (classId === "LMP2")
        return factory ? 28000000 : 18000000;
    return factory ? 22000000 : 12000000;
}
function initTeamState(teamName, primaryClassId, seasonYear) {
    const rnd = seeded(hashTeam(teamName, seasonYear));
    const factory = isFactoryTeam(teamName);
    const budgetSpread = primaryClassId === "Hypercar" ? 25000000 : 8000000;
    const budget = classBudgetBase(primaryClassId, factory) +
        Math.floor((rnd() - 0.5) * budgetSpread);
    const engineerSkill = Math.round((factory ? 86 : 78) + (rnd() - 0.5) * 12);
    const rdTier = factory
        ? 2 + Math.floor(rnd() * 2)
        : Math.floor(rnd() * 2);
    return {
        teamName,
        primaryClassId,
        budget: Math.max(5000000, budget),
        rdTier: Math.min(3, Math.max(0, rdTier)),
        engineerSkill: Math.min(95, Math.max(70, engineerSkill)),
        form: 0,
        championshipPoints: 0,
        racesScored: 0,
        arc: factory ? "defending_champion" : "underdog",
        lastRoundPoints: 0,
        driversSigned: 0,
    };
}
/** Seed rival meta from the official entry list (excludes the player team). */
function initAiRivalSeason(repoRoot, playerTeamName, seasonYear) {
    const playerKey = playerTeamName.trim().toLowerCase();
    const byTeam = new Map();
    for (const entry of (0, grid_generator_1.loadLeMansEntries)(repoRoot)) {
        const key = entry.teamName.trim().toLowerCase();
        if (key === playerKey)
            continue;
        if (!byTeam.has(entry.teamName)) {
            byTeam.set(entry.teamName, entry.classId);
        }
    }
    const teams = [...byTeam.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([teamName, primaryClassId]) => initTeamState(teamName, primaryClassId, seasonYear));
    return {
        seasonYear,
        teams,
        drivers: initDriverStandings(repoRoot, playerTeamName, [], []),
    };
}
function classPositions(results) {
    const byClass = new Map();
    for (const r of results) {
        const list = byClass.get(r.classId) ?? [];
        list.push(r);
        byClass.set(r.classId, list);
    }
    const out = new Map();
    for (const list of byClass.values()) {
        list.sort((a, b) => a.position - b.position);
        list.forEach((r, idx) => out.set(r.entryId, idx + 1));
    }
    return out;
}
function updateArc(team) {
    const prev = team.arc;
    if (team.form >= 2 && team.championshipPoints >= 40) {
        team.arc = "hot_streak";
    }
    else if (team.form <= -2 && team.championshipPoints < 20) {
        team.arc = "rebuilding";
    }
    else if (team.championshipPoints >= 60) {
        team.arc = "defending_champion";
    }
    else if (team.rdTier <= 1 && team.budget < 20000000) {
        team.arc = "underdog";
    }
    else {
        team.arc = null;
    }
    return prev !== team.arc ? team.arc : null;
}
function arcLabel(arc) {
    if (!arc)
        return "";
    return arc.replace(/_/g, " ");
}
function pushOffWeekEvent(season, event) {
    if (!season.lastOffWeekEvents)
        season.lastOffWeekEvents = [];
    if (season.lastOffWeekEvents.length >= 8)
        return;
    season.lastOffWeekEvents.push(event);
}
function applyFormDelta(team, classPos) {
    if (classPos <= 3)
        team.form = Math.min(3, team.form + 1);
    else if (classPos >= 10)
        team.form = Math.max(-3, team.form - 1);
    else if (classPos <= 5)
        team.form = Math.min(3, team.form + 0);
}
function maybeInvestRd(team) {
    if (team.racesScored > 0 && team.racesScored % 3 === 0) {
        const upgradeCost = 4000000 + team.rdTier * 2000000;
        if (team.budget >= upgradeCost && team.rdTier < 3 && team.form >= 0) {
            team.budget -= upgradeCost;
            team.rdTier += 1;
            team.engineerSkill = Math.min(95, team.engineerSkill + 1);
            return true;
        }
    }
    return false;
}
/** One-line off-week headline for UI tickers. */
function buildOffWeekHeadline(season) {
    const hot = season.teams
        .filter((t) => t.arc === "hot_streak" && t.lastRoundPoints > 0)
        .sort((a, b) => b.lastRoundPoints - a.lastRoundPoints)[0];
    if (hot) {
        return `${hot.teamName} surges on ${hot.lastRoundPoints} pts — form +${hot.form}`;
    }
    for (const classId of ["Hypercar", "LMP2", "LMGT3"]) {
        const leader = topRivalsByClass(season, classId, 1)[0];
        if (leader && leader.championshipPoints > 0) {
            return `${leader.teamName} leads ${classId} on ${leader.championshipPoints} pts`;
        }
    }
    const market = season.lastOffWeekEvents?.find((e) => e.type === "market");
    if (market)
        return market.text;
    return season.lastMarketNote ?? "Rivals regroup between rounds";
}
/** Resolve off-week rival progression from a completed race session. */
function resolveAiSeasonTick(season, options) {
    const playerKey = options.playerTeamName.trim().toLowerCase();
    const classPos = classPositions(options.raceResults);
    const byTeam = new Map(season.teams.map((t) => [t.teamName, t]));
    season.lastOffWeekEvents = [];
    season.lastOffWeekHeadline = undefined;
    season.marketSignedListingIds = [];
    season.lastMarketNote = undefined;
    for (const result of options.raceResults) {
        if (result.teamName.trim().toLowerCase() === playerKey)
            continue;
        let team = byTeam.get(result.teamName);
        if (!team) {
            team = initTeamState(result.teamName, result.classId, season.seasonYear);
            season.teams.push(team);
            byTeam.set(result.teamName, team);
        }
        const pos = classPos.get(result.entryId) ?? result.position;
        if (!options.scoring)
            continue;
        const pts = (0, economy_1.computeChampionshipPoints)(pos);
        const prize = (0, economy_1.computePrizeMoney)(pos, result.classId, options.eventFormat);
        team.lastRoundPoints = pts;
        team.championshipPoints += pts;
        team.budget += prize + 75000 - 35000;
        team.racesScored += 1;
        const prevForm = team.form;
        applyFormDelta(team, pos);
        if (team.form > prevForm) {
            pushOffWeekEvent(season, {
                type: "form",
                teamName: team.teamName,
                classId: team.primaryClassId,
                text: `${team.teamName} building momentum (form +${team.form - prevForm})`,
            });
        }
        else if (team.form < prevForm) {
            pushOffWeekEvent(season, {
                type: "form",
                teamName: team.teamName,
                classId: team.primaryClassId,
                text: `${team.teamName} struggling for rhythm (form ${team.form})`,
            });
        }
        if (pts >= 15) {
            pushOffWeekEvent(season, {
                type: "points",
                teamName: team.teamName,
                classId: team.primaryClassId,
                text: `${team.teamName} banked ${pts} pts (P${pos} in ${result.classId})`,
            });
        }
        if (maybeInvestRd(team)) {
            pushOffWeekEvent(season, {
                type: "rd",
                teamName: team.teamName,
                classId: team.primaryClassId,
                text: `${team.teamName} upgrades R&D to tier ${team.rdTier}`,
            });
        }
        const newArc = updateArc(team);
        if (newArc) {
            pushOffWeekEvent(season, {
                type: "arc",
                teamName: team.teamName,
                classId: team.primaryClassId,
                text: `${team.teamName} now tagged as ${arcLabel(newArc)}`,
            });
        }
    }
    for (const classId of ["Hypercar", "LMP2", "LMGT3"]) {
        const leader = topRivalsByClass(season, classId, 1)[0];
        if (leader && leader.championshipPoints > 0 && !leader.isPlayerTeam) {
            pushOffWeekEvent(season, {
                type: "standings",
                teamName: leader.teamName,
                classId,
                text: `${leader.teamName} tops ${classId} on ${leader.championshipPoints} pts`,
            });
        }
    }
    return season;
}
/** Award class points to every driver listed for each finishing entry. */
function resolveDriverChampionshipTick(season, options) {
    if (!options.scoring || !options.raceResults.length) {
        for (const row of season.drivers)
            row.lastRoundPoints = 0;
        return season;
    }
    const classPos = classPositions(options.raceResults);
    for (const row of season.drivers)
        row.lastRoundPoints = 0;
    for (const result of options.raceResults) {
        const pos = classPos.get(result.entryId) ?? result.position;
        const pts = (0, economy_1.computeChampionshipPoints)(pos);
        if (pts <= 0)
            continue;
        const roster = sessionRosterForResult(result, options.sessionEntryRosters);
        if (!roster.length)
            continue;
        const isPlayer = result.teamName.trim().toLowerCase() ===
            options.playerTeamName.trim().toLowerCase();
        for (const profile of roster) {
            const row = upsertDriverStanding(season, profile, result.teamName, result.classId, isPlayer);
            row.lastRoundPoints = pts;
            row.championshipPoints += pts;
            row.racesScored += 1;
        }
    }
    return season;
}
function rivalModifiersForTeam(teamName, season) {
    if (!season)
        return DEFAULT_MODIFIERS;
    const team = season.teams.find((t) => t.teamName.toLowerCase() === teamName.toLowerCase());
    if (!team)
        return DEFAULT_MODIFIERS;
    const wingDelta = Math.max(-0.015, Math.min(0.015, (team.engineerSkill - 80) * 0.001 + team.form * 0.002));
    const damperBumpDelta = Math.max(-2, Math.min(3, team.form + team.rdTier));
    const ductAirflowDelta = team.rdTier * 0.04;
    const pitAggression = Math.max(0.85, Math.min(1.15, 1 + team.form * 0.03 + (team.engineerSkill - 80) * 0.002));
    return { wingDelta, damperBumpDelta, ductAirflowDelta, pitAggression };
}
/** AI rivals sign drivers from the refreshed market between rounds. */
function resolveAiDriverMarketBids(repoRoot, season, market, seed) {
    const rnd = seeded(seed);
    const signedIds = [];
    const teamsByBudget = [...season.teams].sort((a, b) => b.budget - a.budget);
    const playerTeam = season.teams.find((t) => t.isPlayerTeam)?.teamName ?? "";
    const contracts = (0, driver_catalog_1.buildDriverContractMap)(repoRoot, {
        playerTeamName: playerTeam,
        rosterOverrides: season.rosterOverrides,
    });
    const candidates = market.filter((l) => l.source === "wec_active" || l.source === "prospect");
    for (const team of teamsByBudget.slice(0, 8)) {
        if (signedIds.length >= 3)
            break;
        if (team.budget < 500000)
            continue;
        if (rnd() > 0.35 + team.form * 0.05)
            continue;
        const pool = candidates.filter((l) => {
            if (signedIds.includes(l.id))
                return false;
            const driverId = (0, driver_catalog_1.ensureCatalogDriverId)(l.driver).id;
            const holder = contracts.get(driverId);
            if (l.source === "prospect") {
                if (team.budget <= 15000000)
                    return false;
                return (!holder || holder.toLowerCase() === team.teamName.toLowerCase());
            }
            return (l.contractedTeam?.toLowerCase() === team.teamName.toLowerCase() &&
                (!holder || holder.toLowerCase() === team.teamName.toLowerCase()));
        });
        if (pool.length === 0)
            continue;
        const pick = pool[Math.floor(rnd() * pool.length)];
        const cost = pick.signingFee + pick.salaryPerRace * 2;
        if (team.budget < cost)
            continue;
        team.budget -= cost;
        team.driversSigned += 1;
        team.engineerSkill = Math.min(95, team.engineerSkill + 1);
        signedIds.push(pick.id);
        const signingTeam = pick.contractedTeam && pick.source === "wec_active"
            ? pick.contractedTeam
            : team.teamName;
        const carNumber = primaryCarNumber(repoRoot, signingTeam);
        mergeRosterOverride(repoRoot, season, signingTeam, carNumber, (0, driver_catalog_1.ensureCatalogDriverId)(pick.driver));
        pushOffWeekEvent(season, {
            type: "market",
            teamName: signingTeam,
            text: `${signingTeam} signs ${pick.driver.name} from the driver market`,
        });
    }
    const remaining = market.filter((l) => !signedIds.includes(l.id));
    const note = signedIds.length > 0
        ? `${signedIds.length} rival driver signing(s) this off-week`
        : "No rival driver signings this off-week";
    season.marketSignedListingIds = signedIds;
    season.lastMarketNote = note;
    season.lastOffWeekHeadline = buildOffWeekHeadline(season);
    return { market: remaining, signedIds, note };
}
function topRivalsByClass(season, classId, limit = 5) {
    if (!season)
        return [];
    return season.teams
        .filter((t) => t.primaryClassId === classId)
        .sort((a, b) => b.championshipPoints - a.championshipPoints ||
        b.form - a.form)
        .slice(0, limit);
}
function topDriversByClass(season, classId, limit = 5) {
    if (!season)
        return [];
    return season.drivers
        .filter((d) => d.classId === classId)
        .sort((a, b) => b.championshipPoints - a.championshipPoints ||
        a.name.localeCompare(b.name))
        .slice(0, limit);
}
/** Standings rows for UI — always includes the player team if they score in class. */
function standingsTeamsForClass(season, classId, limit = 3) {
    if (!season)
        return [];
    const sorted = season.teams
        .filter((t) => t.primaryClassId === classId)
        .sort((a, b) => b.championshipPoints - a.championshipPoints ||
        Number(b.isPlayerTeam ?? 0) - Number(a.isPlayerTeam ?? 0) ||
        b.form - a.form);
    const player = sorted.find((t) => t.isPlayerTeam);
    let out = sorted.slice(0, limit);
    if (player && !out.some((t) => t.isPlayerTeam)) {
        out = [...sorted.filter((t) => !t.isPlayerTeam).slice(0, limit - 1), player];
    }
    return out;
}
/** Player driver rows for a class, sorted by points. */
function playerDriversForClass(season, classId) {
    if (!season)
        return [];
    return season.drivers
        .filter((d) => d.isPlayerDriver && d.classId === classId)
        .sort((a, b) => b.championshipPoints - a.championshipPoints);
}
