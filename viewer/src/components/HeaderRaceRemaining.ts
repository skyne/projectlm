function formatRaceClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export class HeaderRaceRemaining {
  readonly root: HTMLElement;
  private valueEl: HTMLElement;
  private targetDurationSeconds: number | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "header-race-remaining hidden";
    this.root.setAttribute("aria-live", "polite");
    this.root.innerHTML = `
      <span class="header-race-remaining-label">Remaining</span>
      <span class="header-race-remaining-value">—</span>
    `;
    this.valueEl = this.root.querySelector(".header-race-remaining-value")!;
    container.appendChild(this.root);
  }

  setTargetDuration(seconds: number | null): void {
    this.targetDurationSeconds = seconds && seconds > 0 ? seconds : null;
    this.root.classList.toggle("hidden", !this.targetDurationSeconds);
  }

  setRaceTime(seconds: number): void {
    if (!this.targetDurationSeconds) return;
    const remaining = Math.max(0, this.targetDurationSeconds - seconds);
    this.valueEl.textContent = formatRaceClock(remaining);
    this.root.classList.toggle("time-low", remaining <= 300 && remaining > 0);
  }

  resetSession(): void {
    this.setRaceTime(0);
    this.root.classList.remove("time-low");
    if (this.targetDurationSeconds) {
      this.valueEl.textContent = formatRaceClock(this.targetDurationSeconds);
    }
  }
}
