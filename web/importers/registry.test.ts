import { describe, expect, it } from 'vitest';
import { PlayerRegistry } from './registry';
import { Report } from './report';

describe('PlayerRegistry', () => {
  it('assigns sequential padded ids', () => {
    const reg = new PlayerRegistry(new Report());
    expect(reg.add('A One', 50, 'fba:S79')).toBe('p00001');
    expect(reg.add('B Two', 50, 'fba:S79')).toBe('p00002');
    expect(reg.toFile().nextId).toBe(3);
  });

  it('links the same person across scopes', () => {
    const reg = new PlayerRegistry(new Report());
    const a = reg.add('Yasin Milovanović', 51, 'fba:S79');
    const b = reg.add('Yasin Milovanovic', 50, 'fba:S78');
    expect(b).toBe(a);
    expect(reg.linkedPlayers()).toEqual([{ id: a, name: 'Yasin Milovanović', scopes: ['fba:S79', 'fba:S78'] }]);
  });

  it('links when one birth season is unknown and fills it in', () => {
    const reg = new PlayerRegistry(new Report());
    const jc = reg.add('Milo Lawrenz', null, 'fbajc:S78');
    const pro = reg.add('Milo Lawrenz', 59, 'fba:S79');
    expect(pro).toBe(jc);
    expect(reg.toFile().players[jc].birthSeason).toBe(59);
  });

  it('links a curly apostrophe to a straight one (K10)', () => {
    const reg = new PlayerRegistry(new Report());
    const a = reg.add("Jamari O'Neal", 55, 'fba:S79');
    expect(reg.add('Jamari O’Neal', 55, 'fba:S78')).toBe(a);
    expect(reg.add('Jamari O’Neal', null, 'fbajc:S78')).toBe(a);
  });

  it('does not link different ages', () => {
    const reg = new PlayerRegistry(new Report());
    expect(reg.add('Jalen Carter', 57, 'fba:S79')).not.toBe(reg.add('Jalen Carter', 45, 'fbad2:S79'));
  });

  it('does not link two players on the same league-season', () => {
    const reg = new PlayerRegistry(new Report());
    expect(reg.add('Chris Smith', 50, 'fbajc:S78')).not.toBe(reg.add('Chris Smith', 50, 'fbajc:S78'));
  });

  it('never links unnamed players', () => {
    const reg = new PlayerRegistry(new Report());
    const a = reg.add(null, null, 'fbajc:S78');
    const b = reg.add(null, null, 'fbawc:S78');
    expect(a).not.toBe(b);
    expect(reg.toFile().players[a].name).toBeNull();
  });

  it('warns on ambiguous matches', () => {
    const report = new Report();
    const reg = new PlayerRegistry(report);
    reg.add('Sam Lee', 50, 'fbad2:S79');
    reg.add('Sam Lee', 50, 'fbad2:S79');
    reg.add('Sam Lee', null, 'fbawc:S78');
    expect(report.entries.some(e => e.level === 'warn' && e.topic === 'ambiguous names')).toBe(true);
  });
});

describe('PlayerRegistry.fromFile', () => {
  it('reuses existing ids and continues numbering', () => {
    const file = { nextId: 3, players: { p00001: { id: 'p00001', name: 'Gabriel Greenwood', birthSeason: 51 }, p00002: { id: 'p00002', name: 'Milo Lawrenz', birthSeason: null } } };
    const reg = PlayerRegistry.fromFile(file, new Report());
    expect(reg.add('Gabriel Greenwood', 51, 'fba:S79')).toBe('p00001');
    expect(reg.add('Milo Lawrenz', 60, 'fba:S79')).toBe('p00002');
    expect(reg.add('New Guy', 57, 'fba-fa:S79')).toBe('p00003');
    expect(reg.toFile().players.p00002.birthSeason).toBe(60);
    expect(reg.toFile().nextId).toBe(4);
  });
});
