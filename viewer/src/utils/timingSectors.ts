const TIMING_SECTOR_RE = /^Sector [1-3]$/i;

/** WEC-style timing sectors only (Sector 1–3), not geometry micro-sectors. */
export function isTimingSectorName(name: string): boolean {
  return TIMING_SECTOR_RE.test(name);
}
