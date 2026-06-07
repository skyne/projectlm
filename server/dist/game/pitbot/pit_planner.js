"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planPitStop = planPitStop;
exports.tankCapacityFor = tankCapacityFor;
exports.fuelToAddFor = fuelToAddFor;
const tyre_grip_1 = require("../../tyre_grip");
function tankCapacity(s) {
    return s.fuelTankCapacity ?? (s.classId === "Hypercar" ? 110 : 100);
}
function fuelToAdd(s) {
    return Math.max(1, Math.ceil(tankCapacity(s) - s.fuel));
}
const PIT_LANE_FRACTION = 0.06;
const PIT_LANE_SPEED_MS = 60 / 3.6;
const PIT_FUEL_SEC_PER_L = 0.038;
const PIT_TIRE_SEC = 2.8;
const PIT_REPAIR_ENGINE_SEC = 12;
const PIT_REPAIR_BODY_SEC = 8;
const PIT_DRIVER_CHANGE_SEC = 15;
const PIT_SETUP_SEC = 6;
const DEFAULT_LAP_LENGTH_M = 13600;
const FUEL_THRESHOLD = 0.2;
const FUEL_CRITICAL = 0.12;
const TIRE_WEAR_THRESHOLD = 0.72;
const ENGINE_REPAIR_HEALTH = 78;
const DRIVER_STINT_SWAP_FRACTION = 0.88;
const DRIVER_STAMINA_THRESHOLD = 35;
/** Bundle a soon need if it hits within this many laps. */
const BUNDLE_LOOKAHEAD_LAPS = 5;
const MIN_LAPS_BETWEEN_STOPS = 3;
const CLASS_FUEL_BURN_L = {
    Hypercar: 2.6,
    LMGT3: 1.9,
    LMP2: 2.2,
};
function lapLengthM(_s) {
    return DEFAULT_LAP_LENGTH_M;
}
function lapTimeSec(s) {
    return s.lastLapTime || s.bestLapTime || (s.classId === "Hypercar" ? 230 : 310);
}
function pitLaneTravelSec(s) {
    return (lapLengthM(s) * PIT_LANE_FRACTION) / PIT_LANE_SPEED_MS;
}
function estimateServiceSec(s, services, fuelLiters, tyreCount) {
    const mech = 0.94;
    const svc = s.serviceabilityFactor ?? 1;
    const dcf = s.driverChangeFactor ?? 1;
    const pitScale = 1 / Math.max(0.5, svc);
    const driverScale = 1 / Math.max(0.5, dcf);
    let t = 0;
    if (fuelLiters > 0)
        t += fuelLiters * PIT_FUEL_SEC_PER_L * mech * pitScale;
    t += tyreCount * PIT_TIRE_SEC * mech * pitScale;
    if (services.engine)
        t += PIT_REPAIR_ENGINE_SEC * mech * pitScale;
    if (services.body)
        t += PIT_REPAIR_BODY_SEC * 4 * mech * pitScale;
    if (services.driver)
        t += PIT_DRIVER_CHANGE_SEC * mech * driverScale;
    if (services.setup)
        t += PIT_SETUP_SEC * 0.96;
    return Math.max(5, t);
}
function estimateStopSec(s, services, fuelLiters, tyreCount) {
    return pitLaneTravelSec(s) + estimateServiceSec(s, services, fuelLiters, tyreCount);
}
function burnPerLap(s, sincePit, fuelAtLastPit) {
    if (sincePit > 0 && fuelAtLastPit > s.fuel) {
        return (fuelAtLastPit - s.fuel) / sincePit;
    }
    return CLASS_FUEL_BURN_L[s.classId] ?? 2.2;
}
function lapsUntilFuelBelow(s, thresholdFrac, sincePit, fuelAtLastPit) {
    const tank = tankCapacity(s);
    const target = tank * thresholdFrac;
    if (s.fuel <= target)
        return 0;
    const burn = burnPerLap(s, sincePit, fuelAtLastPit);
    if (burn <= 0)
        return 99;
    return Math.floor((s.fuel - target) / burn);
}
function driverSwapState(s) {
    const roster = s.driverRoster ?? [];
    if (roster.length < 2)
        return { needed: false, urgent: false, lapsUntil: 99 };
    const maxStint = s.maxDriverStintSeconds ?? 0;
    const stint = s.driverStintSeconds ?? 0;
    const lapSec = lapTimeSec(s);
    if (maxStint > 0) {
        if (stint >= maxStint * 0.98)
            return { needed: true, urgent: true, lapsUntil: 0 };
        const swapAt = maxStint * DRIVER_STINT_SWAP_FRACTION;
        if (stint >= swapAt)
            return { needed: true, urgent: false, lapsUntil: 0 };
        const remaining = swapAt - stint;
        return { needed: false, urgent: false, lapsUntil: Math.ceil(remaining / lapSec) };
    }
    const stamina = s.driverStamina ?? 100;
    if (stamina <= DRIVER_STAMINA_THRESHOLD) {
        return { needed: true, urgent: stamina <= 20, lapsUntil: 0 };
    }
    return { needed: false, urgent: false, lapsUntil: 99 };
}
function deflatedWheels(s) {
    const td = s.tyreDeflation ?? {};
    return Object.entries(td)
        .filter(([, v]) => v === "flat" || v === "soft")
        .map(([w]) => w.toUpperCase());
}
function needsLimpPit(s) {
    const limp = s.limpMode ?? "none";
    return limp === "barely_driveable" || limp === "hybrid_only" || limp === "immobilized";
}
function tyresWorn(s) {
    const wear = s.tireWear ?? 0;
    return wear >= TIRE_WEAR_THRESHOLD;
}
function lapsUntilTyreWorn(s) {
    const wear = s.tireWear ?? 0;
    if (wear >= TIRE_WEAR_THRESHOLD)
        return 0;
    const lap = Math.max(1, s.lap);
    const rate = wear / lap;
    if (rate <= 0)
        return 99;
    return Math.ceil((TIRE_WEAR_THRESHOLD - wear) / rate);
}
function nextDriverIndex(s) {
    const roster = s.driverRoster ?? [];
    if (roster.length < 2)
        return -1;
    const active = s.activeDriverIndex ?? roster.findIndex((d) => d.active);
    const idx = active >= 0 ? active : 0;
    return (idx + 1) % roster.length;
}
function slickCompound(wet) {
    if (wet > 0.2)
        return "medium";
    return "soft";
}
function buildParts(s, ctx, services, driverIndex) {
    const tread = (0, tyre_grip_1.desiredTyreTread)(ctx.wet);
    const compound = tread === "slick" ? slickCompound(ctx.wet) : "medium";
    const parts = [];
    if (services.fuel)
        parts.push(`fuel=${fuelToAdd(s)}`);
    else
        parts.push("fuel=0");
    if (services.tyres) {
        const wheels = services.tyreWheels?.length ? services.tyreWheels.join(",") : "all";
        parts.push(`compound=${compound}`, `tyre_tread=${tread}`, `tires=${wheels}`);
    }
    else {
        parts.push("tires=");
    }
    const repairs = [];
    if (services.engine)
        repairs.push("engine");
    if (services.body)
        repairs.push("body");
    if (repairs.length)
        parts.push(`repairs=${repairs.join(",")}`);
    if (services.driver && driverIndex >= 0) {
        parts.push("driver_change=true", `driver_index=${driverIndex}`);
    }
    if (services.setup && ctx.setupWing != null && ctx.setupBias != null) {
        parts.push(`wing=${ctx.setupWing}`, `brake_bias=${ctx.setupBias}`);
    }
    return parts;
}
function serviceLabel(services) {
    const bits = [];
    if (services.setup)
        bits.push("setup");
    if (services.fuel)
        bits.push("fuel");
    if (services.tyres)
        bits.push("tyres");
    if (services.driver)
        bits.push("driver");
    if (services.engine)
        bits.push("engine");
    if (services.body)
        bits.push("body");
    return bits.join("+") || "stop";
}
/** Decide bundled pit stop (or defer). */
function planPitStop(s, ctx, fuelAtLastPit) {
    const fuelPct = s.fuel / tankCapacity(s);
    const weatherTyres = (0, tyre_grip_1.needsWeatherTyreSwap)(ctx.tyreTread, ctx.wet);
    const driver = ctx.phase === "race"
        ? driverSwapState(s)
        : { needed: false, urgent: false, lapsUntil: 99 };
    const engine = (s.engineHealth ?? 100) <= ENGINE_REPAIR_HEALTH;
    const flatWheels = deflatedWheels(s);
    const limp = needsLimpPit(s);
    const worn = tyresWorn(s) || flatWheels.length > 0;
    const lapsFuelLow = lapsUntilFuelBelow(s, FUEL_THRESHOLD, ctx.sincePit, fuelAtLastPit);
    const lapsFuelCrit = lapsUntilFuelBelow(s, FUEL_CRITICAL, ctx.sincePit, fuelAtLastPit);
    const lapsTyres = lapsUntilTyreWorn(s);
    const fuelNow = fuelPct < FUEL_THRESHOLD;
    const fuelSoon = lapsFuelLow <= BUNDLE_LOOKAHEAD_LAPS;
    const tyresNow = weatherTyres || worn;
    const tyresSoon = weatherTyres || lapsTyres <= BUNDLE_LOOKAHEAD_LAPS;
    const driverNow = driver.needed;
    const driverSoon = driver.needed || driver.lapsUntil <= BUNDLE_LOOKAHEAD_LAPS;
    const critical = fuelPct < FUEL_CRITICAL ||
        driver.urgent ||
        engine ||
        limp ||
        flatWheels.length > 0 ||
        (ctx.wet >= tyre_grip_1.WET_TYRE_THRESHOLD && weatherTyres);
    const anyNow = fuelNow || tyresNow || driverNow || engine || limp;
    const bundleSoon = (fuelSoon && (driverSoon || tyresSoon)) ||
        (driverSoon && tyresSoon) ||
        (fuelSoon && driverSoon);
    if (!ctx.setupDone && !critical && ctx.phase !== "race") {
        if (ctx.sincePit < 1)
            return null;
        const services = {
            setup: true,
            fuel: true,
            tyres: true,
            driver: false,
            engine: false,
            body: false,
        };
        const parts = buildParts(s, ctx, services, -1);
        return {
            pitNow: true,
            services,
            parts,
            label: "setup+fuel",
            estimateSec: estimateStopSec(s, services, fuelToAdd(s), 4),
            driverIndex: -1,
        };
    }
    if (!anyNow && !bundleSoon && !critical)
        return null;
    const minLaps = driver.urgent || fuelPct < FUEL_CRITICAL ? 1 : MIN_LAPS_BETWEEN_STOPS;
    if (ctx.sincePit < minLaps && !critical)
        return null;
    if (!critical && !driver.urgent && ctx.sincePit < MIN_LAPS_BETWEEN_STOPS + 2) {
        const loneFuel = fuelNow && !driverSoon && !tyresSoon && !engine;
        const loneTyres = tyresNow && !fuelSoon && !driverSoon && !engine;
        const loneDriver = driverNow && !fuelSoon && !tyresSoon && !engine;
        if (loneFuel || loneTyres || loneDriver) {
            const waitFor = Math.min(fuelNow ? lapsFuelLow : 99, tyresNow ? lapsTyres : 99, driverNow ? driver.lapsUntil : 99);
            if (waitFor > 0 && waitFor <= BUNDLE_LOOKAHEAD_LAPS)
                return null;
        }
    }
    const lapSec = lapTimeSec(s);
    const bundleServices = {
        setup: !ctx.setupDone && ctx.phase === "race",
        fuel: fuelNow || fuelSoon || fuelPct < 0.35,
        tyres: tyresNow || tyresSoon,
        driver: driverNow || driverSoon,
        engine,
        body: limp,
    };
    if (fuelNow &&
        !bundleServices.tyres &&
        !bundleServices.driver &&
        !bundleServices.engine &&
        driver.lapsUntil > BUNDLE_LOOKAHEAD_LAPS + 2 &&
        lapsTyres > BUNDLE_LOOKAHEAD_LAPS + 2) {
        bundleServices.tyres = false;
        bundleServices.fuel = true;
    }
    else if (bundleSoon || critical) {
        bundleServices.fuel = bundleServices.fuel || fuelSoon;
        bundleServices.tyres = bundleServices.tyres || tyresSoon;
        bundleServices.driver = bundleServices.driver || driverSoon;
    }
    if (!bundleServices.fuel &&
        !bundleServices.tyres &&
        !bundleServices.driver &&
        !bundleServices.engine) {
        return null;
    }
    const fuelL = bundleServices.fuel ? fuelToAdd(s) : 0;
    const tyreN = bundleServices.tyres ? (bundleServices.tyreWheels?.length || 4) : 0;
    const combinedSec = estimateStopSec(s, bundleServices, fuelL, tyreN);
    const splitStops = [
        bundleServices.fuel,
        bundleServices.tyres,
        bundleServices.driver,
        bundleServices.engine,
        bundleServices.body,
    ].filter(Boolean).length;
    let splitServiceOnly = 0;
    if (bundleServices.fuel) {
        splitServiceOnly += estimateServiceSec(s, { fuel: true, tyres: false, driver: false, engine: false, body: false, setup: false }, fuelL, 0);
    }
    if (bundleServices.tyres) {
        splitServiceOnly += estimateServiceSec(s, { fuel: false, tyres: true, driver: false, engine: false, body: false, setup: false }, 0, 4);
    }
    if (bundleServices.driver) {
        splitServiceOnly += estimateServiceSec(s, { fuel: false, tyres: false, driver: true, engine: false, body: false, setup: false }, 0, 0);
    }
    if (bundleServices.engine) {
        splitServiceOnly += estimateServiceSec(s, { fuel: false, tyres: false, driver: false, engine: true, body: false, setup: false }, 0, 0);
    }
    const travel = pitLaneTravelSec(s);
    const splitTotal = splitStops * travel + splitServiceOnly + Math.max(0, splitStops - 1) * lapSec;
    if (splitStops > 1 && combinedSec < splitTotal * 0.92) {
        // prefer bundle — already encoded in bundleServices
    }
    else if (splitStops > 1 && !critical && !bundleSoon) {
        if (engine) {
            bundleServices.fuel = false;
            bundleServices.tyres = false;
            bundleServices.driver = false;
        }
        else if (driver.urgent || driverNow) {
            bundleServices.fuel = fuelPct < 0.25;
            bundleServices.tyres = weatherTyres;
            bundleServices.engine = false;
        }
        else if (fuelNow) {
            bundleServices.tyres = false;
            bundleServices.driver = false;
            bundleServices.engine = false;
        }
    }
    if (flatWheels.length) {
        bundleServices.tyres = true;
        bundleServices.tyreWheels = flatWheels;
    }
    const driverIndex = bundleServices.driver ? nextDriverIndex(s) : -1;
    const parts = buildParts(s, ctx, bundleServices, driverIndex);
    const label = serviceLabel(bundleServices);
    const est = estimateStopSec(s, bundleServices, bundleServices.fuel ? fuelToAdd(s) : 0, bundleServices.tyres ? 4 : 0);
    return {
        pitNow: true,
        services: bundleServices,
        parts,
        label: splitStops > 1
            ? `combined ${label} (~${Math.round(est)}s saves ~${Math.round(Math.max(0, splitTotal - est))}s)`
            : label,
        estimateSec: est,
        driverIndex,
    };
}
function tankCapacityFor(s) {
    return tankCapacity(s);
}
function fuelToAddFor(s) {
    return fuelToAdd(s);
}
