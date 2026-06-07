"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DRIVER_STAT_DEFS = exports.DRIVER_POINT_POOL = void 0;
exports.loadLeMansDriverCatalog = loadLeMansDriverCatalog;
exports.generateDriverId = generateDriverId;
exports.stableCatalogDriverId = stableCatalogDriverId;
exports.ensureCatalogDriverId = ensureCatalogDriverId;
exports.buildDriverContractMap = buildDriverContractMap;
exports.driverContractTeam = driverContractTeam;
exports.isDriverOnTeam = isDriverOnTeam;
exports.filterRosterByContract = filterRosterByContract;
exports.ensureDriverIds = ensureDriverIds;
exports.driverStandingKey = driverStandingKey;
exports.sanitizeAssignedDriverIds = sanitizeAssignedDriverIds;
exports.validateExclusiveDriverAssignments = validateExclusiveDriverAssignments;
exports.defaultDriverAssignments = defaultDriverAssignments;
exports.assignUnassignedDriversToCars = assignUnassignedDriversToCars;
exports.migrateDriverAssignments = migrateDriverAssignments;
exports.resolveCarDriverRoster = resolveCarDriverRoster;
exports.sessionEntryKey = sessionEntryKey;
exports.buildSessionEntryRosters = buildSessionEntryRosters;
exports.rostersForCompetingEntries = rostersForCompetingEntries;
exports.exportRuntimeDrivers = exportRuntimeDrivers;
exports.computeDriverPointCost = computeDriverPointCost;
exports.inferTier = inferTier;
exports.validateDriverStats = validateDriverStats;
exports.validateCustomDriver = validateCustomDriver;
exports.generateRandomDriver = generateRandomDriver;
exports.defaultPlayerRoster = defaultPlayerRoster;
const crypto_1 = require("crypto");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
exports.DRIVER_POINT_POOL = 750;
exports.DRIVER_STAT_DEFS = [
    { key: "dryPace", label: "Dry Pace", short: "DRY", description: "Single-lap and race pace on a dry track.", min: 55, max: 98, costPerPoint: 2 },
    { key: "wetPace", label: "Wet Pace", short: "WET", description: "Speed and confidence when the track is damp or fully wet.", min: 50, max: 96, costPerPoint: 2 },
    { key: "consistency", label: "Consistency", short: "CON", description: "Lap-to-lap repeatability; fewer unforced errors.", min: 50, max: 98, costPerPoint: 2 },
    { key: "overtaking", label: "Overtaking", short: "OVT", description: "Ability to pass multiclass traffic and rivals cleanly.", min: 50, max: 96, costPerPoint: 1.5 },
    { key: "defending", label: "Defending", short: "DEF", description: "Holding position under attack without cracking.", min: 50, max: 96, costPerPoint: 1.5 },
    { key: "trafficManagement", label: "Traffic", short: "TRF", description: "Finding gaps and managing blue-flag situations.", min: 50, max: 94, costPerPoint: 1 },
    { key: "rollingStart", label: "Rolling Start", short: "RLS", description: "Safety-car restarts and rolling formation pace.", min: 50, max: 94, costPerPoint: 1 },
    { key: "standingStart", label: "Standing Start", short: "STD", description: "Launch off the line at the 24h start and pit-exit restarts.", min: 50, max: 94, costPerPoint: 1 },
    { key: "setupFeedback", label: "Setup Feedback", short: "SET", description: "Quality of engineering notes after setup changes.", min: 45, max: 92, costPerPoint: 1 },
    { key: "tireManagement", label: "Tire Management", short: "TIR", description: "Wear control and stint length on one set.", min: 50, max: 96, costPerPoint: 1.5 },
    { key: "fuelSaving", label: "Fuel Saving", short: "FUL", description: "Economy driving without losing too much lap time.", min: 50, max: 92, costPerPoint: 1 },
    { key: "composure", label: "Composure", short: "CMP", description: "Resistance to pressure, mistakes when being hunted.", min: 50, max: 98, costPerPoint: 2 },
    { key: "nightPace", label: "Night Pace", short: "NGT", description: "Performance through the dark hours at La Sarthe.", min: 50, max: 94, costPerPoint: 1 },
    { key: "rainRadar", label: "Rain Radar", short: "RNM", description: "Anticipating weather and adapting before rivals.", min: 45, max: 90, costPerPoint: 1 },
    { key: "stamina", label: "Stamina", short: "STM", description: "Fatigue resistance deep into a stint.", min: 50, max: 96, costPerPoint: 1.5 },
];
const BASELINE = {
    dryPace: 68, wetPace: 64, consistency: 68, overtaking: 66, defending: 66,
    trafficManagement: 66, rollingStart: 64, standingStart: 64, setupFeedback: 60,
    tireManagement: 66, fuelSaving: 64, composure: 68, nightPace: 64, rainRadar: 60, stamina: 68,
};
const FIRST_NAMES = ["Alex", "Marco", "Elena", "Luca", "Sofia", "Kai", "Nina", "Oliver", "Yuki", "Ines", "Ravi", "Clara", "Finn", "Marta", "Noah"];
const LAST_NAMES = ["Voss", "Reeves", "Okonkwo", "Bianchi", "Kowalski", "Santos", "Chen", "Müller", "Dupont", "Alvarez", "Nakamura", "Petrov", "Garcia", "Webb", "Tanaka"];
const NATIONS = ["GB", "FR", "DE", "IT", "US", "BR", "JP", "ES", "NL", "AU", "CH", "SE", "DK", "PT", "PL"];
function trim(s) {
    return s.trim();
}
function parseDriverLine(value) {
    const parts = value.split("|").map(trim);
    if (parts.length < 18)
        return null;
    const nums = parts.slice(3).map((p) => Number(p));
    if (nums.some((n) => Number.isNaN(n)))
        return null;
    return {
        name: parts[0],
        nationality: parts[1],
        tier: parts[2],
        dryPace: nums[0],
        wetPace: nums[1],
        consistency: nums[2],
        overtaking: nums[3],
        defending: nums[4],
        trafficManagement: nums[5],
        rollingStart: nums[6],
        standingStart: nums[7],
        setupFeedback: nums[8],
        tireManagement: nums[9],
        fuelSaving: nums[10],
        composure: nums[11],
        nightPace: nums[12],
        rainRadar: nums[13],
        stamina: nums[14],
        maxStintHours: nums[15] ?? 2.5,
    };
}
function loadLeMansDriverCatalog(repoRoot) {
    const file = path.join(repoRoot, "configs/drivers/lemans2026_drivers.txt");
    const map = new Map();
    if (!fs.existsSync(file))
        return map;
    let key = "";
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        const trimmed = trim(line);
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const eq = trimmed.indexOf("=");
        if (eq < 0)
            continue;
        const k = trim(trimmed.slice(0, eq));
        const v = trim(trimmed.slice(eq + 1));
        if (k === "entry") {
            const [team, num] = v.split(",").map(trim);
            key = `${team}#${num}`;
            map.set(key, []);
        }
        else if (k === "driver" && key) {
            const d = parseDriverLine(v);
            if (d)
                map.get(key).push(ensureCatalogDriverId(d));
        }
    }
    return map;
}
function driverToLine(d) {
    return `driver=${[
        d.name, d.nationality, d.tier,
        d.dryPace, d.wetPace, d.consistency, d.overtaking, d.defending,
        d.trafficManagement, d.rollingStart, d.standingStart, d.setupFeedback,
        d.tireManagement, d.fuelSaving, d.composure, d.nightPace, d.rainRadar,
        d.stamina, d.maxStintHours,
    ].join("|")}`;
}
function generateDriverId() {
    return (0, crypto_1.randomUUID)();
}
function slugDriverPart(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}
/** Deterministic id for real-world / catalog drivers (WEC grid, legends). */
function stableCatalogDriverId(name, nationality) {
    return `catalog-${slugDriverPart(name)}-${nationality.trim().toUpperCase()}`;
}
/** Assign a stable catalog id, or keep an existing roster id (custom drivers). */
function ensureCatalogDriverId(driver) {
    const existing = driver.id?.trim();
    if (existing)
        return { ...driver, id: existing };
    return {
        ...driver,
        id: stableCatalogDriverId(driver.name, driver.nationality),
    };
}
/** Resolve which team holds each driver id (player roster wins over overrides over catalog). */
function buildDriverContractMap(repoRoot, ctx) {
    const contracts = new Map();
    const playerKey = ctx.playerTeamName.trim().toLowerCase();
    const catalog = loadLeMansDriverCatalog(repoRoot);
    for (const [key, roster] of catalog) {
        const team = key.slice(0, key.lastIndexOf("#"));
        if (team.toLowerCase() === playerKey)
            continue;
        for (const d of roster) {
            const id = ensureCatalogDriverId(d).id;
            if (!contracts.has(id))
                contracts.set(id, team);
        }
    }
    for (const [key, roster] of Object.entries(ctx.rosterOverrides ?? {})) {
        const team = key.slice(0, key.lastIndexOf("#"));
        for (const d of roster) {
            contracts.set(ensureCatalogDriverId(d).id, team);
        }
    }
    for (const d of ctx.playerRoster ?? []) {
        const id = d.id?.trim();
        if (id)
            contracts.set(id, ctx.playerTeamName);
    }
    return contracts;
}
function driverContractTeam(driverId, contracts) {
    return contracts.get(driverId.trim());
}
function isDriverOnTeam(driverId, teamName, contracts) {
    const holder = driverContractTeam(driverId, contracts);
    return holder?.toLowerCase() === teamName.trim().toLowerCase();
}
/** Filter a team entry roster to drivers contracted to that team. */
function filterRosterByContract(roster, teamName, contracts) {
    return roster.filter((d) => {
        const id = ensureCatalogDriverId(d).id;
        const holder = contracts.get(id);
        return !holder || holder.toLowerCase() === teamName.trim().toLowerCase();
    });
}
function ensureDriverIds(roster) {
    return roster.map((d) => ({
        ...d,
        id: d.id?.trim() || generateDriverId(),
    }));
}
/** Championship / dedup key — prefers stable roster id over name+nat. */
function driverStandingKey(profile) {
    const id = profile.id?.trim();
    if (id)
        return id;
    return `${profile.name.trim().toLowerCase()}|${profile.nationality.trim().toUpperCase()}`;
}
const rosterIdSet = (roster) => new Set(roster
    .map((d) => d.id?.trim())
    .filter((id) => Boolean(id)));
