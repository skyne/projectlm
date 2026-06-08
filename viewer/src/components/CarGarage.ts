import type {
  CarBuildPayload,
  ClassInfoPayload,
  EngineBuildPayload,
  GameCatalogPayload,
  MetaStatePayload,
  PartOptionPayload,
} from "../ws/protocol";
import { peakHorsepower } from "../utils/engineModel";
import {
  compileCarStats,
  effectiveCorneringScore,
  effectiveGripScore,
  effectiveLateralScore,
  formatPartStatLines,
  partStatLines,
  formatStatSummary,
  SIM_STAT_BARS,
  statBarHtml,
  toBarValues,
  type PartSlot,
  type SimBarId,
} from "../utils/carStats";
import { mmPanelHeader } from "../utils/mmUi";
import {
  CONFIG_SLOT_BY_PART_SLOT,
  describePartIncompatibility,
  isPartCompatibleWithBuild,
  validateAssemblyCompatibility,
} from "../utils/partCompatibility";
import {
  isElectricDriveOutletBuild,
  normalizeExhaustType,
} from "../utils/ev_outlet";
import {
  classAllowsHybrid,
  filterPartsForClass,
  legalPartsForSlot,
  normalizeHybridForClass,
} from "../utils/classLegality";
import {
  clampWheelSetup,
  clampSuspensionSetup,
  computeSuspensionTuningStats,
  computeWheelStats,
  isSuspensionCompatibleWithDrivetrain,
  isSuspensionLegalForAxle,
  normalizeCarBuild,
  resolveSuspensionLayouts,
  resolveSuspensionSetup,
  resolveWheelSetup,
  springRateRange,
  rideHeightLimitsForClass,
  suspensionPart,
  suspensionSetupToBuildFields,
  suspensionSpringBaseline,
  validateSuspensionSetup,
  validateWheelSetup,
  wheelLimitsForClass,
  wheelSetupToBuildFields,
  ARB_STIFFNESS_LIMITS,
  DAMPER_LIMITS,
  type SuspensionSetup,
  type WheelSetup,
} from "../utils/chassisSetup";
import { renderClassLiveryCanvas } from "../graphics/liveryRenderer";
import { carBuildToVisual } from "../graphics/visualCatalog";
import { LIVERY_PATTERNS, resolveTeamLivery, type TeamLiveryView } from "../utils/teamLivery";
import { EngineDesigner } from "./EngineDesigner";
import { CoolingDesigner } from "./CoolingDesigner";
import { GarageEngineerPanel } from "./GarageEngineerPanel";
import type { CarBuildVisual } from "../graphics/visualCatalog";

export interface CarGarageHandlers {
  onSaveBuild: (build: CarBuildPayload, carId?: string) => void;
  onVisualBuildChange?: (build: CarBuildVisual) => void;
  onAskGarageEngineer?: (payload: {
    classId: string;
    build: CarBuildPayload;
    compiled: Record<string, number>;
    question?: string;
  }) => void;
}

type BuildSlot =
  | "engine"
  | "chassis"
  | "front_aero"
  | "rear_aero"
  | "diffuser"
  | "exhaust"
  | "cooling"
  | "wheel_package"
  | "suspension"
  | "fuel_system"
  | "brake"
  | "transmission"
  | "hybrid";

const SLOT_LABELS: Record<BuildSlot, string> = {
  engine: "Engine",
  chassis: "Chassis",
  front_aero: "Front Aero",
  rear_aero: "Rear Aero",
  diffuser: "Diffuser",
  exhaust: "Exhaust",
  cooling: "Cooling",
  wheel_package: "Wheels & Tyres",
  suspension: "Suspension",
  fuel_system: "Fuel System",
  brake: "Brakes",
  transmission: "Transmission",
  hybrid: "Hybrid / ERS",
};

const BUILD_FIELD: Record<PartSlot, keyof CarBuildPayload> = {
  chassis: "chassis_type",
  front_aero: "front_aero_type",
  rear_aero: "rear_aero_type",
  diffuser: "diffuser_type",
  exhaust: "exhaust_type",
  cooling: "cooling_pack",
  wheel_package: "wheel_package",
  suspension: "suspension_layout",
  fuel_system: "fuel_system",
  brake: "brake_system",
  transmission: "transmission",
  hybrid: "hybrid_system",
};

const FIELD_TO_BUILD_SLOT: Partial<Record<keyof CarBuildPayload, BuildSlot>> = {
  chassis_type: "chassis",
  front_aero_type: "front_aero",
  rear_aero_type: "rear_aero",
  diffuser_type: "diffuser",
  exhaust_type: "exhaust",
  cooling_pack: "cooling",
  wheel_package: "wheel_package",
  suspension_layout: "suspension",
  fuel_system: "fuel_system",
  brake_system: "brake",
  transmission: "transmission",
  hybrid_system: "hybrid",
};

type BuildGuideStep =
  | { kind: "intro" }
  | { kind: "name" }
  | { kind: "slot"; slot: BuildSlot }
  | { kind: "confirm" };

const BUILD_GUIDE_STEPS: BuildGuideStep[] = [
  { kind: "intro" },
  { kind: "name" },
  { kind: "slot", slot: "engine" },
  { kind: "slot", slot: "chassis" },
  { kind: "slot", slot: "front_aero" },
  { kind: "slot", slot: "rear_aero" },
  { kind: "slot", slot: "diffuser" },
  { kind: "slot", slot: "exhaust" },
  { kind: "slot", slot: "cooling" },
  { kind: "slot", slot: "wheel_package" },
  { kind: "slot", slot: "suspension" },
  { kind: "slot", slot: "brake" },
  { kind: "slot", slot: "transmission" },
  { kind: "slot", slot: "hybrid" },
  { kind: "confirm" },
];

const ALL_BUILD_SLOTS = Object.keys(SLOT_LABELS) as BuildSlot[];

function buildGuideStepsForClass(
  classInfo: ClassInfoPayload | null,
): BuildGuideStep[] {
  if (classAllowsHybrid(classInfo)) return BUILD_GUIDE_STEPS;
  return BUILD_GUIDE_STEPS.filter(
    (step) => step.kind !== "slot" || step.slot !== "hybrid",
  );
}

function visibleBuildSlots(classInfo: ClassInfoPayload | null): BuildSlot[] {
  if (classAllowsHybrid(classInfo)) return ALL_BUILD_SLOTS;
  return ALL_BUILD_SLOTS.filter((slot) => slot !== "hybrid");
}

function slotLabelForBuild(slot: BuildSlot, build?: CarBuildPayload | null): string {
  if (slot === "exhaust" && isElectricDriveOutletBuild(build?.engine)) {
    return "Underbody Outlet";
  }
  return SLOT_LABELS[slot];
}

function buildGuideLabel(step: BuildGuideStep, build?: CarBuildPayload | null): string {
  if (step.kind === "intro") return "Welcome";
  if (step.kind === "name") return "Car Name";
  if (step.kind === "confirm") return "Confirm";
  return slotLabelForBuild(step.slot, build);
}

