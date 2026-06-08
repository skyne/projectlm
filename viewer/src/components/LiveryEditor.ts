import type { MetaStatePayload, TeamLiveryPayload } from "../ws/protocol";
import {
  bindLiveryPatternPicker,
  createLiveryPreviewCard,
  type LiveryPreviewMount,
} from "./LiveryPreview";
import {
  bindColorSwatches,
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  teamInitials,
} from "../utils/liveryColors";
import { processLogoUpload } from "../utils/teamLogo";
import {
  DEFAULT_LIVERY_PATTERN,
  randomLiveryPattern,
  resolveTeamLivery,
  type LiveryPattern,
} from "../utils/teamLivery";

export interface LiveryEditorHandlers {
  onSave: (livery: TeamLiveryPayload) => void;
}

export class LiveryEditor {
  readonly root: HTMLElement;
  private previewMount!: LiveryPreviewMount;
  private primarySwatchesEl!: HTMLElement;
  private secondarySwatchesEl!: HTMLElement;
  private patternPickerEl!: HTMLElement;
  private logoPreviewEl!: HTMLElement;
  private logoStatusEl!: HTMLElement;
  private saveBtn!: HTMLButtonElement;
  private statusEl!: HTMLElement;
  private randomPatternBtn!: HTMLButtonElement;
  private handlers: LiveryEditorHandlers;

  private teamName = "";
  private previewClassId = "Hypercar";
  private primary = DEFAULT_PRIMARY;
  private secondary = DEFAULT_SECONDARY;
  private pattern: LiveryPattern = DEFAULT_LIVERY_PATTERN;
  private logoDataUrl: string | null = null;
  private savedLivery: TeamLiveryPayload = resolveTeamLivery(null);
  private dirty = false;

  constructor(container: HTMLElement, handlers: LiveryEditorHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("div");
    this.root.className = "livery-editor";
    this.root.innerHTML = `
      <div class="livery-editor-split">
        <div class="livery-editor-controls">
          <div class="wizard-field">
            <span>Primary color</span>
            <div class="color-swatches primary-swatches"></div>
          </div>
          <div class="wizard-field">
            <span>Secondary color</span>
            <div class="color-swatches secondary-swatches"></div>
          </div>
          <div class="wizard-field">
            <div class="livery-field-head">
              <span>Stripe pattern</span>
              <button type="button" class="secondary-btn livery-random-pattern-btn">Random</button>
            </div>
            <div class="livery-pattern-picker"></div>
          </div>
          <div class="wizard-field">
            <span>Team logo</span>
            <div class="livery-logo-row">
              <div class="livery-logo-preview" aria-hidden="true"></div>
              <div class="livery-logo-actions">
                <label class="secondary-btn livery-logo-upload-label">
                  Upload image
                  <input type="file" class="livery-logo-input hidden" accept="image/*" />
                </label>
                <button type="button" class="secondary-btn livery-logo-clear-btn" disabled>Remove</button>
              </div>
            </div>
            <p class="wizard-hint livery-logo-status">PNG, JPG, WebP, GIF, or SVG — resized automatically after upload.</p>
          </div>
          <div class="livery-editor-actions">
            <button type="button" class="primary-btn livery-save-btn" disabled>Save livery</button>
            <span class="livery-editor-status" aria-live="polite"></span>
          </div>
        </div>
        <div class="livery-editor-preview-wrap">
          <div class="livery-editor-preview-host"></div>
          <p class="wizard-hint">Live car preview — team colors and stripes paint the body across your fleet, garage, and race map.</p>
        </div>
      </div>
    `;
    container.appendChild(this.root);

    this.primarySwatchesEl = this.root.querySelector(".primary-swatches")!;
    this.secondarySwatchesEl = this.root.querySelector(".secondary-swatches")!;
    this.patternPickerEl = this.root.querySelector(".livery-pattern-picker")!;
    this.logoPreviewEl = this.root.querySelector(".livery-logo-preview")!;
    this.logoStatusEl = this.root.querySelector(".livery-logo-status")!;
    this.saveBtn = this.root.querySelector(".livery-save-btn")!;
    this.statusEl = this.root.querySelector(".livery-editor-status")!;
    this.randomPatternBtn = this.root.querySelector(".livery-random-pattern-btn")!;

    const previewHost = this.root.querySelector<HTMLElement>(".livery-editor-preview-host")!;
    this.previewMount = createLiveryPreviewCard(previewHost, this.previewOptions());

    const logoInput = this.root.querySelector<HTMLInputElement>(".livery-logo-input")!;
    const clearLogoBtn = this.root.querySelector<HTMLButtonElement>(".livery-logo-clear-btn")!;

    this.saveBtn.addEventListener("click", () => this.save());
    this.randomPatternBtn.addEventListener("click", () => {
      this.pattern = randomLiveryPattern();
      this.markDirty();
      this.renderControls();
      this.renderPreview();
    });
    logoInput.addEventListener("change", () => {
      const file = logoInput.files?.[0];
      logoInput.value = "";
      if (!file) return;
      void this.handleLogoUpload(file);
    });
    clearLogoBtn.addEventListener("click", () => {
      this.logoDataUrl = null;
      this.markDirty();
      this.renderLogoPreview();
      this.renderPreview();
    });
  }

