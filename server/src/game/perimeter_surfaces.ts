import type {
  TrackSurfaceDefaults,
  TrackSurfaceSegment,
  TrackWidthSegment,
} from "../ws_protocol";

/** Grass verge depth when no runoff/gravel is authored on that side. */
export const PERIMETER_GRASS_GAP_M = 10;
/** Default synthesized barrier thickness (m). */
export const PERIMETER_BARRIER_WIDTH_M = 1.2;
/** Samples around the lap when building continuous perimeter bands. */
export const PERIMETER_SAMPLE_COUNT = 480;

const SYNTH_PREFIX = "synth:perimeter-";

export interface PerimeterSurfaceInput {
  profile: TrackSurfaceSegment[];
  defaultWidthM: number;
  widthProfile?: TrackWidthSegment[];
  surfaceDefaults?: TrackSurfaceDefaults;
}

interface SideSampleState {
  grassInnerOffsetM: number;
  grassWidthM: number;
  barrierInnerOffsetM: number;
  barrierWidthM: number;
  synthBarrier: boolean;
}

function isBarrierSurface(surface: string): boolean {
  return surface.startsWith("barrier");
}

function isSynthSegment(seg: TrackSurfaceSegment): boolean {
  return seg.name?.startsWith(SYNTH_PREFIX) ?? false;
}

function sideMatches(
  segSide: TrackSurfaceSegment["side"],
  side: "inboard" | "outboard",
): boolean {
  if (segSide === "both") return true;
  return segSide === side;
}

function halfWidthAtT(
  t: number,
  defaultWidthM: number,
  widthProfile?: TrackWidthSegment[],
): number {
  if (widthProfile?.length) {
    for (const seg of widthProfile) {
      if (t >= seg.startT && t <= seg.endT) return seg.widthM / 2;
    }
  }
  return defaultWidthM / 2;
}

function segmentWidthAtT(seg: TrackSurfaceSegment, t: number): number {
  const w0 = seg.widthStartM ?? seg.widthM;
  const w1 = seg.widthEndM ?? seg.widthM;
  const span = Math.max(seg.endT - seg.startT, 1e-9);
  const u = Math.min(1, Math.max(0, (t - seg.startT) / span));
  const env = seg.envelope ?? "flat";
  if (env === "flare_exit") return w0 + (w1 - w0) * (u * u);
  if (env === "flare_entry") {
    const v = 1 - u;
    return w0 + (w1 - w0) * (1 - v * v);
  }
  if (env === "bell") return w0 + (w1 - w0) * Math.sin(u * Math.PI);
  return w0 + (w1 - w0) * u;
}

function segmentInnerEdgeM(
  halfW: number,
  seg: TrackSurfaceSegment,
  vergeWidthM: number,
): number {
  const isKerb = seg.surface.startsWith("kerb");
  const verge = isKerb ? 0 : vergeWidthM;
  return halfW + (seg.innerOffsetM ?? 0) + verge;
}

function sampleSideState(
  t: number,
  side: "inboard" | "outboard",
  authored: TrackSurfaceSegment[],
  defaultWidthM: number,
  widthProfile: TrackWidthSegment[] | undefined,
  vergeWidthM: number,
): SideSampleState {
  const halfW = halfWidthAtT(t, defaultWidthM, widthProfile);
  let occupiedOuter = halfW;
  let explicitBarrier: { inner: number; width: number } | null = null;

  for (const seg of authored) {
    if (t < seg.startT || t > seg.endT) continue;
    if (!sideMatches(seg.side, side)) continue;
    if (isSynthSegment(seg)) continue;

    const inner = segmentInnerEdgeM(halfW, seg, vergeWidthM);
    const outer = inner + segmentWidthAtT(seg, t);

    if (isBarrierSurface(seg.surface)) {
      explicitBarrier = { inner, width: seg.widthM };
      occupiedOuter = Math.max(occupiedOuter, outer);
    } else {
      occupiedOuter = Math.max(occupiedOuter, outer);
    }
  }

  let barrierInner: number;
  let barrierWidth = PERIMETER_BARRIER_WIDTH_M;
  let synthBarrier = false;

  if (explicitBarrier) {
    barrierInner = explicitBarrier.inner;
    barrierWidth = explicitBarrier.width;
  } else if (occupiedOuter > halfW + 0.05) {
    barrierInner = occupiedOuter;
    synthBarrier = true;
  } else {
    barrierInner = halfW + PERIMETER_GRASS_GAP_M;
    synthBarrier = true;
  }

  const bandStart = Math.max(occupiedOuter, halfW + vergeWidthM);
  const grassWidth = Math.max(0, barrierInner - bandStart);

  return {
    grassInnerOffsetM: bandStart - halfW,
    grassWidthM: grassWidth,
    barrierInnerOffsetM: barrierInner - halfW,
    barrierWidthM: barrierWidth,
    synthBarrier,
  };
}

