"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiStintGuide = void 0;
const stint_plan_1 = require("./stint_plan");
const MAX_CONCURRENT = 6;
class AiStintGuide {
    constructor() {
        this.plans = new Map();
        this.pitCounts = new Map();
        this.planning = new Set();
        this.queue = [];
        this.raceStarted = false;
        this.enabled = process.env.AI_STINT_LLM !== "0";
    }
    reset() {
        this.plans.clear();
        this.pitCounts.clear();
        this.planning.clear();
        this.queue = [];
        this.raceStarted = false;
    }
    exportState() {
        return {
            plans: [...this.plans.entries()],
            pitCounts: [...this.pitCounts.entries()],
            raceStarted: this.raceStarted,
        };
    }
    importState(data) {
        this.plans = new Map(data.plans);
        this.pitCounts = new Map(data.pitCounts);
        this.planning.clear();
        this.queue = [];
        this.raceStarted = data.raceStarted;
    }
    getPlan(entryId) {
        return this.plans.get(entryId);
    }
    observe(snapshots, managedEntryIds, ctx) {
        const managed = managedEntryIds instanceof Set
            ? managedEntryIds
            : new Set(managedEntryIds);
        const aiSnaps = snapshots.filter((s) => !managed.has(s.entryId) && !s.retired);
        if (!this.raceStarted && ctx.raceTimeSec >= 0 && aiSnaps.length > 0) {
            this.raceStarted = true;
            for (const snap of aiSnaps) {
                this.schedule(snap, 1, ctx);
                this.pitCounts.set(snap.entryId, snap.pitCount ?? 0);
            }
        }
        for (const snap of aiSnaps) {
            const prev = this.pitCounts.get(snap.entryId) ?? 0;
            const cur = snap.pitCount ?? 0;
            if (cur > prev) {
                this.schedule(snap, cur + 1, ctx);
            }
            this.pitCounts.set(snap.entryId, cur);
        }
        this.drainQueue(ctx);
    }
    schedule(snap, stintNumber, ctx) {
        if (!this.enabled) {
            this.plans.set(snap.entryId, (0, stint_plan_1.fallbackStintPlan)(snap, stintNumber));
            return;
        }
        this.queue.push({ snap, stintNumber });
        void ctx;
    }
    drainQueue(ctx) {
        while (this.planning.size < MAX_CONCURRENT && this.queue.length > 0) {
            const job = this.queue.shift();
            if (!job)
                break;
            const key = `${job.snap.entryId}:${job.stintNumber}`;
            if (this.planning.has(key))
                continue;
            this.planning.add(key);
            void this.runPlan(job.snap, job.stintNumber, ctx, key);
        }
    }
    async runPlan(snap, stintNumber, ctx, key) {
        try {
            const plan = await (0, stint_plan_1.planStintWithLlm)({
                snap,
                stintNumber,
                trackName: ctx.trackName,
                targetDurationSeconds: ctx.targetDurationSeconds,
                raceTimeSec: ctx.raceTimeSec,
            });
            this.plans.set(snap.entryId, plan);
            console.log(`[ai_stint] ${snap.teamName} stint ${stintNumber}: ${plan.compound}/${plan.driverMode} (~${Math.round(plan.targetStintSeconds / 60)}m) ${plan.offline ? "[fallback]" : ""}`);
        }
        finally {
            this.planning.delete(key);
        }
    }
}
exports.AiStintGuide = AiStintGuide;
