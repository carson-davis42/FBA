import type { EventsFile, FranchisesFile, SummaryFile } from '../shared/types';

export interface TimelineSeason {
  season: number;
  champion: { name: string; teamId: string | null } | null;
  expansions: { teamId: string; name: string }[];
  renames: { teamId: string; from: string; to: string }[];
  notes: string[];
  rules: string[];
}

/** League milestones by season, newest first: champions, expansions, name changes, notes and rule changes. */
export function buildTimeline(summaries: SummaryFile[], franchises: FranchisesFile | null, events: EventsFile | null): TimelineSeason[] {
  const map = new Map<number, TimelineSeason>();
  const get = (season: number): TimelineSeason => {
    let t = map.get(season);
    if (!t) {
      t = { season, champion: null, expansions: [], renames: [], notes: [], rules: [] };
      map.set(season, t);
    }
    return t;
  };
  for (const s of summaries) {
    const c = s.champions.find(x => x.title === 'FBA Champion');
    const t = get(s.season);
    if (c) t.champion = { name: c.champion, teamId: c.teamId ?? null };
  }
  for (const e of events?.seasons ?? []) {
    const t = get(e.season);
    t.notes.push(...e.notes);
    t.rules.push(...e.rules);
  }
  for (const f of franchises?.franchises ?? []) {
    const eras = [...f.eras].sort((a, b) => a.from - b.from);
    eras.forEach((era, i) => {
      if (i === 0) {
        if (era.from > 1) get(era.from).expansions.push({ teamId: f.teamId, name: era.name });
      } else if (era.from > 1 && eras[i - 1].name !== era.name) {
        get(era.from).renames.push({ teamId: f.teamId, from: eras[i - 1].name, to: era.name });
      }
    });
  }
  return [...map.values()].sort((a, b) => b.season - a.season);
}
