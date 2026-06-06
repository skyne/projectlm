import type { CarSnapshot } from "../ws/protocol";
import { escapeHtml } from "../utils/mmUi";

export interface ManagedEntryOption {
  entryId: string;
  teamName: string;
  carNumber: string;
  classId?: string;
}

export interface TeamCarPickerHandlers {
  onSelect: (entryId: string) => void;
}

function formatStatus(snap: CarSnapshot | undefined): { label: string; tone: string } {
  if (!snap) return { label: "Awaiting telemetry", tone: "idle" };
  if (snap.retired) {
    const reason = snap.retireReason?.trim();
    return {
      label: reason && reason !== "Retired from race" ? reason : "Retired",
      tone: "danger",
    };
  }
  if (snap.inPit) {
    const sec = snap.pitRemainingSec ?? 0;
    return {
      label: sec > 0 ? `In pit · ${sec.toFixed(0)}s` : "In pit",
      tone: "pit",
    };
  }
  if (snap.pitQueued) return { label: "Pit queued", tone: "pit" };
  if (snap.fuel <= 0) return { label: "Out of fuel", tone: "danger" };
  if (snap.overtaking) return { label: "Overtaking", tone: "active" };
  if (snap.blocked) return { label: "In traffic", tone: "warn" };
  return { label: "On track", tone: "ok" };
}

function formatPosition(snap: CarSnapshot | undefined): string {
  if (!snap || snap.racePosition <= 0) return "—";
  const overall = `P${snap.racePosition}`;
  if (snap.classPosition && snap.classPosition !== snap.racePosition) {
    return `${overall} · ${snap.classId} P${snap.classPosition}`;
  }
  return overall;
}

function formatDriverMode(mode: string | undefined): string {
  switch (mode) {
    case "push":
      return "Push";
    case "conserve":
      return "Eco";
    default:
      return "Normal";
  }
}

function cardClasses(entryId: string, selectedId: string, snap: CarSnapshot | undefined): string {
  const parts = ["team-car-card"];
  if (entryId === selectedId) parts.push("selected");
  if (snap?.retired) parts.push("retired");
  if (snap?.inPit || snap?.pitQueued) parts.push("in-pit");
  return parts.join(" ");
}

function buildCardHtml(
  entry: ManagedEntryOption,
  snap: CarSnapshot | undefined,
  compact = false,
): string {
  const status = formatStatus(snap);
  const driver = snap?.driverName?.trim() || "Driver TBD";
  const lap = snap?.lap ?? "—";
  const fuel = snap != null ? `${snap.fuel.toFixed(0)}L` : "—";
  const engine = snap != null ? `${snap.engineHealth.toFixed(0)}%` : "—";
  const mode = formatDriverMode(snap?.driverMode);
  const classId = entry.classId ?? snap?.classId ?? "";

  if (compact) {
    return `
      <div class="team-car-card-top">
        <span class="team-car-number">#${escapeHtml(entry.carNumber)}</span>
        ${classId ? `<span class="class-badge class-${escapeHtml(classId)}">${escapeHtml(classId)}</span>` : ""}
        <span class="team-car-position">${escapeHtml(formatPosition(snap))}</span>
      </div>
      <div class="team-car-card-main team-car-card-main-compact">
        <span class="team-car-driver">${escapeHtml(driver)}</span>
        <span class="team-car-meta">Lap ${lap} · ${fuel} · ${mode}</span>
      </div>
      <span class="team-car-status team-car-status-${status.tone}">${escapeHtml(status.label)}</span>
    `;
  }

  return `
    <div class="team-car-card-top">
      <span class="team-car-number">#${escapeHtml(entry.carNumber)}</span>
      ${classId ? `<span class="class-badge class-${escapeHtml(classId)}">${escapeHtml(classId)}</span>` : ""}
      <span class="team-car-position">${escapeHtml(formatPosition(snap))}</span>
    </div>
    <div class="team-car-card-main">
      <span class="team-car-driver">${escapeHtml(driver)}</span>
      <span class="team-car-meta">Lap ${lap} · ${fuel} · Eng ${engine}</span>
    </div>
    <div class="team-car-card-foot">
      <span class="team-car-mode">${escapeHtml(mode)}</span>
      <span class="team-car-status team-car-status-${status.tone}">${escapeHtml(status.label)}</span>
    </div>
  `;
}

