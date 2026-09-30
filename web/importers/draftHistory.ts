import { franchiseAt, franchiseByAbbr } from '../engine/shared/franchises';
import type { DraftHistoryDraft, DraftHistoryFile, FranchisesFile, PlayersFile } from '../engine/shared/types';
import { nameResolver } from './history';
import type { Report } from './report';
import { draftTabKind, parseDraftTab } from './sheets/drafts';

/** Sheet shorthands that no era name starts with. */
const SHEET_TEAM_ALIASES: Record<string, string> = { 'Cypress G': 'Cypress Green Guns', 'Cypress B': 'Cypress Black Sox' };

/** A sheet team text in `season` → franchise id: exact era name, alias, abbreviation, then a unique era-name prefix among eras covering the season. */
export function resolveSheetTeam(file: FranchisesFile, text: string, season: number): string | null {
  const t = text.trim();
  const exact = franchiseAt(file, SHEET_TEAM_ALIASES[t] ?? t, season);
  if (exact) return exact.teamId;
  const byAbbr = franchiseByAbbr(file, t, season);
  if (byAbbr) return byAbbr.teamId;
  const covering = file.franchises.filter(f => f.eras.some(e => e.from <= season && (e.to === null || season <= e.to) && e.name.startsWith(`${t} `)));
  return covering.length === 1 ? covering[0].teamId : null;
}

export function buildDraftHistory(
  tabs: Record<string, string[][]>, ctx: { players: PlayersFile; franchises: FranchisesFile; lastSeason: number }, report: Report,
): DraftHistoryFile {
  const resolve = nameResolver(ctx.players, report, 'drafts');
  const drafts: DraftHistoryDraft[] = [];
  for (const [tab, rows] of Object.entries(tabs)) {
    const kind = draftTabKind(tab);
    if (!kind || kind.season > ctx.lastSeason) continue;
    let n = 0;
    const picks = parseDraftTab(rows).map(r => {
      const where = `${tab} ${r.name}`;
      if (r.team.toLowerCase() === 'undrafted') {
        return { pick: null, teamId: null, teamName: null, viaTeamId: null, name: r.name, playerId: resolve(r.name, where), pos: r.pos, detail: r.detail, college: r.college };
      }
      const teamId = resolveSheetTeam(ctx.franchises, r.team, kind.season);
      if (!teamId) report.warn('drafts', `Unresolved team "${r.team}" (${where})`);
      const viaTeamId = r.via ? franchiseByAbbr(ctx.franchises, r.via, kind.season)?.teamId ?? null : null;
      if (r.via && !viaTeamId) report.warn('drafts', `Unresolved via "${r.via}" (${where})`);
      return { pick: ++n, teamId, teamName: r.team, viaTeamId, name: r.name, playerId: resolve(r.name, where), pos: r.pos, detail: r.detail, college: r.college };
    });
    drafts.push({ season: kind.season, kind: kind.kind, picks });
  }
  drafts.sort((a, b) => a.season - b.season || (a.kind === b.kind ? 0 : a.kind === 'draft' ? -1 : 1));
  return { drafts };
}
