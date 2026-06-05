import type { CarSnapshot, SessionInitPayload } from "./ws/protocol";

const numbersByEntryId = new Map<string, number>();
const numbersByTeamName = new Map<string, number>();

export function setEntryNumbersFromSession(payload: SessionInitPayload): void {
  numbersByEntryId.clear();
  numbersByTeamName.clear();

  const fromRecord = payload.carNumberByEntryId ?? {};

  for (const entry of payload.entries ?? []) {
    const parsed = Number(entry.carNumber ?? fromRecord[entry.entryId]);
    if (!Number.isFinite(parsed) || parsed <= 0) continue;
    numbersByEntryId.set(entry.entryId, parsed);
    numbersByTeamName.set(entry.teamName, parsed);
  }
}

export function resolveCarNumber(snap: CarSnapshot): number {
  const direct = Number(snap.carNumber);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const byId = numbersByEntryId.get(snap.entryId);
  if (byId !== undefined && byId > 0) return byId;

  const byTeam = numbersByTeamName.get(snap.teamName);
  if (byTeam !== undefined && byTeam > 0) return byTeam;

  return 0;
}

export function formatCarNumber(snap: CarSnapshot): string {
  const n = resolveCarNumber(snap);
  return n > 0 ? String(n) : "";
}

export function enrichSnapshots(snapshots: CarSnapshot[]): CarSnapshot[] {
  return snapshots.map((snap) => {
    const carNumber = resolveCarNumber(snap);
    return carNumber > 0 ? { ...snap, carNumber } : snap;
  });
}
