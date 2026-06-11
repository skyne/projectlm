import type { GameCatalogPayload } from "../ws/protocol";

export function glossaryEntry(
  catalog: GameCatalogPayload | null | undefined,
  key: string,
) {
  return catalog?.glossary?.find((e) => e.key === key);
}

export function glossaryShort(
  catalog: GameCatalogPayload | null | undefined,
  key: string,
  fallback = "",
): string {
  return glossaryEntry(catalog, key)?.short ?? fallback;
}

export function glossaryLong(
  catalog: GameCatalogPayload | null | undefined,
  key: string,
  fallback = "",
): string {
  return glossaryEntry(catalog, key)?.long ?? fallback;
}
