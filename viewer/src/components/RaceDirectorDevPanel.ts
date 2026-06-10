import type { CarSnapshot, RaceControlPayload } from "../ws/protocol";
import { isDevToolsEnabled } from "./SessionLogDevPanel";

export type DebugRaceControlSender = (
  payload: import("../ws/protocol").DebugRaceControlPayload,
) => void;

export type PenaltyCommandSender = (entryId: string, command: string) => void;

const FLAG_PHASES = [
  { id: "green", label: "Green" },
  { id: "slow_zone", label: "Slow zone" },
  { id: "fcy", label: "FCY" },
  { id: "sc", label: "Safety car" },
  { id: "sc_in_lap", label: "SC in lap" },
  { id: "red_flag", label: "Red flag" },
] as const;

const SECTOR_LEVELS = [
  { id: 0, label: "Green" },
  { id: 1, label: "Yellow" },
  { id: 2, label: "Double yellow" },
] as const;

const HAZARD_KINDS = ["debris", "oil", "coolant", "fuel", "fire"] as const;

export class RaceDirectorDevPanel {
  readonly root: HTMLElement;
  private statusEl: HTMLElement;
  private phaseEl: HTMLElement;
  private entrySelect: HTMLSelectElement;
  private sectorSelect: HTMLSelectElement;
  private hazardKindSelect: HTMLSelectElement;
  private hazardSectorSelect: HTMLSelectElement;
  private canControl = false;
  private sectorCount = 0;
  private entries: CarSnapshot[] = [];
  private raceControl: RaceControlPayload | undefined;
  private sendDebug: DebugRaceControlSender;
  private sendPenalty: PenaltyCommandSender;
  private onReloadDefinitions: (() => void) | null = null;

