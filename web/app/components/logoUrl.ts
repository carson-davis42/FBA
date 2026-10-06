/**
 * Bumped once, when the server's logo caching changed: logos were cached for an hour under the old rule, so a replaced logo could show as the old one.
 * A new number makes every browser fetch fresh copies. The server now revalidates logos on each load, so this needn't change when a logo is replaced.
 */
export const LOGO_URL_VERSION = 2;

/** The URL of a team's logo for a season; shared folders (the college and D2 logos, the league mark) name the wanted `file`. */
export function logoUrl(folder: string, season: number, file?: string | null): string {
  return `/logos/${encodeURIComponent(folder)}/${season}?${file ? `file=${encodeURIComponent(file)}&` : ''}v=${LOGO_URL_VERSION}`;
}
