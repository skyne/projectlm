/** Track per-lap fuel use from live snapshots (client-side estimate). */

export interface FuelStats {
  lastLapLiters: number;
  avgLitersPerLap: number;
  lapsRemaining: number | null;
  currentLapPartialUse: number;
}

interface EntryFuelState {
  lap: number;
  fuelAtLapStart: number;
  lastLapLiters: number;
  lapHistory: number[];
}

const LAP_HISTORY = 6;

export class FuelTracker {
  private byEntry = new Map<string, EntryFuelState>();

  reset(): void {
    this.byEntry.clear();
  }

  update(entryId: string, lap: number, fuelLiters: number): void {
    let state = this.byEntry.get(entryId);
    if (!state) {
      state = { lap, fuelAtLapStart: fuelLiters, lastLapLiters: 0, lapHistory: [] };
      this.byEntry.set(entryId, state);
      return;
    }
    if (lap > state.lap) {
      const consumed = Math.max(0, state.fuelAtLapStart - fuelLiters);
      state.lastLapLiters = consumed;
      state.lapHistory.push(consumed);
      if (state.lapHistory.length > LAP_HISTORY) state.lapHistory.shift();
      state.lap = lap;
      state.fuelAtLapStart = fuelLiters;
    } else if (lap < state.lap) {
      this.byEntry.set(entryId, {
        lap,
        fuelAtLapStart: fuelLiters,
        lastLapLiters: 0,
        lapHistory: [],
      });
    }
  }

  stats(entryId: string, fuelLiters: number): FuelStats {
    const state = this.byEntry.get(entryId);
    if (!state) {
      return { lastLapLiters: 0, avgLitersPerLap: 0, lapsRemaining: null, currentLapPartialUse: 0 };
    }
    const avg =
      state.lapHistory.length > 0
        ? state.lapHistory.reduce((a, b) => a + b, 0) / state.lapHistory.length
        : 0;
    const lapsRemaining = avg > 0.5 ? fuelLiters / avg : null;
    const currentLapPartialUse = Math.max(0, state.fuelAtLapStart - fuelLiters);
    return {
      lastLapLiters: state.lastLapLiters,
      avgLitersPerLap: avg,
      lapsRemaining,
      currentLapPartialUse,
    };
  }
}