  constructor(
    container: HTMLElement,
    handlers: {
      onDebug: DebugRaceControlSender;
      onPenalty: PenaltyCommandSender;
    },
  ) {
    this.sendDebug = handlers.onDebug;
    this.sendPenalty = handlers.onPenalty;

    this.root = document.createElement("div");
    this.root.id = "race-director-dev-overlay";
    this.root.className = "race-director-dev hidden";
    this.root.innerHTML = `
      <div class="race-director-dev-card" role="dialog" aria-labelledby="race-director-dev-title">
        <header class="race-director-dev-header">
          <div>
            <span class="mm-badge-wec">Developer</span>
            <h2 id="race-director-dev-title">Race director</h2>
            <p class="race-director-dev-sub">Trigger flags, SC, incidents, and hazards on the live session.</p>
          </div>
          <button type="button" class="race-director-dev-close" aria-label="Close">×</button>
        </header>
        <div class="race-director-dev-status" aria-live="polite"></div>
        <div class="race-director-dev-body">
          <section class="race-director-dev-section">
            <h3>Session state</h3>
            <div class="race-director-dev-phase"></div>
          </section>
          <section class="race-director-dev-section">
            <h3>Flag phase</h3>
            <div class="race-director-dev-btn-grid race-director-dev-flag-grid"></div>
          </section>
          <section class="race-director-dev-section">
            <h3>Sector flags</h3>
            <div class="race-director-dev-row">
              <label>Sector <select class="race-director-dev-sector"></select></label>
            </div>
            <div class="race-director-dev-btn-grid race-director-dev-sector-grid"></div>
          </section>
          <section class="race-director-dev-section">
            <h3>Track incidents</h3>
            <div class="race-director-dev-row">
              <label>Car <select class="race-director-dev-entry"></select></label>
            </div>
            <div class="race-director-dev-btn-row">
              <button type="button" data-action="strand_car">Strand on track</button>
              <button type="button" data-action="clear_track">Clear track</button>
            </div>
          </section>
          <section class="race-director-dev-section">
            <h3>Surface hazards</h3>
            <div class="race-director-dev-row">
              <label>Kind <select class="race-director-dev-hazard-kind"></select></label>
              <label>Sector <select class="race-director-dev-hazard-sector"></select></label>
            </div>
            <div class="race-director-dev-btn-row">
              <button type="button" data-action="spawn_hazard">Spawn hazard</button>
              <button type="button" data-action="clear_hazards">Clear hazards</button>
            </div>
          </section>
          <section class="race-director-dev-section">
            <h3>Other</h3>
            <div class="race-director-dev-btn-row">
              <button type="button" data-action="white_flag_on">White flag on</button>
              <button type="button" data-action="white_flag_off">White flag off</button>
            </div>
          </section>
          <section class="race-director-dev-section">
            <h3>Penalties (selected car)</h3>
            <div class="race-director-dev-btn-row">
              <button type="button" data-penalty="drive_through">Drive-through</button>
              <button type="button" data-penalty="stop_go">Stop-go</button>
              <button type="button" data-penalty="meatball">Meatball</button>
            </div>
          </section>
          <section class="race-director-dev-section race-director-dev-sim-section hidden">
            <h3>Simulator</h3>
            <div class="race-director-dev-btn-row">
              <button type="button" class="race-director-dev-reload">Reload definitions</button>
            </div>
          </section>
        </div>
        <p class="race-director-dev-hint">Host only · Ctrl+Shift+R · enable with <code>?dev</code> or <code>localStorage.projectlm-dev-tools=1</code></p>
      </div>
    `;
    container.appendChild(this.root);

    this.statusEl = this.root.querySelector(".race-director-dev-status")!;
    this.phaseEl = this.root.querySelector(".race-director-dev-phase")!;
    this.entrySelect = this.root.querySelector(".race-director-dev-entry")!;
    this.sectorSelect = this.root.querySelector(".race-director-dev-sector")!;
    this.hazardKindSelect = this.root.querySelector(".race-director-dev-hazard-kind")!;
    this.hazardSectorSelect = this.root.querySelector(
      ".race-director-dev-hazard-sector",
    )!;

    const flagGrid = this.root.querySelector(".race-director-dev-flag-grid")!;
    for (const phase of FLAG_PHASES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = phase.label;
      btn.dataset.phase = phase.id;
      btn.addEventListener("click", () =>
        this.sendDebug({ action: "flag_phase", phase: phase.id }),
      );
      flagGrid.appendChild(btn);
    }

    const sectorGrid = this.root.querySelector(".race-director-dev-sector-grid")!;
    for (const level of SECTOR_LEVELS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = level.label;
      btn.dataset.level = String(level.id);
      btn.addEventListener("click", () =>
        this.sendDebug({
          action: "sector_flag",
          sectorIndex: Number(this.sectorSelect.value),
          level: level.id,
        }),
      );
      sectorGrid.appendChild(btn);
    }

    for (const kind of HAZARD_KINDS) {
      const opt = document.createElement("option");
      opt.value = kind;
      opt.textContent = kind;
      this.hazardKindSelect.appendChild(opt);
    }

    this.root.querySelector(".race-director-dev-reload")?.addEventListener("click", () => {
      this.onReloadDefinitions?.();
      this.hide();
    });

    this.root.querySelector(".race-director-dev-close")!.addEventListener("click", () =>
      this.hide(),
    );
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.hide();
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        if (!action) return;
        if (action === "strand_car") {
          const entryId = this.entrySelect.value;
          if (!entryId) return;
          this.sendDebug({ action, entryId, reason: "Debug incident" });
          return;
        }
        if (action === "spawn_hazard") {
          this.sendDebug({
            action,
            kind: this.hazardKindSelect.value,
            sectorIndex: Number(this.hazardSectorSelect.value),
          });
          return;
        }
        if (action === "white_flag_on") {
          this.sendDebug({ action: "white_flag", active: true });
          return;
        }
        if (action === "white_flag_off") {
          this.sendDebug({ action: "white_flag", active: false });
          return;
        }
        this.sendDebug({ action });
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-penalty]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const entryId = this.entrySelect.value;
        const penalty = btn.dataset.penalty;
        if (!entryId || !penalty) return;
        const command =
          penalty === "drive_through"
            ? "drive_through"
            : penalty === "stop_go"
              ? "stop_go"
              : "meatball";
        this.sendPenalty(entryId, command);
      });
    });
  }

  setCanControl(canControl: boolean): void {
    this.canControl = canControl;
    this.root.classList.toggle("race-director-dev--locked", !canControl);
    this.setStatus(
      canControl
        ? ""
        : "Host role required — reconnect as host to trigger race director actions.",
    );
  }

  setReloadHandler(handler: () => void): void {
    this.onReloadDefinitions = handler;
    this.root.querySelector(".race-director-dev-sim-section")?.classList.remove("hidden");
  }

  setSectorCount(count: number): void {
    if (count === this.sectorCount) return;
    this.sectorCount = count;
    this.sectorSelect.replaceChildren();
    this.hazardSectorSelect.replaceChildren();
    for (let i = 0; i < count; i++) {
      for (const select of [this.sectorSelect, this.hazardSectorSelect]) {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = `S${i + 1}`;
        select.appendChild(opt);
      }
    }
  }

  updateEntries(snapshots: CarSnapshot[]): void {
    this.entries = snapshots.filter((s) => !s.retired);
    const prev = this.entrySelect.value;
    this.entrySelect.replaceChildren();
    for (const snap of this.entries) {
      const opt = document.createElement("option");
      opt.value = snap.entryId;
      opt.textContent = `#${snap.carNumber} ${snap.teamName}`;
      this.entrySelect.appendChild(opt);
    }
    if (prev && this.entries.some((s) => s.entryId === prev)) {
      this.entrySelect.value = prev;
    }
  }

  updateRaceControl(rc: RaceControlPayload | undefined): void {
    this.raceControl = rc;
    if (!rc) {
      this.phaseEl.textContent = "—";
      return;
    }
    const parts = [
      `Phase: ${rc.flagPhase}`,
      `Obstructions: ${rc.obstructionsOnTrack}`,
      `SC laps left: ${rc.scLapsRemaining}`,
    ];
    if (rc.redFlagActive) {
      parts.push(`Red flag: ${Math.ceil(rc.redFlagSecondsRemaining ?? 0)}s`);
    }
    if (rc.whiteFlagActive) parts.push("White flag");
    if (rc.surfaceHazards.length) {
      parts.push(`Hazards: ${rc.surfaceHazards.length}`);
    }
    this.phaseEl.textContent = parts.join(" · ");
  }

  setStatus(message: string): void {
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle("hidden", message.length === 0);
  }

  show(): void {
    if (!isDevToolsEnabled()) return;
    this.root.classList.remove("hidden");
  }

  hide(): void {
    this.root.classList.add("hidden");
  }

  toggle(): void {
    if (this.root.classList.contains("hidden")) this.show();
    else this.hide();
  }
}
