import type { CarSnapshot, SessionInitPayload } from "./ws/protocol";

const numbersByEntryId = new Map<string, string>();

export function setEntryNumbersFromSession(payload: SessionInitPayload): void {
  numbersByEntryId.clear();

  const fromRecord = payload.carNumberByEntryId ?? {};

  for (const entry of payload.entries ?? []) {
    const parsed = entry.carNumber ?? fromRecord[entry.entryId];
    if (!parsed) continue;
    numbersByEntryId.set(entry.entryId, String(parsed));
  }
}

export function resolveCarNumber(snap: CarSnapshot): string {
  if (typeof snap.carNumber === "string" && snap.carNumber) return snap.carNumber;

  const byId = numbersByEntryId.get(snap.entryId);
  if (byId) return byId;

  return "";
}

export function formatCarNumber(snap: CarSnapshot): string {
  return resolveCarNumber(snap);
}

/** Short class prefix for map labels when numbers collide across classes. */
export function classMapPrefix(classId: string): string {
  switch (classId) {
    case "Hypercar":
      return "H";
    case "LMGT3":
      return "G";
    case "LMP2":
      return "P";
    default:
      return classId.slice(0, 1).toUpperCase();
  }
}

export function formatMapCarLabel(snap: CarSnapshot): string {
  const num = formatCarNumber(snap);
  if (!num) return "?";
  return `${classMapPrefix(snap.classId)}${num}`;
}

export function enrichSnapshots(snapshots: CarSnapshot[]): CarSnapshot[] {
  return snapshots.map((snap) => {
    const carNumber = resolveCarNumber(snap);
    return carNumber ? { ...snap, carNumber } : snap;
  });
}
