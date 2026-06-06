import { mmPanelHeader } from "../utils/mmUi";
import type { CarBuildPayload } from "../ws/protocol";

export interface GarageEngineerHandlers {
  onAsk: (question?: string) => void;
  onApplyChanges: (changes: Partial<CarBuildPayload>) => void;
}

export class GarageEngineerPanel {
  readonly root: HTMLElement;
  private questionInput!: HTMLInputElement;
  private askBtn!: HTMLButtonElement;
  private responseEl!: HTMLElement;
  private applyBtn!: HTMLButtonElement;
  private metaEl!: HTMLElement;
  private handlers: GarageEngineerHandlers;
  private pendingChanges: Partial<CarBuildPayload> | null = null;
  private loading = false;

  constructor(container: HTMLElement, handlers: GarageEngineerHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("section");
    this.root.className = "garage-engineer-panel";
    this.root.innerHTML = `
      ${mmPanelHeader("Development Engineer", { subtitle: "R&D · part tradeoffs", badge: "AI" })}
      <label class="mm-field">
        <span class="control-label">Development question</span>
        <input type="text" class="garage-engineer-question" placeholder="More downforce for Paul Ricard?" maxlength="240" />
      </label>
      <button type="button" class="secondary-btn garage-engineer-ask">Analyze build</button>
      <div class="garage-engineer-response" aria-live="polite"></div>
      <button type="button" class="primary-btn garage-engineer-apply hidden">Apply suggested parts</button>
      <p class="garage-engineer-meta"></p>
    `;
    container.appendChild(this.root);

    this.questionInput = this.root.querySelector(".garage-engineer-question")!;
    this.askBtn = this.root.querySelector(".garage-engineer-ask")!;
    this.responseEl = this.root.querySelector(".garage-engineer-response")!;
    this.applyBtn = this.root.querySelector(".garage-engineer-apply")!;
    this.metaEl = this.root.querySelector(".garage-engineer-meta")!;

    this.askBtn.addEventListener("click", () => this.submit());
    this.questionInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") this.submit();
    });
    this.applyBtn.addEventListener("click", () => {
      if (!this.pendingChanges) return;
      this.handlers.onApplyChanges(this.pendingChanges);
      this.metaEl.textContent = "Suggested parts applied — review stats and save.";
    });
  }

  setLoading(loading: boolean): void {
    this.loading = loading;
    this.askBtn.disabled = loading;
    this.askBtn.textContent = loading ? "Analyzing…" : "Analyze build";
  }

  showAdvice(payload: {
    text: string;
    suggestedChanges?: Partial<CarBuildPayload>;
    offline?: boolean;
    model?: string;
    latencyMs?: number;
  }): void {
    this.setLoading(false);
    this.responseEl.textContent = payload.text;
    this.pendingChanges =
      payload.suggestedChanges && Object.keys(payload.suggestedChanges).length > 0
        ? payload.suggestedChanges
        : null;
    this.applyBtn.classList.toggle("hidden", !this.pendingChanges);
    if (this.pendingChanges) {
      const keys = Object.keys(this.pendingChanges).join(", ");
      this.applyBtn.textContent = `Apply: ${keys}`;
    }
    const parts: string[] = [];
    if (payload.model) parts.push(payload.model);
    if (typeof payload.latencyMs === "number") parts.push(`${payload.latencyMs} ms`);
    if (payload.offline) parts.push("offline mode");
    this.metaEl.textContent = parts.join(" · ");
  }

  private submit(): void {
    if (this.loading) return;
    this.setLoading(true);
    this.responseEl.textContent = "Reviewing platform and part catalog…";
    this.applyBtn.classList.add("hidden");
    this.pendingChanges = null;
    this.handlers.onAsk(this.questionInput.value.trim() || undefined);
  }

  clearPendingChanges(): void {
    this.pendingChanges = null;
    this.applyBtn.classList.add("hidden");
  }
}
