import type { LogoEntry } from './types';

const ERA = /\sS(\d+)(?:-(?:S(\d+)|pres))?$/i;

export function parseLogoFilename(file: string): LogoEntry | null {
  if (!/\.png$/i.test(file)) return null;
  const base = file.replace(/\.png$/i, '').replace(/\.+$/, '').trim();
  const m = base.match(ERA);
  if (m) {
    const from = Number(m[1]);
    const to = /-pres$/i.test(base) ? null : m[2] ? Number(m[2]) : from;
    return { file, from, to, variant: 0 };
  }
  const v = base.match(/\s(\d+)$/);
  return { file, from: null, to: null, variant: v ? Number(v[1]) : 1 };
}

export function resolveLogo(entries: LogoEntry[], folder: string, season: number): string | null {
  const dated = entries.filter(e => e.from !== null);
  const covering = dated.filter(e => e.from! <= season && (e.to === null || season <= e.to));
  if (covering.length) return [...covering].sort((a, b) => b.from! - a.from!)[0].file;

  const undated = entries.filter(e => e.from === null);
  if (undated.length) {
    const byFolder = (e: LogoEntry) => (e.file.startsWith(folder) ? 1 : 0);
    return [...undated].sort((a, b) => b.variant - a.variant || byFolder(b) - byFolder(a) || a.file.localeCompare(b.file))[0].file;
  }

  if (!dated.length) return null;
  const distance = (e: LogoEntry) => (season < e.from! ? e.from! - season : season - (e.to ?? season));
  return [...dated].sort((a, b) => distance(a) - distance(b) || b.from! - a.from!)[0].file;
}
