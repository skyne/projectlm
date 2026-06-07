"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoringCalendarEvents = scoringCalendarEvents;
exports.isSeasonCalendarComplete = isSeasonCalendarComplete;
exports.computeTeamChampionshipPayout = computeTeamChampionshipPayout;
exports.buildSeasonSummary = buildSeasonSummary;
exports.computeSeasonEndPayouts = computeSeasonEndPayouts;
exports.finalizeSeasonSummary = finalizeSeasonSummary;
const CLASS_IDS = ["Hypercar", "LMP2", "LMGT3"];
const TEAM_CHAMPIONSHIP_BASE = [
    3000000, 2000000, 1200000, 800000, 500000, 350000, 250000, 150000,
    100000, 75000,
];
const CLASS_PAYOUT_MULTIPLIER = {
    Hypercar: 1.0,
    LMP2: 0.55,
    LMGT3: 0.42,
};
const SEASON_COMPLETION_BONUS = 500000;
function scoringCalendarEvents(calendar) {
    return calendar.filter((e) => e.eventType !== "test" && e.format !== "test");
}
function isSeasonCalendarComplete(calendar) {
    const scoring = scoringCalendarEvents(calendar);
    return scoring.length > 0 && scoring.every((e) => e.completed);
}
function sortTeams(season, classId) {
    return season.teams
        .filter((t) => t.primaryClassId === classId)
        .sort((a, b) => b.championshipPoints - a.championshipPoints ||
        Number(b.isPlayerTeam ?? 0) - Number(a.isPlayerTeam ?? 0) ||
        b.form - a.form ||
        a.teamName.localeCompare(b.teamName));
}
function sortDrivers(season, classId) {
    return season.drivers
        .filter((d) => d.classId === classId)
        .sort((a, b) => b.championshipPoints - a.championshipPoints ||
        Number(b.isPlayerDriver ?? 0) - Number(a.isPlayerDriver ?? 0) ||
        a.name.localeCompare(b.name));
}
function computeTeamChampionshipPayout(position, classId) {
    if (position < 1)
        return 0;
    const base = position <= TEAM_CHAMPIONSHIP_BASE.length
        ? TEAM_CHAMPIONSHIP_BASE[position - 1]
        : 50000;
    const classMul = CLASS_PAYOUT_MULTIPLIER[classId] ?? 0.5;
    return Math.round(base * classMul);
}
function buildSeasonSummary(meta) {
    const season = meta.aiRivalSeason;
    if (!season)
        return null;
    const teamStandings = {};
    const driverStandings = {};
    const playerTeamPositions = {};
    const playerKey = meta.teamName.trim().toLowerCase();
    for (const classId of CLASS_IDS) {
        const teams = sortTeams(season, classId);
        teamStandings[classId] = teams.map((team, index) => ({
            position: index + 1,
            teamName: team.teamName,
            classId,
            championshipPoints: team.championshipPoints,
            isPlayerTeam: team.isPlayerTeam,
        }));
        const drivers = sortDrivers(season, classId);
        driverStandings[classId] = drivers.slice(0, 10).map((driver, index) => ({
            position: index + 1,
            name: driver.name,
            teamName: driver.teamName,
            classId,
            championshipPoints: driver.championshipPoints,
            isPlayerDriver: driver.isPlayerDriver,
        }));
        const playerIdx = teams.findIndex((t) => t.isPlayerTeam ||
            t.teamName.trim().toLowerCase() === playerKey);
        if (playerIdx >= 0) {
            playerTeamPositions[classId] = playerIdx + 1;
        }
    }
    const racePoints = scoringCalendarEvents(meta.calendar).reduce((sum, e) => sum + (e.championshipPoints ?? 0), 0);
    return {
        seasonYear: meta.seasonYear,
        teamStandings,
        driverStandings,
        playerTeamPositions,
        racePointsEarned: racePoints,
        payouts: [],
        totalPayout: 0,
    };
}
function computeSeasonEndPayouts(meta, summary) {
    const payouts = [];
    let total = 0;
    const playerKey = meta.teamName.trim().toLowerCase();
    for (const [classId, position] of Object.entries(summary.playerTeamPositions)) {
        const amount = computeTeamChampionshipPayout(position, classId);
        if (amount <= 0)
            continue;
        payouts.push({
            label: `${classId} teams' championship P${position}`,
            amount,
        });
        total += amount;
    }
    if (isSeasonCalendarComplete(meta.calendar)) {
        payouts.push({
            label: "FIA season completion bonus",
            amount: SEASON_COMPLETION_BONUS,
        });
        total += SEASON_COMPLETION_BONUS;
    }
    // Fallback: player raced but has no AI team row (legacy saves).
    if (total === SEASON_COMPLETION_BONUS &&
        summary.racePointsEarned > 0 &&
        !Object.keys(summary.playerTeamPositions).length) {
        const hypercarPos = summary.teamStandings.Hypercar?.findIndex((t) => t.teamName.trim().toLowerCase() === playerKey) ?? -1;
        if (hypercarPos >= 0) {
            const amount = computeTeamChampionshipPayout(hypercarPos + 1, "Hypercar");
            if (amount > 0) {
                payouts.unshift({
                    label: `Hypercar teams' championship P${hypercarPos + 1}`,
                    amount,
                });
                total += amount;
            }
        }
    }
    return { payouts, totalPayout: total };
}
function finalizeSeasonSummary(meta) {
    const base = buildSeasonSummary(meta);
    if (!base)
        return null;
    const { payouts, totalPayout } = computeSeasonEndPayouts(meta, base);
    return { ...base, payouts, totalPayout };
}
