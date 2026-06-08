import type {
  BuyCarPayload,
  CarAffiliation,
  CarAcquisition,
  CreateTeamPayload,
  DriverProfilePayload,
  DriverStatDefPayload,
  GameCatalogPayload,
  StaffCandidatePayload,
  StaffMemberPayload,
  TeamCreationDraftPayload,
  TeamCreationWizardStep,
} from "../ws/protocol";
import {
  affiliationHintForClass,
  defaultQuantity,
  hypercarMfgWarning,
  unitCostForBuy,
} from "../utils/fleetUi";
import { closeColorPicker } from "../utils/colorPicker";
import {
  bindLiveryPatternPicker,
  createLiveryPreviewCard,
  type LiveryPreviewMount,
} from "./LiveryPreview";
import {
  bindColorSwatches,
  COLOR_PRESETS,
  DEFAULT_SECONDARY,
} from "../utils/liveryColors";
import { processLogoUpload } from "../utils/teamLogo";
import {
  DEFAULT_LIVERY_PATTERN,
  randomLiveryPattern,
  type LiveryPattern,
} from "../utils/teamLivery";

export interface TeamCreationHandlers {
  onComplete: (payload: CreateTeamPayload) => void;
  onSaveDraft: (draft: TeamCreationDraftPayload) => void;
  canFoundTeam?: () => boolean;
}

type WizardStep = TeamCreationWizardStep;

interface StepValidation {
  ok: boolean;
  message: string | null;
}

const REQUIRED_STAFF_ROLES = ["engineer", "mechanic", "strategist"] as const;

const DRIVER_BASELINE: Record<string, number> = {
  dryPace: 68, wetPace: 64, consistency: 68, overtaking: 66, defending: 66,
  trafficManagement: 66, rollingStart: 64, standingStart: 64, setupFeedback: 60,
  tireManagement: 66, fuelSaving: 64, composure: 68, nightPace: 64, rainRadar: 60, stamina: 68,
};

const DRIVER_FIRST = ["Alex", "Marco", "Elena", "Luca", "Sofia", "Kai", "Nina", "Oliver", "Yuki", "Ines"];
const DRIVER_LAST = ["Voss", "Reeves", "Okonkwo", "Bianchi", "Kowalski", "Santos", "Chen", "Müller", "Dupont"];
const DRIVER_NATS = ["GB", "FR", "DE", "IT", "US", "BR", "JP", "ES", "NL", "AU"];

function inferDriverTier(d: DriverProfilePayload): string {
  const avg = (d.dryPace + d.wetPace + d.consistency) / 3;
  if (avg >= 90) return "Platinum";
  if (avg >= 82) return "Gold";
  if (avg >= 74) return "Silver";
  return "Bronze";
}

function driverPointCost(d: DriverProfilePayload, defs: DriverStatDefPayload[]): number {
  let cost = 0;
  for (const def of defs) {
    const v = d[def.key as keyof DriverProfilePayload] as number;
    const base = DRIVER_BASELINE[def.key] ?? 66;
    cost += Math.max(0, v - base) * def.costPerPoint;
  }
  const tierBonus = d.tier === "Platinum" ? 80 : d.tier === "Gold" ? 40 : 0;
  return Math.round(cost + tierBonus);
}

function randomWizardDriver(): DriverProfilePayload {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  const j = (b: number, s: number) => Math.round(Math.min(96, Math.max(55, b + (Math.random() - 0.5) * s)));
  const d: DriverProfilePayload = {
    id: crypto.randomUUID(),
    name: `${pick(DRIVER_FIRST)} ${pick(DRIVER_LAST)}`,
    nationality: pick(DRIVER_NATS),
    tier: "Silver",
    dryPace: j(76, 18), wetPace: j(72, 16), consistency: j(74, 16),
    overtaking: j(72, 14), defending: j(70, 14), trafficManagement: j(72, 12),
    rollingStart: j(70, 12), standingStart: j(70, 12), setupFeedback: j(66, 14),
    tireManagement: j(72, 12), fuelSaving: j(68, 12), composure: j(72, 16),
    nightPace: j(70, 12), rainRadar: j(66, 12), stamina: j(74, 14),
    maxStintHours: Math.random() > 0.7 ? 3 : 2.5,
  };
  d.tier = inferDriverTier(d);
  return d;
}

