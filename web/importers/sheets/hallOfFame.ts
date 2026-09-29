import type { HallOfFameFile, HofCard, PlayersFile } from '../../engine/shared/types';
import type { Report } from '../report';

const CLASS_START = /^(S\d+|FFL)$/;
const NOMINEE_START = 'S--';
const MAX_NOMINEES = 15;

/**
 * Reads the main sheet's "Hall of Fame" tab (columns A, B, C = Year, Name, RET; row 0 is the header).
 * A column A of "S<n>" or "FFL" starts an inductee class, "S--" starts the nominee section, a non-empty
 * column C starts a card, and any other row with a name adds a line to the current card.
 */
export function parseHallOfFameTab(rows: string[][], players: PlayersFile, report: Report): HallOfFameFile {
  const byName = new Map<string, string[]>();
  for (const p of Object.values(players.players)) {
    if (!p.name) continue;
    const key = p.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), p.id]);
  }
  const findId = (name: string): string | null => {
    const ids = byName.get(name.toLowerCase()) ?? [];
    if (ids.length > 1) report.warn('hall-of-fame', `"${name}" matches ${ids.length} players (${ids.join(', ')}); left unlinked`);
    return ids.length === 1 ? ids[0] : null;
  };

  const classes: HallOfFameFile['classes'] = [];
  const nominees: HofCard[] = [];
  let target: HofCard[] | null = null;
  let card: HofCard | null = null;

  for (let i = 1; i < rows.length; i++) {
    const a = (rows[i]?.[0] ?? '').trim();
    const b = (rows[i]?.[1] ?? '').trim();
    const c = (rows[i]?.[2] ?? '').trim();
    if (a === NOMINEE_START) {
      target = nominees;
      card = null;
    } else if (CLASS_START.test(a)) {
      const inductees: HofCard[] = [];
      classes.push({ season: a, inductees });
      target = inductees;
      card = null;
    } else if (a) {
      report.warn('hall-of-fame', `Row ${i + 1}: unrecognised value "${a}" in the Year column`);
    }
    if (c && b) {
      if (!target) {
        report.warn('hall-of-fame', `Row ${i + 1}: card "${b}" appears before any class or the nominee section; skipped`);
        card = null;
        continue;
      }
      card = { name: b, playerId: findId(b), retiredSeason: c, lines: [] };
      target.push(card);
    } else if (b && a !== NOMINEE_START) {
      if (card) card.lines.push(b);
      else report.warn('hall-of-fame', `Row ${i + 1}: line "${b}" has no card above it; skipped`);
    }
  }

  if (nominees.length > MAX_NOMINEES) {
    report.error('hall-of-fame', `${nominees.length} nominees on the sheet; the limit is ${MAX_NOMINEES}`);
  }
  return { league: 'fba', classes, nominees, removed: [] };
}
