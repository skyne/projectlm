import { PASS_BY_ASSETS, type PassById } from "./assets";

const PASS_BY_IDS: PassById[] = ["passBy1", "passBy2", "passBy3"];

export interface PassByTickInput {
  raceTime: number;
  paused: boolean;
  active: boolean;
  /** Cars on track — more cars = busier start/finish straight. */
  carsOnTrack: number;
}

export interface PassBySettings {
  enabled: boolean;
  masterVolume: number;
  trackVolume: number;
}

/** Pit-wall pass-by ambience — cars rushing the start/finish straight. */
export class RacePassByAudio {
  private unlocked = false;
  private active = false;
  private nextPassAt = 0;
  private lastOvertakeAt = 0;
  private settings: PassBySettings = {
    enabled: true,
    masterVolume: 0.85,
    trackVolume: 0.7,
  };

  setUnlocked(unlocked: boolean): void {
    this.unlocked = unlocked;
  }

  applySettings(settings: PassBySettings): void {
    this.settings = settings;
  }

  setSessionActive(active: boolean): void {
    this.active = active;
    if (!active) this.nextPassAt = 0;
    else this.scheduleFirstPass();
  }

  setPaused(paused: boolean): void {
    if (paused) return;
    if (this.active && this.nextPassAt === 0) this.scheduleFirstPass();
  }

  onTick(input: PassByTickInput): void {
    if (!this.canPlay(input.active, input.paused, input.raceTime)) return;
    if (input.carsOnTrack < 1) return;

    const now = performance.now();
    if (now < this.nextPassAt) return;

    this.playPassSequence(input.carsOnTrack, 1);
    this.scheduleNext(input.carsOnTrack);
  }

  /** Any overtake on track — extra pass-by, throttled. */
  onOvertake(raceTime: number, paused: boolean): void {
    if (!this.canPlay(this.active, paused, raceTime)) return;
    const now = performance.now();
    if (now - this.lastOvertakeAt < 1200) return;
    this.lastOvertakeAt = now;
    this.playPassSequence(8, 0.9);
  }

  private canPlay(active: boolean, paused: boolean, raceTime: number): boolean {
    return (
      active &&
      !paused &&
      raceTime >= 0.5 &&
      this.unlocked &&
      this.settings.enabled
    );
  }

  /** First pass shortly after green flag — don't wait 10+ seconds. */
  private scheduleFirstPass(): void {
    this.nextPassAt = performance.now() + 600 + Math.random() * 1200;
  }

  private scheduleNext(carsOnTrack: number): void {
    const count = Math.max(carsOnTrack, 1);
    // ~7s with one car on track, ~1.4s with a full grid.
    const baseMs = 7000 / Math.sqrt(count);
    const jitter = lerp(0.65, 1.25, Math.random());
    this.nextPassAt = performance.now() + baseMs * jitter;
  }

  /** One pass, sometimes a tight pack when the straight is busy. */
  private playPassSequence(carsOnTrack: number, gainScale: number): void {
    this.playRandom(gainScale);

    let extras = 0;
    if (carsOnTrack >= 14) extras = 1 + Math.floor(Math.random() * 2);
    else if (carsOnTrack >= 8) extras = 1;
    else if (carsOnTrack >= 4 && Math.random() < 0.5) extras = 1;

    for (let i = 0; i < extras; i++) {
      const delay = 160 + i * (180 + Math.random() * 320);
      window.setTimeout(
        () => this.playRandom(gainScale * lerp(0.55, 0.92, Math.random())),
        delay,
      );
    }
  }

  private playRandom(gainScale: number): void {
    const id = PASS_BY_IDS[Math.floor(Math.random() * PASS_BY_IDS.length)]!;
    const src = PASS_BY_ASSETS[id];
    const audio = new Audio(src);
    audio.volume = clamp(
      this.settings.masterVolume *
        this.settings.trackVolume *
        gainScale *
        lerp(0.6, 1, Math.random()),
      0,
      1,
    );
    void audio.play().catch(() => undefined);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
