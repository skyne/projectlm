import type { TrackPoint3 } from "./track_json";

export const STRAIGHT_SAMPLE_M = 10;
export const TURN_SAMPLE_M = 6;

export interface AuthoringNodeLike extends TrackPoint3 {
  type: string;
}

function dist2d(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function lerp(
  a: { x: number; y?: number; z: number },
  b: { x: number; y?: number; z: number },
  t: number,
): TrackPoint3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export function sampleStraightSpan(
  a: { x: number; y?: number; z: number },
  b: { x: number; y?: number; z: number },
  stepM = STRAIGHT_SAMPLE_M,
): TrackPoint3[] {
  const len = dist2d(a, b);
  if (len < 1e-6) return [{ x: a.x, y: a.y ?? 0, z: a.z }];
  const count = Math.max(1, Math.ceil(len / stepM));
  const out: TrackPoint3[] = [];
  for (let i = 0; i <= count; i++) {
    out.push(lerp(a, b, i / count));
  }
  return out;
}

export function sampleCatmullRomSpan(
  points: Array<{ x: number; y?: number; z: number }>,
  stepM = TURN_SAMPLE_M,
): TrackPoint3[] {
  if (points.length === 0) return [];
  if (points.length === 1) {
    return [{ x: points[0].x, y: points[0].y ?? 0, z: points[0].z }];
  }
  if (points.length === 2) return sampleStraightSpan(points[0], points[1], stepM);

  const out: TrackPoint3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const segLen = dist2d(p1, p2);
    const steps = Math.max(1, Math.ceil(segLen / stepM));
    const startJ = i === 0 ? 0 : 1;
    for (let j = startJ; j <= steps; j++) {
      const t = j / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * (p1.y ?? 0) +
            (-(p0.y ?? 0) + (p2.y ?? 0)) * t +
            (2 * (p0.y ?? 0) - 5 * (p1.y ?? 0) + 4 * (p2.y ?? 0) - (p3.y ?? 0)) * t2 +
            (-(p0.y ?? 0) + 3 * (p1.y ?? 0) - 3 * (p2.y ?? 0) + (p3.y ?? 0)) * t3),
        z:
          0.5 *
          (2 * p1.z +
            (-p0.z + p2.z) * t +
            (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
            (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      });
    }
  }
  return out;
}

function appendPoint(out: TrackPoint3[], pt: TrackPoint3): void {
  const last = out[out.length - 1];
  if (last && dist2d(last, pt) < 0.5) return;
  out.push({ x: pt.x, y: pt.y ?? 0, z: pt.z });
}

function compileOpen(nodes: AuthoringNodeLike[]): TrackPoint3[] {
  if (nodes.length < 2) return [];
  const out: TrackPoint3[] = [];
  let i = 0;
  while (i < nodes.length - 1) {
    const node = nodes[i];
    if (node.type === "turn_mid" || node.type === "turn_end") {
      i++;
      continue;
    }
    if (node.type === "turn_start") {
      let end = i + 1;
      while (end < nodes.length && nodes[end].type !== "turn_end") end++;
      if (end >= nodes.length) end = nodes.length - 1;
      for (const pt of sampleCatmullRomSpan(nodes.slice(i, end + 1))) {
        appendPoint(out, pt);
      }
      i = end + 1;
      continue;
    }
    const next = nodes[i + 1];
    const sampled = sampleStraightSpan(node, next);
    for (let s = 0; s < sampled.length - 1; s++) {
      appendPoint(out, sampled[s]);
    }
    i++;
  }
  const last = nodes[nodes.length - 1];
  appendPoint(out, { x: last.x, y: last.y ?? 0, z: last.z });
  return out;
}

