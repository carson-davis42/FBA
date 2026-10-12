import { describe, expect, it } from 'vitest';
import { calendarFor } from '../shared/calendar';
import { EXPANSION_TEAMS } from '../shared/expansion';
import type { TeamsFile, TransactionsFile } from '../shared/types';
import { addExpansionTeams, type AddTeamsState } from './addExpansionTeams';

const base = (): TeamsFile => ({ league: 'fba', teams: [{ teamId: 'A', name: 'A', abbr: 'A', group: 'E', logoFolder: null, badge: { bg: '#000', fg: '#fff' } }] });
const atStep = () => {
  const cal = calendarFor(79);
  const at = cal.steps.findIndex(s => s.id === 's80-add-expansion-teams');
  return { ...cal, steps: cal.steps.map((s, i) => ({ ...s, done: i < at })) };
};
const state = (over: Partial<AddTeamsState> = {}): AddTeamsState => ({
  season: 79, calendar: atStep(), teams: base(), tx: { league: 'fba', season: 79, entries: [] } as TransactionsFile, ...over,
});

describe('addExpansionTeams', () => {
  it('appends both teams, logs it and completes the step', () => {
    const r = addExpansionTeams(state(), { batchId: 'b' });
    if (!r.ok) throw new Error(r.problems.join('; '));
    const teams = r.writes.find(w => w.path === 'leagues/fba/teams.json')!.doc as TeamsFile;
    expect(teams.teams.map(t => t.teamId)).toEqual(['A', 'PHI', 'LAL']);
    const tx = r.writes.find(w => w.path === 'leagues/fba/S79/transactions.json')!.doc as TransactionsFile;
    expect(tx.entries[0].type).toBe('expansion');
    const cal = r.writes.find(w => w.path === 'calendar.json')!.doc as { steps: { id: string; done: boolean }[] };
    expect(cal.steps.find(s => s.id === 's80-add-expansion-teams')!.done).toBe(true);
  });
  it('refuses when the step is not current', () => {
    const r = addExpansionTeams(state({ calendar: calendarFor(79) }), { batchId: 'b' });
    expect(r.ok).toBe(false);
  });
  it('refuses after the lottery has run, naming the lottery', () => {
    const cal = atStep();
    const done = { ...cal, steps: cal.steps.map(s => (s.id === 's80-fba-draft-lottery' ? { ...s, done: true } : s)) };
    const r = addExpansionTeams(state({ calendar: done }), { batchId: 'b' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(' ')).toMatch(/lottery/i);
  });
  it('refuses a calendar with no add-teams step, naming the lottery', () => {
    const cal = atStep();
    const r = addExpansionTeams(state({ calendar: { ...cal, steps: cal.steps.filter(s => s.id !== 's80-add-expansion-teams') } }), { batchId: 'b' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(' ')).toMatch(/lottery/i);
  });
  it('refuses when the teams are already there', () => {
    const r = addExpansionTeams(state({ teams: { ...base(), teams: [...base().teams, ...EXPANSION_TEAMS] } }), { batchId: 'b' });
    expect(r).toEqual({ ok: false, problems: ['The expansion teams are already in the league'] });
  });
});
