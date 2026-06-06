import type { CarSnapshot, SessionInitPayload } from "./ws/protocol";

const numbersByEntryId = new Map<string, string>();
const numbersByTeamName = new Map<string, string>();

export function setEntryNumbersFromSession(payload: SessionInitPayload): void {
  numbersByEntryId.clear();
  numbersByTeamName.clear();

  const fromRecord = payload.carNumberByEntryId ?? {};

  for (const entry of payload.entries ?? []) {
    const parsed = entry.carNumber ?? fromRecord[entry.entryId];
    if (!parsed) continue;
    numbersByEntryId.set(entry.entryId, parsed);
    numbersByTeamName.set(entry.teamName, parsed);
  }
}

export function resolveCarNumber(snap: CarSnapshot): string {
  if (typeof snap.carNumber === "string" && snap.carNumber) return snap.carNumber;

  const byId = numbersByEntryId.get(snap.entryId);
  if (byId) return byId;

  const byTeam = numbersByTeamName.get(snap.teamName);
  if (byTeam) return byTeam;

  return "";
}

export function formatCarNumber(snap: CarSnapshot): string {
  return resolveCarNumber(snap);
}

export function enrichSnapshots(snapshots: CarSnapshot[]): CarSnapshot[] {
  return snapshots.map((snap) => {
    const carNumber = resolveCarNumber(snap);
    return carNumber ? { ...snap, carNumber } : snap;
  });
}