function buildGuideText(step: BuildGuideStep, classId: string): string {
  switch (step.kind) {
    case "intro":
      return `You chose to build your own ${classId}. We'll walk through each system — pick parts within class rules, then save your platform.`;
    case "name":
      return "Name your car. This appears on the timing screens and entry list.";
    case "slot":
      switch (step.slot) {
        case "engine":
          return "Build your powertrain — fuel, architecture, turbos, and drivetrain each trade power, weight, stints, and reliability. Nothing is free.";
        case "chassis":
          return "Choose a monocoque or frame. Packaging affects pit service speed, driver swap times, structural durability, mass, and drag.";
        case "front_aero":
          return "Front downforce vs drag — low drag helps Le Mans, high downforce helps Spa and wet sessions.";
        case "rear_aero":
          return "Rear wing profile sets balance with the front package. Match your track strategy.";
        case "cooling":
          return "Size each cooler — engine, oil, charge-air, gearbox. Bigger exchangers reject more heat but cost mass and drag. Balance against your powertrain heat load.";
        case "wheel_package":
          return "Set front and rear wheel diameter and tyre width — compound is selected at the track.";
        case "suspension":
          return "Pick front and rear suspension architecture, then fine-tune ride height, spring rates, ARB, and damper clickers per axle. Front e-axle / hybrid drivetrains need compatible front packaging.";
        case "fuel_system":
          return "Tank size and flow rate affect stint length and refuelling time in the pits.";
        case "brake":
          return "Brake torque and thermal capacity matter for multi-class traffic and night driving.";
        case "transmission":
          return "Gear ratios and shift speed influence acceleration out of slow corners.";
        case "hybrid":
          return classId === "Hypercar"
            ? "Configure hybrid deployment — extra power on straights, but adds mass and complexity."
            : "This class runs without hybrid assistance — confirm the spec fits your programme.";
        default:
          return `Configure ${SLOT_LABELS[step.slot]}.`;
      }
    case "confirm":
      return "Review your platform. Save the build to finish setup — you can return anytime to refine it.";
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isPartLocked(
  part: PartOptionPayload,
  unlockedParts: string[],
): boolean {
  if (part.fullId === "tire.Soft" && !unlockedParts.includes("tire.Soft")) {
    return true;
  }
  if (
    part.fullId === "brake.CarbonCeramic" &&
    !unlockedParts.includes("brake.CarbonCeramic")
  ) {
    return true;
  }
  return false;
}

function compileOptions(
  classInfo: {
    id?: string;
    powerCapHp?: number;
    minWeightKg?: number;
    maxWeightKg?: number;
    assemblyMassOffsetKg?: number;
  } | null,
) {
  return {
    classId: classInfo?.id,
    powerCapHp: classInfo?.powerCapHp ?? 0,
    minWeightKg: classInfo?.minWeightKg,
    maxWeightKg: classInfo?.maxWeightKg,
    assemblyMassOffsetKg: classInfo?.assemblyMassOffsetKg ?? 0,
  };
}

export class CarGarage {
  readonly root: HTMLElement;
  private catalog: GameCatalogPayload | null = null;
  private meta: MetaStatePayload | null = null;
  private build: CarBuildPayload | null = null;
  private activeSlot: BuildSlot = "engine";
  private buildGuideActive = false;
  private buildGuideStepIndex = 0;
  /** Fleet car being edited — overrides meta.activeCarId until server confirms. */
  private editingCarId: string | null = null;
  private statusEl!: HTMLElement;
  private partGridEl!: HTMLElement;
  private guideEl!: HTMLElement;
  private guideTextEl!: HTMLElement;
  private guideStepsEl!: HTMLElement;
  private guideBackBtn!: HTMLButtonElement;
  private guideNextBtn!: HTMLButtonElement;
  private saveBtn!: HTMLButtonElement;
  private engineDesigner: EngineDesigner;
  private coolingDesigner: CoolingDesigner;
  private garageEngineer: GarageEngineerPanel;
  private handlers: CarGarageHandlers;
  private compareBars: Record<SimBarId, number> | null = null;
  private compareCompiled: ReturnType<typeof compileCarStats> | null = null;
  private previewBuild: CarBuildPayload | null = null;
  private visualHost!: HTMLElement;
  private visualLabelEl!: HTMLElement;
  private teamLivery: TeamLiveryView = resolveTeamLivery(null);
  private teamName = "";
  private visualRenderToken = 0;

  constructor(container: HTMLElement, handlers: CarGarageHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("section");
    this.root.className = "panel car-garage";
    this.root.innerHTML = `
      ${mmPanelHeader("Garage · Car Design", { subtitle: "Hypercar / LMP2 / LMGT3 platform", badge: "TECH" })}
      <div class="car-build-guide hidden">
        <div class="car-build-guide-top">
          <span class="wizard-badge mm-badge-wec">Platform Design</span>
          <nav class="car-build-guide-steps" aria-label="Build steps"></nav>
        </div>
        <p class="car-build-guide-text"></p>
        <footer class="car-build-guide-footer">
          <button type="button" class="secondary-btn car-build-guide-back">Back</button>
          <button type="button" class="primary-btn car-build-guide-next">Continue</button>
        </footer>
      </div>
      <div class="garage-header-actions">
        <button type="button" class="primary-btn garage-save">Save Build</button>
      </div>
      <div class="garage-layout">
        <div class="garage-diagram-col">
          <div class="car-diagram-card garage-car-visual-card">
            <div class="garage-car-visual car-preview-canvas"></div>
            <p class="garage-car-visual-parts car-preview-parts"></p>
          </div>
          <div class="garage-car-name-wrap">
            <label>Car Name<input type="text" class="garage-car-name wizard-input" maxlength="48" /></label>
          </div>
        </div>
        <div class="garage-parts-col">
          <nav class="garage-slot-tabs"></nav>
          <div class="garage-part-grid"></div>
          <div class="garage-engine-host"></div>
          <div class="garage-cooling-host"></div>
        </div>
        <div class="garage-stats-col">
          <h3>Sim Performance</h3>
          <p class="garage-stats-hint">↑ higher / ↓ lower is better · green/red deltas vs previous pick · hover to preview before committing.</p>
          <div class="garage-perf-stats"></div>
          <div class="garage-mass-note"></div>
          <p class="garage-status"></p>
        </div>
      </div>
    `;
    container.appendChild(this.root);

    this.statusEl = this.root.querySelector(".garage-status")!;
    this.partGridEl = this.root.querySelector(".garage-part-grid")!;
    this.guideEl = this.root.querySelector(".car-build-guide")!;
    this.guideTextEl = this.root.querySelector(".car-build-guide-text")!;
    this.guideStepsEl = this.root.querySelector(".car-build-guide-steps")!;
    this.guideBackBtn = this.root.querySelector(".car-build-guide-back")!;
    this.guideNextBtn = this.root.querySelector(".car-build-guide-next")!;
    this.saveBtn = this.root.querySelector(".garage-save")!;
    this.visualHost = this.root.querySelector(".garage-car-visual")!;
    this.visualLabelEl = this.root.querySelector(".garage-car-visual-parts")!;
    this.coolingDesigner = new CoolingDesigner(
      this.root.querySelector(".garage-cooling-host")!,
      {
        onChange: (patch) => {
          if (!this.build) return;
          this.captureStatSnapshot();
          this.build = { ...this.build, ...patch };
          this.previewBuild = null;
          this.statusEl.textContent = "";
          this.renderStats();
          void this.renderCarVisual();
        },
      },
    );
    this.engineDesigner = new EngineDesigner(
      this.root.querySelector(".garage-engine-host")!,
      {
        onChange: (engine, suggestions) => {
          if (!this.build) return;
          this.captureStatSnapshot();
          let next: typeof this.build = { ...this.build, engine };
          if (suggestions?.hybrid_system) {
            next = { ...next, hybrid_system: suggestions.hybrid_system };
          }
          if (suggestions?.fuel_system && this.catalog?.partsBySlot.fuel_system?.some((p) => p.partType === suggestions.fuel_system)) {
            next = { ...next, fuel_system: suggestions.fuel_system };
          } else if (
            engine.fuel_type !== "Hydrogen" &&
            next.fuel_system === "HydrogenTank"
          ) {
            const classId = this.activeClassId();
            next = {
              ...next,
              fuel_system: classId === "Hypercar" ? "LeMans110L" : "StandardTank",
            };
          }
          if (suggestions?.transmission && this.catalog?.partsBySlot.transmission?.some((p) => p.partType === suggestions.transmission)) {
            next = { ...next, transmission: suggestions.transmission };
          }
          next = {
            ...next,
            exhaust_type: normalizeExhaustType(next.exhaust_type, engine),
          };
          this.build = next;
          this.statusEl.textContent = "";
          this.previewBuild = null;
          this.renderStats();
          void this.renderCarVisual();
          if (this.activeSlot === "suspension") {
            this.renderActivePanel();
          }
          if (this.activeSlot === "cooling" && this.build) {
            this.coolingDesigner.setContext(
              this.activeClassId(),
              this.build.engine,
              this.build.duct_airflow ?? 1,
            );
            this.coolingDesigner.setBuild(this.build);
          }
        },
      },
    );
    this.garageEngineer = new GarageEngineerPanel(
      this.root.querySelector(".garage-stats-col")!,
      {
        onAsk: (question) => {
          if (!this.build || !this.handlers.onAskGarageEngineer) {
            this.garageEngineer.showAdvice({
              text: "Load a car build first.",
              offline: true,
            });
            return;
          }
          this.handlers.onAskGarageEngineer({
            classId: this.activeClassId(),
            build: this.build,
            compiled: this.compiledSnapshotForEngineer(),
            question,
          });
        },
        onApplyChanges: (changes) => this.applyGarageChanges(changes),
      },
    );
    this.root.querySelector(".garage-save")!.addEventListener("click", () => {
      this.trySaveBuild();
    });
    this.guideBackBtn.addEventListener("click", () => this.guideBack());
    this.guideNextBtn.addEventListener("click", () => this.guideNext());
  }

  isBuildGuideActive(): boolean {
    return this.buildGuideActive;
  }

  startBuildGuide(): void {
    this.buildGuideActive = true;
    this.buildGuideStepIndex = 0;
    this.render();
  }

  endBuildGuide(): void {
    this.buildGuideActive = false;
    this.buildGuideStepIndex = 0;
    this.root.classList.remove("car-build-guide-active");
    this.guideEl.classList.add("hidden");
    this.saveBtn.hidden = false;
    this.render();
  }

  private guideSteps(): BuildGuideStep[] {
    return buildGuideStepsForClass(this.activeClassInfo());
  }

  private currentGuideStep(): BuildGuideStep {
    const steps = this.guideSteps();
    return steps[this.buildGuideStepIndex] ?? steps[0];
  }

  /** Panel routing during guided build — decoupled from free-garage activeSlot. */
  private guidePanelMode():
    | "hidden"
    | "name"
    | "engine"
    | "cooling"
    | "parts"
    | "confirm" {
    if (!this.buildGuideActive) return "parts";
    const step = this.currentGuideStep();
    if (step.kind === "intro") return "hidden";
    if (step.kind === "name") return "name";
    if (step.kind === "confirm") return "confirm";
    if (step.kind === "slot") {
      if (step.slot === "engine") return "engine";
      if (step.slot === "cooling") return "cooling";
      return "parts";
    }
    return "parts";
  }

  private hideGaragePanels(): void {
    this.partGridEl.classList.add("hidden");
    this.engineDesigner.setVisible(false);
    this.coolingDesigner.setVisible(false);
  }

  private applyGuideLayout(mode: ReturnType<CarGarage["guidePanelMode"]>): void {
    const layout = this.root.querySelector(".garage-layout") as HTMLElement | null;
    const diagramCard = this.root.querySelector(".car-diagram-card") as HTMLElement | null;
    const partsCol = this.root.querySelector(".garage-parts-col") as HTMLElement | null;
    const statsCol = this.root.querySelector(".garage-stats-col") as HTMLElement | null;
    const nameWrap = this.root.querySelector(".garage-car-name-wrap") as HTMLElement | null;

    layout?.classList.toggle("hidden", mode === "hidden");
    layout?.classList.toggle("garage-guide-name-focus", mode === "name");
    diagramCard?.classList.toggle("hidden", mode === "name");
    statsCol?.classList.toggle("hidden", mode === "name" || mode === "hidden");
    partsCol?.classList.toggle("hidden", mode === "name");
    nameWrap?.classList.toggle("garage-name-step-only", mode === "name");
  }

  private guideBack(): void {
    if (this.buildGuideStepIndex > 0) {
      this.buildGuideStepIndex -= 1;
      this.render();
    }
  }

  private guideNext(): void {
    if (!this.validateGuideStep()) {
      this.setStatus("Enter a car name (2+ characters).", true);
      return;
    }
    const step = this.currentGuideStep();
    if (step.kind === "confirm") {
      this.trySaveBuild("Saving build…");
      return;
    }
    if (this.buildGuideStepIndex < this.guideSteps().length - 1) {
      this.buildGuideStepIndex += 1;
      this.render();
    }
  }

  private validateGuideStep(): boolean {
    const step = this.currentGuideStep();
    if (step.kind === "name") {
      return (this.build?.carName.trim().length ?? 0) >= 2;
    }
    return true;
  }

  private assemblyRules() {
    return this.catalog?.assemblyRules ?? [];
  }

  private configPartDisplayName(configSlot: string, partType: string): string {
    const partSlot = (
      Object.entries(CONFIG_SLOT_BY_PART_SLOT) as [PartSlot, string][]
    ).find(([, slot]) => slot === configSlot)?.[0];
    if (partSlot) {
      const match = this.catalog?.partsBySlot[partSlot]?.find(
        (p) => p.partType === partType,
      );
      if (match) return match.displayName;
    }
    if (configSlot === "engine") {
      if (partType === "Hydrogen") return "Hydrogen";
      if (partType === "Gasoline") return "Gasoline";
    }
    return partType.replace(/([a-z])([A-Z])/g, "$1 $2");
  }

  private trySaveBuild(pendingMessage = ""): void {
    if (!this.build) return;
    const classId = this.activeClassId();
    const wheelErr = validateWheelSetup(
      resolveWheelSetup(
        this.build,
        classId,
        this.catalog?.partsBySlot.wheel_package?.find(
          (p) => p.partType === this.build!.wheel_package,
        ),
      ),
      classId,
    );
    if (wheelErr) {
      this.setStatus(wheelErr, true);
      return;
    }
    const legalSusp = this.legalSuspensionLayouts(classId);
    const suspErr = validateSuspensionSetup(this.build, legalSusp);
    if (suspErr) {
      this.setStatus(suspErr, true);
      return;
    }
    const assemblyErr = validateAssemblyCompatibility(
      this.build,
      this.assemblyRules(),
    );
    if (assemblyErr) {
      this.setStatus(`${assemblyErr} — pick compatible parts before saving.`, true);
      return;
    }
    this.build = normalizeCarBuild(this.build, classId, this.catalog?.partsBySlot);
    if (pendingMessage) this.setStatus(pendingMessage);
    this.handlers.onSaveBuild(this.build, this.resolvedFleetCar()?.id);
  }

  private renderBuildGuide(): void {
    if (!this.buildGuideActive) {
      this.guideEl.classList.add("hidden");
      this.root.classList.remove("car-build-guide-active");
      this.saveBtn.hidden = false;
      return;
    }

    this.guideEl.classList.remove("hidden");
    this.root.classList.add("car-build-guide-active");
    this.saveBtn.hidden = true;

    const step = this.currentGuideStep();
    const classId = this.activeClassId();
    this.guideTextEl.textContent = buildGuideText(step, classId);
    this.guideBackBtn.disabled = this.buildGuideStepIndex === 0;
    this.guideNextBtn.textContent =
      step.kind === "confirm" ? "Save Build & Finish" : "Continue";

    this.guideStepsEl.replaceChildren();
    const steps = this.guideSteps();
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const pill = document.createElement("div");
      pill.className = "wizard-step-pill";
      if (i === this.buildGuideStepIndex) pill.classList.add("active");
      else if (i < this.buildGuideStepIndex) pill.classList.add("done");
      pill.textContent = buildGuideLabel(s, this.build);
      this.guideStepsEl.appendChild(pill);
    }
  }

  setCatalog(catalog: GameCatalogPayload): void {
    this.catalog = catalog;
    this.render();
  }

  /** Open garage for a specific fleet car (multiclass teams). */
  openForCar(carId: string): void {
    this.editingCarId = carId;
    this.applyEditingCarBuild();
    this.render();
  }

  /** Use meta.activeCarId instead of a pinned editing car (e.g. header Garage nav). */
  clearEditingCar(): void {
    this.editingCarId = null;
    if (this.meta) this.applyEditingCarBuild();
  }

  update(meta: MetaStatePayload): void {
    this.meta = meta;
    if (
      this.editingCarId &&
      meta.activeCarId === this.editingCarId
    ) {
      // Server confirmed the active car — keep editingCarId as the source of truth in garage.
    }
    this.applyEditingCarBuild();
    this.applyLivery(meta);
    if (meta.carBuildGuidePending && !this.buildGuideActive) {
      this.startBuildGuide();
    } else if (!meta.carBuildGuidePending && this.buildGuideActive) {
      this.endBuildGuide();
    }
    this.render();
  }

  private applyLivery(meta: MetaStatePayload): void {
    this.teamName = meta.teamName;
    this.teamLivery = resolveTeamLivery(meta);
    this.root.style.setProperty("--garage-primary", this.teamLivery.primary);
    this.root.style.setProperty("--garage-secondary", this.teamLivery.secondary);
  }

  private render(): void {
    if (!this.catalog || !this.build) return;
    this.ensureHybridForClass();
    this.renderBuildGuide();

    const guideStep = this.buildGuideActive ? this.currentGuideStep() : null;
    const panelMode = this.guidePanelMode();
    this.applyGuideLayout(panelMode);

    if (panelMode === "hidden") {
      this.hideGaragePanels();
      return;
    }

    if (guideStep?.kind === "slot") {
      this.activeSlot = guideStep.slot;
    }

    const needsEngine =
      !this.buildGuideActive ||
      (guideStep?.kind === "slot" && guideStep.slot === "engine") ||
      guideStep?.kind === "confirm";
    if (needsEngine) {
      this.ensureEngine(this.activeClassId());
    }

    const nameInput = this.root.querySelector<HTMLInputElement>(".garage-car-name")!;
    nameInput.value = this.build.carName;
    nameInput.oninput = () => {
      if (this.build) this.build.carName = nameInput.value;
    };
    if (panelMode === "name") {
      nameInput.focus();
      nameInput.select();
    }

    this.renderTabs();
    this.renderActivePanel();
    if (panelMode !== "name") {
      this.renderStats();
      void this.renderCarVisual();
    } else {
      this.root.querySelector(".garage-perf-stats")!.replaceChildren();
      this.visualHost.replaceChildren();
      this.visualLabelEl.textContent = "";
      this.root.querySelector(".garage-mass-note")!.textContent = "";
    }
    this.renderCompatibilityWarning();
    this.emitVisualBuild();
  }

  private toVisualBuild(build: CarBuildPayload): CarBuildVisual {
    return {
      chassis_type: build.chassis_type,
      front_aero_type: build.front_aero_type,
      rear_aero_type: build.rear_aero_type,
      wheel_package: build.wheel_package,
      hybrid_system: build.hybrid_system || "None",
    };
  }

  private emitVisualBuild(source?: CarBuildPayload): void {
    const build = source ?? this.previewBuild ?? this.build;
    if (!build) return;
    this.handlers.onVisualBuildChange?.(this.toVisualBuild(build));
  }

  private async renderCarVisual(): Promise<void> {
    if (!this.build) return;
    const panelMode = this.guidePanelMode();
    if (panelMode === "hidden" || panelMode === "name") return;

    const source = this.previewBuild ?? this.build;
    const visual = carBuildToVisual(source);
    const classId = this.activeClassId();
    const token = ++this.visualRenderToken;
    const patternLabel =
      LIVERY_PATTERNS.find((p) => p.id === this.teamLivery.pattern)?.label ??
      this.teamLivery.pattern;

    try {
      const canvas = await renderClassLiveryCanvas({
        primary: this.teamLivery.primary,
        secondary: this.teamLivery.secondary,
        pattern: this.teamLivery.pattern,
        logoDataUrl: this.teamLivery.logoDataUrl,
        classId,
        teamName: this.teamName,
        visualBuild: classId === "Hypercar" ? undefined : visual,
        width: 672,
        height: 168,
      });
      if (token !== this.visualRenderToken) return;
      this.visualHost.replaceChildren();
      canvas.className = "car-preview-img garage-car-preview-img garage-livery-preview";
      this.visualHost.appendChild(canvas);
      this.visualLabelEl.textContent = [
        classId,
        patternLabel,
        visual.chassis_type,
        visual.front_aero_type,
        visual.rear_aero_type,
        visual.wheel_package ?? "no wheels",
        visual.hybrid_system,
      ].join(" · ");
    } catch (err) {
      if (token !== this.visualRenderToken) return;
      this.visualLabelEl.textContent = `Livery preview failed: ${err}`;
    }
  }

  private renderCompatibilityWarning(): void {
    if (!this.build) return;
    const classId = this.activeClassId();
    const wheelErr = validateWheelSetup(
      resolveWheelSetup(
        this.build,
        classId,
        this.catalog?.partsBySlot.wheel_package?.find(
          (p) => p.partType === this.build!.wheel_package,
        ),
      ),
      classId,
    );
    const suspErr = validateSuspensionSetup(
      this.build,
      this.legalSuspensionLayouts(classId),
    );
    const err =
      wheelErr ??
      suspErr ??
      validateAssemblyCompatibility(this.build, this.assemblyRules());
    if (err) {
      this.setStatus(`${err} — pick compatible parts before saving.`, true);
    } else if (this.statusEl.classList.contains("error")) {
      this.setStatus("");
    }
  }

  private ensureEngine(classId: string): void {
    if (!this.build || this.build.engine) return;
    const fallback = this.catalog?.defaultEngines?.[classId];
    if (fallback) {
      this.build = { ...this.build, engine: { ...fallback } };
    }
  }

  private resolvedFleetCar() {
    if (!this.meta?.fleet?.length) return null;
    const preferredId = this.editingCarId ?? this.meta.activeCarId;
    return (
      this.meta.fleet.find((c) => c.id === preferredId) ??
      this.meta.fleet[0]
    );
  }

  private applyEditingCarBuild(): void {
    if (!this.meta) return;
    const activeCar = this.resolvedFleetCar();
    if (activeCar?.build) {
      this.build = normalizeCarBuild(
        { ...activeCar.build },
        activeCar.classId ?? this.meta.playerClassId ?? "Hypercar",
        this.catalog?.partsBySlot,
      );
    } else if (this.meta.carBuild) {
      this.build = normalizeCarBuild(
        { ...this.meta.carBuild },
        this.meta.playerClassId ?? "Hypercar",
        this.catalog?.partsBySlot,
      );
    } else if (!this.build) {
      this.build = defaultBuild(this.meta);
    }
    this.ensureEngine(activeCar?.classId ?? this.meta.playerClassId ?? "Hypercar");
    this.ensureHybridForClass();
  }

  private ensureHybridForClass(): void {
    if (!this.build) return;
    const classInfo = this.activeClassInfo();
    const hybrid = normalizeHybridForClass(this.build.hybrid_system, classInfo);
    if (hybrid !== this.build.hybrid_system) {
      this.build = { ...this.build, hybrid_system: hybrid };
    }
    if (!classAllowsHybrid(classInfo) && this.activeSlot === "hybrid") {
      this.activeSlot = "transmission";
    }
  }

  private activeClassId(): string {
    const activeCar = this.resolvedFleetCar();
    return activeCar?.classId ?? this.meta?.playerClassId ?? "Hypercar";
  }

  private activeClassInfo() {
    const classId = this.activeClassId();
    return this.catalog?.classes.find((c) => c.id === classId) ?? null;
  }

  private captureStatSnapshot(): void {
    if (!this.catalog || !this.build) return;
    const compiled = compileCarStats(
      this.build,
      this.catalog.partsBySlot,
      compileOptions(this.activeClassInfo()),
    );
    this.compareCompiled = compiled;
    this.compareBars = toBarValues(compiled);
  }

  private legalSuspensionLayouts(classId: string): Set<string> | undefined {
    const classInfo = this.catalog?.classes.find((c) => c.id === classId);
    return legalPartsForSlot(classInfo ?? null, "suspension");
  }

  /** Parts legal for the active class; assembly/drivetrain filters applied separately. */
  private classVisibleParts(slot: PartSlot): PartOptionPayload[] {
    const parts = this.catalog?.partsBySlot[slot] ?? [];
    return filterPartsForClass(this.activeClassInfo(), slot, parts);
  }

  private renderActivePanel(): void {
    const panelMode = this.guidePanelMode();

    if (this.buildGuideActive) {
      if (panelMode === "name" || panelMode === "hidden") {
        this.hideGaragePanels();
        return;
      }
      if (panelMode === "confirm") {
        this.renderGuideConfirm();
        return;
      }
      if (panelMode === "engine") {
        this.partGridEl.classList.add("hidden");
        this.coolingDesigner.setVisible(false);
        this.engineDesigner.setVisible(true);
        this.ensureEngine(this.activeClassId());
        if (this.build?.engine) {
          this.engineDesigner.setClassInfo(this.activeClassInfo());
          this.engineDesigner.setEngine(this.build.engine);
        }
        return;
      }
      if (panelMode === "cooling") {
        this.partGridEl.classList.add("hidden");
        this.engineDesigner.setVisible(false);
        this.coolingDesigner.setVisible(true);
        if (this.build) {
          this.coolingDesigner.setContext(
            this.activeClassId(),
            this.build.engine,
            this.build.duct_airflow ?? 1,
          );
          this.coolingDesigner.setBuild(this.build);
        }
        return;
      }
      // parts mode — fall through with activeSlot set from guide step
    }

    const isEngine = this.activeSlot === "engine";
    const isCooling = this.activeSlot === "cooling";
    this.partGridEl.classList.toggle("hidden", isEngine || isCooling);
    this.engineDesigner.setVisible(isEngine);
    this.coolingDesigner.setVisible(isCooling);
    if (isEngine) {
      this.ensureEngine(this.activeClassId());
      if (this.build?.engine) {
        this.engineDesigner.setClassInfo(this.activeClassInfo());
        this.engineDesigner.setEngine(this.build.engine);
      }
    } else if (isCooling && this.build) {
      this.coolingDesigner.setContext(
        this.activeClassId(),
        this.build.engine,
        this.build.duct_airflow ?? 1,
      );
      this.coolingDesigner.setBuild(this.build);
    } else {
      this.renderParts();
    }
  }

  private renderTabs(): void {
    const tabs = this.root.querySelector(".garage-slot-tabs")!;
    tabs.replaceChildren();
    if (this.buildGuideActive) {
      tabs.classList.add("hidden");
      return;
    }
    tabs.classList.remove("hidden");
    for (const slot of visibleBuildSlots(this.activeClassInfo())) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `garage-slot-tab${slot === this.activeSlot ? " active" : ""}`;
      btn.textContent = slotLabelForBuild(slot, this.build);
      btn.addEventListener("click", () => {
        this.activeSlot = slot;
        this.render();
      });
      tabs.appendChild(btn);
    }
  }

  private renderParts(): void {
    if (!this.catalog || !this.build || !this.meta) return;
    if (this.activeSlot === "engine") return;
    if (this.activeSlot === "suspension") {
      this.renderSuspensionPanel();
      return;
    }
    if (this.activeSlot === "wheel_package") {
      this.renderWheelPanel();
      return;
    }
    const grid = this.root.querySelector(".garage-part-grid")!;
    grid.replaceChildren();

    const slot = this.activeSlot as PartSlot;
    const parts = this.classVisibleParts(slot);
    const field = BUILD_FIELD[slot];
    const selected = this.build[field] as string;

    for (const part of parts) {
      const locked = isPartLocked(part, this.meta.unlockedParts);
      const incompatible =
        !locked &&
        !isPartCompatibleWithBuild(
          this.build,
          slot,
          part.partType,
          this.assemblyRules(),
        );
      const disabled = locked || incompatible;
      const incompatReason = incompatible
        ? describePartIncompatibility(
            this.build,
            slot,
            part.partType,
            this.assemblyRules(),
            (configSlot, partType) =>
              this.configPartDisplayName(configSlot, partType),
          )
        : null;
      const card = document.createElement("button");
      card.type = "button";
      card.disabled = disabled;
      card.className = `part-card${part.partType === selected ? " selected" : ""}${locked ? " locked" : ""}${incompatible ? " incompatible" : ""}`;
      const statHtml = formatPartStatLines(partStatLines(slot, part));

      card.innerHTML = `
        <span class="part-card-name">${escapeHtml(part.displayName)}</span>
        <div class="part-card-stats">${statHtml || '<span class="part-stat-line">Standard spec</span>'}</div>
        ${locked ? '<span class="part-lock-badge">R&amp;D Locked</span>' : ""}
        ${incompatible ? `<span class="part-lock-badge">Incompatible</span>${incompatReason ? `<span class="part-incompat-hint">${escapeHtml(incompatReason)}</span>` : ""}` : ""}
      `;

      card.addEventListener("mouseenter", () => {
        if (!this.build || disabled || part.partType === selected) return;
        const preview = { ...this.build, [field]: part.partType };
        this.previewBuild = preview;
        this.renderStats();
        this.emitVisualBuild(preview);
      });

      card.addEventListener("mouseleave", () => {
        if (this.previewBuild) {
          this.previewBuild = null;
          this.renderStats();
          this.emitVisualBuild();
        }
      });

      card.addEventListener("click", () => {
        if (!this.build || disabled) return;
        if (part.partType === selected) return;
        this.captureStatSnapshot();
        this.build = { ...this.build, [field]: part.partType };
        this.previewBuild = null;
        this.statusEl.textContent = "";
        this.render();
      });
      grid.appendChild(card);
    }
  }

  private renderSuspensionPanel(): void {
    if (!this.catalog || !this.build || !this.meta) return;
    const grid = this.root.querySelector(".garage-part-grid")!;
    grid.replaceChildren();
    grid.classList.remove("hidden");

    const drivetrain = this.build.engine?.drivetrain;
    const layouts = resolveSuspensionLayouts(this.build);
    const parts = this.classVisibleParts("suspension");

    const panel = document.createElement("div");
    panel.className = "chassis-setup-panel";

    for (const axle of ["front", "rear"] as const) {
      const section = document.createElement("div");
      section.className = "chassis-setup-section";
      const selected =
        axle === "front" ? layouts.front : layouts.rear;
      section.innerHTML = `<h4 class="chassis-setup-heading">${axle === "front" ? "Front" : "Rear"} suspension</h4>`;
      const cards = document.createElement("div");
      cards.className = "garage-part-grid chassis-setup-grid";

      for (const part of parts) {
        const axleLegal = isSuspensionLegalForAxle(part.partType, axle);
        const drvLegal = isSuspensionCompatibleWithDrivetrain(
          part.partType,
          axle,
          drivetrain,
        );
        if (!axleLegal || !drvLegal) continue;
        const card = document.createElement("button");
        card.type = "button";
        card.className = `part-card${part.partType === selected ? " selected" : ""}`;
        const statHtml = formatPartStatLines(partStatLines("suspension", part));
        card.innerHTML = `
          <span class="part-card-name">${escapeHtml(part.displayName)}</span>
          <div class="part-card-stats">${statHtml || '<span class="part-stat-line">Standard spec</span>'}</div>
        `;
        card.addEventListener("click", () => {
          if (!this.build) return;
          this.captureStatSnapshot();
          const field =
            axle === "front"
              ? "front_suspension_layout"
              : "rear_suspension_layout";
          const nextLayout = part.partType;
          const nextFront =
            axle === "front" ? nextLayout : layouts.front;
          const nextRear =
            axle === "rear" ? nextLayout : layouts.rear;
          const classId = this.activeClassId();
          const layoutBuild: CarBuildPayload = {
            ...this.build,
            [field]: nextLayout,
            front_suspension_layout: nextFront,
            rear_suspension_layout: nextRear,
            front_ride_height_mm: undefined,
            rear_ride_height_mm: undefined,
            front_spring_nm: undefined,
            rear_spring_nm: undefined,
            front_arb_stiffness: undefined,
            rear_arb_stiffness: undefined,
            front_damper_bump: undefined,
            front_damper_rebound: undefined,
            rear_damper_bump: undefined,
            rear_damper_rebound: undefined,
          };
          const tuning = clampSuspensionSetup(
            resolveSuspensionSetup(layoutBuild, parts, classId),
            layoutBuild,
            parts,
            classId,
          );
          this.build = {
            ...layoutBuild,
            ...suspensionSetupToBuildFields(tuning),
          };
          this.previewBuild = null;
          this.statusEl.textContent = "";
          this.render();
        });
        cards.appendChild(card);
      }

      section.appendChild(cards);
      panel.appendChild(section);
    }

    panel.appendChild(this.renderSuspensionTuningPanel());

    grid.appendChild(panel);
  }

  private renderSuspensionTuningPanel(): HTMLElement {
    const tuningPanel = document.createElement("div");
    tuningPanel.className = "suspension-tuning-panel";
    if (!this.catalog || !this.build) return tuningPanel;

    const classId = this.activeClassId();
    const parts = this.catalog.partsBySlot.suspension ?? [];
    const setup = resolveSuspensionSetup(this.build, parts, classId);
    const preview = computeSuspensionTuningStats(setup, this.build, parts);
    const rhLimits = rideHeightLimitsForClass(classId);
    const frontSpringBaseline = suspensionSpringBaseline(this.build, parts, "front");
    const rearSpringBaseline = suspensionSpringBaseline(this.build, parts, "rear");

    const summary = document.createElement("div");
    summary.className = "suspension-tuning-summary";
    summary.innerHTML = `
      <p class="suspension-tuning-hint">Part baselines set the starting point — sliders adjust within class limits. Lower ride height helps aero; spring and ARB balance roll stiffness.</p>
      <div class="suspension-tuning-metrics">
        <span>Roll stiffness <strong>×${preview.rollStiffness.toFixed(2)}</strong></span>
        <span>Mech grip <strong>×${preview.mechanicalGrip.toFixed(2)}</strong></span>
        <span>Rake <strong>${escapeHtml(preview.rideHeightBalanceHint)}</strong></span>
      </div>
    `;
    tuningPanel.appendChild(summary);

    const grid = document.createElement("div");
    grid.className = "suspension-tuning-grid";

    type SetupKey = keyof SuspensionSetup;
    const axleSections: Array<{
      axle: "front" | "rear";
      fields: Array<{
        key: SetupKey;
        label: string;
        range: { min: number; max: number; step: number };
        format: (v: number, baseline?: number) => string;
        baseline?: number;
      }>;
    }> = [
      {
        axle: "front",
        fields: [
          {
            key: "frontRideHeightMm",
            label: "Ride height",
            range: rhLimits,
            format: (v) => `${v} mm`,
          },
          {
            key: "frontSpringNm",
            label: "Spring rate",
            range: springRateRange(frontSpringBaseline),
            format: (v, b) => `${v.toLocaleString()} N/m${b ? ` (part ${b.toLocaleString()})` : ""}`,
            baseline: frontSpringBaseline,
          },
          {
            key: "frontArbStiffness",
            label: "ARB stiffness",
            range: ARB_STIFFNESS_LIMITS,
            format: (v) => `×${v.toFixed(2)}`,
          },
          {
            key: "frontDamperBump",
            label: "Damper bump",
            range: { min: DAMPER_LIMITS.min, max: DAMPER_LIMITS.max, step: 1 },
            format: (v) => `${v} clicks`,
          },
          {
            key: "frontDamperRebound",
            label: "Damper rebound",
            range: { min: DAMPER_LIMITS.min, max: DAMPER_LIMITS.max, step: 1 },
            format: (v) => `${v} clicks`,
          },
        ],
      },
      {
        axle: "rear",
        fields: [
          {
            key: "rearRideHeightMm",
            label: "Ride height",
            range: rhLimits,
            format: (v) => `${v} mm`,
          },
          {
            key: "rearSpringNm",
            label: "Spring rate",
            range: springRateRange(rearSpringBaseline),
            format: (v, b) => `${v.toLocaleString()} N/m${b ? ` (part ${b.toLocaleString()})` : ""}`,
            baseline: rearSpringBaseline,
          },
          {
            key: "rearArbStiffness",
            label: "ARB stiffness",
            range: ARB_STIFFNESS_LIMITS,
            format: (v) => `×${v.toFixed(2)}`,
          },
          {
            key: "rearDamperBump",
            label: "Damper bump",
            range: { min: DAMPER_LIMITS.min, max: DAMPER_LIMITS.max, step: 1 },
            format: (v) => `${v} clicks`,
          },
          {
            key: "rearDamperRebound",
            label: "Damper rebound",
            range: { min: DAMPER_LIMITS.min, max: DAMPER_LIMITS.max, step: 1 },
            format: (v) => `${v} clicks`,
          },
        ],
      },
    ];

    for (const section of axleSections) {
      const col = document.createElement("div");
      col.className = "suspension-tuning-axle";
      col.innerHTML = `<h4 class="chassis-setup-heading">${section.axle === "front" ? "Front" : "Rear"} tuning</h4>`;

      for (const def of section.fields) {
        const value = setup[def.key];
        const wrap = document.createElement("label");
        wrap.className = "engine-slider-field chassis-slider-field";
        wrap.innerHTML = `
          <span class="engine-slider-label">
            <span class="engine-slider-name">${def.label}</span>
            <span class="engine-slider-value">${def.format(value, def.baseline)}</span>
          </span>
          <input type="range" class="engine-slider" />
        `;
        const slider = wrap.querySelector<HTMLInputElement>(".engine-slider")!;
        slider.min = String(def.range.min);
        slider.max = String(def.range.max);
        slider.step = String(def.range.step);
        slider.value = String(value);
        slider.addEventListener("pointerdown", () => {
          this.captureStatSnapshot();
        });
        slider.addEventListener("input", () => {
          if (!this.build) return;
          const current = resolveSuspensionSetup(this.build, parts, classId);
          const nextSetup = clampSuspensionSetup(
            { ...current, [def.key]: parseFloat(slider.value) },
            this.build,
            parts,
            classId,
          );
          wrap.querySelector(".engine-slider-value")!.textContent = def.format(
            nextSetup[def.key],
            def.baseline,
          );
          this.build = {
            ...this.build,
            ...suspensionSetupToBuildFields(nextSetup),
          };
          this.previewBuild = null;
          this.updateSuspensionTuningSummary(parts);
          this.renderStats();
        });
        col.appendChild(wrap);
      }

      grid.appendChild(col);
    }

    tuningPanel.appendChild(grid);
    tuningPanel.appendChild(this.renderAlignmentGearingPanel());
    return tuningPanel;
  }

  private renderAlignmentGearingPanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "suspension-alignment-panel";
    if (!this.build) return panel;

    panel.innerHTML = `
      <h4 class="chassis-setup-heading">Alignment & gearing</h4>
      <p class="suspension-tuning-hint">Camber and toe affect mechanical grip balance; final drive trades acceleration for top speed.</p>
    `;

    const fields: Array<{
      key: keyof CarBuildPayload;
      label: string;
      min: number;
      max: number;
      step: number;
      format: (v: number) => string;
      default: number;
    }> = [
      {
        key: "front_camber_deg",
        label: "Front camber",
        min: -4,
        max: 0,
        step: 0.1,
        format: (v) => `${v.toFixed(1)}°`,
        default: -2.5,
      },
      {
        key: "rear_camber_deg",
        label: "Rear camber",
        min: -4,
        max: 0,
        step: 0.1,
        format: (v) => `${v.toFixed(1)}°`,
        default: -1.8,
      },
      {
        key: "front_toe_deg",
        label: "Front toe",
        min: -0.5,
        max: 0.5,
        step: 0.05,
        format: (v) => `${v.toFixed(2)}°`,
        default: 0,
      },
      {
        key: "rear_toe_deg",
        label: "Rear toe",
        min: 0,
        max: 0.5,
        step: 0.05,
        format: (v) => `${v.toFixed(2)}°`,
        default: 0.1,
      },
      {
        key: "final_drive_ratio",
        label: "Final drive",
        min: 3,
        max: 4.2,
        step: 0.05,
        format: (v) => v.toFixed(2),
        default: 3.5,
      },
    ];

    const grid = document.createElement("div");
    grid.className = "suspension-tuning-grid";

    for (const def of fields) {
      const raw = this.build[def.key];
      const value =
        typeof raw === "number" && Number.isFinite(raw) ? raw : def.default;
      const wrap = document.createElement("label");
      wrap.className = "engine-slider-field chassis-slider-field";
      wrap.innerHTML = `
        <span class="engine-slider-label">
          <span class="engine-slider-name">${def.label}</span>
          <span class="engine-slider-value">${def.format(value)}</span>
        </span>
        <input type="range" class="engine-slider" />
      `;
      const slider = wrap.querySelector<HTMLInputElement>(".engine-slider")!;
      slider.min = String(def.min);
      slider.max = String(def.max);
      slider.step = String(def.step);
      slider.value = String(value);
      slider.addEventListener("input", () => {
        if (!this.build) return;
        const next = parseFloat(slider.value);
        wrap.querySelector(".engine-slider-value")!.textContent = def.format(next);
        this.build = { ...this.build, [def.key]: next };
        this.previewBuild = null;
        this.renderStats();
      });
      grid.appendChild(wrap);
    }

    panel.appendChild(grid);
    return panel;
  }

  private updateSuspensionTuningSummary(
    parts: PartOptionPayload[],
  ): void {
    const metrics = this.root.querySelector(".suspension-tuning-metrics");
    if (!metrics || !this.build) return;
    const setup = resolveSuspensionSetup(this.build, parts);
    const preview = computeSuspensionTuningStats(setup, this.build, parts);
    metrics.innerHTML = `
      <span>Roll stiffness <strong>×${preview.rollStiffness.toFixed(2)}</strong></span>
      <span>Mech grip <strong>×${preview.mechanicalGrip.toFixed(2)}</strong></span>
      <span>Rake <strong>${escapeHtml(preview.rideHeightBalanceHint)}</strong></span>
    `;
  }

  private renderWheelPanel(): void {
    if (!this.catalog || !this.build) return;
    const grid = this.root.querySelector(".garage-part-grid")!;
    grid.replaceChildren();
    grid.classList.remove("hidden");

    const classId = this.activeClassId();
    const limits = wheelLimitsForClass(classId);
    const packagePart = this.catalog.partsBySlot.wheel_package?.find(
      (p) => p.partType === this.build!.wheel_package,
    );
    const setup = resolveWheelSetup(this.build, classId, packagePart);

    const panel = document.createElement("div");
    panel.className = "chassis-setup-panel wheel-setup-panel";

    const packages = this.classVisibleParts("wheel_package");
    if (packages.length > 0) {
      const pkgSection = document.createElement("div");
      pkgSection.className = "chassis-setup-section";
      pkgSection.innerHTML = `<h4 class="chassis-setup-heading">Wheel package</h4>`;
      const pkgCards = document.createElement("div");
      pkgCards.className = "garage-part-grid chassis-setup-grid";
      const selectedPkg = this.build.wheel_package;
      for (const part of packages) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = `part-card${part.partType === selectedPkg ? " selected" : ""}`;
        const statHtml = formatPartStatLines(partStatLines("wheel_package", part));
        card.innerHTML = `
          <span class="part-card-name">${escapeHtml(part.displayName)}</span>
          <div class="part-card-stats">${statHtml || '<span class="part-stat-line">Standard spec</span>'}</div>
        `;
        card.addEventListener("click", () => {
          if (!this.build || part.partType === selectedPkg) return;
          this.captureStatSnapshot();
          const nextBuild: CarBuildPayload = {
            ...this.build,
            wheel_package: part.partType,
            front_wheel_diameter_in: undefined,
            rear_wheel_diameter_in: undefined,
            front_tire_width_mm: undefined,
            rear_tire_width_mm: undefined,
          };
          const nextPart = part;
          const nextSetup = clampWheelSetup(
            resolveWheelSetup(nextBuild, classId, nextPart),
            classId,
          );
          this.build = {
            ...nextBuild,
            ...wheelSetupToBuildFields(nextSetup),
          };
          this.previewBuild = null;
          this.statusEl.textContent = "";
          this.render();
        });
        pkgCards.appendChild(card);
      }
      pkgSection.appendChild(pkgCards);
      panel.appendChild(pkgSection);
    }

    const tuningSection = document.createElement("div");
    tuningSection.className = "chassis-setup-section";
    tuningSection.innerHTML = `<h4 class="chassis-setup-heading">Tyre dimensions</h4>`;

    const defs: Array<{
      key: keyof WheelSetup;
      label: string;
      range: { min: number; max: number; step: number };
      format: (v: number) => string;
    }> = [
      {
        key: "frontDiameterIn",
        label: "Front wheel diameter",
        range: limits.frontDiameter,
        format: (v) => `${v}"`,
      },
      {
        key: "rearDiameterIn",
        label: "Rear wheel diameter",
        range: limits.rearDiameter,
        format: (v) => `${v}"`,
      },
      {
        key: "frontWidthMm",
        label: "Front tyre width",
        range: limits.frontWidth,
        format: (v) => `${v} mm`,
      },
      {
        key: "rearWidthMm",
        label: "Rear tyre width",
        range: limits.rearWidth,
        format: (v) => `${v} mm`,
      },
    ];

    for (const def of defs) {
      const wrap = document.createElement("label");
      wrap.className = "engine-slider-field chassis-slider-field";
      const value = setup[def.key];
      wrap.innerHTML = `
        <span class="engine-slider-label">
          <span class="engine-slider-name">${def.label}</span>
          <span class="engine-slider-value">${def.format(value)}</span>
        </span>
        <input type="range" class="engine-slider" />
      `;
      const slider = wrap.querySelector<HTMLInputElement>(".engine-slider")!;
      slider.min = String(def.range.min);
      slider.max = String(def.range.max);
      slider.step = String(def.range.step);
      slider.value = String(value);
      slider.addEventListener("pointerdown", () => {
        this.captureStatSnapshot();
      });
      slider.addEventListener("input", () => {
        if (!this.build) return;
        const current = resolveWheelSetup(this.build, classId, packagePart);
        const nextSetup = clampWheelSetup(
          { ...current, [def.key]: parseFloat(slider.value) },
          classId,
        );
        wrap.querySelector(".engine-slider-value")!.textContent =
          def.format(nextSetup[def.key]);
        this.build = {
          ...this.build,
          ...wheelSetupToBuildFields(nextSetup),
        };
        this.previewBuild = null;
        this.updateWheelSetupSummary(classId, packagePart);
        this.renderStats();
      });
      tuningSection.appendChild(wrap);
    }
    panel.appendChild(tuningSection);

    const wheelStats = computeWheelStats(setup, packagePart, classId);
    const summary = document.createElement("div");
    summary.className = "wheel-setup-summary";
    summary.innerHTML = `
      <p class="wheel-setup-hint">Package baseline is the tuned setup. Width affects per-wheel heat &amp; wear in the race sim.</p>
      <div class="wheel-setup-metrics">
        <span>Front grip <strong>×${wheelStats.frontAxleGrip.toFixed(2)}</strong></span>
        <span>Rear grip <strong>×${wheelStats.rearAxleGrip.toFixed(2)}</strong></span>
        <span>Balance <strong>${(wheelStats.balanceFactor * 100).toFixed(0)}%</strong></span>
        <span>F wear <strong>×${(wheelStats.wearFactor * wheelStats.frontAxleWear).toFixed(2)}</strong></span>
        <span>R wear <strong>×${(wheelStats.wearFactor * wheelStats.rearAxleWear).toFixed(2)}</strong></span>
        <span>F heat <strong>×${wheelStats.frontAxleHeat.toFixed(2)}</strong></span>
        <span>R heat <strong>×${wheelStats.rearAxleHeat.toFixed(2)}</strong></span>
        <span>Wheel drag <strong>+${wheelStats.dragCd.toFixed(3)} Cd</strong></span>
      </div>
    `;
    panel.appendChild(summary);

    grid.appendChild(panel);
  }

  private updateWheelSetupSummary(
    classId: string,
    packagePart: PartOptionPayload | undefined,
  ): void {
    const metrics = this.root.querySelector(".wheel-setup-metrics");
    if (!metrics || !this.build) return;
    const setup = resolveWheelSetup(this.build, classId, packagePart);
    const wheelStats = computeWheelStats(setup, packagePart, classId);
    metrics.innerHTML = `
      <span>Front grip <strong>×${wheelStats.frontAxleGrip.toFixed(2)}</strong></span>
      <span>Rear grip <strong>×${wheelStats.rearAxleGrip.toFixed(2)}</strong></span>
      <span>Balance <strong>${(wheelStats.balanceFactor * 100).toFixed(0)}%</strong></span>
      <span>F wear <strong>×${(wheelStats.wearFactor * wheelStats.frontAxleWear).toFixed(2)}</strong></span>
      <span>R wear <strong>×${(wheelStats.wearFactor * wheelStats.rearAxleWear).toFixed(2)}</strong></span>
      <span>F heat <strong>×${wheelStats.frontAxleHeat.toFixed(2)}</strong></span>
      <span>R heat <strong>×${wheelStats.rearAxleHeat.toFixed(2)}</strong></span>
      <span>Wheel drag <strong>+${wheelStats.dragCd.toFixed(3)} Cd</strong></span>
    `;
  }

  private renderGuideConfirm(): void {
    if (!this.build || !this.catalog) return;
    this.partGridEl.classList.remove("hidden");
    this.engineDesigner.setVisible(false);
    const classId = this.activeClassId();
    const compiled = compileCarStats(
      this.build,
      this.catalog.partsBySlot,
      compileOptions(this.activeClassInfo()),
    );
    const engineLabel = this.build.engine
      ? `${this.build.engine.engine_layout} · ${this.build.engine.fuel_type}${this.build.engine.aspiration ? ` · ${this.build.engine.aspiration}` : ""}`
      : "Default engine";

    const perfLine = formatStatSummary(compiled);

    this.partGridEl.innerHTML = `
      <div class="confirm-grid garage-confirm-grid">
        <div class="confirm-card">
          <h4>${escapeHtml(classId)} Platform</h4>
          <p class="confirm-detail"><strong>${escapeHtml(this.build.carName.trim())}</strong></p>
          <p class="confirm-detail">${escapeHtml(engineLabel)}</p>
        </div>
        <div class="confirm-card">
          <h4>Aero &amp; Chassis</h4>
          <p class="confirm-detail">${escapeHtml(this.build.chassis_type)}</p>
          <p class="confirm-detail">${escapeHtml(this.build.front_aero_type)} / ${escapeHtml(this.build.rear_aero_type)}</p>
          ${
            classAllowsHybrid(this.activeClassInfo())
              ? `<p class="confirm-detail">${escapeHtml(this.build.hybrid_system)}</p>`
              : ""
          }
        </div>
        <div class="confirm-card">
          <h4>Sim Performance</h4>
          <p class="confirm-detail">${escapeHtml(perfLine)}</p>
          <p class="confirm-detail">${Math.round(compiled.rawTotalMass)} kg · Cl ${compiled.totalDownforceCl.toFixed(2)} · Cd ${compiled.totalDragCd.toFixed(3)}</p>
        </div>
      </div>
    `;
  }

  private renderStats(): void {
    if (!this.catalog || !this.build) return;
    const classInfo = this.activeClassInfo();
    const opts = compileOptions(classInfo);

    const currentCompiled = compileCarStats(
      this.build,
      this.catalog.partsBySlot,
      opts,
    );

    let displayCompiled = currentCompiled;
    let baselineCompiled: ReturnType<typeof compileCarStats> | null = null;
    let baselineBars: Record<SimBarId, number> | null = null;

    if (this.previewBuild) {
      displayCompiled = compileCarStats(
        this.previewBuild,
        this.catalog.partsBySlot,
        opts,
      );
      baselineCompiled = currentCompiled;
      baselineBars = toBarValues(currentCompiled);
    } else if (this.compareCompiled && this.compareBars) {
      baselineCompiled = this.compareCompiled;
      baselineBars = this.compareBars;
    }

    const displayBars = toBarValues(displayCompiled);

    const perf = this.root.querySelector(".garage-perf-stats")!;
    perf.innerHTML = SIM_STAT_BARS.map((def) =>
      statBarHtml(
        def,
        displayBars[def.id],
        displayCompiled,
        baselineCompiled ?? undefined,
        baselineBars?.[def.id],
      ),
    ).join("");

    const engineHp = currentCompiled.peakHorsepower;
    const rawHp = this.build.engine
      ? Math.round(peakHorsepower(this.build.engine, this.activeClassId()))
      : 0;
    const cap = classInfo?.powerCapHp ?? 0;
    const powerNote =
      cap > 0 && rawHp > cap
        ? `${Math.round(engineHp)} hp effective (${rawHp} hp before BoP)`
        : `${Math.round(engineHp)} hp`;
    const hybridNote =
      currentCompiled.hybridDeployKw > 0
        ? ` · +${currentCompiled.hybridDeployKw} kW hybrid`
        : "";
    this.root.querySelector(".garage-mass-note")!.textContent =
      `Build mass: ${Math.round(currentCompiled.rawTotalMass)} kg` +
      (currentCompiled.calculatedTotalMass > currentCompiled.rawTotalMass + 0.5
        ? ` · Race min ${Math.round(currentCompiled.calculatedTotalMass)} kg`
        : "") +
      ` · Engine ${powerNote}${hybridNote} · Grip ×${effectiveGripScore(currentCompiled).toFixed(2)} · Corner ×${effectiveCorneringScore(currentCompiled).toFixed(2)}`;

    const activeCar = this.resolvedFleetCar();
    const cls = activeCar?.classId ?? this.meta?.playerClassId ?? "Hypercar";
    const carNum = activeCar ? `#${activeCar.carNumber}` : "";
    const subtitle = this.root.querySelector(".mm-panel-subtitle");
    if (subtitle) {
      subtitle.textContent = `${carNum} ${cls} · Configure components within class regulations.`;
    }
  }

  setStatus(message: string, isError = false): void {
    this.statusEl.textContent = message;
    this.statusEl.className = isError
      ? "garage-status error"
      : message
        ? "garage-status ok"
        : "garage-status";
  }

  showGarageAdvice(payload: {
    text: string;
    suggestedChanges?: Partial<CarBuildPayload>;
    offline?: boolean;
    model?: string;
    latencyMs?: number;
  }): void {
    this.garageEngineer.showAdvice(payload);
  }

  private compiledSnapshotForEngineer(): Record<string, number> {
    if (!this.build || !this.catalog) return {};
    const classId = this.activeClassId();
    const classInfo = this.catalog.classes.find((c) => c.id === classId);
    const compiled = compileCarStats(
      this.build,
      this.catalog.partsBySlot,
      compileOptions(classInfo ?? null),
    );
    return {
      powerHp: compiled.peakHorsepower,
      downforceCl: compiled.totalDownforceCl,
      dragCd: compiled.totalDragCd,
      massKg: compiled.rawTotalMass,
      gripIndex: compiled.gripIndex,
      corneringFactor: compiled.corneringFactor,
      coolingCapacity: compiled.coolingCapacity,
      fuelTankL: compiled.fuelTankCapacity,
      pitWorkFactor: compiled.serviceabilityFactor,
    };
  }

  private applyGarageChanges(changes: Partial<CarBuildPayload>): void {
    if (!this.build || !this.catalog || !this.meta) return;

    const resolved = this.resolveEngineerChanges(changes);
    if (!Object.keys(resolved).length) {
      this.setStatus("Could not apply — parts unknown, locked, or incompatible.", true);
      return;
    }

    const merged = { ...this.build, ...resolved };
    const assemblyErr = validateAssemblyCompatibility(merged, this.assemblyRules());
    if (assemblyErr) {
      this.setStatus(`${assemblyErr} — engineer suggestion blocked.`, true);
      return;
    }

    const firstField = Object.keys(resolved)[0] as keyof CarBuildPayload;
    const slot = FIELD_TO_BUILD_SLOT[firstField];
    if (slot) this.activeSlot = slot;

    this.captureStatSnapshot();
    this.build = normalizeCarBuild(merged, this.activeClassId(), this.catalog.partsBySlot);
    this.previewBuild = null;
    this.render();

    const summary = Object.entries(resolved)
      .map(([field, partType]) => {
        const slotKey = FIELD_TO_BUILD_SLOT[field as keyof CarBuildPayload];
        const part = slotKey
          ? this.catalog?.partsBySlot[slotKey as PartSlot]?.find((p) => p.partType === partType)
          : undefined;
        return part?.displayName ?? partType;
      })
      .join(", ");
    this.setStatus(`Applied: ${summary} — review stats and save.`);
    this.garageEngineer.clearPendingChanges();
  }

  private resolveEngineerChanges(
    changes: Partial<CarBuildPayload>,
  ): Partial<CarBuildPayload> {
    if (!this.catalog || !this.meta) return {};
    const out: Partial<CarBuildPayload> = {};

    for (const [field, rawVal] of Object.entries(changes)) {
      const buildField = field as keyof CarBuildPayload;
      const slot = FIELD_TO_BUILD_SLOT[buildField];
      if (!slot || typeof rawVal !== "string") continue;

      const parts = this.classVisibleParts(slot as PartSlot);
      const needle = rawVal.trim().toLowerCase();
      const match =
        parts.find((p) => p.partType === rawVal) ??
        parts.find((p) => p.partType.toLowerCase() === needle) ??
        parts.find((p) => p.displayName.toLowerCase() === needle) ??
        parts.find(
          (p) =>
            p.partType.toLowerCase().includes(needle) ||
            p.displayName.toLowerCase().includes(needle),
        );

      if (!match || isPartLocked(match, this.meta.unlockedParts)) continue;
      if (
        !isPartCompatibleWithBuild(
          this.build!,
          slot as PartSlot,
          match.partType,
          this.assemblyRules(),
        )
      ) {
        continue;
      }

      (out as Record<string, string>)[buildField] = match.partType;
    }

    return out;
  }
}

