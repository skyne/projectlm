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
exports.snapshotToCarCondition = snapshotToCarCondition;
exports.serializeCarConditionLine = serializeCarConditionLine;
exports.writeCarConditionsFile = writeCarConditionsFile;
exports.repairCarCondition = repairCarCondition;
exports.mergeHiddenFaults = mergeHiddenFaults;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function snapshotToCarCondition(snap) {
    const hiddenFaults = (snap.hiddenFaults ?? []).map((f) => ({ ...f }));
    return {
        partHealth: { ...(snap.partHealth ?? {}) },
        irreparable: [...(snap.partIrreparable ?? [])],
        hiddenFaults: hiddenFaults.length ? hiddenFaults : undefined,
        limpMode: snap.limpMode !== "none" ? snap.limpMode : undefined,
        structuralSeverity: snap.structuralSeverity,
    };
}
function serializeCarConditionLine(entryId, condition) {
    const parts = [entryId];
    for (const [part, health] of Object.entries(condition.partHealth ?? {})) {
        if (health < 99.5)
            parts.push(`${part}=${health.toFixed(1)}`);
    }
    if (condition.irreparable?.length) {
        parts.push(`irreparable=${condition.irreparable.join(",")}`);
    }
    for (const fault of condition.hiddenFaults ?? []) {
        parts.push(`fault=${fault.id}|${fault.kind}|${fault.linkedPart}|${fault.severity.toFixed(1)}|${fault.revealed ? 1 : 0}`);
    }
    return `condition=${parts.join("|")}`;
}
function writeCarConditionsFile(absPath, rows) {
    const lines = ["# Runtime car conditions — generated from meta fleet state"];
    for (const row of rows) {
        if (!row.condition)
            continue;
        const hasDamage = Object.keys(row.condition.partHealth ?? {}).length > 0 ||
            (row.condition.irreparable?.length ?? 0) > 0 ||
            (row.condition.hiddenFaults?.length ?? 0) > 0;
        if (!hasDamage)
            continue;
        lines.push(serializeCarConditionLine(row.entryId, row.condition));
    }
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, lines.join("\n") + "\n");
}
function repairCarCondition(condition, options) {
    const next = {
        partHealth: { ...(condition?.partHealth ?? {}) },
        irreparable: [...(condition?.irreparable ?? [])],
        hiddenFaults: condition?.hiddenFaults ? [...condition.hiddenFaults] : [],
        limpMode: undefined,
        structuralSeverity: 0,
    };
    if (options?.reveal) {
        return {
            ...next,
            hiddenFaults: (next.hiddenFaults ?? []).map((f) => ({ ...f, revealed: true })),
        };
    }
    if (options?.rebuild) {
        return {
            partHealth: {},
            irreparable: [],
            hiddenFaults: (next.hiddenFaults ?? []).map((f) => ({ ...f, revealed: true })),
            structuralSeverity: 0,
        };
    }
    const targets = options?.parts?.length
        ? options.parts
        : Object.keys(next.partHealth);
    for (const part of targets) {
        delete next.partHealth[part];
        next.irreparable = next.irreparable.filter((p) => p !== part);
    }
    return next;
}
function mergeHiddenFaults(existing, incoming) {
    if (!incoming?.length)
        return existing?.length ? [...existing] : undefined;
    const byId = new Map((existing ?? []).map((f) => [f.id, f]));
    for (const fault of incoming) {
        const prev = byId.get(fault.id);
        byId.set(fault.id, prev ? { ...prev, ...fault, revealed: prev.revealed || fault.revealed } : fault);
    }
    const merged = [...byId.values()];
    return merged.length ? merged : undefined;
}
