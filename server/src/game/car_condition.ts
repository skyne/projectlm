import * as fs from "fs";
import * as path from "path";
import type { CarConditionPayload, CarSnapshot } from "../ws_protocol";

export function snapshotToCarCondition(snap: CarSnapshot): CarConditionPayload {
  return {
    partHealth: { ...(snap.partHealth ?? {}) },
    irreparable: [...(snap.partIrreparable ?? [])],
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
      (row.condition.irreparable?.length ?? 0) > 0;
    if (!hasDamage) continue;
    lines.push(serializeCarConditionLine(row.entryId, row.condition));
  }
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, lines.join("\n") + "\n");
}

export function repairCarCondition(
  condition: CarConditionPayload | undefined,
  options?: { parts?: string[]; rebuild?: boolean },
): CarConditionPayload {
  const next: CarConditionPayload = {
    partHealth: { ...(condition?.partHealth ?? {}) },
    irreparable: [...(condition?.irreparable ?? [])],
    hiddenFaults: condition?.hiddenFaults ? [...condition.hiddenFaults] : [],
    limpMode: undefined,
    structuralSeverity: 0,
  };
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
