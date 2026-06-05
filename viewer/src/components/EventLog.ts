import type { SimEvent } from "../ws/protocol";

const MAX_EVENTS = 100;

export class EventLog {
  readonly root: HTMLElement;
  private list: HTMLUListElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement("section");
    this.root.className = "panel event-log";
    this.root.innerHTML = `
      <h2>Events</h2>
      <ul class="event-list"></ul>
    `;
    this.list = this.root.querySelector(".event-list")!;
    container.appendChild(this.root);
  }

  append(events: SimEvent[]): void {
    for (const event of events) {
      const li = document.createElement("li");
      li.className = `event event-${event.type}`;
      const time = formatRaceTime(event.timestamp);
      li.innerHTML = `<span class="time">${time}</span> ${escapeHtml(event.message)}`;
      this.list.prepend(li);
    }

    while (this.list.children.length > MAX_EVENTS) {
      this.list.lastElementChild?.remove();
    }
  }

  clear(): void {
    this.list.replaceChildren();
  }
}

function formatRaceTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
