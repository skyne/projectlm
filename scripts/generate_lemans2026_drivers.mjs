#!/usr/bin/env node
/**
 * Generates configs/drivers/lemans2026_drivers.txt from researched 2026 Le Mans line-ups.
 * Stats are tier-based with per-driver modifiers reflecting real-world reputation.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "configs/drivers/lemans2026_drivers.txt");

const TIER = {
  Platinum: { dry: 93, wet: 87, con: 91, ovt: 89, def: 86, traf: 88, roll: 88, stand: 86, setup: 85, tire: 87, fuel: 82, comp: 90, night: 86, rain: 84, stam: 88, stint: 3.5 },
  Gold:     { dry: 86, wet: 80, con: 84, ovt: 82, def: 80, traf: 82, roll: 80, stand: 78, setup: 76, tire: 80, fuel: 76, comp: 82, night: 78, rain: 74, stam: 82, stint: 3.0 },
  Silver:   { dry: 78, wet: 72, con: 76, ovt: 74, def: 72, traf: 74, roll: 72, stand: 70, setup: 68, tire: 72, fuel: 70, comp: 74, night: 70, rain: 66, stam: 76, stint: 2.5 },
  Bronze:   { dry: 70, wet: 64, con: 68, ovt: 66, def: 64, traf: 66, roll: 64, stand: 62, setup: 58, tire: 64, fuel: 62, comp: 66, night: 62, rain: 58, stam: 70, stint: 2.0 },
};

/** @param {Record<string, number>} mod */
function stats(tier, mod = {}) {
  const b = TIER[tier];
  const g = (k, delta = 0) => Math.min(99, Math.max(50, (b[k] ?? 70) + (mod[k] ?? 0) + delta));
  return {
    dry: g("dry"), wet: g("wet"), con: g("con"), ovt: g("ovt"), def: g("def"),
    traf: g("traf"), roll: g("roll"), stand: g("stand"), setup: g("setup"),
    tire: g("tire"), fuel: g("fuel"), comp: g("comp"), night: g("night"),
    rain: g("rain"), stam: g("stam"), stint: mod.stint ?? b.stint,
  };
}

