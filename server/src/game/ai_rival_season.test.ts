import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import type { DriverProfilePayload, DriverMarketListingPayload, FleetCarPayload } from "../ws_protocol";
import {
  applyPlayerTeamRoundResult,
  classPositions,
  driverIdentityKey,
  buildOffWeekHeadline,
  initAiRivalSeason,
  resolveAiDriverMarketBids,
  resolveAiSeasonTick,
  resolveDriverChampionshipTick,
  rivalModifiersForTeam,
  syncPlayerDriversToStandings,
  topDriversByClass,
  topRivalsByClass,
} from "./ai_rival_season";
import {
  buildSessionEntryRosters,
  exportRuntimeDrivers,
  ensureCatalogDriverId,
  loadLeMansDriverCatalog,
  resolveCarDriverRoster,
  rostersForCompetingEntries,
  type SessionEntryRosters,
} from "./driver_catalog";

const repoRoot = path.resolve(process.cwd(), "..");

function sessionRostersForResults(
  raceResults: Array<{ teamName: string; carNumber: string }>,
  options: {
    playerTeamName: string;
    playerRoster?: DriverProfilePayload[];
    playerFleet?: FleetCarPayload[];
    rosterOverrides?: Record<string, DriverProfilePayload[]>;
  },
): SessionEntryRosters {
  const playerEntries = (options.playerFleet ?? []).flatMap((car) => {
    const roster = resolveCarDriverRoster(
      options.playerRoster ?? [],
      car.assignedDriverIds,
    );
    if (!roster.length) return [];
    return [
      {
        teamName: options.playerTeamName,
        carNumber: car.carNumber,
        roster,
      },
    ];
  });
  const all = buildSessionEntryRosters(repoRoot, {
    playerTeamName: options.playerTeamName,
    playerRoster: options.playerRoster,
    playerEntries,
    rosterOverrides: options.rosterOverrides,
  });
  return rostersForCompetingEntries(raceResults, all);
}

