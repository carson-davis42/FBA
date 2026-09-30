import { franchiseByAbbr } from '../engine/shared/franchises';
import type { FranchisesFile, PastAsset, PastTransactionsFile, PlayersFile } from '../engine/shared/types';
import { nameResolver } from './history';
import type { Report } from './report';
import { parseAsset, parseTransactionsTab } from './sheets/transactions';

export function buildPastTransactions(rows: string[][], ctx: { players: PlayersFile; franchises: FranchisesFile }, report: Report): PastTransactionsFile {
  const { seasons, skipped, problems } = parseTransactionsTab(rows);
  for (const p of problems) report.warn('transactions', p);
  report.info('transactions', `Skipped ${skipped} Traded Away / Traded For lines (they repeat the trades)`);
  const resolve = nameResolver(ctx.players, report, 'transactions');
  const team = (code: string, season: number) => {
    const id = franchiseByAbbr(ctx.franchises, code, season)?.teamId;
    if (!id) report.warn('transactions', `Unresolved team code ${code} (S${season})`);
    return id ?? code;
  };
  const asset = (text: string, season: number): PastAsset => {
    const p = parseAsset(text);
    return p ? { text, pos: p.pos, name: p.name, playerId: resolve(p.name, `S${season} transactions`) } : { text, pos: null, name: null, playerId: null };
  };
  const out = seasons.map(s => ({
    season: s.season,
    entries: s.entries.map(e => e.kind === 'trade'
      ? { kind: 'trade' as const, teamIds: e.codes.map(c => team(c, s.season)), when: e.when, notes: e.notes, moves: e.moves.map(m => ({ to: team(m.to, s.season), asset: asset(m.asset, s.season) })) }
      : { kind: e.kind, teamId: team(e.code, s.season), when: e.when, asset: asset(e.asset, s.season) }),
  }));
  // The sheet may list a season twice; merge in order so seasons ascend without repeats.
  const merged = new Map<number, PastTransactionsFile['seasons'][number]>();
  for (const s of out) merged.set(s.season, { season: s.season, entries: [...(merged.get(s.season)?.entries ?? []), ...s.entries] });
  return { seasons: [...merged.values()].sort((a, b) => a.season - b.season) };
}
