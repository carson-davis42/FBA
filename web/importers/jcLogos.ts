import { normName } from './history';
import type { Report } from './report';
import type { TeamsFile } from '../engine/shared/types';

/** The folder under `FBA Logos/` holding one cropped, transparent PNG per college school, named after the school. */
export const JC_LOGO_FOLDER = 'FBAJC_Final';

/** Points each college team at its logo file (`<school name>.png`). Teams without a file keep what they had and are reported. Returns a new doc. */
export function wireJcLogos(teams: TeamsFile, files: string[], report: Report): TeamsFile {
  const byName = new Map(files.filter(f => /\.png$/i.test(f)).map(f => [normName(f.replace(/\.png$/i, '')), f]));
  const used = new Set<string>();
  const out = teams.teams.map(t => {
    const file = byName.get(normName(t.name));
    if (!file) { report.warn('jc-logos', `No logo file for ${t.name}; its badge stays`); return t; }
    used.add(file);
    return { ...t, logoFolder: JC_LOGO_FOLDER, logoFile: file };
  });
  for (const f of files) if (/\.png$/i.test(f) && !used.has(f)) report.warn('jc-logos', `Logo file ${f} matches no team`);
  report.info('jc-logos', `${used.size} of ${teams.teams.length} teams wired to a logo`);
  return { ...teams, teams: out };
}
