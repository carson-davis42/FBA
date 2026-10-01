import { readdirSync } from 'node:fs';
import path from 'node:path';
import { parseLogoFilename } from '../engine/shared/logos';
import type { LogoEntry, LogoManifest } from '../engine/shared/types';
import type { Report } from './report';

/** Folders whose files are one undated logo per team, so no era is expected in the names. */
const SHARED_FOLDERS = new Set(['FBA', 'FBAJC', 'FBAJC_Final']);

export function buildLogoManifest(logoRoot: string, report: Report): LogoManifest {
  const folders: Record<string, LogoEntry[]> = {};
  for (const dir of readdirSync(logoRoot, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const entries: LogoEntry[] = [];
    for (const f of readdirSync(path.join(logoRoot, dir.name), { withFileTypes: true })) {
      if (!f.isFile()) continue;
      const parsed = parseLogoFilename(f.name);
      if (!parsed) {
        report.info('logos', `Skipped non-PNG file ${dir.name}/${f.name}`);
        continue;
      }
      if (parsed.from === null && !SHARED_FOLDERS.has(dir.name)) {
        report.warn('logos', `Undated logo ${dir.name}/${f.name}: add an era such as "S60-S70" or "S79-pres." to the filename for season-accurate logos`);
      }
      entries.push(parsed);
    }
    folders[dir.name] = entries.sort((a, b) => a.file.localeCompare(b.file));
  }
  return { folders };
}

/** The folders whose logo list differs between two manifests, by kind, each sorted by name. */
export function diffLogoManifests(before: LogoManifest | null, after: LogoManifest): { added: string[]; removed: string[]; changed: string[] } {
  const old = before?.folders ?? {};
  const names = (o: Record<string, LogoEntry[]>) => Object.keys(o).sort((a, b) => a.localeCompare(b));
  return {
    added: names(after.folders).filter(n => !(n in old)),
    removed: names(old).filter(n => !(n in after.folders)),
    changed: names(after.folders).filter(n => n in old && JSON.stringify(old[n]) !== JSON.stringify(after.folders[n])),
  };
}
