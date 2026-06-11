export interface ContextMenuItem {
  label: string;
  action: () => void;
  checked?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

export class EditorContextMenu {
  private el: HTMLDivElement;
  private visible = false;
  private onClose: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "te-context-menu";
    this.el.hidden = true;
    container.appendChild(this.el);
    window.addEventListener("pointerdown", (e) => {
      if (!this.visible) return;
      if (e.target instanceof Node && this.el.contains(e.target)) return;
      this.hide();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.hide();
    });
  }

  show(clientX: number, clientY: number, items: ContextMenuItem[], onClose?: () => void): void {
    this.onClose = onClose ?? null;
    this.el.replaceChildren();
    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement("div");
        sep.className = "te-context-menu-sep";
        this.el.appendChild(sep);
        continue;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "te-context-menu-item";
      btn.textContent = item.checked ? `✓ ${item.label}` : item.label;
      btn.disabled = item.disabled ?? false;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!item.disabled) item.action();
        this.hide();
      });
      this.el.appendChild(btn);
    }
    this.el.hidden = false;
    this.visible = true;
    const rect = this.el.getBoundingClientRect();
    const pad = 8;
    let left = clientX;
    let top = clientY;
    if (left + rect.width > window.innerWidth - pad) {
      left = window.innerWidth - rect.width - pad;
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = window.innerHeight - rect.height - pad;
    }
    this.el.style.left = `${Math.max(pad, left)}px`;
    this.el.style.top = `${Math.max(pad, top)}px`;
  }

  hide(): void {
    if (!this.visible) return;
    this.el.hidden = true;
    this.visible = false;
    this.onClose?.();
    this.onClose = null;
  }
}
