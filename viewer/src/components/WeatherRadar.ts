import type { RaceControlPayload } from "../ws/protocol";
import { formatTrackWetnessRadar } from "../utils/trackWetnessDisplay";
import { formatVisibilityKm, shouldHighlightVisibility } from "../utils/visibilityDisplay";

interface RainCell {
  angle: number;
  radius: number;
  size: number;
  intensity: number;
}

export class WeatherRadar {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private label: HTMLElement;
  private cells: RainCell[] = [];

  constructor(container: HTMLElement) {
    this.root = document.createElement("section");
    this.root.className = "panel weather-radar";
    this.root.innerHTML = `
      <h2>Weather radar</h2>
      <div class="radar-wrap">
        <canvas width="200" height="200" aria-label="Weather radar"></canvas>
      </div>
      <div class="radar-caption"></div>
    `;
    container.appendChild(this.root);
    this.canvas = this.root.querySelector("canvas")!;
    this.ctx = this.canvas.getContext("2d")!;
    this.label = this.root.querySelector(".radar-caption")!;
  }

  update(rc: RaceControlPayload | undefined, raceTime: number): void {
    if (!rc) {
      this.label.textContent = "No radar data";
      this.drawEmpty();
      return;
    }

    const rain = rc.rainIntensity ?? 0;
    const wet = rc.trackWetness;
    this.ensureCells(rain, wet, raceTime);

    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = w * 0.44;

    this.ctx.clearRect(0, 0, w, h);

    // Background
    const bg = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    bg.addColorStop(0, "#0a1f14");
    bg.addColorStop(1, "#051008");
    this.ctx.fillStyle = bg;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, maxR + 4, 0, Math.PI * 2);
    this.ctx.fill();

    // Range rings
    this.ctx.strokeStyle = "rgba(74, 222, 128, 0.25)";
    this.ctx.lineWidth = 1;
    for (const ring of [0.33, 0.66, 1]) {
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, maxR * ring, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // Rain cells (stylized echoes)
    for (const cell of this.cells) {
      const x = cx + Math.cos(cell.angle) * cell.radius * maxR;
      const y = cy + Math.sin(cell.angle) * cell.radius * maxR;
      const r = cell.size * maxR * (0.35 + cell.intensity * 0.5);
      const g = this.ctx.createRadialGradient(x, y, 0, x, y, r);
      const alpha = 0.15 + cell.intensity * 0.55;
      g.addColorStop(0, `rgba(96, 165, 250, ${alpha})`);
      g.addColorStop(0.5, `rgba(37, 99, 235, ${alpha * 0.6})`);
      g.addColorStop(1, "rgba(37, 99, 235, 0)");
      this.ctx.fillStyle = g;
      this.ctx.beginPath();
      this.ctx.arc(x, y, r, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Sweep line
    const sweep = (raceTime * 0.9) % (Math.PI * 2);
    this.ctx.strokeStyle = "rgba(74, 222, 128, 0.85)";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy);
    this.ctx.lineTo(cx + Math.cos(sweep) * maxR, cy + Math.sin(sweep) * maxR);
    this.ctx.stroke();

    // Sweep trail
    this.ctx.strokeStyle = "rgba(74, 222, 128, 0.12)";
    this.ctx.lineWidth = maxR;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, maxR * 0.5, sweep - 0.45, sweep);
    this.ctx.stroke();

    this.ctx.strokeStyle = "rgba(74, 222, 128, 0.5)";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    this.ctx.stroke();

    const phase = rc.weatherPhase ?? "Dry";
    const visKm = rc.visibilityKm ?? 10;
    const visPart = shouldHighlightVisibility(visKm)
      ? ` · ${formatVisibilityKm(visKm)} vis`
      : "";
    this.label.textContent =
      `${phase} · echo intensity ${Math.round(rain * 100)}% · ${formatTrackWetnessRadar(wet)}${visPart}`;
  }

  private ensureCells(rain: number, wet: number, raceTime: number): void {
    const count = rain > 0.05 || wet > 0.08 ? 5 : 2;
    if (this.cells.length !== count) {
      this.cells = Array.from({ length: count }, (_, i) => ({
        angle: (i / count) * Math.PI * 2,
        radius: 0.25 + (i % 3) * 0.22,
        size: 0.18 + (i % 2) * 0.08,
        intensity: 0.3,
      }));
    }
    const drift = raceTime * 0.00008;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      c.angle += drift * (1 + i * 0.15);
      c.radius = 0.2 + ((Math.sin(raceTime * 0.0002 + i) + 1) * 0.35);
      c.intensity = Math.min(1, rain * 0.7 + wet * 0.5 + Math.sin(raceTime * 0.0005 + i * 2) * 0.1);
    }
  }

  private drawEmpty(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.fillStyle = "#0a1210";
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.strokeStyle = "rgba(74, 222, 128, 0.3)";
    this.ctx.beginPath();
    this.ctx.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2);
    this.ctx.stroke();
  }
}
