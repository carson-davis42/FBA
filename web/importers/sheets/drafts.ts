export interface DraftRow { team: string; via: string | null; name: string; pos: string; detail: string | null; college: string | null }

/** One draft tab: rows TEAM | PLAYER | POSITION | CLASS-or-AGE | COLLEGE in pick order; the header row may sit anywhere. */
export function parseDraftTab(rows: string[][]): DraftRow[] {
  const out: DraftRow[] = [];
  for (const r of rows) {
    const [team = '', name = '', pos = '', detail = '', college = ''] = r.map(c => (c ?? '').trim());
    if (!team || !name) continue;
    if (team.toUpperCase() === 'TEAM' && name.toUpperCase() === 'PLAYER') continue;
    const m = team.match(/^(.*?)\s*\(via\s+([^)]+)\)\s*$/i);
    out.push({ team: m ? m[1].trim() : team, via: m ? m[2].trim() : null, name, pos, detail: detail || null, college: college || null });
  }
  return out;
}

/** "S49" → draft, "S75 exp" → expansion; anything else (D2, Draft Board) → null. */
export function draftTabKind(tab: string): { season: number; kind: 'draft' | 'expansion' } | null {
  const m = tab.trim().match(/^S(\d+)(?:\s+(exp))?$/i);
  return m ? { season: Number(m[1]), kind: m[2] ? 'expansion' : 'draft' } : null;
}
