import type {
  AiRivalSeasonPayload,
  CalendarEventPayload,
  DriverChampionshipPayload,
  FinanceLineItemPayload,
  MetaStatePayload,
  SeasonSummaryPayload,
} from "../ws_protocol";

const CLASS_IDS = ["Hypercar", "LMP2", "LMGT3"] as const;

const TEAM_CHAMPIONSHIP_BASE = [
  3_000_000, 2_000_000, 1_200_000, 800_000, 500_000, 350_000, 250_000, 150_000,
  100_000, 75_000,
];

const CLASS_PAYOUT_MULTIPLIER: Record<string, number> = {
  Hypercar: 1.0,
  LMP2: 0.55,
  LMGT3: 0.42,
};

const SEASON_COMPLETION_BONUS = 500_000;

export function scoringCalendarEvents(
  calendar: CalendarEventPayload[],
): CalendarEventPayload[] {
  return calendar.filter(
    (e) => e.eventType !== "test" && e.format !== "test",
  );
}

export function isSeasonCalendarComplete(
  calendar: CalendarEventPayload[],
): boolean {
  const scoring = scoringCalendarEvents(calendar);
  return scoring.length > 0 && scoring.every((e) => e.completed);
}

function sortTeams(
  season: AiRivalSeasonPayload,
  classId: string,
) {
  return season.teams
    .filter((t) => t.primaryClassId === classId)
    .sort(
      (a, b) =>
        b.championshipPoints - a.championshipPoints ||
        Number(b.isPlayerTeam ?? 0) - Number(a.isPlayerTeam ?? 0) ||
        b.form - a.form ||
        a.teamName.localeCompare(b.teamName),
    );
}

function sortDrivers(
  season: AiRivalSeasonPayload,
  classId: string,
): DriverChampionshipPayload[] {
  return season.drivers
    .filter((d) => d.classId === classId)
    .sort(
      (a, b) =>
        b.championshipPoints - a.championshipPoints ||
        Number(b.isPlayerDriver ?? 0) - Number(a.isPlayerDriver ?? 0) ||
        a.name.localeCompare(b.name),
    );
}

export function computeTeamChampionshipPayout(
  position: number,
  classId: string,
): number {
  if (position < 1) return 0;
  const base =
    position <= TEAM_CHAMPIONSHIP_BASE.length
      ? TEAM_CHAMPIONSHIP_BASE[position - 1]
      : 50_000;
  const classMul = CLASS_PAYOUT_MULTIPLIER[classId] ?? 0.5;
  return Math.round(base * classMul);
}

export function buildSeasonSummary(
  meta: MetaStatePayload,
): SeasonSummaryPayload | null {
  const season = meta.aiRivalSeason;
  if (!season) return null;

  const teamStandings: SeasonSummaryPayload["teamStandings"] = {};
  const driverStandings: SeasonSummaryPayload["driverStandings"] = {};
  const playerTeamPositions: Record<string, number> = {};
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

    const playerIdx = teams.findIndex(
      (t) =>
        t.isPlayerTeam ||
        t.teamName.trim().toLowerCase() === playerKey,
    );
    if (playerIdx >= 0) {
      playerTeamPositions[classId] = playerIdx + 1;
    }
  }

  const racePoints = scoringCalendarEvents(meta.calendar).reduce(
    (sum, e) => sum + (e.championshipPoints ?? 0),
    0,
  );

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

export function computeSeasonEndPayouts(
  meta: MetaStatePayload,
  summary: SeasonSummaryPayload,
): { payouts: FinanceLineItemPayload[]; totalPayout: number } {
  const payouts: FinanceLineItemPayload[] = [];
  let total = 0;
  const playerKey = meta.teamName.trim().toLowerCase();

  for (const [classId, position] of Object.entries(summary.playerTeamPositions)) {
    const amount = computeTeamChampionshipPayout(position, classId);
    if (amount <= 0) continue;
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
  if (
    total === SEASON_COMPLETION_BONUS &&
    summary.racePointsEarned > 0 &&
    !Object.keys(summary.playerTeamPositions).length
  ) {
    const hypercarPos =
      summary.teamStandings.Hypercar?.findIndex(
        (t) => t.teamName.trim().toLowerCase() === playerKey,
      ) ?? -1;
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

export function finalizeSeasonSummary(
  meta: MetaStatePayload,
): SeasonSummaryPayload | null {
  const base = buildSeasonSummary(meta);
  if (!base) return null;
  const { payouts, totalPayout } = computeSeasonEndPayouts(meta, base);
  return { ...base, payouts, totalPayout };
}
