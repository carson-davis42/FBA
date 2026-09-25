import { readdirSync } from 'node:fs';
import path from 'node:path';
import { parseLogoFilename } from '../engine/shared/logos';
import type { LogoEntry, LogoManifest } from '../engine/shared/types';
import type { Report } from './report';

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
      if (parsed.from === null && dir.name !== 'FBA') {
        report.warn('logos', `Undated logo ${dir.name}/${f.name}: add an era such as "S60-S70" or "S79-pres." to the filename for season-accurate logos`);
      }
      entries.push(parsed);
    }
    folders[dir.name] = entries.sort((a, b) => a.file.localeCompare(b.file));
  }
  return { folders };
}
