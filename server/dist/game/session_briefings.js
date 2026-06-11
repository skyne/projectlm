"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionBriefingStore = void 0;
const briefing_tactics_1 = require("./briefing_tactics");
class SessionBriefingStore {
    constructor() {
        this.byEntryId = new Map();
        this.sessionType = "race";
        this.classByEntry = new Map();
        this.staff = [];
        this.fleetCarByEntry = new Map();
    }
    reset() {
        this.byEntryId.clear();
        this.classByEntry.clear();
        this.fleetCarByEntry.clear();
        this.sessionType = "race";
        this.staff = [];
    }
    exportState() {
        return {
            byEntryId: Object.fromEntries(this.byEntryId.entries()),
            sessionType: this.sessionType,
            classByEntry: [...this.classByEntry.entries()],
            fleetCarByEntry: [...this.fleetCarByEntry.entries()],
            staff: this.staff,
        };
    }
    importState(data) {
        this.byEntryId = new Map(Object.entries(data.byEntryId));
        this.sessionType = data.sessionType;
        this.classByEntry = new Map(data.classByEntry);
        this.fleetCarByEntry = new Map(data.fleetCarByEntry);
        this.staff = data.staff ?? [];
    }
    load(sessionType, entries, managedEntryIds, carBriefings, staff, rivalPitAggression) {
        this.reset();
        this.sessionType = sessionType;
        this.staff = staff ?? [];
        const briefingByCarId = new Map((carBriefings ?? []).map((b) => [b.carId, b]));
        const managed = new Set(managedEntryIds);
        const teamClassBuckets = new Map();
        for (const entry of entries) {
            this.classByEntry.set(entry.entryId, entry.classId);
            if (entry.fleetCarId) {
                this.fleetCarByEntry.set(entry.entryId, entry.fleetCarId);
            }
            const key = `${entry.teamName}::${entry.classId}`;
            const bucket = teamClassBuckets.get(key) ?? [];
            bucket.push(entry);
            teamClassBuckets.set(key, bucket);
        }
        for (const [, bucket] of teamClassBuckets) {
            bucket.sort((a, b) => a.entryId.localeCompare(b.entryId));
        }
        for (const entry of entries) {
            const fleetCarId = entry.fleetCarId;
            if (managed.has(entry.entryId) && fleetCarId) {
                const raw = briefingByCarId.get(fleetCarId);
                if (raw) {
                    this.byEntryId.set(entry.entryId, {
                        entryId: entry.entryId,
                        briefingId: raw.briefingId,
                        priority: raw.priority,
                        teammatePolicy: raw.teammatePolicy,
                        gapHoldSec: raw.gapHoldSec,
                    });
                    continue;
                }
            }
            const key = `${entry.teamName}::${entry.classId}`;
            const bucket = teamClassBuckets.get(key) ?? [entry];
            const gridIndex = bucket.findIndex((e) => e.entryId === entry.entryId);
            const ai = (0, briefing_tactics_1.deriveAiBriefing)(sessionType, {
                gridIndex: Math.max(0, gridIndex),
                teamSize: bucket.length,
                pitAggression: rivalPitAggression?.(entry.teamName),
                classId: entry.classId,
            });
            this.byEntryId.set(entry.entryId, {
                entryId: entry.entryId,
                briefingId: ai.briefingId,
                priority: ai.priority,
                teammatePolicy: ai.teammatePolicy,
                gapHoldSec: ai.gapHoldSec,
            });
        }
    }
    getEntryBriefing(entryId) {
        return this.byEntryId.get(entryId);
    }
    toRecord() {
        return Object.fromEntries(this.byEntryId);
    }
    updateEntry(entryId, patch) {
        const cur = this.byEntryId.get(entryId);
        if (!cur)
            return;
        this.byEntryId.set(entryId, { ...cur, ...patch, entryId });
    }
    getTactics(entryId) {
        const raw = this.byEntryId.get(entryId);
        if (!raw)
            return undefined;
        const classId = this.classByEntry.get(entryId) ?? "Hypercar";
        const carId = this.fleetCarByEntry.get(entryId);
        return (0, briefing_tactics_1.resolveBriefingTactics)({
            carId: carId ?? "",
            briefingId: raw.briefingId,
            priority: raw.priority,
            teammatePolicy: raw.teammatePolicy,
            gapHoldSec: raw.gapHoldSec,
        }, this.sessionType, classId);
    }
    strategistSkill(entryId) {
        const carId = entryId ? this.fleetCarByEntry.get(entryId) : undefined;
        return (0, briefing_tactics_1.strategistSkillForBriefing)(this.staff, carId);
    }
}
exports.SessionBriefingStore = SessionBriefingStore;
