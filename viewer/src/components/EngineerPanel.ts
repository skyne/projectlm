import { mmPanelHeader } from "../utils/mmUi";

export interface EngineerPanelHandlers {
  onAsk: (entryId: string, question?: string) => void;
  onApplyCommand: (entryId: string, command: string) => void;
  onRefreshStatus: () => void;
}

export class EngineerPanel {
  readonly root: HTMLElement;
  private statusBadge!: HTMLElement;
  private questionInput!: HTMLInputElement;
  private askBtn!: HTMLButtonElement;
  private responseEl!: HTMLElement;
  private applyBtn!: HTMLButtonElement;
  private metaEl!: HTMLElement;
  private handlers: EngineerPanelHandlers;
  private playerEntryId = "entry-1";
  private pendingCommand: string | null = null;
  private loading = false;

  constructor(container: HTMLElement, handlers: EngineerPanelHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("section");
    this.root.className = "panel engineer-panel panel-wec hidden";
    this.root.innerHTML = `
      ${mmPanelHeader("Race Engineer", { subtitle: "Local LLM · pit strategy", badge: "AI" })}
      <p class="engineer-status-line">
        <span class="engineer-status-badge">Checking Ollama…</span>
        <button type="button" class="text-btn engineer-refresh-status">Refresh</button>
      </p>
      <label class="mm-field">
        <span class="control-label">Ask the engineer</span>
        <input type="text" id="engineer-question" placeholder="Should we box now?" maxlength="240" />
      </label>
      <button type="button" class="primary-btn engineer-ask-btn">Get advice</button>
      <div class="engineer-response" aria-live="polite"></div>
      <button type="button" class="secondary-btn engineer-apply-btn hidden">Apply suggested command</button>
      <p class="engineer-meta"></p>
    `;
    container.appendChild(this.root);

    this.statusBadge = this.root.querySelector(".engineer-status-badge")!;
    this.questionInput = this.root.querySelector("#engineer-question")!;
    this.askBtn = this.root.querySelector(".engineer-ask-btn")!;
    this.responseEl = this.root.querySelector(".engineer-response")!;
    this.applyBtn = this.root.querySelector(".engineer-apply-btn")!;
    this.metaEl = this.root.querySelector(".engineer-meta")!;

    this.askBtn.addEventListener("click", () => this.submitQuestion());
    this.questionInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") this.submitQuestion();
    });
    this.applyBtn.addEventListener("click", () => {
      if (!this.pendingCommand) return;
      this.handlers.onApplyCommand(this.playerEntryId, this.pendingCommand);
      this.metaEl.textContent = `Applied: ${this.pendingCommand}`;
    });
    this.root.querySelector(".engineer-refresh-status")!.addEventListener("click", () => {
      this.handlers.onRefreshStatus();
    });
  }

  setPlayerEntry(entryId: string): void {
    this.playerEntryId = entryId;
  }

  setRaceActive(active: boolean): void {
    this.root.classList.toggle("hidden", !active);
  }

  setInteractionEnabled(enabled: boolean): void {
    this.askBtn.disabled = !enabled || this.loading;
    this.questionInput.disabled = !enabled;
    this.applyBtn.disabled = !enabled;
    this.root.querySelector<HTMLButtonElement>(".engineer-refresh-status")!.disabled =
      !enabled;
    this.root.classList.toggle("spectator-readonly", !enabled);
  }

  setLoading(loading: boolean): void {
    this.loading = loading;
    this.askBtn.disabled = loading;
    this.askBtn.textContent = loading ? "Thinking…" : "Get advice";
  }

  setEngineerStatus(online: boolean, model: string): void {
    this.statusBadge.textContent = online
      ? `Ollama online · ${model}`
      : `Ollama offline · heuristic fallback`;
    this.statusBadge.classList.toggle("engineer-online", online);
    this.statusBadge.classList.toggle("engineer-offline", !online);
  }

  showAdvice(payload: {
    text: string;
    suggestedCommand?: string;
    offline?: boolean;
    model?: string;
    latencyMs?: number;
  }): void {
    this.setLoading(false);
    this.responseEl.textContent = payload.text;
    this.pendingCommand = payload.suggestedCommand ?? null;
    this.applyBtn.classList.toggle("hidden", !payload.suggestedCommand);
    if (payload.suggestedCommand) {
      this.applyBtn.textContent = `Apply: ${payload.suggestedCommand}`;
    }

    const parts: string[] = [];
    if (payload.model) parts.push(payload.model);
    if (typeof payload.latencyMs === "number") parts.push(`${payload.latencyMs} ms`);
    if (payload.offline) parts.push("offline mode");
    this.metaEl.textContent = parts.join(" · ");
  }

  private submitQuestion(): void {
    if (this.loading) return;
    this.setLoading(true);
    this.responseEl.textContent = "Analyzing telemetry…";
    this.applyBtn.classList.add("hidden");
    this.pendingCommand = null;
    const question = this.questionInput.value.trim();
    this.handlers.onAsk(this.playerEntryId, question || undefined);
  }
}
