"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_CARS_PER_PURCHASE = void 0;
exports.normalizeQuantity = normalizeQuantity;
exports.classProgramLabel = classProgramLabel;
exports.getClassProgram = getClassProgram;
exports.payloadMatchesClassProgram = payloadMatchesClassProgram;
exports.cloneCarBuild = cloneCarBuild;
exports.buildSpecKey = buildSpecKey;
exports.referenceCarForClass = referenceCarForClass;
exports.referenceCarForProgramme = referenceCarForProgramme;
exports.alignProgrammeBuilds = alignProgrammeBuilds;
exports.nextFleetCarId = nextFleetCarId;
exports.nextCarNumber = nextCarNumber;
exports.fleetCarConfigPath = fleetCarConfigPath;
exports.buyCarUnitCost = buyCarUnitCost;
exports.buyCarCost = buyCarCost;
exports.createFleetCar = createFleetCar;
exports.migrateLegacyMeta = migrateLegacyMeta;
exports.activeFleetCar = activeFleetCar;
exports.manufacturerHypercarCount = manufacturerHypercarCount;
exports.hypercarManufacturerExpEligible = hypercarManufacturerExpEligible;
exports.hypercarMfgExpExceptionPath = hypercarMfgExpExceptionPath;
exports.validateFleetRegulations = validateFleetRegulations;
exports.validateBuyCar = validateBuyCar;
exports.createFleetCars = createFleetCars;
exports.fleetRulesPayload = fleetRulesPayload;
const car_marketplace_1 = require("./car_marketplace");
const catalog_1 = require("./catalog");
const driver_catalog_1 = require("./driver_catalog");
const chassis_setup_1 = require("./chassis_setup");
const economy_1 = require("./economy");
const experimental_entry_1 = require("./experimental_entry");
exports.MAX_CARS_PER_PURCHASE = 6;
function normalizeQuantity(quantity) {
    const q = Math.floor(quantity ?? 1);
    return Math.max(1, Math.min(exports.MAX_CARS_PER_PURCHASE, q));
}
function classProgramLabel(car, platform) {
    if (car.affiliation === "manufacturer" && car.acquisition === "build") {
        return `${car.classId} Manufacturer`;
    }
    if (car.acquisition === "privateer" && platform) {
        return `${car.classId} Privateer · ${platform.displayName}`;
    }
    if (car.affiliation === "privateer") {
        return `${car.classId} Privateer`;
    }
    return `${car.classId} Manufacturer`;
}
function getClassProgram(fleet, classId, repoRoot, entryMode = "homologated") {
    const inClass = fleet.filter((c) => c.classId === classId && (0, experimental_entry_1.fleetEntryMode)(c) === entryMode);
    if (inClass.length === 0)
        return null;
    const ref = inClass[0];
    let platform = null;
    if (ref.platformId && repoRoot) {
        platform = (0, car_marketplace_1.platformById)(repoRoot, ref.platformId);
    }
    const baseLabel = classProgramLabel(ref, platform);
    const label = entryMode === "experimental" ? `${baseLabel} · EXP` : baseLabel;
    return {
        classId,
        entryMode,
        affiliation: ref.affiliation,
        acquisition: ref.acquisition,
        platformId: ref.platformId,
        experimentalProgramId: ref.experimentalProgramId,
        carCount: inClass.length,
        label,
    };
}
function payloadMatchesClassProgram(program, payload) {
    const mode = payload.entryMode ?? "homologated";
    if (program.entryMode !== mode)
        return false;
    if (program.affiliation !== payload.affiliation)
        return false;
    if (program.acquisition !== payload.acquisition)
        return false;
    if (program.acquisition === "privateer") {
        return program.platformId === payload.platformId;
    }
    return payload.acquisition === "build";
}
function cloneCarBuild(build) {
    return structuredClone(build);
}
/** Compare builds ignoring display name — same programme must share one spec. */
function buildSpecKey(build) {
    return JSON.stringify({ ...build, carName: "" });
}
function referenceCarForClass(fleet, classId) {
    return fleet.find((c) => c.classId === classId && (0, experimental_entry_1.fleetEntryMode)(c) === "homologated");
}
function referenceCarForProgramme(fleet, classId, entryMode) {
    return fleet.find((c) => c.classId === classId && (0, experimental_entry_1.fleetEntryMode)(c) === entryMode);
}
function programmeGroupKey(car) {
    const mode = (0, experimental_entry_1.fleetEntryMode)(car);
    if (mode === "experimental") {
        return `${car.classId}:experimental:${car.experimentalProgramId ?? car.id}`;
    }
    return `${car.classId}:homologated`;
}
/** Force sibling entries in each programme to match the first car's build. */
function alignProgrammeBuilds(fleet) {
    let changed = false;
    const groups = new Map();
    for (const car of fleet) {
        const key = programmeGroupKey(car);
        const list = groups.get(key) ?? [];
        list.push(car);
        groups.set(key, list);
    }
    for (const cars of groups.values()) {
        if (cars.length < 2)
            continue;
        const refKey = buildSpecKey(cars[0].build);
        for (let i = 1; i < cars.length; i++) {
            if (buildSpecKey(cars[i].build) !== refKey) {
                cars[i].build = cloneCarBuild(cars[0].build);
                changed = true;
            }
        }
    }
    return changed;
}
function nextFleetCarId(fleet) {
    let max = 0;
    for (const car of fleet) {
        const match = /^car-(\d+)$/.exec(car.id);
        if (match)
            max = Math.max(max, Number(match[1]));
    }
    return `car-${max + 1}`;
}
function nextCarNumber(fleet) {
    if (fleet.length === 0)
        return "1";
    const max = Math.max(...fleet.map((c) => parseInt(c.carNumber, 10) || 0));
    return String(max + 1);
}
function fleetCarConfigPath(carId) {
    return `configs/runtime/fleet/${carId}.txt`;
}
function rawToEngine(raw) {
    if (!raw.engine_layout)
        return undefined;
    return {
        engine_layout: raw.engine_layout,
        fuel_type: raw.fuel_type ?? "Gasoline",
        cylinders: parseInt(raw.cylinders ?? "6", 10),
        bore: parseFloat(raw.bore ?? "0.096"),
        stroke: parseFloat(raw.stroke ?? "0.080"),
        max_rpm: parseInt(raw.max_rpm ?? "8000", 10),
        peak_torque_nm: parseFloat(raw.peak_torque_nm ?? "500"),
        peak_torque_rpm: parseInt(raw.peak_torque_rpm ?? "6500", 10),
        base_vibration: parseFloat(raw.base_vibration ?? "1.0"),
        aspiration: raw.aspiration,
        drivetrain: raw.drivetrain,
        energy_converter: raw.energy_converter,
        buffer_size: raw.buffer_size ? parseFloat(raw.buffer_size) : undefined,
        generator_kw: raw.generator_kw ? parseFloat(raw.generator_kw) : undefined,
    };
}
function inferClassId(chassis) {
    if (chassis.startsWith("GT3") || chassis === "GT3Spaceframe")
        return "LMGT3";
    if (chassis === "Oreca07")
        return "LMP2";
    return "Hypercar";
}
function rawToBuild(raw, carName, partsBySlot) {
    const classId = inferClassId(raw.chassis_type ?? "LMDhDallara");
    const build = {
        carName,
        chassis_type: raw.chassis_type ?? "LMDhDallara",
        front_aero_type: raw.front_aero_type ?? "LowDragNose",
        rear_aero_type: raw.rear_aero_type ?? "StandardWing",
        diffuser_type: raw.diffuser_type ?? "StockFloor",
        exhaust_type: raw.exhaust_type ?? "TwinOutletSide",
        cooling_pack: raw.cooling_pack ?? "EnduranceHeavyDuty",
        wheel_package: raw.wheel_package ?? (0, catalog_1.defaultWheelPackageForClass)(classId),
        suspension_layout: raw.suspension_layout ?? (0, catalog_1.defaultSuspensionForClass)(classId),
        front_suspension_layout: raw.front_suspension_layout,
        rear_suspension_layout: raw.rear_suspension_layout,
        front_wheel_diameter_in: raw.front_wheel_diameter_in
            ? parseFloat(raw.front_wheel_diameter_in)
            : undefined,
        rear_wheel_diameter_in: raw.rear_wheel_diameter_in
            ? parseFloat(raw.rear_wheel_diameter_in)
            : undefined,
        front_tire_width_mm: raw.front_tire_width_mm
            ? parseFloat(raw.front_tire_width_mm)
            : undefined,
        rear_tire_width_mm: raw.rear_tire_width_mm
            ? parseFloat(raw.rear_tire_width_mm)
            : undefined,
        front_ride_height_mm: raw.front_ride_height_mm
            ? parseFloat(raw.front_ride_height_mm)
            : raw.front_ride_height_m
                ? parseFloat(raw.front_ride_height_m) * 1000
                : undefined,
        rear_ride_height_mm: raw.rear_ride_height_mm
            ? parseFloat(raw.rear_ride_height_mm)
            : raw.rear_ride_height_m
                ? parseFloat(raw.rear_ride_height_m) * 1000
                : undefined,
        front_spring_nm: raw.front_spring_nm
            ? parseFloat(raw.front_spring_nm)
            : raw.front_spring_stiffness
                ? parseFloat(raw.front_spring_stiffness)
                : undefined,
        rear_spring_nm: raw.rear_spring_nm
            ? parseFloat(raw.rear_spring_nm)
            : raw.rear_spring_stiffness
                ? parseFloat(raw.rear_spring_stiffness)
                : undefined,
        front_arb_stiffness: raw.front_arb_stiffness
            ? parseFloat(raw.front_arb_stiffness)
            : undefined,
        rear_arb_stiffness: raw.rear_arb_stiffness
            ? parseFloat(raw.rear_arb_stiffness)
            : undefined,
        front_damper_bump: raw.front_damper_bump
            ? parseInt(raw.front_damper_bump, 10)
            : undefined,
        front_damper_rebound: raw.front_damper_rebound
            ? parseInt(raw.front_damper_rebound, 10)
            : undefined,
        rear_damper_bump: raw.rear_damper_bump
            ? parseInt(raw.rear_damper_bump, 10)
            : undefined,
        rear_damper_rebound: raw.rear_damper_rebound
            ? parseInt(raw.rear_damper_rebound, 10)
            : undefined,
        fuel_system: raw.fuel_system ?? "StandardTank",
        brake_system: raw.brake_system ?? "StandardCaliper",
        transmission: raw.transmission ?? "SixSpeedSequential",
        hybrid_system: raw.hybrid_system ?? "None",
    };
    const engine = rawToEngine(raw);
    if (engine)
        build.engine = engine;
    if (raw.engine_radiator_size ||
        raw.oil_cooler_size ||
        raw.charge_air_cooler_size ||
        raw.gearbox_cooler_size) {
        build.cooling = {
            engine_radiator: raw.engine_radiator_size
                ? parseFloat(raw.engine_radiator_size)
                : undefined,
            oil_cooler: raw.oil_cooler_size
                ? parseFloat(raw.oil_cooler_size)
                : undefined,
            charge_air_cooler: raw.charge_air_cooler_size
                ? parseFloat(raw.charge_air_cooler_size)
                : undefined,
            gearbox_cooler: raw.gearbox_cooler_size
                ? parseFloat(raw.gearbox_cooler_size)
                : undefined,
        };
    }
    if (raw.duct_airflow) {
        build.duct_airflow = parseFloat(raw.duct_airflow);
    }
    return (0, chassis_setup_1.normalizeCarBuild)(build, classId, partsBySlot);
}
function buyCarUnitCost(repoRoot, payload, fleet = []) {
    const entryMode = payload.entryMode ?? "homologated";
    const inProgramme = getClassProgram(fleet, payload.classId, repoRoot, entryMode);
    if (payload.acquisition === "privateer") {
        if (!payload.platformId)
            return null;
        const platform = (0, car_marketplace_1.platformById)(repoRoot, payload.platformId);
        if (!platform || platform.classId !== payload.classId)
            return null;
        if (entryMode === "homologated")
            return platform.privateerCost;
        const base = Math.round(platform.privateerCost * experimental_entry_1.EXP_PRIVATEER_UNIT_MULTIPLIER);
        if (!inProgramme)
            return base + experimental_entry_1.EXP_PRIVATEER_PROGRAMME_FEE;
        return Math.round(base * experimental_entry_1.EXP_COPY_UNIT_MULTIPLIER);
    }
    if (payload.affiliation !== "manufacturer")
        return null;
    const homologated = (0, car_marketplace_1.manufacturerBuildCost)(payload.classId);
    if (entryMode === "homologated")
        return homologated;
    if (!inProgramme) {
        return Math.round(homologated * experimental_entry_1.EXP_MANUFACTURER_UNIT_MULTIPLIER);
    }
    return Math.round(homologated * experimental_entry_1.EXP_COPY_UNIT_MULTIPLIER);
}
function buyCarCost(repoRoot, payload, fleet = []) {
    const qty = normalizeQuantity(payload.quantity);
    const entryMode = payload.entryMode ?? "homologated";
    if (entryMode === "experimental" && payload.acquisition === "privateer") {
        const hasProgramme = !!getClassProgram(fleet, payload.classId, repoRoot, "experimental");
        let total = 0;
        for (let i = 0; i < qty; i++) {
            const treatAsExisting = hasProgramme || i > 0;
            const unit = buyCarUnitCost(repoRoot, payload, treatAsExisting ? fleetWithExperimentalStub(fleet, payload.classId) : fleet);
            if (unit === null)
                return null;
            total += unit;
        }
        return total;
    }
    const unit = buyCarUnitCost(repoRoot, payload, fleet);
    if (unit === null)
        return null;
    return unit * qty;
}
function fleetWithExperimentalStub(fleet, classId) {
    if (fleet.some((c) => c.classId === classId && (0, experimental_entry_1.fleetEntryMode)(c) === "experimental")) {
        return fleet;
    }
    const hom = fleet.find((c) => c.classId === classId);
    const build = hom?.build ?? {
        carName: "preview",
        chassis_type: "LMDhDallara",
        front_aero_type: "LowDragNose",
        rear_aero_type: "StandardWing",
        cooling_pack: "EnduranceHeavyDuty",
        wheel_package: "Hypercar18Standard",
        suspension_layout: "PushrodDoubleWishbone",
        fuel_system: "LeMans110L",
        brake_system: "BremboHypercar",
        transmission: "XtracP1359",
        hybrid_system: "LMDh50kW",
    };
    return [
        ...fleet,
        {
            id: "preview-exp",
            carNumber: "0",
            classId,
            affiliation: "manufacturer",
            acquisition: "build",
            entryMode: "experimental",
            experimentalProgramId: "preview",
            build,
            carConfigPath: "",
        },
    ];
}
function createFleetCar(repoRoot, teamName, payload, fleet) {
    if (buyCarUnitCost(repoRoot, payload, fleet) === null)
        return null;
    const entryMode = payload.entryMode ?? "homologated";
    const id = nextFleetCarId(fleet);
    const carNumber = payload.carNumber ?? nextCarNumber(fleet);
    let build;
    let manufacturerId;
    let platformId;
    let experimentalProgramId;
    const existingProgramme = referenceCarForProgramme(fleet, payload.classId, entryMode);
    if (entryMode === "experimental") {
        experimentalProgramId =
            existingProgramme?.experimentalProgramId ??
                (0, experimental_entry_1.newExperimentalProgramId)(payload.classId);
    }
    if (payload.acquisition === "privateer" && payload.platformId) {
        const platform = (0, car_marketplace_1.platformById)(repoRoot, payload.platformId);
        if (!platform)
            return null;
        const catalog = (0, catalog_1.loadGameCatalog)(repoRoot);
        if (existingProgramme?.build) {
            build = cloneCarBuild(existingProgramme.build);
            manufacturerId = existingProgramme.manufacturerId ?? platform.manufacturerId;
            platformId = existingProgramme.platformId ?? platform.id;
        }
        else {
            const raw = (0, car_marketplace_1.buildFromPlatform)(repoRoot, platform, teamName);
            build = rawToBuild(raw, raw.carName ?? `${teamName} ${platform.displayName}`, catalog.partsBySlot);
            manufacturerId = platform.manufacturerId;
            platformId = platform.id;
        }
    }
    else if (existingProgramme?.build) {
        build = cloneCarBuild(existingProgramme.build);
        manufacturerId =
            existingProgramme.manufacturerId ??
                teamName.toLowerCase().replace(/\s+/g, "_").slice(0, 24);
        platformId = existingProgramme.platformId;
    }
    else {
        const catalog = (0, catalog_1.loadGameCatalog)(repoRoot);
        const raw = (0, catalog_1.defaultBuildForClass)(repoRoot, payload.classId);
        if (!raw)
            return null;
        build = rawToBuild(raw, raw.carName ?? `${teamName} ${payload.classId}${entryMode === "experimental" ? " EXP" : ""}`, catalog.partsBySlot);
        manufacturerId = teamName.toLowerCase().replace(/\s+/g, "_").slice(0, 24);
    }
    if (entryMode === "experimental") {
        build.carName = build.carName.includes("EXP")
            ? build.carName
            : `${build.carName} EXP`;
    }
    return {
        id,
        carNumber,
        classId: payload.classId,
        affiliation: payload.affiliation,
        acquisition: payload.acquisition,
        entryMode: entryMode === "homologated" ? undefined : entryMode,
        experimentalProgramId,
        manufacturerId,
        platformId,
        build,
        carConfigPath: fleetCarConfigPath(id),
    };
}
function migrateLegacyMeta(state) {
    const withSponsors = { ...state, sponsors: state.sponsors ?? [] };
    const roster = withSponsors.driverRoster ?? [];
    if (withSponsors.fleet && withSponsors.fleet.length > 0) {
        const { roster: migratedRoster, fleet } = (0, driver_catalog_1.migrateDriverAssignments)(roster, withSponsors.fleet);
        return {
            ...withSponsors,
            driverRoster: migratedRoster,
            activeCarId: withSponsors.activeCarId ?? fleet[0].id,
            fleet: fleet.map((c) => ({ ...c, entryMode: c.entryMode ?? undefined })),
        };
    }
    if (!withSponsors.carBuild && !withSponsors.setupComplete) {
        return { ...withSponsors, fleet: [], activeCarId: "" };
    }
    const classId = withSponsors.playerClassId ?? "Hypercar";
    const build = withSponsors.carBuild ?? {
        carName: `${withSponsors.teamName} ${classId}`,
        chassis_type: classId === "LMGT3" ? "GT3Spaceframe" : classId === "LMP2" ? "Oreca07" : "LMDhDallara",
        front_aero_type: "LowDragNose",
        rear_aero_type: classId === "LMGT3" ? "HighDownforceWing" : "StandardWing",
        diffuser_type: "StockFloor",
        exhaust_type: "TwinOutletSide",
        cooling_pack: "EnduranceHeavyDuty",
        wheel_package: (0, catalog_1.defaultWheelPackageForClass)(classId),
        suspension_layout: (0, catalog_1.defaultSuspensionForClass)(classId),
        fuel_system: classId === "Hypercar" ? "LeMans110L" : "StandardTank",
        brake_system: classId === "Hypercar" ? "BremboHypercar" : "StandardCaliper",
        transmission: classId === "LMGT3" ? "XtracP529" : classId === "Hypercar" ? "XtracP1359" : "SixSpeedSequential",
        hybrid_system: classId === "Hypercar" ? "LMDh50kW" : "None",
    };
    const car = {
        id: "car-1",
        carNumber: "1",
        classId,
        affiliation: "manufacturer",
        acquisition: "build",
        build,
        carConfigPath: fleetCarConfigPath("car-1"),
    };
    return {
        ...withSponsors,
        fleet: [car],
        activeCarId: "car-1",
        playerCarId: "car-1",
        playerEntryId: withSponsors.playerEntryId || "entry-1",
    };
}
function activeFleetCar(state) {
    if (!state.fleet?.length)
        return null;
    return (state.fleet.find((c) => c.id === state.activeCarId) ?? state.fleet[0]);
}
function manufacturerHypercarCount(fleet) {
    return fleet.filter((c) => c.classId === "Hypercar" &&
        c.affiliation === "manufacturer" &&
        (0, experimental_entry_1.fleetEntryMode)(c) === "homologated").length;
}
/** Hypercar mfg EXP allowed only after the mandatory homologated pair exists. */
function hypercarManufacturerExpEligible(fleet) {
    return manufacturerHypercarCount(fleet) >= car_marketplace_1.MANUFACTURER_HYPERCAR_MIN_CARS;
}
/** Established HC manufacturer adding a third mule on top of the homologated pair. */
function hypercarMfgExpExceptionPath(fleet, affiliation) {
    return (affiliation === "manufacturer" && hypercarManufacturerExpEligible(fleet));
}
function experimentalHypercarLimits(fleet, affiliation) {
    const exception = hypercarMfgExpExceptionPath(fleet, affiliation);
    return {
        min: (0, experimental_entry_1.minExperimentalCopies)(affiliation, "Hypercar", {
            hypercarMfgException: exception,
        }),
        max: (0, experimental_entry_1.maxExperimentalCopies)(affiliation, "Hypercar", {
            hypercarMfgException: exception,
        }),
    };
}
function validateFleetRegulations(fleet) {
    if (fleet.length === 0) {
        return "Your team needs at least one car before racing";
    }
    const mfgHypercars = manufacturerHypercarCount(fleet);
    const hasExpHypercarMfg = fleet.some((c) => c.classId === "Hypercar" &&
        c.affiliation === "manufacturer" &&
        (0, experimental_entry_1.isExperimentalCar)(c));
    if (mfgHypercars > 0 &&
        mfgHypercars < car_marketplace_1.MANUFACTURER_HYPERCAR_MIN_CARS &&
        hasExpHypercarMfg) {
        return `Complete your homologated Hypercar programme (${car_marketplace_1.MANUFACTURER_HYPERCAR_MIN_CARS} cars) before adding experimental entries`;
    }
    if (mfgHypercars > 0 && mfgHypercars < car_marketplace_1.MANUFACTURER_HYPERCAR_MIN_CARS) {
        return `As a Hypercar manufacturer you must enter at least ${car_marketplace_1.MANUFACTURER_HYPERCAR_MIN_CARS} homologated Hypercars (you have ${mfgHypercars})`;
    }
    const groups = new Map();
    for (const car of fleet) {
        const key = programmeGroupKey(car);
        const list = groups.get(key) ?? [];
        list.push(car);
        groups.set(key, list);
    }
    for (const [key, cars] of groups) {
        if (cars.length < 2)
            continue;
        const refKey = buildSpecKey(cars[0].build);
        for (const car of cars.slice(1)) {
            if (buildSpecKey(car.build) !== refKey) {
                const label = key.includes(":experimental:")
                    ? `${cars[0].classId} EXP`
                    : cars[0].classId;
                return `Your ${label} entries must share the same design — #${car.carNumber} does not match #${cars[0].carNumber}`;
            }
        }
    }
    const byClass = new Map();
    for (const car of fleet) {
        const list = byClass.get(car.classId) ?? [];
        list.push(car);
        byClass.set(car.classId, list);
    }
    for (const [classId, cars] of byClass) {
        const homologated = cars.filter((c) => (0, experimental_entry_1.fleetEntryMode)(c) === "homologated");
        const experimental = cars.filter(experimental_entry_1.isExperimentalCar);
        const expProgramIds = new Set(experimental.map((c) => c.experimentalProgramId).filter(Boolean));
        if (expProgramIds.size > 1) {
            return `Only one experimental design is allowed in ${classId}`;
        }
        if (experimental.length > 0) {
            const affiliation = experimental[0].affiliation;
            if (classId === "Hypercar" &&
                affiliation === "manufacturer" &&
                mfgHypercars > 0 &&
                mfgHypercars < car_marketplace_1.MANUFACTURER_HYPERCAR_MIN_CARS) {
                return `Complete your homologated Hypercar programme (${car_marketplace_1.MANUFACTURER_HYPERCAR_MIN_CARS} cars) before adding experimental entries`;
            }
            const { min, max } = classId === "Hypercar"
                ? experimentalHypercarLimits(fleet, affiliation)
                : {
                    min: 1,
                    max: (0, experimental_entry_1.maxExperimentalCopies)(affiliation, classId),
                };
            if (experimental.length < min) {
                return `Experimental ${classId} programmes require at least ${min} entries`;
            }
            if (experimental.length > max) {
                return `At most ${max} experimental ${classId} entries allowed`;
            }
            if (homologated.length > 0) {
                const homKey = buildSpecKey(homologated[0].build);
                const expKey = buildSpecKey(experimental[0].build);
                if (homKey === expKey) {
                    return `Experimental ${classId} must use a different design than your homologated entries`;
                }
            }
        }
    }
    const numbers = new Set();
    for (const car of fleet) {
        if (numbers.has(car.carNumber)) {
            return `Duplicate car number #${car.carNumber}`;
        }
        numbers.add(car.carNumber);
    }
    return null;
}
function validateBuyCar(repoRoot, state, payload) {
    if (!payload.classId)
        return "Class is required";
    const catalogClasses = ["Hypercar", "LMP2", "LMGT3"];
    if (!catalogClasses.includes(payload.classId))
        return "Unknown class";
    if (payload.affiliation === "privateer" && payload.acquisition !== "privateer") {
        return "Privateer entries must acquire an existing platform";
    }
    if (payload.affiliation === "manufacturer" && payload.acquisition === "privateer") {
        return "Manufacturers build their own cars, they cannot buy a privateer slot";
    }
    if (payload.acquisition === "privateer") {
        if (!payload.platformId)
            return "Select a platform to run as privateer";
        const platform = (0, car_marketplace_1.platformById)(repoRoot, payload.platformId);
        if (!platform)
            return "Unknown platform";
        if (platform.classId !== payload.classId) {
            return `${platform.displayName} is not eligible for ${payload.classId}`;
        }
    }
    const fleet = state.fleet ?? [];
    const entryMode = payload.entryMode ?? "homologated";
    const homologated = getClassProgram(fleet, payload.classId, repoRoot, "homologated");
    const experimental = getClassProgram(fleet, payload.classId, repoRoot, "experimental");
    const existing = getClassProgram(fleet, payload.classId, repoRoot, entryMode);
    if (existing && !payloadMatchesClassProgram(existing, payload)) {
        return `You already have a ${existing.label} programme in ${payload.classId}. Sell those cars before switching platform or build type.`;
    }
    if (entryMode === "experimental") {
        const homMfgHypercars = manufacturerHypercarCount(fleet);
        if (payload.classId === "Hypercar" &&
            payload.affiliation === "manufacturer" &&
            homMfgHypercars > 0 &&
            homMfgHypercars < car_marketplace_1.MANUFACTURER_HYPERCAR_MIN_CARS) {
            return `Complete your homologated Hypercar programme (${car_marketplace_1.MANUFACTURER_HYPERCAR_MIN_CARS} cars) before adding experimental entries`;
        }
        const limits = payload.classId === "Hypercar"
            ? experimentalHypercarLimits(fleet, payload.affiliation)
            : {
                min: 1,
                max: (0, experimental_entry_1.maxExperimentalCopies)(payload.affiliation, payload.classId),
            };
        const nextCount = (experimental?.carCount ?? 0) + normalizeQuantity(payload.quantity);
        if (nextCount > limits.max) {
            return `At most ${limits.max} experimental ${payload.classId} entries allowed`;
        }
        if (!experimental && nextCount < limits.min) {
            return `Experimental ${payload.classId} programmes require at least ${limits.min} cars`;
        }
        if (payload.affiliation === "privateer" &&
            !experimental &&
            state.budget < experimental_entry_1.EXP_PRIVATEER_PROGRAMME_FEE) {
            return `Experimental privateer programmes require at least $${experimental_entry_1.EXP_PRIVATEER_PROGRAMME_FEE.toLocaleString()} for the development slot`;
        }
    }
    else if (homologated && experimental) {
        // both programmes allowed in same class
    }
    const cost = buyCarCost(repoRoot, payload, fleet);
    if (cost === null)
        return "Invalid car purchase";
    if (state.budget < cost) {
        return `Insufficient budget (need $${cost.toLocaleString()} for ${normalizeQuantity(payload.quantity)} car(s))`;
    }
    return null;
}
function createFleetCars(repoRoot, teamName, payload, fleet) {
    const qty = normalizeQuantity(payload.quantity);
    const cars = [];
    let working = [...fleet];
    for (let i = 0; i < qty; i++) {
        const car = createFleetCar(repoRoot, teamName, payload, working);
        if (!car)
            break;
        cars.push(car);
        working = [...working, car];
    }
    return cars;
}
function fleetRulesPayload() {
    return {
        startingBudget: economy_1.STARTING_BUDGET,
        manufacturerHypercarMinCars: car_marketplace_1.MANUFACTURER_HYPERCAR_MIN_CARS,
        oneCarTypePerClass: true,
        maxCarsPerPurchase: exports.MAX_CARS_PER_PURCHASE,
        costs: {
            manufacturerBuild: {
                Hypercar: (0, car_marketplace_1.manufacturerBuildCost)("Hypercar"),
                LMP2: (0, car_marketplace_1.manufacturerBuildCost)("LMP2"),
                LMGT3: (0, car_marketplace_1.manufacturerBuildCost)("LMGT3"),
            },
            privateerSlot: {
                Hypercar: (0, car_marketplace_1.privateerSlotCost)("Hypercar"),
                LMP2: (0, car_marketplace_1.privateerSlotCost)("LMP2"),
                LMGT3: (0, car_marketplace_1.privateerSlotCost)("LMGT3"),
            },
        },
        experimental: (0, experimental_entry_1.experimentalRulesPayload)(),
    };
}
