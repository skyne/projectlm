import type { CarSnapshot } from "../ws_protocol";
import {
  fallbackStintPlan,
  planStintWithLlm,
  type AiStintPlan,
} from "./stint_plan";

export interface StintGuideContext {
  trackName: string;
  targetDurationSeconds: number;
  raceTimeSec: number;
}

const MAX_CONCURRENT = 6;

export class AiStintGuide {
  private plans = new Map<string, AiStintPlan>();
  private pitCounts = new Map<string, number>();
  private planning = new Set<string>();
  private queue: Array<{ snap: CarSnapshot; stintNumber: number }> = [];
  private raceStarted = false;
  private enabled = process.env.AI_STINT_LLM !== "0";

  reset(): void {
    this.plans.clear();
    this.pitCounts.clear();
    this.planning.clear();
    this.queue = [];
    this.raceStarted = false;
  }

  getPlan(entryId: string): AiStintPlan | undefined {
    return this.plans.get(entryId);
  }

  observe(
    snapshots: CarSnapshot[],
    managedEntryIds: string[] | Set<string>,
    ctx: StintGuideContext,
  ): void {
    const managed =
      managedEntryIds instanceof Set
        ? managedEntryIds
        : new Set(managedEntryIds);
    const aiSnaps = snapshots.filter(
      (s) => !managed.has(s.entryId) && !s.retired,
    );

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

  private schedule(snap: CarSnapshot, stintNumber: number, ctx: StintGuideContext): void {
    if (!this.enabled) {
      this.plans.set(snap.entryId, fallbackStintPlan(snap, stintNumber));
      return;
    }
    this.queue.push({ snap, stintNumber });
    void ctx;
  }

  private drainQueue(ctx: StintGuideContext): void {
    while (this.planning.size < MAX_CONCURRENT && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;
      const key = `${job.snap.entryId}:${job.stintNumber}`;
      if (this.planning.has(key)) continue;
      this.planning.add(key);
      void this.runPlan(job.snap, job.stintNumber, ctx, key);
    }
  }

  private async runPlan(
    snap: CarSnapshot,
    stintNumber: number,
    ctx: StintGuideContext,
    key: string,
  ): Promise<void> {
    try {
      const plan = await planStintWithLlm({
        snap,
        stintNumber,
        trackName: ctx.trackName,
        targetDurationSeconds: ctx.targetDurationSeconds,
        raceTimeSec: ctx.raceTimeSec,
      });
      this.plans.set(snap.entryId, plan);
      console.log(
        `[ai_stint] ${snap.teamName} stint ${stintNumber}: ${plan.compound}/${plan.driverMode} (~${Math.round(plan.targetStintSeconds / 60)}m) ${plan.offline ? "[fallback]" : ""}`,
      );
    } finally {
      this.planning.delete(key);
    }
  }
}
