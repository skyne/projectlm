import { CarCompositor, clearImageCache, loadCarGraphics } from "../graphics/CarCompositor";
import { classIdFromChassis, tintAssemblyCanvas } from "../graphics/liveryRenderer";
import type { CarBuildVisual } from "../graphics/visualCatalog";
import { resolveTeamLivery, type TeamLiveryView } from "../utils/teamLivery";

const DEMO_BUILD: CarBuildVisual = {
  chassis_type: "LMDhDallara",
  front_aero_type: "LowDragNose",
  rear_aero_type: "HighDownforceWing",
  wheel_package: "Hypercar18WideRear",
  hybrid_system: "LMDh50kW",
};

export class CarPreview {
  private root: HTMLElement;
  private canvasHost: HTMLElement;
  private labelEl: HTMLElement;
  private compositor: CarCompositor | null = null;
  private build: CarBuildVisual = { ...DEMO_BUILD };
  private livery: TeamLiveryView = resolveTeamLivery(null);
  private teamName = "";

  constructor(root: HTMLElement) {
    this.root = root;
    (window as unknown as { __carPreview?: CarPreview }).__carPreview = this;
    this.root.className = "panel car-preview-panel";
    this.root.innerHTML = `
      <h2 class="panel-title">Car assembly</h2>
      <div class="car-preview-canvas"></div>
      <p class="car-preview-parts"></p>
    `;
    this.canvasHost = this.root.querySelector(".car-preview-canvas")!;
    this.labelEl = this.root.querySelector(".car-preview-parts")!;
    void this.init();
  }

  setBuild(build: Partial<CarBuildVisual>): void {
    this.build = { ...this.build, ...build };
    void this.render();
  }

  setLivery(livery: TeamLiveryView, teamName?: string): void {
    this.livery = livery;
    if (teamName !== undefined) this.teamName = teamName;
    void this.render();
  }

  async reloadGraphics(): Promise<void> {
    clearImageCache();
    const { catalog, assembly } = await loadCarGraphics();
    this.compositor = new CarCompositor({ catalog, assembly });
    await this.render();
  }

  private async init(): Promise<void> {
    try {
      await this.reloadGraphics();
    } catch (err) {
      this.labelEl.textContent = `Assembly preview unavailable: ${err}`;
    }
  }

  private async render(): Promise<void> {
    if (!this.compositor) return;
    const assembly = await this.compositor.render(this.build);
    const canvas = await tintAssemblyCanvas(assembly, {
      primary: this.livery.primary,
      secondary: this.livery.secondary,
      pattern: this.livery.pattern,
      logoDataUrl: this.livery.logoDataUrl,
      classId: classIdFromChassis(this.build.chassis_type),
      teamName: this.teamName,
      visualBuild:
        classIdFromChassis(this.build.chassis_type) === "Hypercar" ? undefined : this.build,
    });
    this.canvasHost.innerHTML = "";
    canvas.className = "car-preview-img";
    this.canvasHost.appendChild(canvas);
    this.labelEl.textContent = [
      this.build.chassis_type,
      this.build.front_aero_type,
      this.build.rear_aero_type,
      this.build.wheel_package ?? "no wheels",
      this.build.hybrid_system,
    ].join(" · ");
  }
}
