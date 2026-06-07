import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, "../..");
process.chdir(repoRoot);
const native = require(path.join(repoRoot, "bindings/node"));

const car1 =
  "entry=Audi Sport Team SkyTech,configs/runtime/fleet/car-1.txt,Hypercar,1,1\n";
fs.writeFileSync("configs/runtime/_e.txt", `# test\n${car1}`);

const cases = {
  car1_imola: fs
    .readFileSync("configs/runtime/race.txt", "utf8")
    .replace("entries=configs/runtime/entries.txt", "entries=configs/runtime/_e.txt"),
  car1_lemans: fs
    .readFileSync("configs/runtime/race.txt", "utf8")
    .replace("entries=configs/runtime/entries.txt", "entries=configs/runtime/_e.txt")
    .replace("tracks/imola.json", "tracks/lemans_la_sarthe.json"),
  full_imola: fs.readFileSync("configs/runtime/race.txt", "utf8"),
  web_default: fs.readFileSync("configs/race_config_web.txt", "utf8"),
};

for (const [name, race] of Object.entries(cases)) {
  fs.writeFileSync("configs/runtime/_test_race.txt", race);
  try {
    const ok = native.initFromRaceConfig("configs/runtime/_test_race.txt");
    console.log(name, ok);
  } catch {
    console.log(name, "CRASH");
    process.exit(2);
  }
}
