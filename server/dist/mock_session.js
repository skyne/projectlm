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
exports.MockSimSession = void 0;
/**
 * Dev fallback when @projectlm/native is not built.
 * Replace with N-API addon: cd bindings/node && npm run build
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function weatherProfileForId(profileId) {
    if (profileId === "hot_dry") {
        return {
            baseTempC: 32,
            tempDriftPerHour: -2,
            baseWetness: 0,
            rainChancePerHour: 0.02,
            maxRainIntensity: 0.85,
            wetRatePerSecond: 0.0015,
            dryRatePerSecond: 0.00008,
        };
    }
    if (profileId === "overcast") {
        return {
            baseTempC: 18,
            tempDriftPerHour: -0.5,
            baseWetness: 0.08,
            rainChancePerHour: 0.25,
            maxRainIntensity: 0.55,
            wetRatePerSecond: 0.0015,
            dryRatePerSecond: 0.00008,
        };
    }
    if (profileId === "changeable") {
        return {
            baseTempC: 21,
            tempDriftPerHour: -1.2,
            baseWetness: 0.05,
            rainChancePerHour: 0.45,
            maxRainIntensity: 0.75,
            wetRatePerSecond: 0.0025,
            dryRatePerSecond: 0.00008,
        };
    }
    if (profileId === "wet") {
        return {
            baseTempC: 16,
            tempDriftPerHour: 0,
            baseWetness: 0.55,
            rainChancePerHour: 0.8,
            maxRainIntensity: 0.95,
            wetRatePerSecond: 0.004,
            dryRatePerSecond: 0.00002,
        };
    }
    return {
        baseTempC: 24,
        tempDriftPerHour: -1,
        baseWetness: 0,
        rainChancePerHour: 0.05,
        maxRainIntensity: 0.85,
        wetRatePerSecond: 0.0015,
        dryRatePerSecond: 0.00008,
    };
}
function initWeatherPhase(trackWetness) {
    if (trackWetness >= 0.55)
        return "HeavyRain";
    if (trackWetness >= 0.25)
        return "LightRain";
    if (trackWetness >= 0.08)
        return "Cloudy";
    return "Dry";
}
function sectorAtDistance(sectors, distance, lapLength) {
    if (sectors.length === 0)
        return 0;
    const t = (((distance % lapLength) + lapLength) % lapLength) / lapLength;
    for (let i = 0; i < sectors.length; i++) {
        const sector = sectors[i];
        if (t >= sector.start_t && t < sector.end_t)
            return i;
    }
    return sectors.length - 1;
}
function makeCarState(entry, gridIndex) {
    const tank = TANK_LITERS[entry.classId] ?? 100;
    return {
        ...entry,
        distance: gridIndex * 120,
        lap: 1,
        speed: CLASS_SPEED[entry.classId] ?? 85,
        fuel: tank,
        fuelTankCapacity: tank,
        tireWear: 0,
        engineHealth: 100,
        coolantTempC: 72,
        sectorIndex: 0,
        retired: false,
        inPit: false,
        pitQueued: false,
        pitCount: 0,
        driverStintSeconds: 0,
        maxDriverStintSeconds: MAX_STINT_SECONDS[entry.classId] ?? 2700,
        driverModeScale: 1,
        pitServiceRemaining: 0,
        pitFuelLiters: 0,
        pitChangeTires: false,
        pitRepairEngine: false,
        pitDriverSwap: false,
        currentLapTime: 0,
        currentSectorTime: 0,
        lastLapTime: 0,
        bestLapTime: 0,
        currentLapSectorTimes: [],
        lapHistory: [],
        tireCompound: "medium",
        wetTyres: false,
    };
}
function computeGapToLeader(car, leader, lapLength) {
    const lapDiff = leader.lap - car.lap;
    let distanceGap = leader.distance - car.distance;
    distanceGap += lapDiff * lapLength;
    const refSpeed = Math.max(leader.speed, 1);
    return Math.max(0, distanceGap / refSpeed);
}
const CLASS_SPEED = {
    Hypercar: 92,
    LMGT3: 78,
    LMP2: 85,
    solo: 88,
};
const TANK_LITERS = {
    Hypercar: 90,
    LMP2: 75,
    LMGT3: 120,
    solo: 100,
};
const MAX_STINT_SECONDS = {
    Hypercar: 2700,
    LMP2: 3000,
    LMGT3: 2100,
    solo: 2700,
};
const FUEL_BURN_PER_SEC = {
    Hypercar: 0.09,
    LMP2: 0.075,
    LMGT3: 0.055,
    solo: 0.07,
};
function isPitCommand(command) {
    const lower = command.toLowerCase();
    return lower === "pit" || lower.startsWith("pit|");
}
function parsePitCommand(command) {
    const result = {
        fuelLiters: 0,
        changeTires: false,
        tireCompound: "",
        repairEngine: false,
        driverSwap: false,
    };
    for (const token of command.split("|")) {
        const part = token.trim().toLowerCase();
        if (!part || part === "pit")
            continue;
        const eq = part.indexOf("=");
        if (eq === -1)
            continue;
        const key = part.slice(0, eq);
        const value = part.slice(eq + 1);
        if (key === "fuel")
            result.fuelLiters = Math.max(0, Number(value) || 0);
        else if (key === "tires" && value)
            result.changeTires = true;
        else if (key === "compound" && value) {
            result.changeTires = true;
            result.tireCompound = value;
        }
        else if (key === "repairs" && value.includes("engine"))
            result.repairEngine = true;
        else if (key === "driver" && value)
            result.driverSwap = true;
    }
    return result;
}
function serviceDuration(request) {
    let duration = 2;
    if (request.fuelLiters > 0)
        duration += Math.min(8, request.fuelLiters * 0.04);
    if (request.changeTires)
        duration += 4;
    if (request.repairEngine)
        duration += 6;
    if (request.driverSwap)
        duration += 3;
    return duration;
}
function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return (0.5 *
        (2 * p1 +
            (-p0 + p2) * t +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
            (-p0 + 3 * p1 - 3 * p2 + p3) * t3));
}
function loadTrack(repoRoot, trackPath) {
    const abs = path.join(repoRoot, trackPath);
    const track = JSON.parse(fs.readFileSync(abs, "utf8"));
    const points = track.display_polyline ?? track.control_points;
    const useLinear = track.interpolation === "linear" || track.display_polyline !== undefined;
    const closed = track.closed !== false;
    const segmentCount = closed ? points.length : points.length - 1;
    const rawSamples = [];
    if (useLinear) {
        for (let i = 0; i < segmentCount; i++) {
            const p1 = points[i % points.length];
            const p2 = points[(i + 1) % points.length];
            rawSamples.push({ x: p1.x, z: p1.z });
            const steps = 4;
            for (let s = 1; s < steps; s++) {
                const t = s / steps;
                rawSamples.push({
                    x: p1.x + t * (p2.x - p1.x),
                    z: p1.z + t * (p2.z - p1.z),
                });
            }
        }
    }
    else {
        for (let i = 0; i < segmentCount; i++) {
            const p0 = points[(i - 1 + points.length) % points.length];
            const p1 = points[i % points.length];
            const p2 = points[(i + 1) % points.length];
            const p3 = points[(i + 2) % points.length];
            for (let s = 0; s < 8; s++) {
                const t = s / 8;
                rawSamples.push({
                    x: catmull(p0.x, p1.x, p2.x, p3.x, t),
                    z: catmull(p0.z, p1.z, p2.z, p3.z, t),
                });
            }
        }
    }
    let total = 0;
    const cumulative = [0];
    for (let i = 1; i < rawSamples.length; i++) {
        total += Math.hypot(rawSamples[i].x - rawSamples[i - 1].x, rawSamples[i].z - rawSamples[i - 1].z);
        cumulative.push(total);
    }
    const lapLength = track.lap_length ?? total;
    const scale = total > 0 ? lapLength / total : 1;
    const samples = rawSamples.map((pt, i) => {
        const dist = cumulative[i] * scale;
        const prev = rawSamples[(i - 1 + rawSamples.length) % rawSamples.length];
        const next = rawSamples[(i + 1) % rawSamples.length];
        const tx = next.x - prev.x;
        const tz = next.z - prev.z;
        const len = Math.hypot(tx, tz) || 1;
        return {
            distance: dist,
            normalizedT: lapLength > 0 ? dist / lapLength : 0,
            x: pt.x,
            z: pt.z,
            tangentX: tx / len,
            tangentZ: tz / len,
        };
    });
    return { track, samples, lapLength };
}
function parseRaceConfig(repoRoot, configPath) {
    const abs = path.isAbsolute(configPath) ? configPath : path.join(repoRoot, configPath);
    const config = {
        trackConfigPath: "tracks/sample_circuit.json",
        targetLaps: 1,
        targetDurationMinutes: 0,
        simTimestep: 0.1,
        entriesPath: "",
        weatherProfile: "dry",
        trackWetness: 0,
        ambientTempC: 22,
        rngSeed: 20260306,
    };
    for (const line of fs.readFileSync(abs, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1)
            continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (key === "track_config")
            config.trackConfigPath = val;
        else if (key === "target_laps")
            config.targetLaps = parseInt(val, 10);
        else if (key === "target_duration_minutes")
            config.targetDurationMinutes = parseFloat(val);
        else if (key === "track_wetness")
            config.trackWetness = parseFloat(val);
        else if (key === "weather_profile")
            config.weatherProfile = val;
        else if (key === "ambient_temp_c")
            config.ambientTempC = parseFloat(val);
        else if (key === "rng_seed")
            config.rngSeed = parseInt(val, 10);
        else if (key === "sim_timestep")
            config.simTimestep = parseFloat(val);
        else if (key === "entries")
            config.entriesPath = val;
    }
    return config;
}
function parseEntries(repoRoot, entriesPath) {
    const rows = [];
    for (const line of fs.readFileSync(path.join(repoRoot, entriesPath), "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.startsWith("entry="))
            continue;
        const parts = trimmed.slice(6).split(",");
        if (parts.length < 4)
            continue;
        const grid = parseInt(parts[3].trim(), 10);
        if (!Number.isFinite(grid) || grid <= 0)
            continue;
        const carNumber = parts.length >= 5 ? parseInt(parts[4].trim(), 10) : grid;
        rows.push({
            entryId: `entry-${grid}`,
            teamName: parts[0].trim(),
            carNumber: Number.isFinite(carNumber) && carNumber > 0 ? carNumber : grid,
            classId: parts[2].trim(),
        });
    }
    return rows;
}
class MockSimSession {
    constructor(repoRoot) {
        this.configPath = "";
        this.raceConfig = null;
        this.trackJson = null;
        this.samples = [];
        this.lapLength = 1;
        this.cars = [];
        this.raceTime = 0;
        this.pendingEvents = [];
        this.raceComplete = false;
        this.pendingCommands = [];
        this.replayLog = [];
        this.trackWetness = 0;
        this.ambientTempC = 22;
        this.rainIntensity = 0;
        this.trackGripEvolution = 1;
        this.weatherPhase = "Dry";
        this.forecastRainInSeconds = -1;
        this.weatherProfile = weatherProfileForId("dry");
        this.weatherProfileId = "dry";
        this.rngState = 20260306;
        this.rngSeed = 20260306;
        this.repoRoot = repoRoot;
    }
    initFromRaceConfig(configPath) {
        try {
            this.configPath = configPath;
            this.raceConfig = parseRaceConfig(this.repoRoot, configPath);
            this.trackWetness = this.raceConfig.trackWetness;
            this.ambientTempC = this.raceConfig.ambientTempC;
            this.weatherProfileId = this.raceConfig.weatherProfile;
            this.weatherProfile = weatherProfileForId(this.weatherProfileId);
            this.rainIntensity = this.trackWetness * this.weatherProfile.maxRainIntensity;
            this.trackGripEvolution = 1;
            this.weatherPhase = initWeatherPhase(this.trackWetness);
            this.forecastRainInSeconds = -1;
            this.rngSeed = this.raceConfig.rngSeed;
            this.rngState = this.rngSeed;
            this.replayLog = [];
            const loaded = loadTrack(this.repoRoot, this.raceConfig.trackConfigPath);
            this.trackJson = loaded.track;
            this.samples = loaded.samples;
            this.lapLength = loaded.lapLength;
            const entries = this.raceConfig.entriesPath
                ? parseEntries(this.repoRoot, this.raceConfig.entriesPath)
                : [{ entryId: "solo-1", teamName: "Solo Entry", carNumber: 1, classId: "solo" }];
            this.cars = entries.map((e, i) => makeCarState(e, i));
            for (const car of this.cars) {
                car.sectorIndex = sectorAtDistance(this.trackJson.sectors, car.distance, this.lapLength);
            }
            this.raceTime = 0;
            this.pendingEvents = [];
            this.raceComplete = false;
            return true;
        }
        catch {
            return false;
        }
    }
    submitCommand(entryId, command) {
        this.pendingCommands.push({ entryId, command });
        this.replayLog.push({ timestamp: this.raceTime, entryId, command });
        return true;
    }
    processCommands() {
        for (const { entryId, command } of this.pendingCommands) {
            const car = this.cars.find((c) => c.entryId === entryId);
            if (!car || car.retired || car.inPit)
                continue;
            if (command.toLowerCase().startsWith("driver_mode=")) {
                const mode = command.slice(command.indexOf("=") + 1).toLowerCase();
                if (mode === "conserve")
                    car.driverModeScale = 0.82;
                else if (mode === "push")
                    car.driverModeScale = 1.05;
                else
                    car.driverModeScale = 1;
                continue;
            }
            if (!isPitCommand(command))
                continue;
            const request = parsePitCommand(command);
            car.pitQueued = true;
            car.inPit = true;
            car.speed = 0;
            car.pitFuelLiters =
                request.fuelLiters > 0
                    ? request.fuelLiters
                    : Math.max(0, car.fuelTankCapacity - car.fuel);
            car.pitChangeTires = request.changeTires;
            car.pitRepairEngine = request.repairEngine;
            car.pitDriverSwap = request.driverSwap;
            if (request.tireCompound) {
                car.tireCompound = request.tireCompound;
                car.wetTyres = request.tireCompound === "wet";
            }
            car.pitServiceRemaining = serviceDuration({
                ...request,
                fuelLiters: car.pitFuelLiters,
            });
            this.pendingEvents.push({
                type: "PitEnter",
                entryId: car.entryId,
                lap: car.lap,
                timestamp: this.raceTime,
                message: `${car.teamName} entered pit lane`,
            });
        }
        this.pendingCommands = [];
    }
    nextRandom() {
        this.rngState = (this.rngState + 0x6d2b79f5) | 0;
        let t = Math.imul(this.rngState ^ (this.rngState >>> 15), 1 | this.rngState);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    tickWeather(deltaTime) {
        const profile = this.weatherProfile;
        this.ambientTempC += (profile.tempDriftPerHour / 3600) * deltaTime;
        const rainRollChance = (profile.rainChancePerHour / 3600) * deltaTime;
        const roll = () => this.nextRandom();
        if (this.weatherPhase === "Dry" || this.weatherPhase === "Cloudy") {
            if (roll() < rainRollChance) {
                this.weatherPhase = "LightRain";
                this.forecastRainInSeconds = 0;
            }
            else if (this.trackWetness < 0.05 && roll() < rainRollChance * 0.5) {
                this.forecastRainInSeconds =
                    this.forecastRainInSeconds < 0
                        ? 120 + roll() * 900
                        : this.forecastRainInSeconds - deltaTime;
            }
        }
        if (this.forecastRainInSeconds > 0) {
            this.forecastRainInSeconds -= deltaTime;
        }
        if (this.weatherPhase === "LightRain" || this.weatherPhase === "HeavyRain") {
            this.rainIntensity = Math.min(profile.maxRainIntensity, this.rainIntensity + profile.wetRatePerSecond * deltaTime * 4);
            this.trackWetness = Math.min(1, this.trackWetness +
                profile.wetRatePerSecond * deltaTime * (1 + this.rainIntensity));
            if (this.trackWetness >= 0.55)
                this.weatherPhase = "HeavyRain";
        }
        else if (this.weatherPhase === "Drying" ||
            (this.trackWetness > profile.baseWetness + 0.02 && this.rainIntensity < 0.08)) {
            this.weatherPhase = "Drying";
            this.rainIntensity = Math.max(0, this.rainIntensity - profile.dryRatePerSecond * deltaTime * 3);
            this.trackWetness = Math.max(profile.baseWetness, this.trackWetness -
                profile.dryRatePerSecond * deltaTime * (1.2 + this.raceTime / 7200));
            if (this.trackWetness <= profile.baseWetness + 0.03 &&
                this.rainIntensity <= 0.05) {
                this.weatherPhase = this.trackWetness > 0.08 ? "Cloudy" : "Dry";
            }
        }
        else if (this.trackWetness > profile.baseWetness) {
            this.trackWetness = Math.max(profile.baseWetness, this.trackWetness - profile.dryRatePerSecond * deltaTime);
        }
        this.trackGripEvolution = 1 + Math.min(0.06, (this.raceTime / 7200) * 0.06);
        if (this.trackWetness >= 0.55)
            this.weatherPhase = "HeavyRain";
        else if (this.trackWetness >= 0.25)
            this.weatherPhase = "LightRain";
        else if (this.trackWetness >= 0.08 && this.weatherPhase !== "Drying") {
            this.weatherPhase = "Cloudy";
        }
        else if (this.trackWetness < 0.08 && this.weatherPhase !== "Drying") {
            this.weatherPhase = "Dry";
        }
    }
    processPitServices(deltaTime) {
        for (const car of this.cars) {
            if (!car.inPit || car.retired)
                continue;
            car.pitServiceRemaining = Math.max(0, car.pitServiceRemaining - deltaTime);
            if (car.pitServiceRemaining > 0)
                continue;
            if (car.pitFuelLiters > 0) {
                car.fuel = Math.min(car.fuelTankCapacity, car.fuel + car.pitFuelLiters);
            }
            if (car.pitChangeTires)
                car.tireWear = 0.05;
            if (car.pitRepairEngine)
                car.engineHealth = Math.min(100, car.engineHealth + 18);
            if (car.pitDriverSwap || car.pitChangeTires || car.pitFuelLiters > 0) {
                car.driverStintSeconds = 0;
            }
            car.inPit = false;
            car.pitQueued = false;
            car.pitCount += 1;
            car.driverModeScale = 1;
            car.pitFuelLiters = 0;
            car.pitChangeTires = false;
            car.pitRepairEngine = false;
            car.pitDriverSwap = false;
            car.speed = CLASS_SPEED[car.classId] ?? 85;
            this.pendingEvents.push({
                type: "PitExit",
                entryId: car.entryId,
                lap: car.lap,
                timestamp: this.raceTime,
                message: `${car.teamName} exited pit lane`,
            });
        }
    }
    tick(deltaTime) {
        if (this.raceComplete || !this.raceConfig || !this.trackJson)
            return;
        this.processCommands();
        this.raceTime += deltaTime;
        this.tickWeather(deltaTime);
        for (const car of this.cars) {
            if (car.retired || car.inPit)
                continue;
            car.driverStintSeconds += deltaTime;
            const burn = (FUEL_BURN_PER_SEC[car.classId] ?? 0.07) * car.driverModeScale;
            car.fuel = Math.max(0, car.fuel - burn * deltaTime);
            car.tireWear = Math.min(1, car.tireWear + deltaTime * 0.00035);
            car.engineHealth = Math.max(0, car.engineHealth - deltaTime * 0.0025 * (1.1 - car.engineHealth / 100));
            car.coolantTempC = 72 + car.tireWear * 18 + (100 - car.engineHealth) * 0.15;
            if (car.fuel <= 0 && car.lap > 2) {
                car.retired = true;
                this.pendingEvents.push({
                    type: "Retirement",
                    entryId: car.entryId,
                    lap: car.lap,
                    timestamp: this.raceTime,
                    message: `${car.teamName} retired: Out of fuel`,
                });
                continue;
            }
            if (car.engineHealth <= 0) {
                car.retired = true;
                this.pendingEvents.push({
                    type: "Retirement",
                    entryId: car.entryId,
                    lap: car.lap,
                    timestamp: this.raceTime,
                    message: `${car.teamName} retired: Engine failure`,
                });
                continue;
            }
            const prevSector = car.sectorIndex;
            car.currentLapTime += deltaTime;
            car.currentSectorTime += deltaTime;
            const wearPenalty = 1 - car.tireWear * 0.12;
            const wetPenalty = 1 - this.trackWetness * (car.wetTyres ? 0.05 : 0.22);
            car.distance += car.speed * wearPenalty * wetPenalty * deltaTime * car.driverModeScale;
            const lapComplete = car.distance >= this.lapLength;
            if (lapComplete) {
                car.currentLapSectorTimes.push(car.currentSectorTime);
                car.lapHistory.push({
                    lapNumber: car.lap,
                    lapTime: car.currentLapTime,
                    sectorTimes: [...car.currentLapSectorTimes],
                });
                car.lastLapTime = car.currentLapTime;
                if (car.bestLapTime <= 0 || car.currentLapTime < car.bestLapTime) {
                    car.bestLapTime = car.currentLapTime;
                }
                this.pendingEvents.push({
                    type: "LapComplete",
                    entryId: car.entryId,
                    lap: car.lap,
                    timestamp: this.raceTime,
                    message: `${car.teamName} completed lap ${car.lap}`,
                });
                car.distance -= this.lapLength;
                car.lap += 1;
                car.currentLapTime = 0;
                car.currentSectorTime = 0;
                car.currentLapSectorTimes = [];
            }
            else {
                const newSector = sectorAtDistance(this.trackJson.sectors, car.distance, this.lapLength);
                if (newSector !== prevSector) {
                    car.currentLapSectorTimes.push(car.currentSectorTime);
                    this.pendingEvents.push({
                        type: "SectorCross",
                        entryId: car.entryId,
                        lap: car.lap,
                        sectorIndex: prevSector,
                        timestamp: this.raceTime,
                        message: `${car.teamName} crossed sector ${prevSector}`,
                    });
                    car.currentSectorTime = 0;
                    car.sectorIndex = newSector;
                }
            }
            if (lapComplete) {
                car.sectorIndex = sectorAtDistance(this.trackJson.sectors, car.distance, this.lapLength);
            }
        }
        this.processPitServices(deltaTime);
        const durationLimit = this.raceConfig.targetDurationMinutes * 60;
        if (durationLimit > 0 && this.raceTime >= durationLimit) {
            this.raceComplete = true;
            this.pendingEvents.push({
                type: "RaceComplete",
                timestamp: this.raceTime,
                message: "Race complete",
            });
        }
        else if (this.cars.every((c) => c.retired || c.lap > this.raceConfig.targetLaps)) {
            this.raceComplete = true;
            this.pendingEvents.push({
                type: "RaceComplete",
                timestamp: this.raceTime,
                message: "Race complete",
            });
        }
    }
    getSnapshots() {
        const board = [...this.cars].sort((a, b) => b.lap - a.lap || b.distance - a.distance);
        const leader = board[0];
        return board.map((car, rank) => {
            const d = ((car.distance % this.lapLength) + this.lapLength) % this.lapLength;
            const sample = this.samples.find((s) => s.distance >= d) ?? this.samples[0];
            return {
                entryId: car.entryId,
                teamName: car.teamName,
                carNumber: car.carNumber,
                classId: car.classId,
                lap: car.lap,
                distance: car.distance,
                normalizedT: sample.normalizedT,
                speed: car.speed,
                rpm: 6000,
                fuel: car.fuel,
                tireWear: car.tireWear,
                engineHealth: car.engineHealth,
                sectorIndex: car.sectorIndex,
                racePosition: rank + 1,
                inPit: car.inPit,
                retired: car.retired,
                fuelTankCapacity: car.fuelTankCapacity,
                pitCount: car.pitCount,
                pitQueued: car.pitQueued,
                driverStintSeconds: car.driverStintSeconds,
                maxDriverStintSeconds: car.maxDriverStintSeconds,
                coolantTempC: car.coolantTempC,
                tireCompound: car.tireCompound,
                wetTyres: car.wetTyres,
                currentLapTime: car.currentLapTime,
                currentSectorTime: car.currentSectorTime,
                lastLapTime: car.lastLapTime,
                bestLapTime: car.bestLapTime,
                gapToLeader: leader ? computeGapToLeader(car, leader, this.lapLength) : 0,
                currentLapSectorTimes: [...car.currentLapSectorTimes],
                lapHistory: car.lapHistory.map((lap) => ({
                    lapNumber: lap.lapNumber,
                    lapTime: lap.lapTime,
                    sectorTimes: [...lap.sectorTimes],
                })),
                position: { x: sample.x, y: 0, z: sample.z },
                tangent: { x: sample.tangentX, y: 0, z: sample.tangentZ },
            };
        });
    }
    drainEvents() {
        const drained = this.pendingEvents;
        this.pendingEvents = [];
        return drained;
    }
    getTrackGeometry() {
        if (!this.trackJson) {
            return { name: "Unknown", lapLength: 0, closed: true, polyline: [], sectors: [] };
        }
        const polyline = this.trackJson.display_polyline?.map((p) => ({ x: p.x, z: p.z })) ??
            this.samples.map((s) => ({ x: s.x, z: s.z }));
        return {
            name: this.trackJson.name,
            lapLength: this.lapLength,
            closed: true,
            polyline,
            mapLabels: this.trackJson.map_labels,
            sectors: this.trackJson.sectors.map((s) => {
                const midT = (s.start_t + s.end_t) * 0.5;
                const pt = this.samples[Math.round(midT * (this.samples.length - 1))];
                return {
                    name: s.name,
                    startT: s.start_t,
                    endT: s.end_t,
                    labelX: pt?.x ?? 0,
                    labelZ: pt?.z ?? 0,
                };
            }),
        };
    }
    reloadDefinitions() {
        if (!this.configPath)
            return false;
        return this.initFromRaceConfig(this.configPath);
    }
    restartRace() {
        if (!this.raceConfig || !this.trackJson)
            return false;
        const entries = this.raceConfig.entriesPath
            ? parseEntries(this.repoRoot, this.raceConfig.entriesPath)
            : [{ entryId: "solo-1", teamName: "Solo Entry", carNumber: 1, classId: "solo" }];
        this.cars = entries.map((e, i) => makeCarState(e, i));
        for (const car of this.cars) {
            car.sectorIndex = sectorAtDistance(this.trackJson.sectors, car.distance, this.lapLength);
        }
        this.raceTime = 0;
        this.pendingEvents = [];
        this.raceComplete = false;
        if (this.raceConfig) {
            this.trackWetness = this.raceConfig.trackWetness;
            this.ambientTempC = this.raceConfig.ambientTempC;
            this.weatherProfileId = this.raceConfig.weatherProfile;
            this.weatherProfile = weatherProfileForId(this.weatherProfileId);
            this.rainIntensity = this.trackWetness * this.weatherProfile.maxRainIntensity;
            this.trackGripEvolution = 1;
            this.weatherPhase = initWeatherPhase(this.trackWetness);
            this.forecastRainInSeconds = -1;
            this.rngState = this.rngSeed;
        }
        return true;
    }
    isRaceComplete() {
        return this.raceComplete;
    }
    getRaceTime() {
        return this.raceTime;
    }
    getRaceControl() {
        return {
            fcyActive: false,
            scActive: false,
            trackWetness: this.trackWetness,
            ambientTempC: this.ambientTempC,
            trackGripEvolution: this.trackGripEvolution,
            rainIntensity: this.rainIntensity,
            weatherPhase: this.weatherPhase,
            forecastRainInSeconds: this.forecastRainInSeconds,
        };
    }
    getReplayLog() {
        return [...this.replayLog];
    }
    getRngSeed() {
        return this.rngSeed;
    }
}
exports.MockSimSession = MockSimSession;
