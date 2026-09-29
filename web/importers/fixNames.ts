import type { PlayersFile } from '../engine/shared/types';
import type { Report } from './report';
import { closeMatches, sameName, type SheetPlayer } from './sheets/playersTab';

export interface NameFix { playerId: string; from: string; to: string }

/** Propose a rename for every player whose name isn't in the sheet but has exactly one close match. */
export function planNameFixes(players: PlayersFile, sheet: SheetPlayer[], report: Report): NameFix[] {
  const fixes: NameFix[] = [];
  for (const p of Object.values(players.players)) {
    if (p.name === null) continue;
    if (sheet.some(s => sameName(s.name, p.name as string))) continue;
    const close = closeMatches(p.name, sheet);
    if (close.length === 1) {
      fixes.push({ playerId: p.id, from: p.name, to: close[0].name });
      report.info('fix-names', `${p.name} → ${close[0].name}`);
    } else if (close.length === 0) {
      report.warn('fix-names', `${p.name} (${p.id}): no close match in the Players tab`);
    } else {
      report.warn('fix-names', `${p.name} (${p.id}): ${close.length} close matches (${close.map(c => c.name).join(', ')})`);
    }
  }
  return fixes;
}

export function applyNameFixes(players: PlayersFile, fixes: NameFix[], skip: string[]): PlayersFile {
  const next: PlayersFile = { ...players, players: { ...players.players } };
  for (const f of fixes) {
    if (skip.includes(f.from)) continue;
    const p = next.players[f.playerId];
    if (p) next.players[f.playerId] = { ...p, name: f.to };
  }
  return next;
}
