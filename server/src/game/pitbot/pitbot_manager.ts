import type { CarSnapshot, WeekendSessionType } from "../../ws_protocol";
import {
  gridSetupCommands,
  initCarState,
  tickPitBot,
  type CarPitState,
  type PitBotAction,
} from "./pit_wall";
import type { PlannerSnap } from "./pit_planner";

export interface PitBotManagerContext {
  trackWetness?: number;
  weekendSessionType?: WeekendSessionType;
  rivalPitAggression?: (teamName: string) => number;
  getStintPlan?: (entryId: string) => import("../../llm/stint_plan").AiStintPlan | undefined;
}

/** Built-in opponent AI — PitBot pit-wall for non-player entries. */
export class PitBotManager {
  private carState = new Map<string, CarPitState>();
  private opponentEntryIds: string[] = [];
  private gridSetupDone = false;

  reset(): void {
    this.carState.clear();
    this.opponentEntryIds = [];
    this.gridSetupDone = false;
  }

  private opponentIds(
    snapshots: CarSnapshot[],
    managedEntryIds: Set<string>,
  ): string[] {
    return snapshots
      .filter((s) => !managedEntryIds.has(s.entryId) && !s.retired)
      .map((s) => s.entryId);
  }

  tick(
    snapshots: CarSnapshot[],
    managedEntryIds: string[] | Set<string>,
    ctx: PitBotManagerContext,
    submitCommand: (entryId: string, command: string) => boolean,
  ): PitBotAction[] {
    const managed =
      managedEntryIds instanceof Set
        ? managedEntryIds
        : new Set(managedEntryIds);
    const opponents = this.opponentIds(snapshots, managed);
    this.opponentEntryIds = opponents;

    const wet = ctx.trackWetness ?? 0;
    const phase = ctx.weekendSessionType ?? "race";

    if (this.carState.size === 0 && opponents.length > 0) {
      this.carState = initCarState(opponents, wet);
    }

    for (const id of opponents) {
      if (!this.carState.has(id)) {
        this.carState.set(
          id,
          initCarState([id], wet).get(id)!,
        );
      }
    }

    const actions: PitBotAction[] = [];

    if (!this.gridSetupDone && opponents.length > 0) {
      for (const action of gridSetupCommands(
        snapshots as PlannerSnap[],
        opponents,
        wet,
        ctx.getStintPlan,
      )) {
        if (submitCommand(action.entryId, action.command)) {
          actions.push(action);
        }
      }
      this.gridSetupDone = true;
    }

    actions.push(
      ...tickPitBot(
        snapshots as PlannerSnap[],
        opponents,
        this.carState,
        {
          phase,
          wet,
          rivalPitAggression: ctx.rivalPitAggression,
          getStintPlan: ctx.getStintPlan,
        },
        submitCommand,
      ),
    );

    return actions;
  }
}
