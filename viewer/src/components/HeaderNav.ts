export type MainView = "hq" | "weekend" | "map" | "timetable";

export class HeaderNav {
  readonly root: HTMLElement;
  private onChange?: (view: MainView) => void;
  private active: MainView = "hq";

  constructor(container: HTMLElement) {
    this.root = document.createElement("nav");
    this.root.className = "view-nav";
    this.root.innerHTML = `
      <button type="button" class="view-tab active" data-view="hq">HQ</button>
      <button type="button" class="view-tab" data-view="weekend">Weekend</button>
      <button type="button" class="view-tab" data-view="map">Map</button>
      <button type="button" class="view-tab" data-view="timetable">Timetable</button>
    `;

    for (const button of this.root.querySelectorAll<HTMLButtonElement>(".view-tab")) {
      button.addEventListener("click", () => {
        const view = button.dataset.view as MainView;
        this.setActive(view);
        this.onChange?.(view);
      });
    }

    container.appendChild(this.root);
  }

  setHandler(handler: (view: MainView) => void): void {
    this.onChange = handler;
  }

  setActive(view: MainView): void {
    this.active = view;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>(".view-tab")) {
      button.classList.toggle("active", button.dataset.view === view);
    }
  }

  getActive(): MainView {
    return this.active;
  }
}
