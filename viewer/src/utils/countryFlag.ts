/** ISO 3166-1 alpha-2 → flag emoji via regional indicator symbols (Unicode 6.0). */
export function countryFlagEmoji(countryCode: string | undefined | null): string {
  const code = (countryCode ?? "").trim().toUpperCase();
  if (code.length !== 2 || !/^[A-Z]{2}$/.test(code)) return "";
  const base = 0x1f1e6;
  const offset = "A".charCodeAt(0);
  return String.fromCodePoint(
    base + code.charCodeAt(0) - offset,
    base + code.charCodeAt(1) - offset,
  );
}

export function formatNationality(
  countryCode: string | undefined | null,
  opts?: { showCode?: boolean },
): string {
  const flag = countryFlagEmoji(countryCode);
  const code = (countryCode ?? "").trim().toUpperCase();
  if (!code) return "";
  if (!flag) return code;
  if (opts?.showCode === false) return flag;
  return `${flag} ${code}`;
}
