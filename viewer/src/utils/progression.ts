export const XP_PER_LEVEL = 100;

export function progressionXpValue(xp?: number): number {
  return Math.max(0, Math.round(xp ?? 0));
}

export function progressionLevel(xp: number): number {
  return Math.floor(progressionXpValue(xp) / XP_PER_LEVEL) + 1;
}

export function xpIntoCurrentLevel(xp: number): number {
  return progressionXpValue(xp) % XP_PER_LEVEL;
}

export function xpToNextLevel(xp: number): number {
  return XP_PER_LEVEL - xpIntoCurrentLevel(xp);
}

export function xpBarPercent(xp: number): number {
  return Math.round((xpIntoCurrentLevel(xp) / XP_PER_LEVEL) * 100);
}

function driverStatForLevel(level: number): "setupFeedback" | "dryPace" {
  return level % 2 === 1 ? "setupFeedback" : "dryPace";
}

export function nextDriverRewardLabel(level: number): string {
  const stat = driverStatForLevel(level);
  return stat === "setupFeedback" ? "+1 Setup Feedback" : "+1 Dry Pace";
}

export function formatProgressionLine(xp?: number): string {
  const value = progressionXpValue(xp);
  const level = progressionLevel(value);
  return `Lv ${level} · ${xpIntoCurrentLevel(value)}/${XP_PER_LEVEL} XP`;
}
