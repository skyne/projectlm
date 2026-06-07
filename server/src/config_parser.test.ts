import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatEntryLine,
  legacyEntryIdFromGrid,
  parseEntryFields,
  parseEntries,
} from "./config_parser";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { applyQualifyingGrid } from "./game/weekend_sessions";
import type { GeneratedEntry } from "./game/grid_generator";
import { writeEntriesFile } from "./game/grid_generator";

describe("config_parser entry lines", () => {
  it("parses legacy 5-field lines with grid-derived entry id", () => {
    const parsed = parseEntryFields(
      "entry=Toyota Racing,configs/car.txt,Hypercar,3,7",
    );
    assert.ok(parsed);
    assert.equal(parsed.entryId, legacyEntryIdFromGrid(3));
    assert.equal(parsed.carNumber, "7");
  });

  it("parses explicit entry_id and survives duplicate class grids", () => {
    const hyper = formatEntryLine({
      teamName: "Team A",
      carConfigPath: "configs/a.txt",
      classId: "Hypercar",
      grid: 1,
      carNumber: "20",
      entryId: "entry-9",
    });
    const gt3 = formatEntryLine({
      teamName: "Team B",
      carConfigPath: "configs/b.txt",
      classId: "LMGT3",
      grid: 1,
      carNumber: "20",
      entryId: "entry-34",
    });

    const h = parseEntryFields(hyper);
    const g = parseEntryFields(gt3);
    assert.ok(h && g);
    assert.equal(h.grid, 1);
    assert.equal(g.grid, 1);
    assert.notEqual(h.entryId, g.entryId);
    assert.equal(h.carNumber, "20");
    assert.equal(g.carNumber, "20");
  });

  it("round-trips applyQualifyingGrid through writeEntriesFile", () => {
    const entries: GeneratedEntry[] = [
      {
        entryId: "entry-9",
        teamName: "BMW",
        carConfigPath: "configs/h.txt",
        classId: "Hypercar",
        grid: 9,
        carNumber: "20",
        isPlayer: false,
      },
      {
        entryId: "entry-34",
        teamName: "GT Team",
        carConfigPath: "configs/g.txt",
        classId: "LMGT3",
        grid: 34,
        carNumber: "20",
        isPlayer: false,
      },
    ];
    const reordered = applyQualifyingGrid(entries, [
      { entryId: "entry-9", classId: "Hypercar", bestLapTime: 98.0 },
      { entryId: "entry-34", classId: "LMGT3", bestLapTime: 104.0 },
    ]);
    assert.equal(reordered.find((e) => e.entryId === "entry-9")?.grid, 1);
    assert.equal(reordered.find((e) => e.entryId === "entry-34")?.grid, 1);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plm-entries-"));
    const rel = "entries_test.txt";
    writeEntriesFile(dir, rel, reordered);
    const parsed = parseEntries(dir, rel);
    assert.equal(parsed.length, 2);
    const ids = parsed.map((e) => e.entryId).sort();
    assert.deepEqual(ids, ["entry-34", "entry-9"]);
  });
});
