import type { TrackJson } from "@server/game/track_json";

export interface TrackListEntry {
  id: string;
  displayName: string;
  jsonPath: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return body;
}

export async function fetchTrackList(): Promise<TrackListEntry[]> {
  const data = await request<{ tracks: TrackListEntry[] }>("/api/tracks");
  return data.tracks;
}

export async function fetchTrack(trackId: string): Promise<TrackJson> {
  const data = await request<{ track: TrackJson }>(`/api/tracks/${encodeURIComponent(trackId)}`);
  return data.track;
}

export async function fetchDraftList(): Promise<string[]> {
  const data = await request<{ drafts: string[] }>("/api/drafts");
  return data.drafts;
}

export async function fetchDraft(filename: string): Promise<TrackJson> {
  const data = await request<{ track: TrackJson }>(
    `/api/drafts/${encodeURIComponent(filename)}`,
  );
  return data.track;
}

export async function saveDraft(filename: string, track: TrackJson): Promise<string> {
  const data = await request<{ path: string }>("/api/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, track }),
  });
  return data.path;
}