/** @type {Array<{team:string, num:number, drivers:Array<{name:string, nat:string, tier:keyof TIER, mod?:Record<string,number>}>}>} */
const ROSTERS = [
  // Hypercar
  { team: "007 Aston Martin Thor Team", num: "007", drivers: [
    { name: "Marco Sørensen", nat: "DK", tier: "Gold" },
    { name: "Nicki Thiim", nat: "DK", tier: "Gold", mod: { def: 4 } },
    { name: "Roman De Angelis", nat: "CA", tier: "Silver" },
  ]},
  { team: "009 Aston Martin Thor Team", num: "009", drivers: [
    { name: "Fernando Costa", nat: "BR", tier: "Silver" },
    { name: "Harry Tincknell", nat: "GB", tier: "Gold" },
    { name: "Tom Gamble", nat: "GB", tier: "Silver" },
  ]},
  { team: "Toyota Racing", num: 7, drivers: [
    { name: "Sébastien Buemi", nat: "CH", tier: "Platinum", mod: { wet: 5, con: 3, comp: 4 } },
    { name: "Brendon Hartley", nat: "NZ", tier: "Platinum", mod: { wet: 6, night: 4 } },
    { name: "Ryo Hirakawa", nat: "JP", tier: "Gold", mod: { tire: 5, fuel: 4 } },
  ]},
  { team: "Toyota Racing", num: 8, drivers: [
    { name: "Kamui Kobayashi", nat: "JP", tier: "Platinum", mod: { ovt: 4, wet: 3 } },
    { name: "Nyck de Vries", nat: "NL", tier: "Gold", mod: { dry: 4, stand: 5 } },
    { name: "José María López", nat: "AR", tier: "Gold", mod: { def: 5, con: 3 } },
  ]},
  { team: "Cadillac Hertz Team JOTA", num: 12, drivers: [
    { name: "Will Stevens", nat: "GB", tier: "Gold" },
    { name: "Norman Nato", nat: "FR", tier: "Gold", mod: { ovt: 3 } },
    { name: "Alex Lynn", nat: "GB", tier: "Gold", mod: { wet: 4 } },
  ]},
  { team: "BMW M Team WRT", num: 15, drivers: [
    { name: "Kevin Magnussen", nat: "DK", tier: "Platinum", mod: { ovt: 5, def: 4, stand: 6 } },
    { name: "Philipp Eng", nat: "AT", tier: "Gold", mod: { dry: 3 } },
    { name: "Sheldon van der Linde", nat: "ZA", tier: "Gold" },
  ]},
  { team: "Genesis Magma Racing", num: 17, drivers: [
    { name: "André Lotterer", nat: "DE", tier: "Platinum", mod: { night: 5, comp: 5, stint: 0.5 } },
    { name: "Luis Felipe Derani", nat: "BR", tier: "Gold", mod: { wet: 4, ovt: 3 } },
    { name: "Mathys Jaubert", nat: "FR", tier: "Silver", mod: { dry: 4, stand: 5 } },
  ]},
  { team: "Genesis Magma Racing", num: 19, drivers: [
    { name: "Paul-Loup Chatin", nat: "FR", tier: "Gold", mod: { tire: 4, fuel: 3 } },
    { name: "Mathieu Jaminet", nat: "FR", tier: "Gold", mod: { def: 4, con: 3 } },
    { name: "Daniel Juncadella", nat: "ES", tier: "Gold", mod: { wet: 3 } },
  ]},
  { team: "BMW M Team WRT", num: 20, drivers: [
    { name: "Robin Frijns", nat: "NL", tier: "Gold", mod: { tire: 5 } },
    { name: "Marco Wittmann", nat: "DE", tier: "Gold", mod: { dry: 4 } },
    { name: "Raffaele Marciello", nat: "IT", tier: "Gold" },
  ]},
  { team: "Alpine Endurance Team", num: 35, drivers: [
    { name: "Jules Gounon", nat: "FR", tier: "Platinum", mod: { def: 5, traf: 4 } },
    { name: "Victor Martins", nat: "FR", tier: "Gold", mod: { dry: 5, stand: 4 } },
    { name: "Mick Schumacher", nat: "DE", tier: "Gold", mod: { ovt: 4 } },
  ]},
  { team: "Alpine Endurance Team", num: 36, drivers: [
    { name: "Paul Aron", nat: "EE", tier: "Gold", mod: { dry: 3 } },
    { name: "Nelson Piquet Jr.", nat: "BR", tier: "Gold", mod: { wet: 3, night: 3 } },
    { name: "François Perrodo", nat: "FR", tier: "Silver", mod: { fuel: 5, tire: 4 } },
  ]},
  { team: "Cadillac Hertz Team JOTA", num: 38, drivers: [
    { name: "Sébastien Bourdais", nat: "FR", tier: "Platinum", mod: { setup: 5, con: 3 } },
    { name: "Earl Bamber", nat: "NZ", tier: "Platinum", mod: { comp: 4, wet: 4 } },
    { name: "Richard Westbrook", nat: "GB", tier: "Gold" },
  ]},
  { team: "Ferrari AF Corse", num: 50, drivers: [
    { name: "Antonio Fuoco", nat: "IT", tier: "Platinum", mod: { dry: 4, ovt: 3 } },
    { name: "Antonio Giovinazzi", nat: "IT", tier: "Gold", mod: { stand: 5 } },
    { name: "James Calado", nat: "GB", tier: "Gold", mod: { tire: 4, setup: 4 } },
  ]},
  { team: "Ferrari AF Corse", num: 51, drivers: [
    { name: "Robert Kubica", nat: "PL", tier: "Platinum", mod: { wet: 5, comp: 5 } },
    { name: "Alessandro Pier Guidi", nat: "IT", tier: "Gold", mod: { def: 5, stint: 0.3 } },
    { name: "Davide Rigon", nat: "IT", tier: "Gold", mod: { setup: 4 } },
  ]},
  { team: "AF Corse", num: 83, drivers: [
    { name: "Daniel Serra", nat: "BR", tier: "Gold" },
    { name: "Pierguidi Jr.", nat: "IT", tier: "Silver" },
    { name: "Amato Canepa", nat: "IT", tier: "Silver" },
  ]},
  { team: "Peugeot TotalEnergies", num: 93, drivers: [
    { name: "Jean-Éric Vergne", nat: "FR", tier: "Platinum", mod: { dry: 4, fuel: 4 } },
    { name: "Paul di Resta", nat: "GB", tier: "Gold", mod: { wet: 4, night: 3 } },
    { name: "Théo Pourchaire", nat: "FR", tier: "Gold", mod: { dry: 5, stand: 5 } },
  ]},
  { team: "Peugeot TotalEnergies", num: 94, drivers: [
    { name: "Loïc Duval", nat: "FR", tier: "Platinum", mod: { wet: 4, stint: 0.2 } },
    { name: "Stoffel Vandoorne", nat: "BE", tier: "Gold", mod: { dry: 4, ovt: 3 } },
    { name: "Nico Müller", nat: "CH", tier: "Gold", mod: { tire: 4 } },
  ]},
  { team: "Cadillac WTR", num: 101, drivers: [
    { name: "Jordan Taylor", nat: "US", tier: "Platinum", mod: { comp: 4, def: 3 } },
    { name: "Renger van der Zande", nat: "NL", tier: "Gold", mod: { night: 4 } },
    { name: "Pipo Derani", nat: "BR", tier: "Gold", mod: { ovt: 4 } },
  ]},

  // LMP2
  { team: "DKR Engineering", num: 3, drivers: [
    { name: "Grégoire Saucy", nat: "CH", tier: "Gold", mod: { dry: 4 } },
    { name: "Mikkel Jensen", nat: "DK", tier: "Gold" },
    { name: "Fabio Scherer", nat: "CH", tier: "Silver" },
  ]},
  { team: "Crowdstrike Racing by APR", num: 4, drivers: [
    { name: "Colin Braun", nat: "US", tier: "Gold" },
    { name: "George Russell", nat: "GB", tier: "Silver" },
    { name: "James Allen", nat: "US", tier: "Silver" },
  ]},
  { team: "Proton Competition", num: 9, drivers: [
    { name: "Logan Sargeant", nat: "US", tier: "Gold", mod: { dry: 4, stand: 4 } },
    { name: "Julien Andlauer", nat: "FR", tier: "Gold", mod: { wet: 3 } },
    { name: "Zacharie Robichon", nat: "CA", tier: "Silver" },
  ]},
  { team: "TDS Racing", num: 14, drivers: [
    { name: "Kévin Estre", nat: "FR", tier: "Platinum", mod: { dry: 5, ovt: 5, night: 4 } },
    { name: "Richard Verschoor", nat: "NL", tier: "Gold" },
    { name: "Patrick Pilet", nat: "FR", tier: "Gold", mod: { comp: 4, stint: 0.3 } },
  ]},
  { team: "United Autosports", num: 22, drivers: [
    { name: "Oliver Jarvis", nat: "GB", tier: "Gold", mod: { wet: 3 } },
    { name: "Guy Smith", nat: "GB", tier: "Gold" },
    { name: "Paul di Resta", nat: "GB", tier: "Gold" },
  ]},
  { team: "Nielsen Racing", num: 24, drivers: [
    { name: "Jack Doohan", nat: "AU", tier: "Gold", mod: { dry: 5, stand: 5 } },
    { name: "Ben Barnicoat", nat: "GB", tier: "Gold" },
    { name: "Matt Campbell", nat: "AU", tier: "Gold", mod: { tire: 3 } },
  ]},
  { team: "Algarve Pro Racing", num: 25, drivers: [
    { name: "Enzo Trulli", nat: "IT", tier: "Silver", mod: { dry: 4 } },
    { name: "Matteo Cressoni", nat: "IT", tier: "Silver" },
    { name: "James Kell", nat: "GB", tier: "Bronze" },
  ]},
  { team: "Vector Sport", num: 26, drivers: [
    { name: "Ryan Cullen", nat: "IE", tier: "Silver" },
    { name: "Patrick Byrne", nat: "IE", tier: "Silver" },
    { name: "John Farano", nat: "CA", tier: "Bronze" },
  ]},
  { team: "IDEC Sport", num: 28, drivers: [
    { name: "Paul-Loup Chatin", nat: "FR", tier: "Gold" },
    { name: "Philippe Gache", nat: "FR", tier: "Silver" },
    { name: "Paul Petit", nat: "FR", tier: "Silver" },
  ]},
  { team: "Forestier Racing by Panis", num: 29, drivers: [
    { name: "Nico Müller", nat: "CH", tier: "Gold" },
    { name: "James Allen", nat: "US", tier: "Silver" },
    { name: "Tin Han", nat: "CN", tier: "Bronze" },
  ]},
  { team: "Duqueine Team", num: 30, drivers: [
    { name: "Doriane Pin", nat: "FR", tier: "Gold", mod: { dry: 6, ovt: 5, stand: 6 } },
    { name: "Richard Verschoor", nat: "NL", tier: "Gold" },
    { name: "Axel Gorse", nat: "FR", tier: "Silver" },
  ]},
  { team: "CLX Motorsport", num: 37, drivers: [
    { name: "Alex Quinn", nat: "GB", tier: "Gold", mod: { dry: 3 } },
    { name: "David Heinemeier Hansson", nat: "DK", tier: "Gold", mod: { fuel: 5, tire: 4 } },
    { name: "Renger van der Zande", nat: "NL", tier: "Gold" },
  ]},
  { team: "Inter Europol Competition", num: 43, drivers: [
    { name: "Nico Müller", nat: "CH", tier: "Gold", mod: { con: 4 } },
    { name: "Fabio Scherer", nat: "CH", tier: "Silver" },
    { name: "Jakub Śmiechowski", nat: "PL", tier: "Silver" },
  ]},
  { team: "Proton Competition", num: 44, drivers: [
    { name: "Pietro Fittipaldi", nat: "BR", tier: "Gold", mod: { wet: 3 } },
    { name: "Neel Jani", nat: "CH", tier: "Gold" },
    { name: "Gianmarco Fassio", nat: "IT", tier: "Silver" },
  ]},
  { team: "RD Limited", num: 48, drivers: [
    { name: "Romain Dumas", nat: "FR", tier: "Platinum", mod: { wet: 6, night: 5, comp: 5 } },
    { name: "Kévin Estre", nat: "FR", tier: "Platinum" },
    { name: "Matteo Malucelli", nat: "IT", tier: "Silver" },
  ]},
  { team: "AO by TF", num: 99, drivers: [
    { name: "Louis Delétraz", nat: "CH", tier: "Gold", mod: { dry: 3 } },
    { name: "Patrick Byrne", nat: "IE", tier: "Silver" },
    { name: "Salman Khan", nat: "IN", tier: "Bronze" },
  ]},
  { team: "AF Corse", num: 183, drivers: [
    { name: "Francesco Castellacci", nat: "IT", tier: "Silver" },
    { name: "Thomas Flohr", nat: "CH", tier: "Bronze", mod: { stint: -0.5 } },
    { name: "Davide Rigon", nat: "IT", tier: "Gold" },
  ]},
  { team: "United Autosports", num: 222, drivers: [
    { name: "Guy Smith", nat: "GB", tier: "Gold" },
    { name: "James Allen", nat: "US", tier: "Silver" },
    { name: "Renger van der Zande", nat: "NL", tier: "Gold" },
  ]},
  { team: "Inter Europol Competition", num: 343, drivers: [
    { name: "Fabio Scherer", nat: "CH", tier: "Silver" },
    { name: "Jakub Śmiechowski", nat: "PL", tier: "Silver" },
    { name: "Clément Nauleau", nat: "FR", tier: "Silver" },
  ]},

  // LMGT3
  { team: "TF Sport", num: 2, drivers: [
    { name: "Tom Gamble", nat: "GB", tier: "Gold" },
    { name: "Salman Khan", nat: "IN", tier: "Bronze" },
    { name: "Rui Andrade", nat: "PT", tier: "Silver" },
  ]},
  { team: "Garage 59", num: 10, drivers: [
    { name: "Ben Barnicoat", nat: "GB", tier: "Gold" },
    { name: "Jenson Button", nat: "GB", tier: "Platinum", mod: { wet: 4, comp: 4 } },
    { name: "James Kell", nat: "GB", tier: "Silver" },
  ]},
  { team: "13 Autosport", num: 13, drivers: [
    { name: "Tommy Milner", nat: "US", tier: "Gold", mod: { def: 4 } },
    { name: "Jordan Taylor", nat: "US", tier: "Platinum" },
    { name: "Paul Stanton", nat: "US", tier: "Silver" },
  ]},
  { team: "Vista AF Corse", num: 21, drivers: [
    { name: "Daniel Serra", nat: "BR", tier: "Gold" },
    { name: "Francesco Castellacci", nat: "IT", tier: "Silver" },
    { name: "Thomas Flohr", nat: "CH", tier: "Bronze" },
  ]},
  { team: "Heart of Racing Team", num: 23, drivers: [
    { name: "Eduardo Barrichello", nat: "BR", tier: "Silver", mod: { dry: 3 } },
    { name: "Ian James", nat: "US", tier: "Bronze" },
    { name: "Ross Gunn", nat: "GB", tier: "Gold" },
  ]},
  { team: "Heart of Racing Team", num: 27, drivers: [
    { name: "Marco Sørensen", nat: "DK", tier: "Gold" },
    { name: "Ross Gunn", nat: "GB", tier: "Gold" },
    { name: "Salman Khan", nat: "IN", tier: "Bronze" },
  ]},
  { team: "Team WRT", num: 32, drivers: [
    { name: "Sheldon van der Linde", nat: "ZA", tier: "Gold" },
    { name: "Robin Frijns", nat: "NL", tier: "Gold" },
    { name: "Dries Vanthoor", nat: "BE", tier: "Gold", mod: { dry: 3 } },
  ]},
  { team: "TF Sport", num: 33, drivers: [
    { name: "Tom Gamble", nat: "GB", tier: "Gold" },
    { name: "Salman Khan", nat: "IN", tier: "Bronze" },
    { name: "Rui Andrade", nat: "PT", tier: "Silver" },
  ]},
  { team: "Racing Team Turkey by TF", num: 34, drivers: [
    { name: "Salman Khan", nat: "IN", tier: "Bronze" },
    { name: "Rui Andrade", nat: "PT", tier: "Silver" },
    { name: "Tom Gamble", nat: "GB", tier: "Gold" },
  ]},
  { team: "Vista AF Corse", num: 54, drivers: [
    { name: "Daniel Serra", nat: "BR", tier: "Gold" },
    { name: "Francesco Castellacci", nat: "IT", tier: "Silver" },
    { name: "Thomas Flohr", nat: "CH", tier: "Bronze" },
  ]},
  { team: "Kessel Racing", num: 57, drivers: [
    { name: "Lorenzo Patrese", nat: "IT", tier: "Silver", mod: { dry: 4 } },
    { name: "Daniel Serra", nat: "BR", tier: "Gold" },
    { name: "Francesco Castellacci", nat: "IT", tier: "Silver" },
  ]},
  { team: "Garage 59", num: 58, drivers: [
    { name: "Ben Barnicoat", nat: "GB", tier: "Gold" },
    { name: "James Kell", nat: "GB", tier: "Silver" },
    { name: "Jenson Button", nat: "GB", tier: "Platinum" },
  ]},
  { team: "Racing Spirit of Leman", num: 59, drivers: [
    { name: "Marco Sørensen", nat: "DK", tier: "Gold" },
    { name: "Nicki Thiim", nat: "DK", tier: "Gold" },
    { name: "Roman De Angelis", nat: "CA", tier: "Silver" },
  ]},
  { team: "Iron Lynx", num: 61, drivers: [
    { name: "Dries Vanthoor", nat: "BE", tier: "Gold" },
    { name: "Mirko Bortolotti", nat: "IT", tier: "Gold", mod: { dry: 3 } },
    { name: "Andrea Caldarelli", nat: "IT", tier: "Gold" },
  ]},
  { team: "Team Qatar by Iron Lynx", num: 62, drivers: [
    { name: "Giuliano Alesi", nat: "FR", tier: "Silver", mod: { dry: 3 } },
    { name: "Mirko Bortolotti", nat: "IT", tier: "Gold" },
    { name: "Andrea Caldarelli", nat: "IT", tier: "Gold" },
  ]},
  { team: "Team WRT", num: 69, drivers: [
    { name: "Sheldon van der Linde", nat: "ZA", tier: "Gold" },
    { name: "Robin Frijns", nat: "NL", tier: "Gold" },
    { name: "Dries Vanthoor", nat: "BE", tier: "Gold" },
  ]},
  { team: "Kessel Racing", num: 74, drivers: [
    { name: "Lorenzo Patrese", nat: "IT", tier: "Silver", mod: { dry: 4 } },
    { name: "Daniel Serra", nat: "BR", tier: "Gold" },
    { name: "Francesco Castellacci", nat: "IT", tier: "Silver" },
  ]},
  { team: "Proton Competition", num: 77, drivers: [
    { name: "Logan Sargeant", nat: "US", tier: "Gold", mod: { dry: 4 } },
    { name: "Zacharie Robichon", nat: "CA", tier: "Silver" },
    { name: "Julien Andlauer", nat: "FR", tier: "Gold" },
  ]},
  { team: "Akkodis ASP Team", num: 78, drivers: [
    { name: "José María López", nat: "AR", tier: "Platinum", mod: { def: 5, tire: 4 } },
    { name: "Ben Barnicoat", nat: "GB", tier: "Gold" },
    { name: "James Kell", nat: "GB", tier: "Silver" },
  ]},
  { team: "Iron Lynx", num: 79, drivers: [
    { name: "Mirko Bortolotti", nat: "IT", tier: "Gold" },
    { name: "Andrea Caldarelli", nat: "IT", tier: "Gold" },
    { name: "Dries Vanthoor", nat: "BE", tier: "Gold" },
  ]},
  { team: "Akkodis ASP Team", num: 87, drivers: [
    { name: "José María López", nat: "AR", tier: "Platinum", mod: { def: 5, tire: 4 } },
    { name: "Ben Barnicoat", nat: "GB", tier: "Gold" },
    { name: "James Kell", nat: "GB", tier: "Silver" },
  ]},
  { team: "Proton Competition", num: 88, drivers: [
    { name: "Logan Sargeant", nat: "US", tier: "Gold" },
    { name: "Julien Andlauer", nat: "FR", tier: "Gold" },
    { name: "Zacharie Robichon", nat: "CA", tier: "Silver" },
  ]},
  { team: "Manthey DK Engineering", num: 91, drivers: [
    { name: "Richard Lietz", nat: "AT", tier: "Platinum", mod: { stint: 0.5, tire: 4, comp: 4 } },
    { name: "Kévin Estre", nat: "FR", tier: "Platinum" },
    { name: "Michael Christensen", nat: "DK", tier: "Gold", mod: { setup: 4 } },
  ]},
  { team: "The Bend Manthey", num: 92, drivers: [
    { name: "Richard Lietz", nat: "AT", tier: "Platinum", mod: { stint: 0.5 } },
    { name: "Matt Campbell", nat: "AU", tier: "Gold" },
    { name: "Jörg Bergmeister", nat: "DE", tier: "Gold", mod: { night: 4, comp: 3 } },
  ]},
  { team: "Richard Mille AF Corse", num: 150, drivers: [
    { name: "Lilou Wadoux", nat: "FR", tier: "Gold", mod: { dry: 4, ovt: 4, con: 3 } },
    { name: "Francesco Castellacci", nat: "IT", tier: "Silver" },
    { name: "Thomas Flohr", nat: "CH", tier: "Bronze" },
  ]},
];

function driverLine(d) {
  const s = stats(d.tier, d.mod ?? {});
  return `driver=${[
    d.name, d.nat, d.tier,
    s.dry, s.wet, s.con, s.ovt, s.def, s.traf, s.roll, s.stand,
    s.setup, s.tire, s.fuel, s.comp, s.night, s.rain, s.stam, s.stint,
  ].join("|")}`;
}

const lines = [
  "# 2026 24 Hours of Le Mans — driver roster with simulation stats",
  "# Format: driver=name|nat|tier|dry|wet|consistency|overtaking|defending|traffic|rolling|standing|setup|tire|fuel|composure|night|rain|stamina|max_stint_hours",
  "# Sources: 24h-lemans.com, FIA WEC, manufacturer announcements (June 2026)",
  "",
];

for (const entry of ROSTERS) {
  lines.push(`entry=${entry.team},${entry.num}`);
  for (const d of entry.drivers) lines.push(driverLine(d));
  lines.push("");
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join("\n"));
console.log(`Wrote ${ROSTERS.length} entries to ${OUT}`);