function statesEqual(a: SideSampleState, b: SideSampleState, eps = 0.35): boolean {
  return (
    Math.abs(a.grassInnerOffsetM - b.grassInnerOffsetM) < eps &&
    Math.abs(a.grassWidthM - b.grassWidthM) < eps &&
    Math.abs(a.barrierInnerOffsetM - b.barrierInnerOffsetM) < eps &&
    Math.abs(a.barrierWidthM - b.barrierWidthM) < eps &&
    a.synthBarrier === b.synthBarrier
  );
}

function mergeSideSamples(
  samples: Array<{ t: number; state: SideSampleState }>,
): Array<{ startT: number; endT: number; state: SideSampleState }> {
  if (!samples.length) return [];
  const merged: Array<{ startT: number; endT: number; state: SideSampleState }> = [];
  let curStart = samples[0].t;
  let curState = samples[0].state;

  for (let i = 1; i < samples.length; i++) {
    const { t, state } = samples[i];
    if (!statesEqual(state, curState)) {
      merged.push({ startT: curStart, endT: t, state: curState });
      curStart = t;
      curState = state;
    }
  }
  merged.push({ startT: curStart, endT: 1, state: curState });
  return merged;
}

function buildSideSegments(
  side: "inboard" | "outboard",
  intervals: Array<{ startT: number; endT: number; state: SideSampleState }>,
  vergeWidthM: number,
): TrackSurfaceSegment[] {
  const out: TrackSurfaceSegment[] = [];
  for (const { startT, endT, state } of intervals) {
    if (endT <= startT + 1e-6) continue;
    if (state.grassWidthM > 0.15) {
      out.push({
        name: `${SYNTH_PREFIX}grass-${side}`,
        startT,
        endT,
        side,
        surface: "verge",
        variant: "grass",
        widthM: state.grassWidthM,
        innerOffsetM: Math.max(0, state.grassInnerOffsetM - vergeWidthM),
        gripMultiplier: 0.28,
      });
    }
    if (state.synthBarrier && state.barrierWidthM > 0) {
      out.push({
        name: `${SYNTH_PREFIX}barrier-${side}`,
        startT,
        endT,
        side,
        surface: "barrier_tecpro",
        widthM: state.barrierWidthM,
        innerOffsetM: Math.max(0, state.barrierInnerOffsetM - vergeWidthM),
        gripMultiplier: 0,
      });
    }
  }
  return out;
}

/** Append continuous grass + barrier bands around the lap from authored surface data. */
export function synthesizePerimeterSurfaces(
  input: PerimeterSurfaceInput,
): TrackSurfaceSegment[] {
  const authored = input.profile.filter((seg) => !isSynthSegment(seg));
  const vergeWidthM = input.surfaceDefaults?.vergeWidthM ?? 2;
  const defaultWidthM = input.defaultWidthM > 0 ? input.defaultWidthM : 12;
  const sampleCount = Math.max(64, PERIMETER_SAMPLE_COUNT);

  const synth: TrackSurfaceSegment[] = [];
  for (const side of ["outboard", "inboard"] as const) {
    const samples: Array<{ t: number; state: SideSampleState }> = [];
    for (let i = 0; i < sampleCount; i++) {
      const t = i / sampleCount;
      samples.push({
        t,
        state: sampleSideState(
          t,
          side,
          authored,
          defaultWidthM,
          input.widthProfile,
          vergeWidthM,
        ),
      });
    }
    synth.push(...buildSideSegments(side, mergeSideSamples(samples), vergeWidthM));
  }

  return [...authored, ...synth];
}
