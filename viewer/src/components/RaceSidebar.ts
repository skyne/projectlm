export type SidebarPanel = "drive" | "pit" | "comms";

const PANELS: { id: SidebarPanel; label: string; icon: string }[] = [
  { id: "drive", label: "Drive", icon: "🏎" },
  { id: "pit", label: "Pit", icon: "⛽" },
  { id: "comms", label: "Comms", icon: "📡" },
];

/** Tabbed race sidebar — groups pit wall, weather, engineer, etc. into focused panels. */
export class RaceSidebar {
  readonly root: HTMLElement;
  private tabsEl: HTMLElement;
  private active: SidebarPanel = "drive";

  constructor(sidebar: HTMLElement) {
    this.root = sidebar;
    sidebar.classList.add("sidebar-tabbed");

    const brand = sidebar.querySelector(".sidebar-brand");
    brand?.remove();

    this.tabsEl = document.createElement("nav");
    this.tabsEl.className = "sidebar-tabs";
    this.tabsEl.setAttribute("aria-label", "Race control panels");

    const panelsWrap = document.createElement("div");
    panelsWrap.className = "sidebar-panels";

    const groups: Record<SidebarPanel, string[]> = {
      drive: ["event-log-container", "race-controls-container"],
      pit: ["pitwall-container", "sidebar-weather-stack"],
      comms: ["engineer-container"],
    };

    for (const panel of PANELS) {
      const section = document.createElement("section");
      section.className = "sidebar-panel";
      section.dataset.panel = panel.id;
      if (panel.id !== "drive") section.classList.add("hidden");

      let weatherStack: HTMLElement | null = null;
      if (panel.id === "pit") {
        weatherStack = document.createElement("div");
        weatherStack.className = "sidebar-weather-stack";
        for (const id of ["weather-radar-container", "weather-forecast-container"]) {
          const slot = sidebar.querySelector(`#${id}`);
          if (slot) weatherStack.appendChild(slot);
        }
      }

      for (const id of groups[panel.id]) {
        if (id === "sidebar-weather-stack") continue;
        const slot = sidebar.querySelector(`#${id}`);
        if (slot) section.appendChild(slot);
      }

      if (weatherStack) section.appendChild(weatherStack);

      panelsWrap.appendChild(section);
    }

    sidebar.prepend(this.tabsEl);
    sidebar.appendChild(panelsWrap);

    this.renderTabs();
  }

  private renderTabs(): void {
    this.tabsEl.replaceChildren();
    for (const panel of PANELS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `sidebar-tab${panel.id === this.active ? " active" : ""}`;
      btn.dataset.panel = panel.id;
      btn.innerHTML = `
        <span class="sidebar-tab-icon" aria-hidden="true">${panel.icon}</span>
        <span class="sidebar-tab-label">${panel.label}</span>
      `;
      btn.addEventListener("click", () => this.setActive(panel.id));
      this.tabsEl.appendChild(btn);
    }
  }

  setActive(panel: SidebarPanel): void {
    this.active = panel;
    for (const btn of this.tabsEl.querySelectorAll<HTMLButtonElement>(".sidebar-tab")) {
      btn.classList.toggle("active", btn.dataset.panel === panel);
    }
    for (const section of this.root.querySelectorAll<HTMLElement>(".sidebar-panel")) {
      section.classList.toggle("hidden", section.dataset.panel !== panel);
    }
  }
}
