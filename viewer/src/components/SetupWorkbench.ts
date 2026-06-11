import type {
  DriverProfilePayload,
  FleetCarPayload,
  GameCatalogPayload,
  TrackSetupPresetPayload,
} from "../ws/protocol";
import {
  SESSION_SETUP_FIELDS,
  type SessionSetupFieldDef,
} from "../utils/weekendSetup";
import { escapeHtml } from "../utils/mmUi";

export interface SetupWorkbenchOptions {
  catalog: GameCatalogPayload | null;
  car: FleetCarPayload;
  current: TrackSetupPresetPayload;
  previous?: TrackSetupPresetPayload | null;
  assignedDrivers?: DriverProfilePayload[];
}

function driverCompromiseNote(drivers: DriverProfilePayload[]): string | null {
  if (drivers.length < 2) return null;
  const adapt =
    drivers.reduce((sum, d) => sum + (d.adaptability ?? 66), 0) / drivers.length;
  if (adapt >= 78) {
    return "Multi-driver roster — high adaptability should tolerate this compromise.";
  }
  if (adapt < 68) {
    return "Multi-driver roster — low adaptability; consider a neutral baseline.";
  }
  return "Multi-driver roster — moderate adaptability; watch for pace drop if pushed off baseline.";
}

function performanceHints(
  current: TrackSetupPresetPayload,
  previous: TrackSetupPresetPayload | null | undefined,
): string[] {
  const hints: string[] = [];
  const wing = current.wingBaseline ?? 0;
  const prevWing = previous?.wingBaseline ?? wing;
  const wingDelta = wing - prevWing;
  if (Math.abs(wingDelta) > 0.02) {
    hints.push(
      wingDelta > 0
        ? "More wing — likely +downforce, −straight speed vs last sheet."
        : "Less wing — likely +top speed, −corner stability vs last sheet.",
    );
  }
  const brake = current.brakeBiasBaseline ?? 0.5;
  const prevBrake = previous?.brakeBiasBaseline ?? brake;
  if (Math.abs(brake - prevBrake) > 0.02) {
    hints.push(
      brake > prevBrake
        ? "Front brake bias — may stabilize turn-in."
        : "Rear brake bias — may help rotation.",
    );
  }
  if (!hints.length) {
    hints.push("No major aero/brake shift vs saved sheet — chassis tweaks only.");
  }
  return hints;
}

function formatDelta(def: SessionSetupFieldDef, from: number, to: number): string {
  const delta = to - from;
  if (Math.abs(delta) < def.step * 0.5) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${def.format(delta)}`;
}

export function renderSetupWorkbench(opts: SetupWorkbenchOptions): HTMLElement {
  const root = document.createElement("div");
  root.className = "setup-workbench";

  const prev = opts.previous ?? null;
  const diffs = SESSION_SETUP_FIELDS.map((def) => {
    const cur = opts.current[def.key] as number;
    const old = prev ? (prev[def.key] as number) : cur;
    const changed = prev != null && Math.abs(cur - old) >= def.step * 0.5;
    return { def, cur, old, changed };
  }).filter((row) => row.changed);

  const diffBlock = document.createElement("div");
  diffBlock.className = "setup-workbench-diff";
  diffBlock.innerHTML = `<h4 class="chassis-setup-heading">Diff vs saved sheet</h4>`;
  if (!prev) {
    diffBlock.innerHTML += `<p class="wizard-hint">No prior track sheet — showing baseline only.</p>`;
  } else if (!diffs.length) {
    diffBlock.innerHTML += `<p class="wizard-hint">Matches your saved sheet for this circuit.</p>`;
  } else {
    const table = document.createElement("table");
    table.className = "setup-workbench-table";
    table.innerHTML = `
      <thead><tr><th>Setting</th><th>Was</th><th>Now</th><th>Δ</th></tr></thead>
      <tbody></tbody>
    `;
    const body = table.querySelector("tbody")!;
    for (const row of diffs) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(row.def.label)}</td>
        <td>${escapeHtml(row.def.format(row.old))}</td>
        <td>${escapeHtml(row.def.format(row.cur))}</td>
        <td class="setup-workbench-delta">${escapeHtml(formatDelta(row.def, row.old, row.cur))}</td>
      `;
      body.appendChild(tr);
    }
    diffBlock.appendChild(table);
  }
  root.appendChild(diffBlock);

  const hints = document.createElement("div");
  hints.className = "setup-workbench-hints";
  hints.innerHTML = `<h4 class="chassis-setup-heading">Performance hints</h4>`;
  const ul = document.createElement("ul");
  ul.className = "setup-workbench-hint-list";
  for (const line of performanceHints(opts.current, prev)) {
    const li = document.createElement("li");
    li.textContent = line;
    ul.appendChild(li);
  }
  hints.appendChild(ul);
  root.appendChild(hints);

  const drivers = opts.assignedDrivers ?? [];
  const compromise = driverCompromiseNote(drivers);
  if (compromise) {
    const note = document.createElement("p");
    note.className = "setup-workbench-compromise wizard-hint";
    note.textContent = compromise;
    root.appendChild(note);
  }

  return root;
}
