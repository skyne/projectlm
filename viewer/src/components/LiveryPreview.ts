import { mountLiveryCanvas, type LiveryRenderOptions } from "../graphics/liveryRenderer";
import {
  LIVERY_PATTERNS,
  type LiveryPattern,
  liveryCssStripBackground,
} from "../utils/teamLivery";

export interface LiveryPreviewMount {
  update(options: LiveryRenderOptions & { teamName?: string }): void;
  destroy(): void;
}

export type LiveryPreviewLayout = "showcase" | "card";

export function createLiveryPreviewCard(
  host: HTMLElement,
  options: LiveryRenderOptions & {
    teamName?: string;
    layout?: LiveryPreviewLayout;
  },
): LiveryPreviewMount {
  const layout = options.layout ?? "showcase";

  if (layout === "showcase") {
    host.className = "livery-showcase";
    host.replaceChildren();
    const carHost = document.createElement("div");
    carHost.className = "livery-car-host";
    const caption = document.createElement("p");
    caption.className = "livery-showcase-caption";
    host.append(carHost, caption);

    const carMount = mountLiveryCanvas(carHost, options);
    const apply = (opts: LiveryRenderOptions & { teamName?: string }) => {
      const team = opts.teamName?.trim() || "Your Team";
      const cls = opts.classId ?? "Hypercar";
      caption.textContent = `${team} · ${cls}`;
      carMount.update(opts);
    };
    apply(options);
    return {
      update: apply,
      destroy: () => {
        carMount.destroy();
        host.replaceChildren();
      },
    };
  }

  host.className = "livery-preview-card";
  host.style.setProperty("--livery-primary", options.primary);
  host.style.setProperty("--livery-secondary", options.secondary);
  host.innerHTML = `
    <div class="livery-car-host"></div>
    <div class="livery-name livery-preview-name"></div>
  `;

  const nameEl = host.querySelector<HTMLElement>(".livery-preview-name")!;
  const carHost = host.querySelector<HTMLElement>(".livery-car-host")!;
  const carMount = mountLiveryCanvas(carHost, options);

  const apply = (opts: LiveryRenderOptions & { teamName?: string }) => {
    host.style.setProperty("--livery-primary", opts.primary);
    host.style.setProperty("--livery-secondary", opts.secondary);
    if (opts.teamName !== undefined) {
      nameEl.textContent = opts.teamName.trim() || "Your Team";
    }
    carMount.update(opts);
  };

  apply(options);

  return {
    update: apply,
    destroy: () => {
      carMount.destroy();
      host.replaceChildren();
    },
  };
}

export function bindLiveryPatternPicker(
  container: HTMLElement,
  selected: LiveryPattern,
  colors: { primary: string; secondary: string },
  onPick: (pattern: LiveryPattern) => void,
): void {
  container.replaceChildren();
  container.className = "livery-pattern-grid";

  for (const entry of LIVERY_PATTERNS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `livery-pattern-btn${entry.id === selected ? " selected" : ""}`;
    btn.title = entry.description;
    btn.innerHTML = `
      <span class="livery-pattern-swatch" style="background: ${liveryCssStripBackground(colors.primary, colors.secondary, entry.id)}"></span>
      <span class="livery-pattern-label">${entry.label}</span>
    `;
    btn.addEventListener("click", () => onPick(entry.id));
    container.appendChild(btn);
  }
}
