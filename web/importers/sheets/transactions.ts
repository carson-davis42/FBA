export type RawTx =
  | { kind: 'trade'; codes: string[]; when: string | null; notes: string[]; moves: { to: string; asset: string }[] }
  | { kind: 'cut' | 'released' | 'signed' | 'acquired'; code: string; when: string | null; asset: string };
export interface RawTxSeason { season: number; entries: RawTx[] }

const MOVE_KINDS: Record<string, 'cut' | 'released' | 'signed' | 'acquired'> = { cut: 'cut', released: 'released', signed: 'signed', acquired: 'acquired' };
const CODE = /^[A-Z]{2,4}$/;
const TRADE = /^[A-Z]{2,4}(?:\/[A-Z]{2,4})+$/;

type Block = { type: 'trade'; entry: Extract<RawTx, { kind: 'trade' }> } | { type: 'team'; code: string; when: string | null } | null;

/** The main sheet's Transactions tab (column A = header or kind, column B = asset or timing). */
export function parseTransactionsTab(rows: string[][]): { seasons: RawTxSeason[]; skipped: number; problems: string[] } {
  const seasons: RawTxSeason[] = [];
  const problems: string[] = [];
  let skipped = 0;
  let season: RawTxSeason | null = null;
  let block: Block = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const a = (r[0] ?? '').trim();
    const b = (r[1] ?? '').trim();
    if (!a && !b) { block = null; continue; }
    const sm = a.match(/^S(\d+)$/);
    if (sm && !b) { season = { season: Number(sm[1]), entries: [] }; seasons.push(season); block = null; continue; }
    if (!season) continue;
    if (a.startsWith('->')) {
      if (block?.type !== 'trade') problems.push(`row ${i + 1}: "${a} | ${b}" is outside a trade`);
      else if (!b) problems.push(`row ${i + 1}: "${a}" has no asset`);
      else block.entry.moves.push({ to: a.slice(2).trim(), asset: b });
      continue;
    }
    const kind = MOVE_KINDS[a.toLowerCase()];
    if (kind) {
      if (block?.type !== 'team') problems.push(`row ${i + 1}: "${a} | ${b}" is outside a team block`);
      else if (!b) problems.push(`row ${i + 1}: "${a}" has no asset`);
      else season.entries.push({ kind, code: block.code, when: block.when, asset: b });
      continue;
    }
    if (/^traded (away|for)$/i.test(a)) { skipped++; continue; }
    if (TRADE.test(a)) {
      const entry = { kind: 'trade' as const, codes: a.split('/'), when: b || null, notes: [] as string[], moves: [] as { to: string; asset: string }[] };
      season.entries.push(entry);
      block = { type: 'trade', entry };
      continue;
    }
    if (CODE.test(a)) { block = { type: 'team', code: a, when: b || null }; continue; }
    if (block?.type === 'trade') { block.entry.notes.push(b ? `${a} — ${b}` : a); continue; }
    problems.push(`row ${i + 1}: "${a} | ${b}" not understood`);
  }
  return { seasons, skipped, problems };
}

/** "SF-Keon Whitfield" → pos + name; pick and other assets → null. */
export function parseAsset(text: string): { pos: string; name: string } | null {
  const m = text.trim().match(/^(PG|SG|SF|PF|C|IN|MID|OUT)-(.+)$/);
  return m ? { pos: m[1], name: m[2].trim() } : null;
}
