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
exports.BUILD_FIELD_BY_CONFIG_SLOT = void 0;
exports.loadAssemblyRules = loadAssemblyRules;
exports.buildFieldValue = buildFieldValue;
exports.validateAssemblyCompatibility = validateAssemblyCompatibility;
exports.isAssemblyPartCompatible = isAssemblyPartCompatible;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** Config slot names in part_compatibility.txt → CarBuildPayload fields. */
exports.BUILD_FIELD_BY_CONFIG_SLOT = {
    chassis: "chassis_type",
    front_aero: "front_aero_type",
    rear_aero: "rear_aero_type",
    cooling: "cooling_pack",
    wheel_package: "wheel_package",
    suspension: "suspension_layout",
    fuel_system: "fuel_system",
    brake_system: "brake_system",
    transmission: "transmission",
    hybrid_system: "hybrid_system",
};
function trim(s) {
    return s.trim();
}
function loadAssemblyRules(repoRoot) {
    const file = path.join(repoRoot, "configs/part_compatibility.txt");
    if (!fs.existsSync(file))
        return [];
    const rules = [];
    let current = null;
    const flush = () => {
        if (!current?.ifSlot || !current.ifPart || !current.requiresSlot) {
            current = null;
            return;
        }
        if (current.kind === "requires" && current.requiresPart) {
            rules.push({
                kind: "requires",
                ifSlot: current.ifSlot,
                ifPart: current.ifPart,
                requiresSlot: current.requiresSlot,
                requiresPart: current.requiresPart,
            });
        }
        else if (current.requiresAnyParts.length > 0) {
            rules.push({
                kind: "requires_any",
                ifSlot: current.ifSlot,
                ifPart: current.ifPart,
                requiresSlot: current.requiresSlot,
                requiresAnyParts: current.requiresAnyParts,
            });
        }
        current = null;
    };
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        const trimmed = trim(line);
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const eq = trimmed.indexOf("=");
        if (eq < 0)
            continue;
        const key = trim(trimmed.slice(0, eq));
        const value = trim(trimmed.slice(eq + 1));
        if (key === "rule") {
            flush();
            current = { kind: "requires_any", requiresAnyParts: [] };
        }
        else if (!current) {
            continue;
        }
        else if (key === "if_slot") {
            current.ifSlot = value;
        }
        else if (key === "if_part") {
            current.ifPart = value;
        }
        else if (key === "requires_slot") {
            current.requiresSlot = value;
        }
        else if (key === "requires_part") {
            current.kind = "requires";
            current.requiresPart = value;
        }
        else if (key === "requires_any_parts") {
            current.kind = "requires_any";
            current.requiresAnyParts = value.split(",").map(trim).filter(Boolean);
        }
    }
    flush();
    return rules;
}
function buildFieldValue(build, configSlot) {
    const field = exports.BUILD_FIELD_BY_CONFIG_SLOT[configSlot];
    if (!field)
        return "";
    const value = build[field];
    return typeof value === "string" ? value : "";
}
function validateFuelSystemPowertrain(build) {
    if (build.fuel_system === "HydrogenTank" &&
        build.engine?.fuel_type !== "Hydrogen") {
        return "Hydrogen tank requires Hydrogen fuel in the powertrain";
    }
    return null;
}
function validateAssemblyCompatibility(build, rules) {
    for (const rule of rules) {
        if (buildFieldValue(build, rule.ifSlot) !== rule.ifPart)
            continue;
        const other = buildFieldValue(build, rule.requiresSlot);
        if (rule.kind === "requires") {
            if (other !== rule.requiresPart) {
                return `${rule.ifPart} requires ${rule.requiresPart} on ${rule.requiresSlot}`;
            }
        }
        else if (!rule.requiresAnyParts.includes(other)) {
            return `${rule.ifPart} is not compatible with ${other} on ${rule.requiresSlot}`;
        }
    }
    if (build.rear_aero_type === "WinglessGroundEffect" &&
        build.front_aero_type !== "LowDragNose") {
        return "Wingless rear package requires Low Drag Nose";
    }
    return validateFuelSystemPowertrain(build);
}
/** True when selecting `candidatePart` for `configSlot` keeps the build valid. */
function isAssemblyPartCompatible(build, configSlot, candidatePart, rules) {
    const field = exports.BUILD_FIELD_BY_CONFIG_SLOT[configSlot];
    if (!field)
        return true;
    const preview = { ...build, [field]: candidatePart };
    return validateAssemblyCompatibility(preview, rules) === null;
}
