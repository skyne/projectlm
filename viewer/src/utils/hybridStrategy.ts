export type HybridStrategy = "balanced" | "deploy" | "harvest" | "hold";

export const HYBRID_STRATEGIES: HybridStrategy[] = [
  "balanced",
  "deploy",
  "harvest",
  "hold",
];

export function hybridStrategyLabel(mode: HybridStrategy): string {
  switch (mode) {
    case "deploy":
      return "Deploy";
    case "harvest":
      return "Harvest";
    case "hold":
      return "Hold";
    case "balanced":
    default:
      return "Balanced";
  }
}

export function hybridStrategyHint(mode: HybridStrategy): string {
  switch (mode) {
    case "deploy":
      return "Use hybrid aggressively on straights above 120 km/h";
    case "harvest":
      return "Minimise deploy — rebuild charge under braking";
    case "hold":
      return "No deploy — save charge for later";
    case "balanced":
    default:
      return "Lap-cyclic deploy and regen — default race pace";
  }
}

export function hybridChargePercent(
  chargeMJ: number | null | undefined,
  budgetMJ: number | null | undefined,
): number | null {
  if (chargeMJ == null || chargeMJ < 0 || budgetMJ == null || budgetMJ <= 0) {
    return null;
  }
  return Math.min(100, Math.max(0, (chargeMJ / budgetMJ) * 100));
}

export function formatHybridCharge(
  chargeMJ: number | null | undefined,
  budgetMJ: number | null | undefined,
): string {
  if (chargeMJ == null || chargeMJ < 0) return "—";
  const pct = hybridChargePercent(chargeMJ, budgetMJ);
  if (pct != null) {
    return `${chargeMJ.toFixed(1)} / ${budgetMJ!.toFixed(1)} MJ · ${pct.toFixed(0)}%`;
  }
  return `${chargeMJ.toFixed(1)} MJ`;
}

export function buildHybridChargeBarHtml(
  chargeMJ: number | null | undefined,
  budgetMJ: number | null | undefined,
  compact = false,
): string {
  const pct = hybridChargePercent(chargeMJ, budgetMJ);
  if (pct == null) {
    return compact ? "—" : `<span class="telemetry-hint">No hybrid</span>`;
  }
  const band = pct >= 55 ? "high" : pct >= 25 ? "mid" : "low";
  const label = formatHybridCharge(chargeMJ, budgetMJ);
  return `
    <div class="hybrid-charge-wrap${compact ? " hybrid-charge-wrap-compact" : ""}">
      <div class="hybrid-charge-bar hybrid-${band}" style="--hybrid-fill: ${pct.toFixed(1)}%"></div>
      <strong>${label}</strong>
    </div>`;
}
