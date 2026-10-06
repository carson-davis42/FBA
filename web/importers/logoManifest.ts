import { readdirSync } from 'node:fs';
import path from 'node:path';
import { parseLogoFilename, TEAM_LOGOS_DIR } from '../engine/shared/logos';
import type { LogoEntry, LogoManifest } from '../engine/shared/types';
import type { Report } from './report';

/** Folders whose files are one undated logo per team, so no era is expected in the names. */
const SHARED_FOLDERS = new Set(['FBA', 'FBA_Gold', 'FBAD2', 'FBAJC', 'FBAJC_Final']);

/** The logo folders under the root: the top-level ones, plus each team folder inside FBA_Main (which is not a logo folder itself). */
function logoFolders(logoRoot: string): { name: string; dir: string }[] {
  const out: { name: string; dir: string }[] = [];
  for (const d of readdirSync(logoRoot, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    if (d.name !== TEAM_LOGOS_DIR) { out.push({ name: d.name, dir: path.join(logoRoot, d.name) }); continue; }
    for (const team of readdirSync(path.join(logoRoot, d.name), { withFileTypes: true })) {
      if (team.isDirectory()) out.push({ name: team.name, dir: path.join(logoRoot, d.name, team.name) });
    }
  }
  return out;
}

export function buildLogoManifest(logoRoot: string, report: Report): LogoManifest {
  const folders: Record<string, LogoEntry[]> = {};
  for (const dir of logoFolders(logoRoot)) {
    const entries: LogoEntry[] = [];
    for (const f of readdirSync(dir.dir, { withFileTypes: true })) {
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
  // The same order a directory listing gives (case-insensitive), whether a folder sits at the top level or inside FBA_Main.
  const upper = (s: string) => s.toUpperCase();
  return { folders: Object.fromEntries(Object.entries(folders).sort(([a], [b]) => (upper(a) < upper(b) ? -1 : upper(a) > upper(b) ? 1 : 0))) };
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
