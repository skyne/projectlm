import type { CarSnapshot, SessionInitPayload } from "./ws/protocol";

let numbersByEntryId = new Map<string, number>();

export function setEntryNumbersFromSession(payload: SessionInitPayload): void {
  numbersByEntryId = new Map(
    payload.entries.map((entry) => [entry.entryId, entry.carNumber]),
  );
}

export function resolveCarNumber(snap: CarSnapshot): number {
  if (snap.carNumber > 0) return snap.carNumber;
  const fromSession = numbersByEntryId.get(snap.entryId);
  if (fromSession !== undefined && fromSession > 0) return fromSession;
  return 0;
}

export function enrichSnapshots(snapshots: CarSnapshot[]): CarSnapshot[] {
  return snapshots.map((snap) => ({
    ...snap,
    carNumber: resolveCarNumber(snap),
  }));
}
