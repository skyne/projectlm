import type { MetaStatePayload } from "../ws/protocol";
import {
  bindColorSwatches,
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  teamInitials,
} from "../utils/liveryColors";

export interface LiveryEditorHandlers {
  onSave: (colors: { primary: string; secondary: string }) => void;
}

export class LiveryEditor {
  readonly root: HTMLElement;
  private previewEl!: HTMLElement;
  private primarySwatchesEl!: HTMLElement;
  private secondarySwatchesEl!: HTMLElement;
  private saveBtn!: HTMLButtonElement;
  private statusEl!: HTMLElement;
  private handlers: LiveryEditorHandlers;

  private teamName = "";
  private primary = DEFAULT_PRIMARY;
  private secondary = DEFAULT_SECONDARY;
  private savedPrimary = DEFAULT_PRIMARY;
  private savedSecondary = DEFAULT_SECONDARY;
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
          <div class="livery-editor-actions">
            <button type="button" class="primary-btn livery-save-btn" disabled>Save livery</button>
            <span class="livery-editor-status" aria-live="polite"></span>
          </div>
        </div>
        <div class="livery-editor-preview-wrap">
          <div class="livery-preview-card livery-editor-preview">
            <div class="livery-badge preview-badge">??</div>
            <div class="livery-name preview-name">Your Team</div>
            <div class="livery-strip"></div>
          </div>
          <p class="wizard-hint">More livery options — decals, numbers, and patterns — coming soon.</p>
        </div>
      </div>
    `;
    container.appendChild(this.root);

    this.previewEl = this.root.querySelector(".livery-editor-preview")!;
    this.primarySwatchesEl = this.root.querySelector(".primary-swatches")!;
    this.secondarySwatchesEl = this.root.querySelector(".secondary-swatches")!;
    this.saveBtn = this.root.querySelector(".livery-save-btn")!;
    this.statusEl = this.root.querySelector(".livery-editor-status")!;

    this.saveBtn.addEventListener("click", () => this.save());
  }

  update(meta: MetaStatePayload): void {
    this.teamName = meta.teamName;
    const primary = meta.teamColors?.primary ?? DEFAULT_PRIMARY;
    const secondary = meta.teamColors?.secondary ?? DEFAULT_SECONDARY;

    if (!this.dirty) {
      this.primary = primary;
      this.secondary = secondary;
      this.savedPrimary = primary;
      this.savedSecondary = secondary;
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
      this.savedPrimary = this.primary;
      this.savedSecondary = this.secondary;
      this.saveBtn.disabled = true;
    }
  }

  private setPrimary(color: string): void {
    this.primary = color;
    this.markDirty();
    this.renderSwatches();
    this.renderPreview();
  }

  private setSecondary(color: string): void {
    this.secondary = color;
    this.markDirty();
    this.renderSwatches();
    this.renderPreview();
  }

  private markDirty(): void {
    this.dirty =
      this.primary.toLowerCase() !== this.savedPrimary.toLowerCase() ||
      this.secondary.toLowerCase() !== this.savedSecondary.toLowerCase();
    this.saveBtn.disabled = !this.dirty;
    if (this.dirty) {
      this.statusEl.textContent = "";
      this.statusEl.classList.remove("error");
    }
  }

  private save(): void {
    if (!this.dirty) return;
    this.handlers.onSave({ primary: this.primary, secondary: this.secondary });
    this.setStatus("Saving…");
  }

  private render(): void {
    this.renderSwatches();
    this.renderPreview();
    this.saveBtn.disabled = !this.dirty;
  }

  private renderSwatches(): void {
    bindColorSwatches(this.primarySwatchesEl, this.primary, (c) => this.setPrimary(c), {
      onLive: (c) => this.renderPreviewWith({ primary: c }),
      onCancel: () => this.renderPreview(),
    });
    bindColorSwatches(this.secondarySwatchesEl, this.secondary, (c) => this.setSecondary(c), {
      onLive: (c) => this.renderPreviewWith({ secondary: c }),
      onCancel: () => this.renderPreview(),
    });
  }

  private renderPreview(): void {
    this.renderPreviewWith({});
  }

  private renderPreviewWith(overrides: { primary?: string; secondary?: string }): void {
    this.previewEl.style.setProperty("--livery-primary", overrides.primary ?? this.primary);
    this.previewEl.style.setProperty("--livery-secondary", overrides.secondary ?? this.secondary);
    this.root.querySelector(".preview-badge")!.textContent = teamInitials(this.teamName);
    this.root.querySelector(".preview-name")!.textContent = this.teamName.trim() || "Your Team";
  }
}
