import { inkFor } from '../engine/shared/ink';
import type { TeamsFile } from '../engine/shared/types';
import { normName } from './history';
import type { Report } from './report';

/** The folder under `FBA Logos/` holding one logo per D2 club. Each club has the one logo, used since its first season, so its file is named directly on the team. */
export const D2_LOGO_FOLDER = 'FBAD2';

/** A club's two main colours, read from the artwork of its logo (`d2LogoColors.json`, keyed by file name without `.png`). */
export type D2LogoColors = Record<string, { primary: string; secondary: string }>;

/** Logos whose name doesn't start with the team's name in the data: file name (without the era) to team name. */
export const D2_LOGO_ALIASES: Record<string, string> = {
  'AS Roma Pallacanestro': 'Roma Pallacanestro',
};

/** A logo file's name without the extension or the era: "Mumbai BC S79-pres..png" is "Mumbai BC". */
export const logoStem = (file: string): string =>
  file.replace(/\.png$/i, '').replace(/\.+$/, '').replace(/\sS\d+(?:-(?:S\d+|pres))?$/i, '').trim();

/**
 * Points each D2 club at its logo file and, when `colors` has the logo, gives its badge the logo's primary colour (with readable text) and secondary
 * accent. A file belongs to the team named at the start of its name ("Guadalajara CB" is Guadalajara; the longest match wins), or to the team a listed
 * alias names. Clubs without a file keep what they had; files that match no team are reported. Returns a new doc.
 */
export function wireD2Logos(teams: TeamsFile, files: string[], report: Report, colors: D2LogoColors = {}): TeamsFile {
  const byName = new Map(teams.teams.map(t => [normName(t.name), t.teamId]));
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  const owner = (stem: string): string | undefined => {
    const alias = D2_LOGO_ALIASES[stem];
    if (alias) return byName.get(normName(alias));
    const n = normName(stem);
    const hit = names.find(name => n === name || n.startsWith(`${name} `));
    return hit === undefined ? undefined : byName.get(hit);
  };
  const wired = new Map<string, string>();
  // In name order, so a club with two logos always gets the later one (the newer file replaces the older).
  for (const file of [...files].sort((a, b) => a.localeCompare(b))) {
    if (!/\.png$/i.test(file)) continue;
    const id = owner(logoStem(file));
    if (id === undefined) { report.warn('d2-logos', `Logo file ${file} matches no team`); continue; }
    const prev = wired.get(id);
    if (prev) report.warn('d2-logos', `${teams.teams.find(t => t.teamId === id)!.name} has two logos (${prev} and ${file}); using ${file}`);
    wired.set(id, file);
  }
  const out = teams.teams.map(t => {
    const file = wired.get(t.teamId);
    if (!file) return t;
    const c = colors[file.replace(/\.png$/i, '')];
    if (!c) report.warn('d2-logos', `No logo colours for ${t.name}; its badge colours stay`);
    return { ...t, logoFolder: D2_LOGO_FOLDER, logoFile: file, ...(c ? { badge: { bg: c.primary, fg: inkFor(c.primary), accent: c.secondary } } : {}) };
  });
  report.info('d2-logos', `${wired.size} of ${teams.teams.length} teams wired to a logo`);
  return { ...teams, teams: out };
}