function defaultWizardRoster(team: string): DriverProfilePayload[] {
  return [
    {
      id: crypto.randomUUID(),
      name: `${team} Ace`, nationality: "GB", tier: "Gold",
      dryPace: 84, wetPace: 78, consistency: 82, overtaking: 80, defending: 78,
      trafficManagement: 80, rollingStart: 78, standingStart: 76, setupFeedback: 74,
      tireManagement: 80, fuelSaving: 76, composure: 82, nightPace: 78, rainRadar: 72,
      stamina: 80, maxStintHours: 3,
    },
    {
      id: crypto.randomUUID(),
      name: `${team} Endurance`, nationality: "FR", tier: "Silver",
      dryPace: 78, wetPace: 74, consistency: 80, overtaking: 72, defending: 76,
      trafficManagement: 78, rollingStart: 74, standingStart: 72, setupFeedback: 70,
      tireManagement: 82, fuelSaving: 80, composure: 78, nightPace: 76, rainRadar: 70,
      stamina: 84, maxStintHours: 3.5,
    },
  ];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function driverNameKey(name: string): string {
  return name.trim().toLowerCase();
}

function rosterHasDriverName(roster: DriverProfilePayload[], name: string): boolean {
  const key = driverNameKey(name);
  return roster.some((r) => driverNameKey(r.name) === key);
}

export class TeamCreationWizard {
  readonly root: HTMLElement;
  private catalog: GameCatalogPayload | null = null;
  private step: WizardStep = "identity";
  private teamName = "";
  private primaryColor = COLOR_PRESETS[0];
  private secondaryColor = DEFAULT_SECONDARY;
  private liveryPattern: LiveryPattern = randomLiveryPattern();
  private logoDataUrl: string | null = null;
  private liveryPreviewMount: LiveryPreviewMount | null = null;
  private classId = "Hypercar";
  private affiliation: CarAffiliation = "privateer";
  private acquisition: CarAcquisition = "privateer";
  private platformId = "";
  private carQuantity = 1;
  private selectedStaff = new Map<string, StaffCandidatePayload>();
  private driverRoster: DriverProfilePayload[] = [];
  private selectedDriver = 0;
  private handlers: TeamCreationHandlers;

  private stepsEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private backBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;
  private footerMsgEl!: HTMLElement;
  private submitting = false;

  constructor(container: HTMLElement, handlers: TeamCreationHandlers) {
    this.handlers = handlers;
    this.root = container;
    this.root.className = "team-wizard-overlay hidden";
    this.root.innerHTML = `
      <div class="team-wizard-card">
        <header class="team-wizard-header">
          <div class="team-wizard-brand">
            <span class="wizard-badge mm-badge-wec">FIA WEC · New Team</span>
            <h2>Establish Your Endurance Team</h2>
            <p class="wizard-subtitle">Walk through each step to name your team, pick colors, choose a class programme, hire staff, and sign drivers.</p>
          </div>
          <nav class="wizard-steps" aria-label="Setup steps"></nav>
        </header>
        <div class="team-wizard-body"></div>
        <footer class="team-wizard-footer">
          <button type="button" class="secondary-btn wizard-back">Back</button>
          <div class="wizard-footer-end">
            <p class="wizard-footer-msg" role="status" aria-live="polite"></p>
            <button type="button" class="primary-btn wizard-next">Continue</button>
          </div>
        </footer>
      </div>
    `;

    this.stepsEl = this.root.querySelector(".wizard-steps")!;
    this.bodyEl = this.root.querySelector(".team-wizard-body")!;
    this.backBtn = this.root.querySelector(".wizard-back")!;
    this.nextBtn = this.root.querySelector(".wizard-next")!;
    this.footerMsgEl = this.root.querySelector(".wizard-footer-msg")!;

    this.backBtn.addEventListener("click", () => this.goBack());
    this.nextBtn.addEventListener("click", () => this.goNext());
  }

  setCatalog(catalog: GameCatalogPayload): void {
    this.catalog = catalog;
    if (catalog.classes.length > 0 && !catalog.classes.find((c) => c.id === this.classId)) {
      this.classId = catalog.classes[0].id;
    }
    const platforms = catalog.carPlatforms?.filter((p) => p.classId === this.classId) ?? [];
    if (platforms.length > 0 && !platforms.find((p) => p.id === this.platformId)) {
      this.platformId = platforms[0].id;
    }
    this.syncStaffFromCatalog(catalog);
    if (!this.root.classList.contains("hidden")) this.render();
  }

  open(draft?: TeamCreationDraftPayload | null): void {
    this.restoreFromDraft(draft);
    this.root.classList.remove("hidden");
    this.render();
  }

  /** @deprecated Use open() — kept so callers can detect visibility without resetting state. */
  show(): void {
    if (this.isVisible()) return;
    this.open(null);
  }

  hide(): void {
    this.root.classList.add("hidden");
    this.submitting = false;
  }

  isVisible(): boolean {
    return !this.root.classList.contains("hidden");
  }

  /** Show a server or permission error on the confirm step footer. */
  setError(message: string | null): void {
    this.submitting = false;
    if (!message) {
      this.updateNavState();
      return;
    }
    this.updateNavState({ ok: false, message });
  }

  /** Re-run footer validation after role/permission changes. */
  refreshNavState(): void {
    if (this.isVisible()) this.updateNavState();
  }

  private steps(): WizardStep[] {
    return ["identity", "livery", "firstCar", "staff", "drivers", "confirm"];
  }

  private stepLabel(s: WizardStep): string {
    const labels: Record<WizardStep, string> = {
      identity: "Team Name",
      livery: "Livery",
      firstCar: "Class & Car",
      staff: "Personnel",
      drivers: "Drivers",
      confirm: "Confirm",
    };
    return labels[s];
  }

  private stepGuide(): string {
    const guides: Record<WizardStep, string> = {
      identity: "Step 1 — Choose your team name. It appears on entry lists, timing screens, and your livery.",
      livery: "Step 2 — Choose team colors, a stripe pattern, and optionally upload your logo.",
      firstCar: "Step 3 — Start your first class programme. Affiliation is per class: building a Hypercar makes you a Hypercar manufacturer; other classes can differ.",
      staff: "Step 4 — Hire one engineer, mechanic, and strategist from the candidate pool.",
      drivers: "Step 5 — Build your endurance line-up (2–3 drivers). Fine-tune stats later in Driver Center.",
      confirm: "Step 6 — Review your choices, then found your team and head to the Garage.",
    };
    return guides[this.step];
  }

  private goBack(): void {
    const idx = this.steps().indexOf(this.step);
    if (idx > 0) {
      const prevStep = this.steps()[idx - 1];
      this.persistDraft(prevStep);
      this.step = prevStep;
      this.render();
    }
  }

  private goNext(): void {
    const validation = this.stepValidation();
    if (!validation.ok) {
      this.updateNavState(validation);
      return;
    }
    const idx = this.steps().indexOf(this.step);
    if (idx < this.steps().length - 1) {
      const nextStep = this.steps()[idx + 1];
      this.persistDraft(nextStep);
      this.step = nextStep;
      this.render();
      return;
    }
    this.submit();
  }

  private buildDraft(step: WizardStep): TeamCreationDraftPayload {
    return {
      step,
      teamName: this.teamName,
      primaryColor: this.primaryColor,
      secondaryColor: this.secondaryColor,
      liveryPattern: this.liveryPattern,
      logoDataUrl: this.logoDataUrl,
      classId: this.classId,
      affiliation: this.affiliation,
      platformId: this.platformId,
      carQuantity: this.carQuantity,
      staff: [...this.selectedStaff.values()].map((s) => ({
        role: s.role,
        name: s.name,
        skill: s.skill,
      })),
      driverRoster: this.driverRoster.map((d) => ({ ...d })),
    };
  }

  private persistDraft(step: WizardStep): void {
    this.handlers.onSaveDraft(this.buildDraft(step));
  }

  private restoreFromDraft(draft?: TeamCreationDraftPayload | null): void {
    if (!draft) {
      this.step = "identity";
      this.teamName = "";
      this.primaryColor = COLOR_PRESETS[0];
      this.secondaryColor = DEFAULT_SECONDARY;
      this.liveryPattern = randomLiveryPattern();
      this.logoDataUrl = null;
      this.classId = "Hypercar";
      this.affiliation = "privateer";
      this.acquisition = "privateer";
      this.platformId = "";
      this.carQuantity = 1;
      this.selectedStaff.clear();
      this.driverRoster = [];
      this.selectedDriver = 0;
      return;
    }

    this.step = draft.step;
    this.teamName = draft.teamName;
    this.primaryColor = draft.primaryColor || COLOR_PRESETS[0];
    this.secondaryColor = draft.secondaryColor || DEFAULT_SECONDARY;
    this.liveryPattern = draft.liveryPattern ?? DEFAULT_LIVERY_PATTERN;
    this.logoDataUrl = draft.logoDataUrl ?? null;
    this.classId = draft.classId || "Hypercar";
    this.affiliation = draft.affiliation === "manufacturer" ? "manufacturer" : "privateer";
    this.acquisition = this.affiliation === "manufacturer" ? "build" : "privateer";
    this.platformId = draft.platformId ?? "";
    this.carQuantity = draft.carQuantity ?? 1;
    this.selectedStaff.clear();
    for (const s of draft.staff ?? []) {
      const match = this.catalog?.staffCandidates?.find(
        (c) => c.role === s.role && c.name === s.name,
      );
      this.selectedStaff.set(
        s.role,
        match ?? {
          role: s.role,
          name: s.name,
          skill: s.skill,
          salary: 120_000 + s.skill * 1500,
        },
      );
    }
    this.driverRoster = (draft.driverRoster ?? []).map((d) => ({
      ...d,
      id: d.id?.trim() || crypto.randomUUID(),
    }));
    this.selectedDriver = 0;
  }

  private syncStaffFromCatalog(catalog: GameCatalogPayload): void {
    for (const [role, staff] of [...this.selectedStaff]) {
      const match = catalog.staffCandidates?.find(
        (c) => c.role === role && c.name === staff.name,
      );
      if (match) this.selectedStaff.set(role, match);
    }
  }

  private stepValidation(): StepValidation {
    if (this.step === "identity") {
      const name = this.teamName.trim();
      if (name.length < 2) {
        return { ok: false, message: "Team name must be at least 2 characters." };
      }
      if (name.length > 40) {
        return { ok: false, message: "Team name must be 40 characters or fewer." };
      }
      return { ok: true, message: null };
    }

    if (this.step === "livery") {
      return { ok: true, message: null };
    }

    if (!this.catalog) {
      return { ok: false, message: "Loading game catalog…" };
    }

    if (this.step === "firstCar") {
      const rules = this.catalog.fleetRules;
      const mfgMin = rules.manufacturerHypercarMinCars ?? 2;
      const platforms =
        this.catalog.carPlatforms?.filter((p) => p.classId === this.classId) ?? [];

      if (this.affiliation === "privateer") {
        if (platforms.length === 0) {
          return { ok: false, message: "No customer platforms are available for this class." };
        }
        if (!this.platformId) {
          return { ok: false, message: "Select a platform to run as privateer." };
        }
      }

      if (
        this.classId === "Hypercar" &&
        this.affiliation === "manufacturer" &&
        this.carQuantity < mfgMin
      ) {
        return {
          ok: false,
          message: `Hypercar manufacturers must order at least ${mfgMin} cars (you have ${this.carQuantity}).`,
        };
      }

      const carCost = this.firstCarCost();
      const budget = this.startingBudget();
      if (carCost > budget) {
        return {
          ok: false,
          message: `This programme costs $${carCost.toLocaleString()} — more than your $${budget.toLocaleString()} starting budget.`,
        };
      }

      return { ok: true, message: null };
    }

    if (this.step === "staff") {
      const roles = new Set([...this.selectedStaff.values()].map((s) => s.role));
      const missing = REQUIRED_STAFF_ROLES.filter((role) => !roles.has(role));
      if (missing.length > 0) {
        return {
          ok: false,
          message: `Hire ${missing.join(", ")} to continue.`,
        };
      }

      const remaining = this.remainingBudget();
      if (remaining < 0) {
        return {
          ok: false,
          message: `Over budget by $${Math.abs(remaining).toLocaleString()} — choose cheaper staff or revise your class programme.`,
        };
      }

      return { ok: true, message: null };
    }

    if (this.step === "drivers") {
      const err = this.driverRosterError();
      if (err) return { ok: false, message: err };
      return { ok: true, message: null };
    }

    if (this.step === "confirm") {
      if (this.handlers.canFoundTeam && !this.handlers.canFoundTeam()) {
        return {
          ok: false,
          message:
            "Only the session host can found a team. Open Identity in the header and reconnect as Host, or ask the current host to finish setup.",
        };
      }
      if (!this.catalog) {
        return { ok: false, message: "Loading game catalog…" };
      }
      const missing = this.missingStaffRoles();
      if (missing.length > 0) {
        return {
          ok: false,
          message: `Hire ${missing.join(", ")} before founding.`,
        };
      }
      const driverErr = this.driverRosterError();
      if (driverErr) return { ok: false, message: driverErr };
      const mfgMin = this.catalog.fleetRules.manufacturerHypercarMinCars ?? 2;
      if (
        this.classId === "Hypercar" &&
        this.affiliation === "manufacturer" &&
        this.carQuantity < mfgMin
      ) {
        return {
          ok: false,
          message: `Hypercar manufacturers need at least ${mfgMin} cars — go back to Class & Car and increase quantity.`,
        };
      }
      const remaining = this.remainingBudget();
      if (remaining < 0) {
        return {
          ok: false,
          message: `Over budget by $${Math.abs(remaining).toLocaleString()} — go back and adjust your setup.`,
        };
      }
      return { ok: true, message: null };
    }

    return { ok: true, message: null };
  }

  private driverRosterError(): string | null {
    if (this.driverRoster.length < 1) {
      return "Add at least one driver to your line-up.";
    }

    const pool = this.catalog?.driverPointPool ?? 750;
    const defs = this.catalog?.driverStatDefs ?? [];
    for (const driver of this.driverRoster) {
      if (!driver.name.trim()) {
        return "Every driver needs a name.";
      }
      const cost = driverPointCost(driver, defs);
      if (cost > pool) {
        const label = driver.name.trim() || "A driver";
        return `${label} exceeds the ${pool}-point budget (${cost} pts).`;
      }
    }

    return null;
  }

  private missingStaffRoles(): string[] {
    const roles = new Set([...this.selectedStaff.values()].map((s) => s.role));
    return REQUIRED_STAFF_ROLES.filter((role) => !roles.has(role));
  }

  private updateNavState(validation = this.stepValidation()): void {
    if (this.submitting) {
      this.nextBtn.disabled = true;
      return;
    }
    this.nextBtn.disabled = !validation.ok;
    this.footerMsgEl.textContent = validation.message ?? "";
    this.footerMsgEl.classList.toggle("visible", Boolean(validation.message));
  }

  private ensureDriverRoster(): void {
    if (this.driverRoster.length === 0) {
      const name = this.teamName.trim() || "Your Team";
      this.driverRoster = defaultWizardRoster(name);
    }
  }

  private firstCarPayload(): BuyCarPayload {
    const base = {
      classId: this.classId,
      quantity: this.carQuantity,
    };
    if (this.affiliation === "manufacturer") {
      return {
        ...base,
        affiliation: "manufacturer",
        acquisition: "build",
      };
    }
    return {
      ...base,
      affiliation: "privateer",
      acquisition: "privateer",
      platformId: this.platformId,
    };
  }

  private firstCarCost(): number {
    if (!this.catalog) return 0;
    const unit = unitCostForBuy(
      this.catalog,
      this.classId,
      this.affiliation,
      this.platformId,
    );
    return unit * this.carQuantity;
  }

  private startingBudget(): number {
    return this.catalog?.fleetRules.startingBudget ?? 500_000_000;
  }

  private staffCost(): number {
    return [...this.selectedStaff.values()].reduce((s, p) => s + p.salary, 0);
  }

  private remainingBudget(): number {
    return this.startingBudget() - this.staffCost() - this.firstCarCost();
  }

  private submit(): void {
    const validation = this.stepValidation();
    if (!validation.ok) {
      this.updateNavState(validation);
      return;
    }
    this.submitting = true;
    this.footerMsgEl.textContent = "Founding team…";
    this.footerMsgEl.classList.add("visible");
    this.nextBtn.disabled = true;

    const staff: StaffMemberPayload[] = [...this.selectedStaff.values()].map((s) => ({
      role: s.role,
      name: s.name,
      skill: s.skill,
    }));
    this.handlers.onComplete({
      teamName: this.teamName.trim(),
      primaryColor: this.primaryColor,
      secondaryColor: this.secondaryColor,
      liveryPattern: this.liveryPattern,
      logoDataUrl: this.logoDataUrl,
      staff,
      firstCar: this.firstCarPayload(),
      driverRoster: this.driverRoster.map((d) => ({
        ...d,
        tier: inferDriverTier(d),
      })),
    });
  }

  private renderStepGuide(): void {
    const existing = this.bodyEl.querySelector(".wizard-step-guide");
    existing?.remove();
    const guide = document.createElement("p");
    guide.className = "wizard-step-guide";
    guide.textContent = this.stepGuide();
    this.bodyEl.prepend(guide);
  }

  private render(): void {
    if (this.step !== "livery") closeColorPicker();
    this.renderSteps();
    this.backBtn.disabled = this.step === "identity";
    this.nextBtn.textContent =
      this.step === "confirm" ? "Found Team" : "Continue";

    switch (this.step) {
      case "identity":
        this.renderIdentity();
        break;
      case "livery":
        this.renderLivery();
        break;
      case "firstCar":
        this.renderFirstCar();
        break;
      case "staff":
        this.renderStaff();
        break;
      case "drivers":
        this.ensureDriverRoster();
        this.renderDrivers();
        break;
      case "confirm":
        this.renderConfirm();
        break;
    }

    this.updateNavState();
  }

  private renderSteps(): void {
    this.stepsEl.replaceChildren();
    const currentIdx = this.steps().indexOf(this.step);
    for (const s of this.steps()) {
      const el = document.createElement("div");
      el.className = "wizard-step-pill";
      const stepIdx = this.steps().indexOf(s);
      if (s === this.step) {
        el.classList.add("active");
      } else if (stepIdx < currentIdx) {
        el.classList.add("done");
        el.setAttribute("role", "button");
        el.tabIndex = 0;
        el.title = `Return to ${this.stepLabel(s)}`;
        const goTo = () => {
          this.persistDraft(s);
          this.step = s;
          this.render();
        };
        el.addEventListener("click", goTo);
        el.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            goTo();
          }
        });
      }
      el.textContent = this.stepLabel(s);
      this.stepsEl.appendChild(el);
    }
  }

  private renderIdentity(): void {
    const name = this.teamName.trim();
    const nameTooShort = name.length > 0 && name.length < 2;
    const nameTooLong = this.teamName.length > 40;

    this.bodyEl.innerHTML = `
      <div class="wizard-split">
        <div class="wizard-form-col">
          <label class="wizard-field">
            <span>Team Name</span>
            <input type="text" class="wizard-input team-name-input${nameTooShort || nameTooLong ? " wizard-input-invalid" : ""}" maxlength="40" placeholder="e.g. AF Corse" value="${escapeHtml(this.teamName)}" />
          </label>
          <p class="wizard-hint">2–40 characters. You can run mixed Hypercar and GT3 programmes later from Team HQ.</p>
          <p class="wizard-hint wizard-char-count${nameTooShort || nameTooLong ? " fleet-rule-warning" : ""}">${this.teamName.length} / 40 characters</p>
          ${nameTooShort ? `<p class="wizard-hint fleet-rule-warning">Enter at least 2 characters.</p>` : ""}
          ${nameTooLong ? `<p class="wizard-hint fleet-rule-warning">Team name is too long.</p>` : ""}
        </div>
        <div class="wizard-preview-col">
          <div class="wizard-livery-preview-host"></div>
        </div>
      </div>
    `;

    const input = this.bodyEl.querySelector<HTMLInputElement>(".team-name-input")!;
    input.addEventListener("input", () => {
      this.teamName = input.value;
      this.syncWizardLiveryPreview();
      this.updateNavState();
    });
    this.mountWizardLiveryPreview();
    this.renderStepGuide();
  }

  private renderLivery(): void {
    this.bodyEl.innerHTML = `
      <div class="wizard-split">
        <div class="wizard-form-col">
          <div class="wizard-field">
            <span>Primary Livery Color</span>
            <div class="color-swatches primary-swatches"></div>
          </div>
          <div class="wizard-field">
            <span>Secondary Livery Color</span>
            <div class="color-swatches secondary-swatches"></div>
          </div>
          <div class="wizard-field">
            <div class="livery-field-head">
              <span>Stripe pattern</span>
              <button type="button" class="secondary-btn wizard-random-pattern-btn">Random</button>
            </div>
            <div class="livery-pattern-picker wizard-pattern-picker"></div>
          </div>
          <div class="wizard-field">
            <span>Team logo (optional)</span>
            <div class="livery-logo-row">
              <div class="livery-logo-preview wizard-logo-preview" aria-hidden="true"></div>
              <div class="livery-logo-actions">
                <label class="secondary-btn livery-logo-upload-label">
                  Upload image
                  <input type="file" class="wizard-logo-input hidden" accept="image/*" />
                </label>
                <button type="button" class="secondary-btn wizard-logo-clear-btn"${this.logoDataUrl ? "" : " disabled"}>Remove</button>
              </div>
            </div>
            <p class="wizard-hint wizard-logo-status">Any common image format — we resize it after upload.</p>
          </div>
        </div>
        <div class="wizard-preview-col">
          <div class="wizard-livery-preview-host"></div>
        </div>
      </div>
    `;

    this.bindLiverySwatches();
    bindLiveryPatternPicker(
      this.bodyEl.querySelector(".wizard-pattern-picker")!,
      this.liveryPattern,
      { primary: this.primaryColor, secondary: this.secondaryColor },
      (pattern) => {
        this.liveryPattern = pattern;
        this.syncWizardLiveryPreview();
        bindLiveryPatternPicker(
          this.bodyEl.querySelector(".wizard-pattern-picker")!,
          this.liveryPattern,
          { primary: this.primaryColor, secondary: this.secondaryColor },
          (p) => {
            this.liveryPattern = p;
            this.syncWizardLiveryPreview();
          },
        );
      },
    );
    this.bodyEl.querySelector(".wizard-random-pattern-btn")!.addEventListener("click", () => {
      this.liveryPattern = randomLiveryPattern();
      this.syncWizardLiveryPreview();
      bindLiveryPatternPicker(
        this.bodyEl.querySelector(".wizard-pattern-picker")!,
        this.liveryPattern,
        { primary: this.primaryColor, secondary: this.secondaryColor },
        (pattern) => {
          this.liveryPattern = pattern;
          this.syncWizardLiveryPreview();
        },
      );
    });

    const logoInput = this.bodyEl.querySelector<HTMLInputElement>(".wizard-logo-input")!;
    const clearLogoBtn = this.bodyEl.querySelector<HTMLButtonElement>(".wizard-logo-clear-btn")!;
    const logoStatus = this.bodyEl.querySelector<HTMLElement>(".wizard-logo-status")!;
    logoInput.addEventListener("change", () => {
      const file = logoInput.files?.[0];
      logoInput.value = "";
      if (!file) return;
      void processLogoUpload(file)
        .then((processed) => {
          this.logoDataUrl = processed.dataUrl;
          clearLogoBtn.disabled = false;
          if (logoStatus) {
            logoStatus.textContent = `Logo ready (${processed.width}×${processed.height}).`;
          }
          this.renderWizardLogoPreview();
          this.syncWizardLiveryPreview();
        })
        .catch((err) => {
          if (logoStatus) {
            logoStatus.textContent =
              err instanceof Error ? err.message : "Could not process logo";
            logoStatus.classList.add("fleet-rule-warning");
          }
        });
    });
    clearLogoBtn.addEventListener("click", () => {
      this.logoDataUrl = null;
      clearLogoBtn.disabled = true;
      this.renderWizardLogoPreview();
      this.syncWizardLiveryPreview();
    });

    this.renderWizardLogoPreview();
    this.mountWizardLiveryPreview();
    this.renderStepGuide();
  }

  private liveryPreviewOptions() {
    return {
      primary: this.primaryColor,
      secondary: this.secondaryColor,
      pattern: this.liveryPattern,
      logoDataUrl: this.logoDataUrl,
      classId: this.classId,
      teamName: this.teamName,
      width: 520,
      height: 140,
      layout: "showcase" as const,
    };
  }

  private mountWizardLiveryPreview(): void {
    const host = this.bodyEl.querySelector<HTMLElement>(".wizard-livery-preview-host");
    if (!host) return;
    this.liveryPreviewMount?.destroy();
    this.liveryPreviewMount = createLiveryPreviewCard(host, this.liveryPreviewOptions());
  }

  private syncWizardLiveryPreview(overrides?: {
    primary?: string;
    secondary?: string;
    pattern?: LiveryPattern;
  }): void {
    this.liveryPreviewMount?.update({
      ...this.liveryPreviewOptions(),
      primary: overrides?.primary ?? this.primaryColor,
      secondary: overrides?.secondary ?? this.secondaryColor,
      pattern: overrides?.pattern ?? this.liveryPattern,
      teamName: this.teamName,
    });
  }

  private renderWizardLogoPreview(): void {
    const host = this.bodyEl.querySelector<HTMLElement>(".wizard-logo-preview");
    if (!host) return;
    host.replaceChildren();
    if (this.logoDataUrl) {
      const img = document.createElement("img");
      img.src = this.logoDataUrl;
      img.alt = "";
      img.className = "livery-logo-thumb";
      host.appendChild(img);
      return;
    }
    const span = document.createElement("span");
    span.className = "livery-logo-placeholder";
    span.textContent = (this.teamName.trim() || "??").slice(0, 2).toUpperCase();
    host.appendChild(span);
  }

  private bindLiverySwatches(): void {
    bindColorSwatches(
      this.bodyEl.querySelector(".primary-swatches")!,
      this.primaryColor,
      (c) => {
        this.primaryColor = c;
        this.syncWizardLiveryPreview();
        this.bindLiverySwatches();
      },
      {
        onLive: (c) => this.syncWizardLiveryPreview({ primary: c }),
        onCancel: () => this.syncWizardLiveryPreview(),
      },
    );
    bindColorSwatches(
      this.bodyEl.querySelector(".secondary-swatches")!,
      this.secondaryColor,
      (c) => {
        this.secondaryColor = c;
        this.syncWizardLiveryPreview();
        this.bindLiverySwatches();
      },
      {
        onLive: (c) => this.syncWizardLiveryPreview({ secondary: c }),
        onCancel: () => this.syncWizardLiveryPreview(),
      },
    );
  }

  private renderFirstCar(): void {
    const classes = this.catalog?.classes ?? [];
    const platforms =
      this.catalog?.carPlatforms?.filter((p) => p.classId === this.classId) ?? [];
    const rules = this.catalog?.fleetRules;
    const mfgMin = rules?.manufacturerHypercarMinCars ?? 2;
    const maxQty = rules?.maxCarsPerPurchase ?? 6;
    const unitCost = this.catalog
      ? unitCostForBuy(this.catalog, this.classId, this.affiliation, this.platformId)
      : 0;
    const cost = unitCost * this.carQuantity;
    const mfgBelowMin =
      this.classId === "Hypercar" &&
      this.affiliation === "manufacturer" &&
      this.carQuantity < mfgMin;
    const mfgWarning = mfgBelowMin
      ? `Hypercar manufacturers must enter at least ${mfgMin} cars — increase quantity to continue.`
      : hypercarMfgWarning(this.classId, this.affiliation, this.carQuantity, mfgMin);
    const remaining = this.startingBudget() - cost;
    const overBudget = remaining < 0;
    const needsPlatform = this.affiliation === "privateer" && !this.platformId;
    const noPlatforms = this.affiliation === "privateer" && platforms.length === 0;

    this.bodyEl.innerHTML = `
      <p class="wizard-intro">Affiliation is per class, not per team. Build your own Hypercar and you are a Hypercar manufacturer — you can still run GT3 as a privateer later.</p>
      <div class="wizard-field">
        <span>This class</span>
        <div class="affiliation-toggle">
          <button type="button" class="affiliation-btn" data-aff="privateer">Privateer — buy platform</button>
          <button type="button" class="affiliation-btn" data-aff="manufacturer">Manufacturer — build new</button>
        </div>
      </div>
      <div class="class-select-grid class-select-compact"></div>
      <div class="platform-section"></div>
      <label class="wizard-field">
        <span>Number of cars</span>
        <input type="number" class="wizard-input first-car-qty" min="1" max="${maxQty}" value="${this.carQuantity}" />
      </label>
      ${mfgWarning ? `<p class="wizard-hint fleet-rule-warning">${escapeHtml(mfgWarning)}</p>` : ""}
      <p class="wizard-hint first-car-cost">$${unitCost.toLocaleString()} × ${this.carQuantity} = <strong>$${cost.toLocaleString()}</strong></p>
      <p class="wizard-hint${overBudget ? " fleet-rule-warning" : ""}">Starting budget after this purchase: $${remaining.toLocaleString()}</p>
      ${needsPlatform && !noPlatforms ? `<p class="wizard-hint fleet-rule-warning">Select a platform below to continue.</p>` : ""}
      ${noPlatforms ? `<p class="wizard-hint fleet-rule-warning">No platforms available for ${escapeHtml(this.classId)}.</p>` : ""}
      ${overBudget ? `<p class="wizard-hint fleet-rule-warning">Over budget by $${Math.abs(remaining).toLocaleString()} — pick a cheaper programme or fewer cars.</p>` : ""}
    `;

    for (const btn of this.bodyEl.querySelectorAll<HTMLButtonElement>(".affiliation-btn")) {
      const aff = btn.dataset.aff as CarAffiliation;
      if (aff === this.affiliation) btn.classList.add("selected");
      btn.addEventListener("click", () => {
        this.affiliation = aff;
        this.acquisition = aff === "manufacturer" ? "build" : "privateer";
        if (aff === "manufacturer") {
          this.platformId = "";
        } else {
          const plats =
            this.catalog?.carPlatforms?.filter((p) => p.classId === this.classId) ?? [];
          this.platformId = plats[0]?.id ?? "";
        }
        this.carQuantity = defaultQuantity(this.classId, aff, mfgMin);
        this.renderFirstCar();
      });
    }

    const qtyInput = this.bodyEl.querySelector<HTMLInputElement>(".first-car-qty")!;
    qtyInput.addEventListener("input", () => {
      this.carQuantity = Math.max(1, Math.min(maxQty, parseInt(qtyInput.value, 10) || 1));
      this.renderFirstCar();
    });

    const grid = this.bodyEl.querySelector(".class-select-grid")!;
    grid.replaceChildren();
    for (const cls of classes) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `class-select-card class-${escapeHtml(cls.id)}`;
      if (cls.id === this.classId) card.classList.add("selected");
      card.innerHTML = `
        <span class="class-select-title">${escapeHtml(cls.displayName)}</span>
        <span class="class-select-meta">${cls.powerCapHp} HP cap</span>
      `;
      card.addEventListener("click", () => {
        this.classId = cls.id;
        const plats = this.catalog?.carPlatforms?.filter((p) => p.classId === cls.id) ?? [];
        this.platformId = plats[0]?.id ?? "";
        this.carQuantity = defaultQuantity(this.classId, this.affiliation, mfgMin);
        this.renderFirstCar();
      });
      grid.appendChild(card);
    }

    const platformSection = this.bodyEl.querySelector(".platform-section")!;
    if (this.affiliation === "manufacturer") {
      const buildCost = rules?.costs.manufacturerBuild[this.classId] ?? 0;
      platformSection.innerHTML = `
        <div class="confirm-card">
          <h4>${escapeHtml(this.classId)} Manufacturer</h4>
          <p class="confirm-detail">${escapeHtml(affiliationHintForClass(this.classId, "manufacturer", mfgMin))}</p>
          <p class="confirm-detail">$${buildCost.toLocaleString()} per car from the class template.</p>
        </div>
      `;
    } else {
      platformSection.innerHTML = `
        <p class="confirm-detail">${escapeHtml(affiliationHintForClass(this.classId, "privateer", mfgMin))}</p>
        <h4 class="staff-role-title${needsPlatform ? " wizard-label-warning" : ""}">Choose Platform${needsPlatform ? " *" : ""}</h4>
        <div class="platform-select-grid"></div>
      `;
      const platGrid = platformSection.querySelector(".platform-select-grid")!;
      for (const platform of platforms) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = `platform-card${platform.id === this.platformId ? " selected" : ""}`;
        card.innerHTML = `
          <span class="platform-name">${escapeHtml(platform.displayName)}</span>
          <span class="platform-meta">${escapeHtml(platform.manufacturerName)} · $${platform.privateerCost.toLocaleString()}</span>
        `;
        card.addEventListener("click", () => {
          this.platformId = platform.id;
          this.renderFirstCar();
        });
        platGrid.appendChild(card);
      }
    }
    this.renderStepGuide();
    this.updateNavState();
  }

  private renderStaff(): void {
    const candidates = this.catalog?.staffCandidates ?? [];
    const byRole = new Map<string, StaffCandidatePayload[]>();
    for (const c of candidates) {
      const list = byRole.get(c.role) ?? [];
      list.push(c);
      byRole.set(c.role, list);
    }

    const staffCost = this.staffCost();
    const carCost = this.firstCarCost();
    const remaining = this.remainingBudget();
    const missingRoles = this.missingStaffRoles();

    this.bodyEl.innerHTML = `
      <p class="wizard-intro">Hire one engineer, mechanic, and strategist. Staff and your first car are deducted from $${this.startingBudget().toLocaleString()}.</p>
      ${missingRoles.length > 0 ? `<p class="wizard-hint fleet-rule-warning">Still needed: ${missingRoles.join(", ")}.</p>` : ""}
      <div class="staff-select-grid"></div>
      <div class="staff-budget-note${remaining < 0 ? " staff-budget-over" : ""}">Staff: $${staffCost.toLocaleString()} · First car: $${carCost.toLocaleString()} · Remaining: $${remaining.toLocaleString()}</div>
      ${remaining < 0 ? `<p class="wizard-hint fleet-rule-warning">Over budget by $${Math.abs(remaining).toLocaleString()} — pick cheaper staff or go back to revise your class programme.</p>` : ""}
    `;

    const grid = this.bodyEl.querySelector(".staff-select-grid")!;
    for (const [role, list] of byRole) {
      const section = document.createElement("div");
      const roleMissing = missingRoles.includes(role);
      section.className = `staff-role-section${roleMissing ? " staff-role-missing" : ""}`;
      section.innerHTML = `<h4 class="staff-role-title${roleMissing ? " wizard-label-warning" : ""}">${escapeHtml(role)}${roleMissing ? " *" : ""}</h4>`;
      const cards = document.createElement("div");
      cards.className = "staff-candidate-row";

      for (const person of list) {
        const selected = this.selectedStaff.get(role)?.name === person.name;
        const card = document.createElement("button");
        card.type = "button";
        card.className = `staff-candidate-card${selected ? " selected" : ""}`;
        card.innerHTML = `
          <span class="staff-candidate-name">${escapeHtml(person.name)}</span>
          <div class="skill-bar"><div class="skill-bar-fill" style="width: ${person.skill}%"></div></div>
          <span class="staff-candidate-skill">${person.skill} skill</span>
          <span class="staff-candidate-salary">$${person.salary.toLocaleString()}</span>
        `;
        card.addEventListener("click", () => {
          this.selectedStaff.set(role, person);
          this.renderStaff();
        });
        cards.appendChild(card);
      }

      section.appendChild(cards);
      grid.appendChild(section);
    }
    this.renderStepGuide();
    this.updateNavState();
  }

  private renderDrivers(): void {
    const defs = this.catalog?.driverStatDefs ?? [];
    const pool = this.catalog?.driverPointPool ?? 750;
    const selected = this.driverRoster[this.selectedDriver];
    const rosterErr = this.driverRosterError();
    const singleDriver = this.driverRoster.length === 1;

    this.bodyEl.innerHTML = `
      <div class="wizard-drivers-layout wizard-drivers-layout-market">
        <div class="wizard-drivers-list-col">
          <ul class="wizard-driver-list"></ul>
          <div class="wizard-drivers-actions">
            <button type="button" class="secondary-btn wizard-driver-add">+ Add driver</button>
            <button type="button" class="secondary-btn wizard-driver-random">Randomize line-up</button>
          </div>
          <p class="wizard-hint wizard-driver-pool">Each driver may use up to ${pool} creation points (checked per driver).</p>
          ${singleDriver ? `<p class="wizard-hint">Endurance races work best with 2–3 drivers — consider adding another.</p>` : ""}
          ${rosterErr ? `<p class="wizard-hint fleet-rule-warning">${escapeHtml(rosterErr)}</p>` : ""}
        </div>
        <div class="wizard-drivers-editor"></div>
        <div class="wizard-driver-templates">
          <h4>Driver templates</h4>
          <p class="wizard-hint">Pick a WEC grid driver, retired legend, or prospect — stats are pre-built.</p>
          <ul class="wizard-template-list"></ul>
        </div>
      </div>
    `;

    const listEl = this.bodyEl.querySelector(".wizard-driver-list")!;
    listEl.replaceChildren();
    for (let i = 0; i < this.driverRoster.length; i++) {
      const d = this.driverRoster[i];
      const driverCost = driverPointCost(d, defs);
      const driverInvalid = !d.name.trim() || driverCost > pool;
      const li = document.createElement("li");
      li.className = `wizard-driver-item${i === this.selectedDriver ? " active" : ""}${driverInvalid ? " wizard-driver-invalid" : ""}`;
      li.innerHTML = `
        <button type="button" class="wizard-driver-select">
          <span class="driver-tier tier-${escapeHtml(d.tier.toLowerCase())}">${escapeHtml(d.tier)}</span>
          <strong>${escapeHtml(d.name.trim() || "Unnamed driver")}</strong>
          <span class="wizard-driver-meta">${escapeHtml(d.nationality)} · DRY ${d.dryPace} · ${driverCost}/${pool} pts</span>
        </button>
        ${this.driverRoster.length > 1 ? `<button type="button" class="wizard-driver-remove" title="Remove">✕</button>` : ""}
      `;
      li.querySelector(".wizard-driver-select")!.addEventListener("click", () => {
        this.selectedDriver = i;
        this.renderDrivers();
      });
      li.querySelector(".wizard-driver-remove")?.addEventListener("click", () => {
        this.driverRoster.splice(i, 1);
        this.selectedDriver = Math.min(this.selectedDriver, this.driverRoster.length - 1);
        this.renderDrivers();
      });
      listEl.appendChild(li);
    }

    const editorEl = this.bodyEl.querySelector(".wizard-drivers-editor")!;
    if (selected) {
      const cost = driverPointCost(selected, defs);
      const nameMissing = !selected.name.trim();
      const overPool = cost > pool;
      editorEl.innerHTML = `
        <h4 class="staff-role-title">Edit driver</h4>
        <label class="wizard-field">
          <span>Name</span>
          <input type="text" class="wizard-input wizard-driver-name${nameMissing ? " wizard-input-invalid" : ""}" maxlength="48" value="${escapeHtml(selected.name)}" />
        </label>
        <label class="wizard-field">
          <span>Nationality</span>
          <select class="wizard-input wizard-driver-nat">
            ${DRIVER_NATS.map((n) => `<option value="${n}"${n === selected.nationality ? " selected" : ""}>${n}</option>`).join("")}
          </select>
        </label>
        <div class="wizard-driver-stats">
          <span class="driver-tier tier-${escapeHtml(selected.tier.toLowerCase())}">${escapeHtml(selected.tier)}</span>
          <span>DRY ${selected.dryPace} · WET ${selected.wetPace} · CON ${selected.consistency}</span>
          <span>Cost: ${cost} pts</span>
        </div>
        ${nameMissing ? `<p class="wizard-hint fleet-rule-warning">Driver name is required.</p>` : ""}
        ${overPool ? `<p class="wizard-hint fleet-rule-warning">This driver exceeds the ${pool}-point budget — randomize or lower stats in Driver Center later.</p>` : ""}
      `;

      editorEl.querySelector<HTMLInputElement>(".wizard-driver-name")!.addEventListener("input", (ev) => {
        selected.name = (ev.target as HTMLInputElement).value;
        this.updateNavState();
      });
      editorEl.querySelector<HTMLSelectElement>(".wizard-driver-nat")!.addEventListener("change", (ev) => {
        selected.nationality = (ev.target as HTMLSelectElement).value;
      });
    }

    const addBtn = this.bodyEl.querySelector<HTMLButtonElement>(".wizard-driver-add")!;
    addBtn.addEventListener("click", () => {
      this.driverRoster.push(randomWizardDriver());
      this.selectedDriver = this.driverRoster.length - 1;
      this.renderDrivers();
    });
    this.bodyEl.querySelector(".wizard-driver-random")!.addEventListener("click", () => {
      const count = Math.max(2, this.driverRoster.length || 2);
      this.driverRoster = Array.from({ length: count }, () => randomWizardDriver());
      this.selectedDriver = 0;
      this.renderDrivers();
    });

    const templatesEl = this.bodyEl.querySelector(".wizard-template-list")!;
    const previews = this.catalog?.driverMarketPreview ?? [];
    const availablePreviews = previews.filter(
      (listing) => !rosterHasDriverName(this.driverRoster, listing.driver.name),
    );
    if (!previews.length) {
      templatesEl.innerHTML = `<li class="wizard-hint">Templates load when the game catalog is ready.</li>`;
    } else if (!availablePreviews.length) {
      templatesEl.innerHTML =
        `<li class="wizard-hint">All listed templates are in your line-up — remove a driver or add a custom driver.</li>`;
    } else {
      for (const listing of availablePreviews.slice(0, 16)) {
        const d = listing.driver;
        const li = document.createElement("li");
        li.className = "wizard-template-item";
        const teamNote = listing.contractedTeam
          ? ` · ${listing.contractedTeam}`
          : "";
        li.innerHTML = `
          <strong>${escapeHtml(d.name)}</strong>
          <span class="wizard-template-meta">
            <span class="driver-tier tier-${escapeHtml(d.tier.toLowerCase())}">${escapeHtml(d.tier)}</span>
            ${escapeHtml(d.nationality)} · DRY ${d.dryPace}${escapeHtml(teamNote)}
          </span>
          <span class="wizard-template-meta">${escapeHtml(listing.tagline)}</span>
          <button type="button" class="secondary-btn wizard-template-add">Add to roster</button>
        `;
        li.querySelector(".wizard-template-add")!.addEventListener("click", () => {
          const existing = this.driverRoster.findIndex(
            (r) => driverNameKey(r.name) === driverNameKey(d.name),
          );
          const copy = { ...d, tier: inferDriverTier(d) };
          if (existing >= 0) {
            this.driverRoster[existing] = copy;
            this.selectedDriver = existing;
          } else {
            this.driverRoster.push(copy);
            this.selectedDriver = this.driverRoster.length - 1;
          }
          this.renderDrivers();
        });
        templatesEl.appendChild(li);
      }
    }

    this.renderStepGuide();
    this.updateNavState();
  }

  private renderConfirm(): void {
    const staff = [...this.selectedStaff.values()];
    const carCost = this.firstCarCost();
    const budget = this.remainingBudget();
    const overBudget = budget < 0;
    const mfgMin = this.catalog?.fleetRules.manufacturerHypercarMinCars ?? 2;
    const mfgBelowMin =
      this.classId === "Hypercar" &&
      this.affiliation === "manufacturer" &&
      this.carQuantity < mfgMin;
    const cannotFound = this.handlers.canFoundTeam && !this.handlers.canFoundTeam();
    const platform = this.catalog?.carPlatforms?.find((p) => p.id === this.platformId);

    const programmeRole =
      this.affiliation === "manufacturer"
        ? `${this.classId} Manufacturer`
        : `${this.classId} Privateer`;
    const carDesc =
      this.affiliation === "manufacturer"
        ? `own ${this.classId} build`
        : (platform?.displayName ?? "customer platform");

    this.bodyEl.innerHTML = `
      <div class="confirm-grid">
        <div class="confirm-card">
          <h4>Team</h4>
          <div class="confirm-livery-wrap">
            <div class="confirm-livery-preview-host"></div>
            <span class="confirm-team-name">${escapeHtml(this.teamName.trim())}</span>
          </div>
        </div>
        <div class="confirm-card">
          <h4>Class Programme</h4>
          <p><span class="class-badge class-${escapeHtml(this.classId)}">${escapeHtml(this.classId)}</span></p>
          <p class="confirm-detail">${escapeHtml(programmeRole)} · ${this.carQuantity}× ${escapeHtml(carDesc)}</p>
          <p class="confirm-detail">$${carCost.toLocaleString()}</p>
          ${mfgBelowMin ? `<p class="wizard-hint fleet-rule-warning">Hypercar manufacturers must enter at least ${mfgMin} cars — go back to Class &amp; Car.</p>` : ""}
        </div>
        <div class="confirm-card confirm-staff">
          <h4>Personnel (${staff.length})</h4>
          <ul>${staff.map((s) => `<li>${escapeHtml(s.role)}: ${escapeHtml(s.name)} (${s.skill})</li>`).join("")}</ul>
        </div>
        <div class="confirm-card confirm-staff">
          <h4>Drivers (${this.driverRoster.length})</h4>
          <ul>${this.driverRoster.map((d) => `<li>${escapeHtml(d.name)} · ${escapeHtml(d.tier)} · ${escapeHtml(d.nationality)}</li>`).join("")}</ul>
        </div>
        <div class="confirm-card">
          <h4>Starting Budget</h4>
          <p class="confirm-budget${overBudget ? " confirm-budget-over" : ""}">$${budget.toLocaleString()}</p>
          <p class="confirm-detail">100 R&amp;D points · Add more cars anytime from Team HQ</p>
          ${overBudget ? `<p class="wizard-hint fleet-rule-warning">Over budget by $${Math.abs(budget).toLocaleString()} — go back and adjust staff or your class programme before founding.</p>` : ""}
        </div>
      </div>
      ${
        cannotFound
          ? `<p class="wizard-hint fleet-rule-warning">You are connected as a pit crew member or spectator. Only the session host can found the team — use Identity in the header to reconnect as Host.</p>`
          : ""
      }
      <p class="wizard-hint">${
        this.affiliation === "manufacturer"
          ? "After founding you'll enter guided platform design in the Garage — step through engine, aero, and systems before your first session."
          : "After founding you'll land in the Garage to review your platform — then return to Championship Hub for your first session."
      }</p>
    `;
    const confirmHost = this.bodyEl.querySelector<HTMLElement>(".confirm-livery-preview-host");
    if (confirmHost) {
      createLiveryPreviewCard(confirmHost, {
        ...this.liveryPreviewOptions(),
        width: 400,
        height: 110,
        layout: "card",
      });
    }
    this.renderStepGuide();
  }
}
