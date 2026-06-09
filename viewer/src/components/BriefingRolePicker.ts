import type { CarSessionBriefing, FleetCarPayload, WeekendSessionType } from "../ws/protocol";
import {
  briefingIdsForSession,
  briefingLabel,
  briefingPreviewText,
  carsSharingClass,
} from "../utils/briefingUi";
export interface BriefingRolePickerHandlers {
  onChange: (carId: string, briefing: CarSessionBriefing) => void;
}

export class BriefingRolePicker {
  readonly root: HTMLElement;
  private handlers: BriefingRolePickerHandlers;
  private sessionType: WeekendSessionType = "race";
  private briefings = new Map<string, CarSessionBriefing>();
  private fleet: FleetCarPayload[] = [];
  private activeCarId = "";
  private previewEl!: HTMLElement;

  constructor(handlers: BriefingRolePickerHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("div");
    this.root.className = "briefing-role-picker";
    this.root.innerHTML = `
      <h4 class="chassis-setup-heading">Session briefing</h4>
      <label class="mm-field briefing-role-field">
        <span class="engine-slider-name">Race order</span>
        <select class="briefing-role-select"></select>
      </label>
      <div class="briefing-team-coord hidden">
        <label class="mm-field">
          Priority
          <select class="briefing-priority-select">
            <option value="">—</option>
            <option value="lead">Lead car</option>
            <option value="support">Support</option>
          </select>
        </label>
        <label class="mm-field">
          Teammate policy
          <select class="briefing-teammate-select">
            <option value="none">None</option>
            <option value="yield">Yield — don't fight</option>
            <option value="support">Support sister car</option>
          </select>
        </label>
      </div>
      <p class="briefing-pitbot-preview"></p>
    `;
    this.previewEl = this.root.querySelector(".briefing-pitbot-preview")!;

    const roleSelect = this.root.querySelector<HTMLSelectElement>(".briefing-role-select")!;
    roleSelect.addEventListener("change", () => this.emitChange());
    this.root.querySelector<HTMLSelectElement>(".briefing-priority-select")!.addEventListener(
      "change",
      () => this.emitChange(),
    );
    this.root.querySelector<HTMLSelectElement>(".briefing-teammate-select")!.addEventListener(
      "change",
      () => this.emitChange(),
    );
  }

  load(
    fleet: FleetCarPayload[],
    sessionType: WeekendSessionType,
    briefings: Map<string, CarSessionBriefing>,
    activeCarId: string,
  ): void {
    this.fleet = fleet;
    this.sessionType = sessionType;
    this.briefings = new Map(briefings);
    this.activeCarId = activeCarId;
    this.render();
  }

  setActiveCar(carId: string): void {
    this.activeCarId = carId;
    this.render();
  }

  getBriefings(): CarSessionBriefing[] {
    return [...this.briefings.values()];
  }

  private emitChange(): void {
    const car = this.fleet.find((c) => c.id === this.activeCarId);
    if (!car) return;
    const roleSelect = this.root.querySelector<HTMLSelectElement>(".briefing-role-select")!;
    const prioritySelect = this.root.querySelector<HTMLSelectElement>(".briefing-priority-select")!;
    const teammateSelect = this.root.querySelector<HTMLSelectElement>(".briefing-teammate-select")!;
    const briefing: CarSessionBriefing = {
      carId: car.id,
      briefingId: roleSelect.value,
      priority:
        prioritySelect.value === "lead" || prioritySelect.value === "support"
          ? prioritySelect.value
          : undefined,
      teammatePolicy:
        teammateSelect.value === "yield" || teammateSelect.value === "support"
          ? teammateSelect.value
          : teammateSelect.value === "none"
            ? "none"
            : undefined,
    };
    this.briefings.set(car.id, briefing);
    this.handlers.onChange(car.id, briefing);
    this.previewEl.textContent = `PitBot: ${briefingPreviewText(
      briefing.briefingId,
      this.sessionType,
      car.classId,
    )}`;
  }

  private render(): void {
    const car = this.fleet.find((c) => c.id === this.activeCarId);
    const roleSelect = this.root.querySelector<HTMLSelectElement>(".briefing-role-select")!;
    const ids = briefingIdsForSession(this.sessionType);
    roleSelect.replaceChildren();
    for (const id of ids) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = briefingLabel(id);
      roleSelect.appendChild(opt);
    }

    const briefing = this.briefings.get(this.activeCarId);
    if (briefing) {
      roleSelect.value = briefing.briefingId;
      const prioritySelect = this.root.querySelector<HTMLSelectElement>(".briefing-priority-select")!;
      prioritySelect.value = briefing.priority ?? "";
      const teammateSelect = this.root.querySelector<HTMLSelectElement>(".briefing-teammate-select")!;
      teammateSelect.value = briefing.teammatePolicy ?? "none";
    }

    const teamCoord = this.root.querySelector(".briefing-team-coord")!;
    const multiClass = car ? carsSharingClass(this.fleet, car.classId) > 1 : false;
    teamCoord.classList.toggle("hidden", !multiClass);

    this.previewEl.textContent = car
      ? `PitBot: ${briefingPreviewText(
          briefing?.briefingId ?? roleSelect.value,
          this.sessionType,
          car.classId,
        )}`
      : "";
  }
}
