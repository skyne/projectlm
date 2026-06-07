import * as fs from "fs";
import * as path from "path";
import type { CarConditionPayload, CarSnapshot, HiddenFaultPayload } from "../ws_protocol";

export function snapshotToCarCondition(snap: CarSnapshot): CarConditionPayload {
  const hiddenFaults = (snap.hiddenFaults ?? []).map((f) => ({ ...f }));
  return {
    partHealth: { ...(snap.partHealth ?? {}) },
    irreparable: [...(snap.partIrreparable ?? [])],
    hiddenFaults: hiddenFaults.length ? hiddenFaults : undefined,
    limpMode: snap.limpMode !== "none" ? snap.limpMode : undefined,
    structuralSeverity: snap.structuralSeverity,
  };
}

export function serializeCarConditionLine(
  entryId: string,
  condition: CarConditionPayload,
): string {
  const parts: string[] = [entryId];
  for (const [part, health] of Object.entries(condition.partHealth ?? {})) {
    if (health < 99.5) parts.push(`${part}=${health.toFixed(1)}`);
  }
  if (condition.irreparable?.length) {
    parts.push(`irreparable=${condition.irreparable.join(",")}`);
  }
  for (const fault of condition.hiddenFaults ?? []) {
    parts.push(
      `fault=${fault.id}|${fault.kind}|${fault.linkedPart}|${fault.severity.toFixed(1)}|${fault.revealed ? 1 : 0}`,
    );
  }
  return `condition=${parts.join("|")}`;
}

export function writeCarConditionsFile(
  absPath: string,
  rows: Array<{ entryId: string; condition?: CarConditionPayload }>,
): void {
  const lines = ["# Runtime car conditions — generated from meta fleet state"];
  for (const row of rows) {
    if (!row.condition) continue;
    const hasDamage =
      Object.keys(row.condition.partHealth ?? {}).length > 0 ||
      (row.condition.irreparable?.length ?? 0) > 0 ||
      (row.condition.hiddenFaults?.length ?? 0) > 0;
    if (!hasDamage) continue;
    lines.push(serializeCarConditionLine(row.entryId, row.condition));
  }
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, lines.join("\n") + "\n");
}

export function repairCarCondition(
  condition: CarConditionPayload | undefined,
  options?: { parts?: string[]; rebuild?: boolean; reveal?: boolean },
): CarConditionPayload {
  const next: CarConditionPayload = {
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

export function mergeHiddenFaults(
  existing: HiddenFaultPayload[] | undefined,
  incoming: HiddenFaultPayload[] | undefined,
): HiddenFaultPayload[] | undefined {
  if (!incoming?.length) return existing?.length ? [...existing] : undefined;
  const byId = new Map((existing ?? []).map((f) => [f.id, f]));
  for (const fault of incoming) {
    const prev = byId.get(fault.id);
    byId.set(fault.id, prev ? { ...prev, ...fault, revealed: prev.revealed || fault.revealed } : fault);
  }
  const merged = [...byId.values()];
  return merged.length ? merged : undefined;
}
