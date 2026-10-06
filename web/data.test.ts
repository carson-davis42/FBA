import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { schemaForPath } from './engine/shared/schemaRegistry';
import { relativesOf } from './engine/history/relatives';
import type { FranchisesFile, FreeAgentsFile, MetaFile, PlayersFile, RelativesFile, ReservesFile, RostersFile, StreakRecordsFile } from './engine/shared/types';

const DATA_DIR = path.join(__dirname, 'data');
const readData = <T>(rel: string): T => JSON.parse(readFileSync(path.join(DATA_DIR, ...rel.split('/')), 'utf8')) as T;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '.backups' || entry === '.journal') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.json')) out.push(full);
  }
  return out;
}

describe('committed data', () => {
  const files = walk(DATA_DIR);

  it('found at least 19 data files', () => {
    expect(files.length).toBeGreaterThanOrEqual(19);
  });

  it.each(files.map(f => [path.relative(DATA_DIR, f).split(path.sep).join('/'), f] as const))(
    'validates %s',
    (rel, full) => {
      const schema = schemaForPath(rel);
      expect(schema, `no schema registered for ${rel}`).not.toBeNull();

      const doc: unknown = JSON.parse(readFileSync(full, 'utf8'));
      const result = schema!.safeParse(doc);
      if (!result.success) {
        throw new Error(`${rel} failed validation: ${JSON.stringify(result.error.issues.slice(0, 5), null, 2)}`);
      }
      expect(result.success).toBe(true);
    },
  );

  it('links relatives only to players that exist, and derives the Quinsler family correctly', () => {
    const rel = readData<RelativesFile>('leagues/fba/relatives.json');
    const players = readData<PlayersFile>('players.json').players;
    for (const { child, parent } of rel.parents) for (const id of [child, parent]) if (id.startsWith('p')) expect(players[id], id).toBeDefined();
    const idOf = (name: string) => Object.values(players).find(p => p.name === name)!.id;
    const of = (name: string) => relativesOf(rel, idOf(name)).map(r => `${r.label}: ${players[r.playerId].name}`);
    expect(of('Matt Quinsler')).toEqual(expect.arrayContaining(['Parent: Marcus Quinsler', 'Sibling: Saun Quinsler', 'Cousin: Stephen Quinsler']));
    expect(of('Marcus Quinsler')).toContain('Nephew/niece: Stephen Quinsler');
    expect(of('Saun Quinsler')).toContain('Grandchild: CJ Quinsler');
    expect(of('Seth Quinsler')).toContain('Third cousin: CJ Quinsler');
  });

  it('keeps streak records only for franchises that exist, from before the tracked seasons', () => {
    const franchises = new Set(readData<FranchisesFile>('leagues/fba/franchises.json').franchises.map(f => f.teamId));
    for (const r of readData<StreakRecordsFile>('leagues/fba/streakRecords.json').records) {
      expect(franchises.has(r.teamId), r.teamId).toBe(true);
      expect(r.toSeason, `${r.teamId} ${r.length}${r.kind}`).toBeLessThan(79);
    }
  });

  it('has no player listed in more than one pool for the current season', () => {
    const meta = readData<MetaFile>('meta.json');
    const fbaSeason = meta.rosterSeason.fba;
    const d2Season = meta.rosterSeason.fbad2;
    const fba = readData<RostersFile>(`leagues/fba/S${fbaSeason}/rosters.json`);
    const d2 = readData<RostersFile>(`leagues/fbad2/S${d2Season}/rosters.json`);
    const freeAgents = readData<FreeAgentsFile>(`leagues/fba/S${fbaSeason}/freeAgents.json`);
    const reserves = readData<ReservesFile>(`leagues/fbad2/S${d2Season}/reserves.json`);

    const locations = new Map<string, string[]>();
    const record = (playerId: string | null, where: string) => {
      if (playerId === null) return;
      locations.set(playerId, [...(locations.get(playerId) ?? []), where]);
    };
    for (const [teamId, entries] of Object.entries(fba.teams)) for (const e of entries) record(e.playerId, `FBA ${teamId}`);
    for (const [teamId, entries] of Object.entries(d2.teams)) for (const e of entries) record(e.playerId, `D2 ${teamId}`);
    for (const p of freeAgents.players) record(p.playerId, 'free agents');
    for (const p of reserves.players) record(p.playerId, 'D2 Reserves');

    const dupes = [...locations.entries()].filter(([, where]) => where.length > 1);
    expect(dupes, dupes.map(([id, where]) => `${id}: ${where.join(', ')}`).join('\n')).toEqual([]);
  });
});