  update(meta: MetaStatePayload): void {
    this.teamName = meta.teamName;
    this.previewClassId = meta.fleet?.[0]?.classId ?? meta.playerClassId ?? "Hypercar";
    const livery = resolveTeamLivery(meta);

    if (!this.dirty) {
      this.primary = livery.primary;
      this.secondary = livery.secondary;
      this.pattern = livery.pattern;
      this.logoDataUrl = livery.logoDataUrl ?? null;
      this.savedLivery = { ...livery };
      this.render();
    } else {
      this.renderPreview();
    }
  }

  setStatus(message: string, isError = false): void {
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle("error", isError);
    if (!isError && message) {
      this.dirty = false;
      this.savedLivery = this.currentLivery();
      this.saveBtn.disabled = true;
    }
  }

  private previewOptions() {
    return {
      primary: this.primary,
      secondary: this.secondary,
      pattern: this.pattern,
      logoDataUrl: this.logoDataUrl,
      classId: this.previewClassId,
      teamName: this.teamName,
      width: 560,
      height: 148,
      layout: "showcase" as const,
    };
  }

  private currentLivery(): TeamLiveryPayload {
    return {
      primary: this.primary,
      secondary: this.secondary,
      pattern: this.pattern,
      logoDataUrl: this.logoDataUrl,
    };
  }

  private liveryDirty(): boolean {
    const cur = this.currentLivery();
    return (
      cur.primary.toLowerCase() !== this.savedLivery.primary.toLowerCase() ||
      cur.secondary.toLowerCase() !== this.savedLivery.secondary.toLowerCase() ||
      cur.pattern !== this.savedLivery.pattern ||
      (cur.logoDataUrl ?? null) !== (this.savedLivery.logoDataUrl ?? null)
    );
  }

  private markDirty(): void {
    this.dirty = this.liveryDirty();
    this.saveBtn.disabled = !this.dirty;
    if (this.dirty) {
      this.statusEl.textContent = "";
      this.statusEl.classList.remove("error");
    }
  }

  private save(): void {
    if (!this.dirty) return;
    this.handlers.onSave(this.currentLivery());
    this.setStatus("Saving…");
  }

  private async handleLogoUpload(file: File): Promise<void> {
    try {
      const processed = await processLogoUpload(file);
      this.logoDataUrl = processed.dataUrl;
      this.logoStatusEl.textContent = `Logo ready (${processed.width}×${processed.height}).`;
      this.logoStatusEl.classList.remove("error");
      this.markDirty();
      this.renderLogoPreview();
      this.renderPreview();
    } catch (err) {
      this.logoStatusEl.textContent =
        err instanceof Error ? err.message : "Could not process logo";
      this.logoStatusEl.classList.add("error");
    }
  }

  private render(): void {
    this.renderControls();
    this.renderLogoPreview();
    this.renderPreview();
    this.saveBtn.disabled = !this.dirty;
  }

  private renderControls(): void {
    bindColorSwatches(this.primarySwatchesEl, this.primary, (c) => this.setPrimary(c), {
      onLive: (c) => this.renderPreviewWith({ primary: c }),
      onCancel: () => this.renderPreview(),
    });
    bindColorSwatches(this.secondarySwatchesEl, this.secondary, (c) => this.setSecondary(c), {
      onLive: (c) => this.renderPreviewWith({ secondary: c }),
      onCancel: () => this.renderPreview(),
    });
    bindLiveryPatternPicker(
      this.patternPickerEl,
      this.pattern,
      { primary: this.primary, secondary: this.secondary },
      (pattern) => {
        this.pattern = pattern;
        this.markDirty();
        this.renderControls();
        this.renderPreview();
      },
    );
  }

  private renderLogoPreview(): void {
    const clearBtn = this.root.querySelector<HTMLButtonElement>(".livery-logo-clear-btn")!;
    clearBtn.disabled = !this.logoDataUrl;
    this.logoPreviewEl.replaceChildren();
    if (this.logoDataUrl) {
      const img = document.createElement("img");
      img.src = this.logoDataUrl;
      img.alt = "Team logo preview";
      img.className = "livery-logo-thumb";
      this.logoPreviewEl.appendChild(img);
      return;
    }
    const placeholder = document.createElement("span");
    placeholder.className = "livery-logo-placeholder";
    placeholder.textContent = teamInitials(this.teamName);
    this.logoPreviewEl.appendChild(placeholder);
  }

  private setPrimary(color: string): void {
    this.primary = color;
    this.markDirty();
    this.renderControls();
    this.renderPreview();
  }

  private setSecondary(color: string): void {
    this.secondary = color;
    this.markDirty();
    this.renderControls();
    this.renderPreview();
  }

  private renderPreview(): void {
    this.renderPreviewWith({});
  }

  private renderPreviewWith(overrides: {
    primary?: string;
    secondary?: string;
    pattern?: LiveryPattern;
  }): void {
    this.previewMount.update({
      ...this.previewOptions(),
      primary: overrides.primary ?? this.primary,
      secondary: overrides.secondary ?? this.secondary,
      pattern: overrides.pattern ?? this.pattern,
      teamName: this.teamName,
    });
  }
}