export class TeamCarPicker {
  readonly root: HTMLElement;
  private triggerBtn!: HTMLButtonElement;
  private triggerBodyEl!: HTMLElement;
  private panelEl!: HTMLElement;
  private gridEl!: HTMLElement;
  private handlers: TeamCarPickerHandlers;
  private entries: ManagedEntryOption[] = [];
  private snapshots: CarSnapshot[] = [];
  private selectedId = "";
  private enabled = true;
  private open = false;
  private label: string;
  private onDocClick: (ev: MouseEvent) => void;
  private onDocKey: (ev: KeyboardEvent) => void;
  private onReposition: (() => void) | null = null;
  private scrollParent: HTMLElement | null = null;
  private panelAnchor: Comment | null = null;

  constructor(handlers: TeamCarPickerHandlers, options: { label?: string } = {}) {
    this.handlers = handlers;
    this.label = options.label ?? "Team car";
    this.root = document.createElement("div");
    this.root.className = "team-car-picker hidden";
    this.root.innerHTML = `
      <div class="team-car-picker-head">
        <span class="control-label"></span>
        <span class="team-car-picker-hint"></span>
      </div>
      <div class="team-car-dropdown">
        <button type="button" class="team-car-trigger" aria-haspopup="listbox" aria-expanded="false">
          <span class="team-car-trigger-body"></span>
          <span class="team-car-trigger-chevron" aria-hidden="true">▾</span>
        </button>
        <div class="team-car-grid-panel hidden" role="presentation">
          <div class="team-car-grid" role="listbox" aria-label="Team cars"></div>
        </div>
      </div>
    `;

    this.triggerBtn = this.root.querySelector(".team-car-trigger")!;
    this.triggerBodyEl = this.root.querySelector(".team-car-trigger-body")!;
    this.panelEl = this.root.querySelector(".team-car-grid-panel")!;
    this.gridEl = this.root.querySelector(".team-car-grid")!;

    const labelEl = this.root.querySelector(".control-label")!;
    labelEl.textContent = this.label;
    this.root.querySelector(".team-car-picker-hint")!.textContent =
      this.entries.length > 0 ? `${this.entries.length} entries` : "Select car to command";

    this.triggerBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (!this.enabled || this.entries.length <= 1) return;
      this.setOpen(!this.open);
    });

    this.onDocClick = (ev) => {
      if (!this.open) return;
      const target = ev.target as Node;
      if (this.root.contains(target) || this.panelEl.contains(target)) return;
      this.setOpen(false);
    };
    this.onDocKey = (ev) => {
      if (ev.key === "Escape" && this.open) this.setOpen(false);
    };
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.root);
    document.addEventListener("click", this.onDocClick);
    document.addEventListener("keydown", this.onDocKey);
  }

  destroy(): void {
    this.setOpen(false);
    document.removeEventListener("click", this.onDocClick);
    document.removeEventListener("keydown", this.onDocKey);
    this.unbindRepositionListeners();
  }

  setEntries(entries: ManagedEntryOption[], selectedId: string): void {
    this.entries = entries;
    this.selectedId = entries.some((e) => e.entryId === selectedId)
      ? selectedId
      : (entries[0]?.entryId ?? "");
    this.root.querySelector(".team-car-picker-hint")!.textContent =
      entries.length > 1 ? `${entries.length} entries · click to switch` : "";
    this.render();
  }

  setSnapshots(snapshots: CarSnapshot[]): void {
    this.snapshots = snapshots;
    this.render();
  }

  setSelectedEntry(entryId: string): void {
    if (!entryId || entryId === this.selectedId) return;
    if (!this.entries.some((e) => e.entryId === entryId)) return;
    this.selectedId = entryId;
    this.render();
  }

  getSelectedEntryId(): string {
    return this.selectedId;
  }

  isMultiEntry(): boolean {
    return this.entries.length > 1;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.triggerBtn.disabled = !enabled;
    this.root.classList.toggle("spectator-readonly", !enabled);
    for (const btn of this.gridEl.querySelectorAll("button")) {
      btn.disabled = !enabled;
    }
    if (!enabled) this.setOpen(false);
  }

  private setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.root.classList.toggle("is-open", open);
    this.triggerBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      this.panelEl.classList.remove("hidden");
      this.mountPanelPortal();
      requestAnimationFrame(() => {
        if (!this.open) return;
        this.positionPanel();
        this.bindRepositionListeners();
      });
    } else {
      this.unbindRepositionListeners();
      this.panelEl.classList.add("hidden");
      this.unmountPanelPortal();
    }
  }

  /** Move panel to body so sidebar overflow does not clip it. */
  private mountPanelPortal(): void {
    if (this.panelEl.parentElement === document.body) return;
    this.panelAnchor = document.createComment("team-car-grid-panel");
    this.panelEl.parentElement!.insertBefore(this.panelAnchor, this.panelEl);
    document.body.appendChild(this.panelEl);
    this.panelEl.classList.add("team-car-grid-panel--floating");
  }

  private unmountPanelPortal(): void {
    this.clearPanelPosition();
    this.panelEl.classList.remove("team-car-grid-panel--floating");
    if (this.panelAnchor?.parentElement) {
      this.panelAnchor.parentElement.insertBefore(this.panelEl, this.panelAnchor);
      this.panelAnchor.remove();
    }
    this.panelAnchor = null;
  }

  /** Escape sidebar overflow clipping; panel scrolls internally. */
  private positionPanel(): void {
    if (!this.open) return;
    const rect = this.triggerBtn.getBoundingClientRect();
    const gap = 6;
    const edgePad = 12;
    const maxBelow = window.innerHeight - rect.bottom - gap - edgePad;
    const maxAbove = rect.top - gap - edgePad;
    const openDown = maxBelow >= 140 || maxBelow >= maxAbove;
    const maxH = Math.max(120, Math.min(280, openDown ? maxBelow : maxAbove));

    this.panelEl.style.position = "fixed";
    this.panelEl.style.left = `${rect.left}px`;
    this.panelEl.style.width = `${rect.width}px`;
    this.panelEl.style.right = "auto";
    this.panelEl.style.maxHeight = `${maxH}px`;
    if (openDown) {
      this.panelEl.style.top = `${rect.bottom + gap}px`;
      this.panelEl.style.bottom = "auto";
    } else {
      this.panelEl.style.top = "auto";
      this.panelEl.style.bottom = `${window.innerHeight - rect.top + gap}px`;
    }
  }

  private clearPanelPosition(): void {
    this.panelEl.style.position = "";
    this.panelEl.style.left = "";
    this.panelEl.style.right = "";
    this.panelEl.style.top = "";
    this.panelEl.style.bottom = "";
    this.panelEl.style.width = "";
    this.panelEl.style.maxHeight = "";
  }

  private bindRepositionListeners(): void {
    if (this.onReposition) return;
    this.onReposition = () => this.positionPanel();
    window.addEventListener("resize", this.onReposition);
    this.scrollParent =
      this.root.closest(".sidebar-panels") ?? this.root.closest(".sidebar");
    this.scrollParent?.addEventListener("scroll", this.onReposition, { passive: true });
  }

  private unbindRepositionListeners(): void {
    if (!this.onReposition) return;
    window.removeEventListener("resize", this.onReposition);
    this.scrollParent?.removeEventListener("scroll", this.onReposition);
    this.scrollParent = null;
    this.onReposition = null;
  }

  private selectedEntry(): ManagedEntryOption | undefined {
    return this.entries.find((e) => e.entryId === this.selectedId);
  }

  private snapFor(entryId: string): CarSnapshot | undefined {
    return this.snapshots.find((s) => s.entryId === entryId);
  }

  private render(): void {
    const show = this.entries.length > 1;
    this.root.classList.toggle("hidden", !show);
    if (!show) {
      this.setOpen(false);
      return;
    }

    const entry = this.selectedEntry();
    const snap = entry ? this.snapFor(entry.entryId) : undefined;
    if (entry) {
      this.triggerBodyEl.innerHTML = `<div class="${cardClasses(entry.entryId, this.selectedId, snap)} team-car-card-compact">${buildCardHtml(entry, snap, true)}</div>`;
    } else {
      this.triggerBodyEl.textContent = "Select a car";
    }

    this.gridEl.replaceChildren();
    for (const item of this.entries) {
      const itemSnap = this.snapFor(item.entryId);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = cardClasses(item.entryId, this.selectedId, itemSnap);
      btn.dataset.entryId = item.entryId;
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", item.entryId === this.selectedId ? "true" : "false");
      btn.innerHTML = buildCardHtml(item, itemSnap);
      btn.disabled = !this.enabled;
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (!this.enabled || item.entryId === this.selectedId) {
          this.setOpen(false);
          return;
        }
        this.selectedId = item.entryId;
        this.handlers.onSelect(item.entryId);
        this.setOpen(false);
        this.render();
      });
      this.gridEl.appendChild(btn);
    }

    if (this.open) this.positionPanel();
  }
}