describe("ai_rival_season", () => {
  it("seeds rivals from the Le Mans entry list excluding the player", () => {
    const season = initAiRivalSeason(repoRoot, "SkyTech", 2026);
    assert.equal(season.seasonYear, 2026);
    assert.ok(season.teams.length >= 20);
    assert.ok(
      !season.teams.some((t) => t.teamName.toLowerCase() === "skytech"),
    );
    assert.ok(season.teams.every((t) => t.budget > 0));
    assert.ok(season.drivers.length >= 100);
  });

  it("awards class championship points and updates form after a race", () => {
    const season = initAiRivalSeason(repoRoot, "SkyTech", 2026);
    const toyota = season.teams.find((t) =>
      t.teamName.toLowerCase().includes("toyota"),
    );
    assert.ok(toyota);

    resolveAiSeasonTick(season, {
      playerTeamName: "SkyTech",
      scoring: true,
      eventFormat: "6h",
      raceResults: [
        {
          entryId: "e1",
          teamName: toyota!.teamName,
          carNumber: "7",
          classId: "Hypercar",
          position: 1,
        },
        {
          entryId: "e2",
          teamName: "Cursor Racing",
          carNumber: "99",
          classId: "Hypercar",
          position: 2,
        },
      ],
    });

    assert.equal(toyota!.lastRoundPoints, 25);
    assert.equal(toyota!.championshipPoints, 25);
    assert.ok(toyota!.form >= 1);
    assert.ok(rivalModifiersForTeam(toyota!.teamName, season).wingDelta !== 0);
  });

  it("computes class positions independently of overall order", () => {
    const positions = classPositions([
      { entryId: "h1", teamName: "A", carNumber: "1", classId: "Hypercar", position: 1 },
      { entryId: "g1", teamName: "B", carNumber: "2", classId: "LMGT3", position: 2 },
      { entryId: "h2", teamName: "C", carNumber: "3", classId: "Hypercar", position: 3 },
    ]);
    assert.equal(positions.get("h1"), 1);
    assert.equal(positions.get("h2"), 2);
    assert.equal(positions.get("g1"), 1);
  });

  it("lets rich rivals remove driver market listings", () => {
    const season = initAiRivalSeason(repoRoot, "SkyTech", 2026);
    for (const team of season.teams.slice(0, 3)) {
      team.budget = 120_000_000;
      team.form = 2;
    }

    const market: DriverMarketListingPayload[] = [
      {
        id: "wec-toyota-driver",
        source: "wec_active",
        driver: {
          name: "Test Driver",
          nationality: "JP",
          tier: "Platinum",
          dryPace: 90,
          wetPace: 88,
          consistency: 90,
          overtaking: 86,
          defending: 84,
          trafficManagement: 88,
          rollingStart: 86,
          standingStart: 84,
          setupFeedback: 82,
          tireManagement: 86,
          fuelSaving: 84,
          composure: 88,
          nightPace: 86,
          rainRadar: 84,
          stamina: 86,
          maxStintHours: 3,
        },
        contractedTeam: season.teams[0]!.teamName,
        signingFee: 200_000,
        salaryPerRace: 50_000,
        tagline: "buyout",
      },
      {
        id: "prospect-1",
        source: "prospect",
        driver: {
          name: "Prospect",
          nationality: "FR",
          tier: "Silver",
          dryPace: 78,
          wetPace: 76,
          consistency: 80,
          overtaking: 74,
          defending: 72,
          trafficManagement: 76,
          rollingStart: 74,
          standingStart: 72,
          setupFeedback: 70,
          tireManagement: 76,
          fuelSaving: 74,
          composure: 78,
          nightPace: 74,
          rainRadar: 70,
          stamina: 76,
          maxStintHours: 2.5,
        },
        signingFee: 80_000,
        salaryPerRace: 20_000,
        tagline: "prospect",
      },
    ];

    const { market: remaining, signedIds } = resolveAiDriverMarketBids(
      repoRoot,
      season,
      market,
      42,
    );
    assert.ok(signedIds.length >= 1);
    assert.ok(remaining.length < market.length);
  });

  it("skips listings protected by player negotiations", () => {
    const season = initAiRivalSeason(repoRoot, "SkyTech", 2026);
    for (const team of season.teams.slice(0, 3)) {
      team.budget = 120_000_000;
      team.form = 2;
    }
    const listingId = "prospect-protected";
    const market: DriverMarketListingPayload[] = [
      {
        id: listingId,
        source: "prospect",
        driver: {
          name: "Protected Prospect",
          nationality: "FR",
          tier: "Silver",
          dryPace: 78,
          wetPace: 74,
          consistency: 76,
          overtaking: 72,
          defending: 74,
          trafficManagement: 74,
          rollingStart: 72,
          standingStart: 70,
          setupFeedback: 68,
          tireManagement: 76,
          fuelSaving: 74,
          composure: 76,
          nightPace: 72,
          rainRadar: 68,
          stamina: 76,
          maxStintHours: 2.5,
        },
        signingFee: 90_000,
        salaryPerRace: 18_000,
        tagline: "prospect",
      },
    ];
    const protectedIds = new Set([listingId]);
    const { signedIds, market: remaining } = resolveAiDriverMarketBids(
      repoRoot,
      season,
      market,
      99,
      protectedIds,
    );
    assert.equal(signedIds.length, 0);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0]?.id, listingId);
  });

  it("ranks rivals by class for standings display", () => {
    const season = initAiRivalSeason(repoRoot, "SkyTech", 2026);
    const hyper = season.teams.filter((t) => t.primaryClassId === "Hypercar");
    hyper[0]!.championshipPoints = 50;
    hyper[1]!.championshipPoints = 30;
    const top = topRivalsByClass(season, "Hypercar", 2);
    assert.equal(top.length, 2);
    assert.equal(top[0]!.championshipPoints, 50);
  });

  it("scales pit aggression into bounded modifier range", () => {
    const season = initAiRivalSeason(repoRoot, "SkyTech", 2026);
    const hot = season.teams[0]!;
    hot.form = 3;
    hot.engineerSkill = 92;
    const cold = season.teams[1]!;
    cold.form = -3;
    cold.engineerSkill = 72;

    const hotMod = rivalModifiersForTeam(hot.teamName, season);
    const coldMod = rivalModifiersForTeam(cold.teamName, season);
    assert.ok(hotMod.pitAggression > coldMod.pitAggression);
    assert.ok(hotMod.pitAggression <= 1.15);
    assert.ok(coldMod.pitAggression >= 0.85);
  });

  it("awards drivers championship points to full entry rosters", () => {
    const season = initAiRivalSeason(repoRoot, "SkyTech", 2026);
    const raceResults = [
      {
        entryId: "toyota-7",
        teamName: "Toyota Racing",
        carNumber: "7",
        classId: "Hypercar",
        position: 1,
      },
    ];
    resolveDriverChampionshipTick(season, {
      scoring: true,
      playerTeamName: "SkyTech",
      raceResults,
      sessionEntryRosters: sessionRostersForResults(raceResults, {
        playerTeamName: "SkyTech",
      }),
    });

    const buemi = season.drivers.find((d) =>
      d.name.includes("Buemi"),
    );
    assert.ok(buemi);
    assert.equal(buemi!.lastRoundPoints, 25);
    assert.equal(buemi!.championshipPoints, 25);
    assert.equal(
      season.drivers.filter((d) => d.teamName === "Toyota Racing" && d.lastRoundPoints === 25).length,
      3,
    );
    const top = topDriversByClass(season, "Hypercar", 3);
    assert.equal(top.length, 3);
    assert.ok(top.every((d) => d.championshipPoints === 25));
  });

  it("marks player roster drivers in standings and scores them", () => {
    const playerDriver = {
      id: "driver-test-alex",
      name: "Alex Test",
      nationality: "GB",
      tier: "Gold",
      dryPace: 85,
      wetPace: 82,
      consistency: 84,
      overtaking: 80,
      defending: 78,
      trafficManagement: 80,
      rollingStart: 78,
      standingStart: 76,
      setupFeedback: 74,
      tireManagement: 80,
      fuelSaving: 78,
      composure: 82,
      nightPace: 78,
      rainRadar: 76,
      stamina: 80,
      maxStintHours: 3,
    };
    const season = initAiRivalSeason(repoRoot, "SkyTech", 2026);
    const playerFleet = [
      {
        id: "car-1",
        carNumber: "42",
        classId: "Hypercar",
        affiliation: "privateer",
        acquisition: "privateer",
        build: { carName: "SkyTech 42" },
        carConfigPath: "configs/runtime/test.txt",
        assignedDriverIds: ["driver-test-alex"],
      },
    ] as FleetCarPayload[];

    syncPlayerDriversToStandings(season, "SkyTech", [playerDriver], playerFleet);

    const key = playerDriver.id!;
    const row = season.drivers.find((d) => d.driverKey === key);
    assert.ok(row?.isPlayerDriver);

    const raceResults = [
      {
        entryId: "h1",
        teamName: "A",
        carNumber: "1",
        classId: "Hypercar",
        position: 1,
      },
      {
        entryId: "h2",
        teamName: "B",
        carNumber: "2",
        classId: "Hypercar",
        position: 2,
      },
      {
        entryId: "player-1",
        teamName: "SkyTech",
        carNumber: "42",
        classId: "Hypercar",
        position: 5,
      },
    ];
    resolveDriverChampionshipTick(season, {
      scoring: true,
      playerTeamName: "SkyTech",
      raceResults,
      sessionEntryRosters: sessionRostersForResults(raceResults, {
        playerTeamName: "SkyTech",
        playerRoster: [playerDriver],
        playerFleet,
      }),
    });

    assert.equal(row!.championshipPoints, 15);
  });

  it("scores poached drivers only on the car they actually drove", () => {
    const catalog = loadLeMansDriverCatalog(repoRoot);
    const toyotaRoster = catalog.get("Toyota Racing#7");
    assert.ok(toyotaRoster?.length);
    const buemiRaw = toyotaRoster!.find((d) => d.name.includes("Buemi"));
    assert.ok(buemiRaw);
    const buemi = ensureCatalogDriverId(buemiRaw);

    const season = initAiRivalSeason(repoRoot, "SkyTech", 2026);
    const playerFleet = [
      {
        id: "car-1",
        carNumber: "42",
        classId: "Hypercar",
        affiliation: "privateer",
        acquisition: "privateer",
        build: { carName: "SkyTech 42" },
        carConfigPath: "configs/runtime/test.txt",
        assignedDriverIds: [buemi.id!],
      },
    ] as FleetCarPayload[];

    syncPlayerDriversToStandings(season, "SkyTech", [buemi], playerFleet);

    const raceResults = [
      {
        entryId: "toyota-7",
        teamName: "Toyota Racing",
        carNumber: "7",
        classId: "Hypercar",
        position: 1,
      },
      {
        entryId: "player-1",
        teamName: "SkyTech",
        carNumber: "42",
        classId: "Hypercar",
        position: 5,
      },
    ];
    resolveDriverChampionshipTick(season, {
      scoring: true,
      playerTeamName: "SkyTech",
      raceResults,
      sessionEntryRosters: sessionRostersForResults(raceResults, {
        playerTeamName: "SkyTech",
        playerRoster: [buemi],
        playerFleet,
      }),
    });

    const row = season.drivers.find((d) => d.driverKey === buemi.id);
    assert.ok(row);
    assert.equal(row!.lastRoundPoints, 18);
    assert.equal(row!.championshipPoints, 18);
    assert.equal(row!.teamName, "SkyTech");
    assert.ok(
      !season.drivers.some(
        (d) => d.driverKey === buemi.id && d.lastRoundPoints === 25,
      ),
    );
  });

  it("records player team in rival standings after a round", () => {
    const season = initAiRivalSeason(repoRoot, "SkyTech", 2026);
    applyPlayerTeamRoundResult(season, "SkyTech", "LMP2", 18);
    const player = season.teams.find((t) => t.isPlayerTeam);
    assert.ok(player);
    assert.equal(player!.championshipPoints, 18);
    assert.equal(player!.primaryClassId, "LMP2");
  });

  it("writes AI market signings into runtime roster overrides", () => {
    const season = initAiRivalSeason(repoRoot, "SkyTech", 2026);
    for (const team of season.teams) team.budget = 1_000_000;
    const toyota = season.teams.find((t) => t.teamName === "Toyota Racing");
    assert.ok(toyota);
    toyota!.budget = 120_000_000;
    toyota!.form = 3;

    const market: DriverMarketListingPayload[] = [
      {
        id: "wec-toyota-new",
        source: "wec_active",
        contractedTeam: "Toyota Racing",
        driver: {
          name: "Signed Prospect",
          nationality: "FR",
          tier: "Gold",
          dryPace: 85,
          wetPace: 82,
          consistency: 84,
          overtaking: 80,
          defending: 78,
          trafficManagement: 80,
          rollingStart: 78,
          standingStart: 76,
          setupFeedback: 74,
          tireManagement: 80,
          fuelSaving: 78,
          composure: 82,
          nightPace: 78,
          rainRadar: 76,
          stamina: 80,
          maxStintHours: 3,
        },
        signingFee: 100_000,
        salaryPerRace: 30_000,
        tagline: "buyout",
      },
    ];

    const { signedIds } = resolveAiDriverMarketBids(
      repoRoot,
      season,
      market,
      42,
    );
    assert.ok(signedIds.includes("wec-toyota-new"));
    const key = "Toyota Racing#7";
    assert.ok(season.rosterOverrides?.[key]?.some((d) => d.name === "Signed Prospect"));

    const rel = exportRuntimeDrivers(repoRoot, {
      rosterOverrides: season.rosterOverrides,
    });
    const abs = path.join(repoRoot, rel);
    const text = fs.readFileSync(abs, "utf8");
    assert.ok(text.includes("Signed Prospect"));
  });

  it("builds off-week headline and narrative events", () => {
    const season = initAiRivalSeason(repoRoot, "SkyTech", 2026);
    const toyota = season.teams.find((t) =>
      t.teamName.toLowerCase().includes("toyota"),
    );
    assert.ok(toyota);

    resolveAiSeasonTick(season, {
      playerTeamName: "SkyTech",
      scoring: true,
      eventFormat: "6h",
      raceResults: [
        {
          entryId: "e1",
          teamName: toyota!.teamName,
          carNumber: "7",
          classId: "Hypercar",
          position: 1,
        },
      ],
    });

    assert.ok((season.lastOffWeekEvents?.length ?? 0) >= 2);
    assert.ok(season.lastOffWeekEvents?.some((e) => e.type === "points"));
    assert.ok(season.lastOffWeekEvents?.some((e) => e.type === "standings"));

    for (const team of season.teams) team.budget = 1_000_000;
    toyota!.budget = 120_000_000;
    toyota!.form = 3;

    resolveAiDriverMarketBids(
      repoRoot,
      season,
      [
        {
          id: "wec-toyota-new",
          source: "wec_active",
          contractedTeam: "Toyota Racing",
          driver: {
            name: "Narrative Prospect",
            nationality: "FR",
            tier: "Gold",
            dryPace: 85,
            wetPace: 82,
            consistency: 84,
            overtaking: 80,
            defending: 78,
            trafficManagement: 80,
            rollingStart: 78,
            standingStart: 76,
            setupFeedback: 74,
            tireManagement: 80,
            fuelSaving: 78,
            composure: 82,
            nightPace: 78,
            rainRadar: 76,
            stamina: 80,
            maxStintHours: 3,
          },
          signingFee: 100_000,
          salaryPerRace: 30_000,
          tagline: "buyout",
        },
      ],
      42,
    );

    assert.ok(season.lastOffWeekHeadline);
    assert.ok(season.lastOffWeekEvents?.some((e) => e.type === "market"));
    assert.ok(buildOffWeekHeadline(season).length > 0);
  });
});
