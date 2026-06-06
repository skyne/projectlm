import type { ClientRole, RosterUpdatePayload } from "../ws/protocol";

function roleBadgeClass(role: ClientRole): string {
  if (role === "host") return "roster-role-host";
  if (role === "player") return "roster-role-player";
  return "roster-role-spectator";
}

export class SessionRoster {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private modeEl: HTMLElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "session-roster-header";
    this.root.innerHTML = `
      <span class="session-roster-mode hidden"></span>
      <ul class="session-roster-list"></ul>
    `;
    container.appendChild(this.root);
    this.modeEl = this.root.querySelector(".session-roster-mode")!;
    this.listEl = this.root.querySelector(".session-roster-list")!;
  }

  update(payload: RosterUpdatePayload): void {
    this.listEl.replaceChildren();
    this.root.classList.toggle("hidden", payload.clients.length === 0);

    const mode = payload.sessionMode ?? "solo";
    this.modeEl.textContent = mode === "coop" ? "Co-op pit wall" : "";
    this.modeEl.classList.toggle("hidden", mode !== "coop");

    for (const client of payload.clients) {
      const li = document.createElement("li");
      li.className = "session-roster-item";
      li.title = client.entryIds.length
        ? `${client.displayName} (${client.role}) — ${client.entryIds.length} car(s)`
        : `${client.displayName} (${client.role})`;
      li.innerHTML = `
        <span class="session-roster-name">${escapeHtml(client.displayName)}</span>
        <span class="session-roster-role ${roleBadgeClass(client.role)}">${client.role}</span>
      `;
      this.listEl.appendChild(li);
    }
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
