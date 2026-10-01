/// <reference types="vite/client" />
const FILES = import.meta.glob('/node_modules/flag-icons/flags/4x3/*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const BY_CODE = new Map(Object.entries(FILES).map(([p, url]) => [p.slice(p.lastIndexOf('/') + 1, -4), url]));

/** The URL of the 4:3 SVG flag for an ISO code, or null when the package has none. */
export const flagUrl = (code: string): string | null => BY_CODE.get(code) ?? null;
