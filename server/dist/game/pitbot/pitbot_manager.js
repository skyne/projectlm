"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PitBotManager = void 0;
const pit_wall_1 = require("./pit_wall");
/** Built-in opponent AI — PitBot pit-wall for non-player entries. */
class PitBotManager {
    constructor() {
        this.carState = new Map();
        this.opponentEntryIds = [];
        this.gridSetupDone = false;
    }
    reset() {
        this.carState.clear();
        this.opponentEntryIds = [];
        this.gridSetupDone = false;
    }
    opponentIds(snapshots, managedEntryIds) {
        return snapshots
            .filter((s) => !managedEntryIds.has(s.entryId) && !s.retired)
            .map((s) => s.entryId);
    }
    tick(snapshots, managedEntryIds, ctx, submitCommand) {
        const managed = managedEntryIds instanceof Set
            ? managedEntryIds
            : new Set(managedEntryIds);
        const opponents = this.opponentIds(snapshots, managed);
        this.opponentEntryIds = opponents;
        const wet = ctx.trackWetness ?? 0;
        const phase = ctx.weekendSessionType ?? "race";
        if (this.carState.size === 0 && opponents.length > 0) {
            this.carState = (0, pit_wall_1.initCarState)(opponents, wet);
        }
        for (const id of opponents) {
            if (!this.carState.has(id)) {
                this.carState.set(id, (0, pit_wall_1.initCarState)([id], wet).get(id));
            }
        }
        const actions = [];
        if (!this.gridSetupDone && opponents.length > 0) {
            for (const action of (0, pit_wall_1.gridSetupCommands)(snapshots, opponents, wet, ctx.getStintPlan, ctx.getBriefingTactics)) {
                if (submitCommand(action.entryId, action.command)) {
                    actions.push(action);
                }
            }
            this.gridSetupDone = true;
        }
        actions.push(...(0, pit_wall_1.tickPitBot)(snapshots, opponents, this.carState, {
            phase,
            wet,
            raceTimeSec: ctx.raceTimeSec,
            flagPhase: ctx.flagPhase,
            fcyActive: ctx.fcyActive,
            scActive: ctx.scActive,
            rivalPitAggression: ctx.rivalPitAggression,
            getStintPlan: ctx.getStintPlan,
            getBriefingTactics: ctx.getBriefingTactics,
            strategistSkill: ctx.strategistSkill,
        }, submitCommand));
        return actions;
    }
}
exports.PitBotManager = PitBotManager;