const FALLBACK_ENGINE: EngineBuildPayload = {
  engine_layout: "V6",
  fuel_type: "Gasoline",
  cylinders: 6,
  bore: 0.096,
  stroke: 0.055,
  max_rpm: 9000,
  peak_torque_nm: 435,
  peak_torque_rpm: 6500,
  base_vibration: 0.95,
  aspiration: "TwinParallel",
  drivetrain: "Mechanical",
  power_target: 660,
  rev_character: 0.55,
  block_size: 0.5,
};

function defaultBuild(meta: MetaStatePayload): CarBuildPayload {
  const classId = meta.playerClassId ?? "Hypercar";
  const wheel =
    classId === "LMGT3"
      ? "GT3Front20Rear21"
      : classId === "LMP2"
        ? "LMP2Oreca18"
        : "Hypercar18Standard";
  const suspension =
    classId === "LMGT3"
      ? "DoubleWishboneGT3"
      : classId === "LMP2"
        ? "OrecaLMP2Spec"
        : "PushrodDoubleWishbone";
  return {
    carName: `${meta.teamName} ${classId}`,
    chassis_type: classId === "LMGT3" ? "GT3Spaceframe" : classId === "LMP2" ? "Oreca07" : "LMDhDallara",
    front_aero_type: "LowDragNose",
    rear_aero_type: classId === "LMGT3" ? "HighDownforceWing" : "StandardWing",
    diffuser_type: "StockFloor",
    exhaust_type: "TwinOutletSide",
    cooling_pack: "EnduranceHeavyDuty",
    cooling: {
      engine_radiator: 0.65,
      oil_cooler: 0.55,
      charge_air_cooler: 0.5,
      gearbox_cooler: 0.4,
    },
    duct_airflow: 1,
    wheel_package: wheel,
    suspension_layout: suspension,
    front_suspension_layout: suspension,
    rear_suspension_layout: suspension,
    front_wheel_diameter_in: classId === "LMGT3" ? 20 : 18,
    rear_wheel_diameter_in: classId === "LMGT3" ? 21 : 18,
    front_tire_width_mm: classId === "LMGT3" ? 325 : classId === "LMP2" ? 300 : 305,
    rear_tire_width_mm: classId === "LMGT3" ? 340 : classId === "LMP2" ? 305 : 310,
    front_ride_height_mm: classId === "LMGT3" ? 45 : classId === "LMP2" ? 42 : 40,
    rear_ride_height_mm: classId === "LMGT3" ? 45 : classId === "LMP2" ? 42 : 40,
    front_spring_nm: classId === "LMGT3" ? 122000 : classId === "LMP2" ? 128000 : 135000,
    rear_spring_nm: classId === "LMGT3" ? 138000 : classId === "LMP2" ? 142000 : 150000,
    front_arb_stiffness: 1,
    rear_arb_stiffness: 1,
    front_damper_bump: 8,
    front_damper_rebound: 8,
    rear_damper_bump: 8,
    rear_damper_rebound: 8,
    fuel_system: classId === "Hypercar" ? "LeMans110L" : "StandardTank",
    brake_system: classId === "Hypercar" ? "BremboHypercar" : "StandardCaliper",
    transmission: classId === "LMGT3" ? "XtracP529" : classId === "Hypercar" ? "XtracP1359" : "SixSpeedSequential",
    hybrid_system: classId === "Hypercar" ? "LMDh50kW" : "None",
    engine: { ...FALLBACK_ENGINE },
  };
}
