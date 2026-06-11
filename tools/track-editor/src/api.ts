import { createServer, type IncomingMessage } from "http";
import * as fs from "fs";
import * as path from "path";
import { TRACK_CATALOG } from "@server/game/track_catalog";
import {
  parseTrackJson,
  trackJsonToFile,
  validateTrackJson,
} from "@server/game/track_exporter";
import { loadTrackJsonFromPath } from "@server/game/track_loader";
import type { TrackJson } from "@server/game/track_json";

const repoRoot = process.env.PROJECTLM_ROOT ?? path.resolve(import.meta.dirname, "../../..");
const port = Number(process.env.TRACK_EDITOR_API_PORT ?? 5191);
const draftsDir = path.join(repoRoot, "tracks", "drafts");

function ensureDraftsDir(): void {
  fs.mkdirSync(draftsDir, { recursive: true });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sanitizeDraftName(name: string): string | null {
  const base = path.basename(name);
  if (!/^[a-z0-9][a-z0-9_-]*\.json$/i.test(base)) return null;
  return base;
}

function json(res: import("http").ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

function listDrafts(): string[] {
  ensureDraftsDir();
  return fs
    .readdirSync(draftsDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  const { pathname } = url;

  try {
    if (req.method === "GET" && pathname === "/api/tracks") {
      const tracks = Object.values(TRACK_CATALOG).map((t) => ({
        id: t.id,
        displayName: t.displayName,
        jsonPath: t.jsonPath,
      }));
      tracks.push({
        id: "sample_circuit",
        displayName: "Sample Circuit",
        jsonPath: "tracks/sample_circuit.json",
      });
      json(res, 200, { tracks });
      return;
    }

    const trackMatch = pathname.match(/^\/api\/tracks\/([^/]+)$/);
    if (req.method === "GET" && trackMatch) {
      const trackId = decodeURIComponent(trackMatch[1]);
      const rel =
        TRACK_CATALOG[trackId]?.jsonPath ??
        (trackId === "sample_circuit" ? "tracks/sample_circuit.json" : null);
      if (!rel) {
        json(res, 404, { error: "track not found" });
        return;
      }
      const track = loadTrackJsonFromPath(repoRoot, rel);
      if (!track) {
        json(res, 404, { error: "track file missing" });
        return;
      }
      json(res, 200, { trackId, track });
      return;
    }

    if (req.method === "GET" && pathname === "/api/drafts") {
      json(res, 200, { drafts: listDrafts() });
      return;
    }

    const draftMatch = pathname.match(/^\/api\/drafts\/([^/]+)$/);
    if (req.method === "GET" && draftMatch) {
      const name = sanitizeDraftName(decodeURIComponent(draftMatch[1]));
      if (!name) {
        json(res, 400, { error: "invalid draft name" });
        return;
      }
      const abs = path.join(draftsDir, name);
      if (!abs.startsWith(draftsDir) || !fs.existsSync(abs)) {
        json(res, 404, { error: "draft not found" });
        return;
      }
      const track = JSON.parse(fs.readFileSync(abs, "utf8")) as TrackJson;
      json(res, 200, { filename: name, track });
      return;
    }

    if (req.method === "POST" && pathname === "/api/drafts") {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as { filename?: string; track?: TrackJson };
      const name = sanitizeDraftName(body.filename ?? "");
      if (!name) {
        json(res, 400, { error: "invalid filename" });
        return;
      }
      const track = parseTrackJson(body.track);
      validateTrackJson(track, track.name);
      ensureDraftsDir();
      const abs = path.join(draftsDir, name);
      if (!abs.startsWith(draftsDir)) {
        json(res, 400, { error: "invalid path" });
        return;
      }
      fs.writeFileSync(abs, trackJsonToFile(track), "utf8");
      json(res, 200, { ok: true, filename: name, path: `tracks/drafts/${name}` });
      return;
    }

    json(res, 404, { error: "not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    json(res, 400, { error: message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[track-editor-api] listening on http://127.0.0.1:${port}`);
});