function sanitizeAssignedDriverIds(driverIds, roster) {
    if (!driverIds?.length)
        return [];
    const valid = rosterIdSet(roster);
    const seen = new Set();
    const out = [];
    for (const id of driverIds) {
        const trimmed = id.trim();
        if (!trimmed || !valid.has(trimmed) || seen.has(trimmed))
            continue;
        seen.add(trimmed);
        out.push(trimmed);
    }
    return out;
}
/** Each driver id may appear on at most one car; each car needs ≥1 when fleet non-empty. */
function validateExclusiveDriverAssignments(fleet, roster) {
    if (!fleet.length)
        return null;
    const valid = rosterIdSet(roster);
    const claimed = new Map();
    for (const car of fleet) {
        const ids = sanitizeAssignedDriverIds(car.assignedDriverIds, roster);
        if (ids.length < 1) {
            return `Car #${car.carNumber} must have at least one assigned driver`;
        }
        for (const driverId of ids) {
            if (!valid.has(driverId)) {
                return `Car #${car.carNumber} references an unknown driver`;
            }
            const otherCar = claimed.get(driverId);
            if (otherCar && otherCar !== car.id) {
                const driver = roster.find((d) => d.id === driverId);
                return `${driver?.name ?? "A driver"} cannot be assigned to more than one car`;
            }
            claimed.set(driverId, car.id);
        }
    }
    return null;
}
/** Default exclusive assignments: single car gets full pool; multi-car uses round-robin. */
function defaultDriverAssignments(roster, fleet) {
    const withIds = ensureDriverIds(roster);
    const driverIds = withIds.map((d) => d.id);
    const out = {};
    if (!fleet.length || !driverIds.length)
        return out;
    if (fleet.length === 1) {
        out[fleet[0].id] = [...driverIds];
        return out;
    }
    for (const car of fleet)
        out[car.id] = [];
    let carIdx = 0;
    for (const driverId of driverIds) {
        out[fleet[carIdx].id].push(driverId);
        carIdx = (carIdx + 1) % fleet.length;
    }
    return out;
}
/** Assign roster drivers not yet on any car to new fleet entries (round-robin). */
function assignUnassignedDriversToCars(roster, fleet, targetCarIds) {
    const withIds = ensureDriverIds(roster);
    const claimed = new Set();
    for (const car of fleet) {
        for (const id of car.assignedDriverIds ?? [])
            claimed.add(id);
    }
    const unassigned = withIds.map((d) => d.id).filter((id) => !claimed.has(id));
    const updates = {};
    let carIdx = 0;
    for (const driverId of unassigned) {
        const carId = targetCarIds[carIdx % targetCarIds.length];
        updates[carId] = [...(updates[carId] ?? []), driverId];
        carIdx += 1;
    }
    return updates;
}
/** Migrate index-based assignments and assign stable driver ids. */
function migrateDriverAssignments(roster, fleet) {
    const withIds = ensureDriverIds(roster);
    const idByIndex = withIds.map((d) => d.id);
    let migratedFleet = fleet.map((car) => {
        const legacy = car;
        let assignedDriverIds = sanitizeAssignedDriverIds(car.assignedDriverIds, withIds);
        if (!assignedDriverIds.length && legacy.assignedDriverIndices?.length) {
            assignedDriverIds = sanitizeAssignedDriverIds(legacy.assignedDriverIndices
                .filter((i) => i >= 0 && i < idByIndex.length)
                .map((i) => idByIndex[i]), withIds);
        }
        const { assignedDriverIndices: _legacy, ...rest } = legacy;
        return { ...rest, assignedDriverIds };
    });
    const overlap = () => {
        const seen = new Set();
        for (const car of migratedFleet) {
            for (const id of car.assignedDriverIds ?? []) {
                if (seen.has(id))
                    return true;
                seen.add(id);
            }
        }
        return false;
    };
    if (overlap() || migratedFleet.some((c) => !(c.assignedDriverIds?.length))) {
        const defaults = defaultDriverAssignments(withIds, migratedFleet);
        migratedFleet = migratedFleet.map((car) => ({
            ...car,
            assignedDriverIds: defaults[car.id] ?? [],
        }));
    }
    return { roster: withIds, fleet: migratedFleet };
}
/** Resolve the driver line-up for a fleet car from team roster + per-car assignments. */
function resolveCarDriverRoster(teamRoster, assignedDriverIds) {
    if (assignedDriverIds !== undefined) {
        const byId = new Map(ensureDriverIds(teamRoster)
            .filter((d) => d.id)
            .map((d) => [d.id, d]));
        return sanitizeAssignedDriverIds(assignedDriverIds, teamRoster).flatMap((id) => {
            const driver = byId.get(id);
            return driver ? [{ ...driver }] : [];
        });
    }
    return teamRoster.map((d) => ({ ...d }));
}
function sessionEntryKey(teamName, carNumber) {
    return `${teamName}#${carNumber}`;
}
/** Build full entry→roster map (catalog + contracts + player fleet). */
function buildSessionEntryRosters(repoRoot, options) {
    const lemans = loadLeMansDriverCatalog(repoRoot);
    const overrides = options.rosterOverrides ?? {};
    const contracts = buildDriverContractMap(repoRoot, {
        playerTeamName: options.playerTeamName ?? "",
        playerRoster: options.playerRoster ??
            options.playerEntries?.flatMap((e) => e.roster) ??
            [],
        rosterOverrides: overrides,
    });
    const rosters = {};
    for (const [key, roster] of lemans) {
        const comma = key.lastIndexOf("#");
        const team = key.slice(0, comma);
        const merged = overrides[key]?.length
            ? overrides[key].map((d) => ({ ...d }))
            : roster.map((d) => ({ ...d }));
        const filtered = filterRosterByContract(merged, team, contracts);
        if (filtered.length) {
            rosters[key] = filtered.map((d) => ({ ...d }));
        }
    }
    for (const entry of options.playerEntries ?? []) {
        if (!entry.roster.length)
            continue;
        rosters[sessionEntryKey(entry.teamName, entry.carNumber)] = entry.roster.map((d) => ({ ...d }));
    }
    return rosters;
}
/** Keep only rosters for entries that actually started the session. */
function rostersForCompetingEntries(entries, allRosters) {
    const out = {};
    for (const entry of entries) {
        const key = sessionEntryKey(entry.teamName, entry.carNumber);
        const roster = allRosters[key];
        if (roster?.length)
            out[key] = roster.map((d) => ({ ...d }));
    }
    return out;
}
function exportRuntimeDrivers(repoRoot, options, prebuiltRosters) {
    const rel = "configs/runtime/drivers.txt";
    const abs = path.join(repoRoot, rel);
    const rosters = prebuiltRosters ?? buildSessionEntryRosters(repoRoot, options);
    const lines = [
        "# Runtime driver roster — generated by server",
        "# Merges 2026 Le Mans entry list with player custom drivers",
        "",
    ];
    for (const key of Object.keys(rosters).sort()) {
        const roster = rosters[key];
        const comma = key.lastIndexOf("#");
        lines.push(`entry=${key.slice(0, comma)},${key.slice(comma + 1)}`);
        for (const d of roster)
            lines.push(driverToLine(d));
        lines.push("");
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, lines.join("\n"));
    return rel;
}
function computeDriverPointCost(driver) {
    let cost = 0;
    for (const def of exports.DRIVER_STAT_DEFS) {
        const value = driver[def.key];
        const base = BASELINE[def.key] ?? 66;
        const delta = Math.max(0, value - base);
        cost += delta * def.costPerPoint;
    }
    const tierBonus = driver.tier === "Platinum" ? 80 : driver.tier === "Gold" ? 40 : 0;
    return Math.round(cost + tierBonus);
}
function inferTier(driver) {
    const avg = (driver.dryPace + driver.wetPace + driver.consistency) / 3;
    if (avg >= 90)
        return "Platinum";
    if (avg >= 82)
        return "Gold";
    if (avg >= 74)
        return "Silver";
    return "Bronze";
}
function validateDriverStats(driver) {
    if (!driver.name.trim())
        return "Driver name required";
    for (const def of exports.DRIVER_STAT_DEFS) {
        const v = driver[def.key];
        if (v < def.min || v > def.max)
            return `${def.label} must be ${def.min}–${def.max}`;
    }
    return null;
}
function validateCustomDriver(driver) {
    const err = validateDriverStats(driver);
    if (err)
        return err;
    const cost = computeDriverPointCost(driver);
    if (cost > exports.DRIVER_POINT_POOL)
        return `Exceeds point pool (${cost}/${exports.DRIVER_POINT_POOL})`;
    return null;
}
function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xffffffff;
    };
}
function generateRandomDriver(seed = Date.now()) {
    const rnd = seeded(seed);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const jitter = (base, spread) => Math.round(Math.min(96, Math.max(55, base + (rnd() - 0.5) * spread)));
    const driver = {
        id: generateDriverId(),
        name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        nationality: pick(NATIONS),
        tier: "Silver",
        dryPace: jitter(76, 18),
        wetPace: jitter(72, 16),
        consistency: jitter(74, 16),
        overtaking: jitter(72, 14),
        defending: jitter(70, 14),
        trafficManagement: jitter(72, 12),
        rollingStart: jitter(70, 12),
        standingStart: jitter(70, 12),
        setupFeedback: jitter(66, 14),
        tireManagement: jitter(72, 12),
        fuelSaving: jitter(68, 12),
        composure: jitter(72, 16),
        nightPace: jitter(70, 12),
        rainRadar: jitter(66, 12),
        stamina: jitter(74, 14),
        maxStintHours: rnd() > 0.7 ? 3.0 : 2.5,
    };
    driver.tier = inferTier(driver);
    return driver;
}
function defaultPlayerRoster(teamName) {
    return [
        {
            id: generateDriverId(),
            name: `${teamName} Ace`,
            nationality: "GB",
            tier: "Gold",
            dryPace: 84, wetPace: 78, consistency: 82, overtaking: 80, defending: 78,
            trafficManagement: 80, rollingStart: 78, standingStart: 76, setupFeedback: 74,
            tireManagement: 80, fuelSaving: 76, composure: 82, nightPace: 78, rainRadar: 72,
            stamina: 80, maxStintHours: 3.0,
        },
        {
            id: generateDriverId(),
            name: `${teamName} Endurance`,
            nationality: "FR",
            tier: "Silver",
            dryPace: 78, wetPace: 74, consistency: 80, overtaking: 72, defending: 76,
            trafficManagement: 78, rollingStart: 74, standingStart: 72, setupFeedback: 70,
            tireManagement: 82, fuelSaving: 80, composure: 78, nightPace: 76, rainRadar: 70,
            stamina: 84, maxStintHours: 3.5,
        },
    ];
}
