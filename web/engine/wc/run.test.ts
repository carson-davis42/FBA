import { describe, expect, it } from 'vitest';
import { schemaForPath } from '../shared/schemaRegistry';
import { finishWorldCup } from './worldcup';
import { runFullWorldCup } from './testRun';

function run(seed: number) {
  const { q, w } = runFullWorldCup(seed);
  const wf = finishWorldCup(w);
  if (!wf.ok) throw new Error(wf.problems.join());
  return { q, w: wf.state };
}

describe('full run', () => {
  it('plays qualifying to a champion with valid documents', () => {
    const { q, w } = run(79);
    expect(q.qualifying!.games).toHaveLength(210);
    expect(q.qualifying!.advanced).toHaveLength(49);
    expect(w.worldCup!.groupGames).toHaveLength(192);
    expect(w.worldCup!.knockout).toHaveLength(31);
    expect(schemaForPath('leagues/fbawc/S79/qualifying.json')!.safeParse(q.qualifying).success).toBe(true);
    expect(schemaForPath('leagues/fbawc/S79/rosters.json')!.safeParse(q.rosters).success).toBe(true);
    expect(schemaForPath('leagues/fbawc/S80/worldcup.json')!.safeParse(w.worldCup).success).toBe(true);
    expect(schemaForPath('leagues/fbawc/S80/rosters.json')!.safeParse(w.rosters).success).toBe(true);

    for (const [country, roster] of Object.entries(q.rosters.teams)) {
      roster.forEach((e, i) => {
        if (e.playerId !== null) return;
        const after = w.rosters.teams[country][i];
        if (after.playerId === null) {
          expect(after.rating).toBe(e.rating);
          expect(after.age).toBe(e.age! + 1);
        }
      });
    }
    expect(w.worldCup!.field).toContain(w.worldCup!.champion);
    expect(w.worldCup!.field).toContain(w.worldCup!.runnerUp);
    expect(w.calendar.steps.find(s => s.id === 's80-world-cup')!.done).toBe(true);
  });

  it('is deterministic for a seed', () => {
    expect(JSON.stringify(run(79))).toBe(JSON.stringify(run(79)));
  });
});