/** Compile sparse authoring nodes to a dense polyline (open or closed circuit). */
export function compilePolylineFromAuthoring(
  nodes: AuthoringNodeLike[],
  closed: boolean,
): TrackPoint3[] {
  if (nodes.length < 2) return [];
  if (!closed) return compileOpen(nodes);

  const open = compileOpen([...nodes, nodes[0]]);
  if (open.length < 2) return open;

  const first = open[0];
  const last = open[open.length - 1];
  // Drop a redundant closing duplicate only when it does not open a gap at SF.
  if (dist2d(first, last) < 0.5) {
    open.pop();
  }
  const tail = open[open.length - 1];
  if (dist2d(first, tail) > 0.5) {
    appendPoint(open, { x: first.x, y: first.y ?? 0, z: first.z });
  }
  return open;
}

export function perpDistanceToSegment(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  px: number,
  pz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const len = Math.hypot(abx, abz);
  if (len < 1e-9) return Math.hypot(px - ax, pz - az);
  return Math.abs(abx * (pz - az) - abz * (px - ax)) / len;
}

export function interiorAngleDeg(
  prev: { x: number; z: number },
  cur: { x: number; z: number },
  next: { x: number; z: number },
): number {
  const v1x = prev.x - cur.x;
  const v1z = prev.z - cur.z;
  const v2x = next.x - cur.x;
  const v2z = next.z - cur.z;
  const l1 = Math.hypot(v1x, v1z);
  const l2 = Math.hypot(v2x, v2z);
  if (l1 < 1e-6 || l2 < 1e-6) return 180;
  const dot = (v1x * v2x + v1z * v2z) / (l1 * l2);
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

export function douglasPeuckerIndices(
  points: Array<{ x: number; z: number }>,
  start: number,
  end: number,
  epsilon: number,
  keep: Set<number>,
): void {
  if (end <= start + 1) return;
  let maxDist = 0;
  let index = start;
  const ax = points[start].x;
  const az = points[start].z;
  const bx = points[end].x;
  const bz = points[end].z;
  for (let i = start + 1; i < end; i++) {
    const d = perpDistanceToSegment(ax, az, bx, bz, points[i].x, points[i].z);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    keep.add(index);
    douglasPeuckerIndices(points, start, index, epsilon, keep);
    douglasPeuckerIndices(points, index, end, epsilon, keep);
  }
}

export function inferCornerTurnPairs(
  nodes: Array<{ type: string }>,
): void {
  for (let k = 0; k < nodes.length; k++) {
    if (nodes[k].type !== "turn_start") continue;
    let end = k + 1;
    while (end < nodes.length && nodes[end].type !== "turn_end") end++;
    if (end < nodes.length && nodes[end].type === "turn_end") continue;
    if (k + 1 < nodes.length && nodes[k + 1].type === "normal") {
      nodes[k + 1].type = "turn_end";
    } else if (end > k + 1) {
      const mark = end - 1;
      if (nodes[mark].type !== "turn_start") {
        nodes[mark].type = "turn_end";
      }
    } else if (k + 2 < nodes.length) {
      nodes[k + 2].type = "turn_end";
    }
  }
}

/** Mark knees inside a turn span (chicanes, S-curves, radius changes). */
export function inferTurnMidpoints(
  nodes: Array<{ type: string; x: number; z: number }>,
): void {
  let i = 0;
  while (i < nodes.length) {
    if (nodes[i].type !== "turn_start") {
      i++;
      continue;
    }
    let end = i + 1;
    while (end < nodes.length && nodes[end].type !== "turn_end") end++;
    if (end >= nodes.length) break;

    for (let k = i + 1; k < end; k++) {
      if (nodes[k].type === "turn_start") {
        nodes[k].type = "turn_mid";
      }
    }

    for (let k = i + 1; k < end; k++) {
      if (nodes[k].type !== "normal") continue;
      const angle = interiorAngleDeg(nodes[k - 1], nodes[k], nodes[k + 1]);
      if (angle < 150) nodes[k].type = "turn_mid";
    }
    i = end + 1;
  }
}
