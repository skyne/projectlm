import { NAV_ICONS } from "../utils/mmUi";

export type MainView =
  | "season"
  | "calendar"
  | "map"
  | "timing"
  | "telemetry"
  | "racelog"
  | "team"
  | "garage"
  | "drivers";

const OFFSEASON_TABS: MainView[] = ["season", "calendar", "garage", "drivers", "team"];
const RACE_TABS: MainView[] = ["map", "timing", "telemetry", "racelog"];

const TAB_LABELS: Record<MainView, string> = {
  season: "Championship",
  calendar: "Calendar",
  map: "Track Map",
  timing: "Live Timing",
  telemetry: "Telemetry",
  racelog: "Race Log",
  garage: "Garage",
  drivers: "Drivers",
  team: "Headquarters",
};

export class HeaderNav {
  readonly root: HTMLElement;
  private onChange?: (view: MainView) => void;
  private active: MainView = "season";
  private raceActive = false;
  private raceLogAvailable = false;
  private garageBuildLocked = false;
  private buttons = new Map<MainView, HTMLButtonElement>();

  constructor(container: HTMLElement) {
    this.root = document.createElement("nav");
    this.root.className = "view-nav view-nav-wec";
    this.root.setAttribute("aria-label", "Main navigation");

    const allViews: MainView[] = [
      "season",
      "calendar",
      "map",
      "timing",
      "telemetry",
      "racelog",
      "garage",
      "drivers",
      "team",
    ];
    for (const view of allViews) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "view-tab";
      button.dataset.view = view;
      button.title = TAB_LABELS[view];
      button.innerHTML = `
        <span class="view-tab-icon" aria-hidden="true">${NAV_ICONS[view] ?? "•"}</span>
        <span class="view-tab-label">${TAB_LABELS[view]}</span>
      `;
      button.addEventListener("click", () => {
        if (button.hidden) return;
        this.onChange?.(view);
      });
      this.buttons.set(view, button);
      this.root.appendChild(button);
    }

    container.appendChild(this.root);
    this.applyTabVisibility();
    this.setActive("season");
  }

  setHandler(handler: (view: MainView) => void): void {
    this.onChange = handler;
  }

  setRaceActive(active: boolean): void {
    this.raceActive = active;
    this.applyTabVisibility();
    if (
      active &&
      (this.active === "garage" ||
        this.active === "team" ||
        this.active === "season" ||
        this.active === "calendar" ||
        this.active === "drivers")
    ) {
      this.setActive("map");
    } else if (
      !active &&
      !this.raceLogAvailable &&
      (this.active === "map" ||
        this.active === "timing" ||
        this.active === "telemetry" ||
        this.active === "racelog")
    ) {
      this.setActive(this.garageBuildLocked ? "garage" : "season");
    }
  }

  setRaceLogAvailable(available: boolean): void {
    this.raceLogAvailable = available;
    this.applyTabVisibility();
  }

  isRaceActive(): boolean {
    return this.raceActive;
  }

  setGarageBuildLocked(locked: boolean): void {
    this.garageBuildLocked = locked;
    this.applyTabVisibility();
    if (locked && !this.raceActive) {
      this.setActive("garage");
    }
  }

  private applyTabVisibility(): void {
    for (const view of OFFSEASON_TABS) {
      const btn = this.buttons.get(view)!;
      if (this.raceActive) {
        btn.hidden = true;
      } else if (this.garageBuildLocked) {
        btn.hidden = view !== "garage";
      } else {
        btn.hidden = false;
      }
    }
    for (const view of RACE_TABS) {
      const btn = this.buttons.get(view)!;
      if (view === "racelog") {
        btn.hidden = !(this.raceActive || this.raceLogAvailable);
      } else {
        btn.hidden = !this.raceActive;
      }
    }
  }

  setActive(view: MainView): void {
    if (
      this.raceActive &&
      (view === "garage" ||
        view === "team" ||
        view === "season" ||
        view === "calendar" ||
        view === "drivers")
    ) {
      return;
    }
    if (!this.raceActive && (view === "map" || view === "timing" || view === "telemetry")) {
      return;
    }
    if (!this.raceActive && !this.raceLogAvailable && view === "racelog") {
      return;
    }
    this.active = view;
    for (const [v, button] of this.buttons) {
      const isActive = v === view && !button.hidden;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-current", isActive ? "page" : "false");
    }
  }

  getActive(): MainView {
    return this.active;
  }
}
