import type {
  CarSessionBriefing,
  EntrySessionBriefing,
  StaffMemberPayload,
  WeekendSessionType,
} from "../ws_protocol";
import {
  deriveAiBriefing,
  resolveBriefingTactics,
  strategistSkillForBriefing,
  type BriefingTactics,
} from "./briefing_tactics";

export interface SessionBriefingEntry {
  entryId: string;
  teamName: string;
  classId: string;
  fleetCarId?: string;
}

export class SessionBriefingStore {
  private byEntryId = new Map<string, EntrySessionBriefing>();
  private sessionType: WeekendSessionType = "race";
  private classByEntry = new Map<string, string>();
  private staff: StaffMemberPayload[] = [];
  private fleetCarByEntry = new Map<string, string>();

  reset(): void {
    this.byEntryId.clear();
    this.classByEntry.clear();
    this.fleetCarByEntry.clear();
    this.sessionType = "race";
    this.staff = [];
  }

  exportState(): {
    byEntryId: Record<string, EntrySessionBriefing>;
    sessionType: WeekendSessionType;
    classByEntry: [string, string][];
    fleetCarByEntry: [string, string][];
    staff: StaffMemberPayload[];
  } {
    return {
      byEntryId: Object.fromEntries(this.byEntryId.entries()),
      sessionType: this.sessionType,
      classByEntry: [...this.classByEntry.entries()],
      fleetCarByEntry: [...this.fleetCarByEntry.entries()],
      staff: this.staff,
    };
  }

  importState(data: {
    byEntryId: Record<string, EntrySessionBriefing>;
    sessionType: WeekendSessionType;
    classByEntry: [string, string][];
    fleetCarByEntry: [string, string][];
    staff: StaffMemberPayload[];
  }): void {
    this.byEntryId = new Map(Object.entries(data.byEntryId));
    this.sessionType = data.sessionType;
    this.classByEntry = new Map(data.classByEntry);
    this.fleetCarByEntry = new Map(data.fleetCarByEntry);
    this.staff = data.staff ?? [];
  }

  load(
    sessionType: WeekendSessionType,
    entries: SessionBriefingEntry[],
    managedEntryIds: string[],
    carBriefings: CarSessionBriefing[] | undefined,
    staff: StaffMemberPayload[] | undefined,
    rivalPitAggression?: (teamName: string) => number,
  ): void {
    this.reset();
    this.sessionType = sessionType;
    this.staff = staff ?? [];

    const briefingByCarId = new Map(
      (carBriefings ?? []).map((b) => [b.carId, b]),
    );
    const managed = new Set(managedEntryIds);

    const teamClassBuckets = new Map<string, SessionBriefingEntry[]>();
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
      const ai = deriveAiBriefing(sessionType, {
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

  getEntryBriefing(entryId: string): EntrySessionBriefing | undefined {
    return this.byEntryId.get(entryId);
  }

  toRecord(): Record<string, EntrySessionBriefing> {
    return Object.fromEntries(this.byEntryId);
  }

  updateEntry(entryId: string, patch: Partial<EntrySessionBriefing>): void {
    const cur = this.byEntryId.get(entryId);
    if (!cur) return;
    this.byEntryId.set(entryId, { ...cur, ...patch, entryId });
  }

  getTactics(entryId: string): BriefingTactics | undefined {
    const raw = this.byEntryId.get(entryId);
    if (!raw) return undefined;
    const classId = this.classByEntry.get(entryId) ?? "Hypercar";
    const carId = this.fleetCarByEntry.get(entryId);
    return resolveBriefingTactics(
      {
        carId: carId ?? "",
        briefingId: raw.briefingId,
        priority: raw.priority,
        teammatePolicy: raw.teammatePolicy,
        gapHoldSec: raw.gapHoldSec,
      },
      this.sessionType,
      classId,
    );
  }

  strategistSkill(entryId?: string): number {
    const carId = entryId ? this.fleetCarByEntry.get(entryId) : undefined;
    return strategistSkillForBriefing(this.staff, carId);
  }
}
