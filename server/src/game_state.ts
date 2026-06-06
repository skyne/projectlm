import * as fs from "fs";
import * as path from "path";
import type { MetaStatePayload } from "./ws_protocol";

const SAVE_REL = "data/game_save.json";

function savePath(repoRoot: string): string {
  return path.join(repoRoot, SAVE_REL);
}

export class GameStateStore {
  constructor(private readonly repoRoot: string) {}

  load(defaults: MetaStatePayload): MetaStatePayload {
    const abs = savePath(this.repoRoot);
    if (!fs.existsSync(abs)) return structuredClone(defaults);
    try {
      const parsed = JSON.parse(fs.readFileSync(abs, "utf8")) as MetaStatePayload;
      return {
        ...defaults,
        ...parsed,
        setupComplete: parsed.setupComplete ?? true,
      };
    } catch {
      return structuredClone(defaults);
    }
  }

  save(state: MetaStatePayload): void {
    const abs = savePath(this.repoRoot);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(state, null, 2) + "\n");
  }

  delete(): void {
    const abs = savePath(this.repoRoot);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }
}
