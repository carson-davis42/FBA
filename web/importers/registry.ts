import { normalizeName } from '../engine/shared/names';
import type { Player, PlayersFile } from '../engine/shared/types';
import type { Report } from './report';

export class PlayerRegistry {
  private readonly players = new Map<string, Player>();
  private readonly byName = new Map<string, string[]>();
  private readonly scopes = new Map<string, string[]>();
  private next = 1;

  constructor(private readonly report: Report) {}

  static fromFile(file: PlayersFile, report: Report): PlayerRegistry {
    const reg = new PlayerRegistry(report);
    for (const p of Object.values(file.players)) {
      reg.players.set(p.id, { ...p });
      reg.scopes.set(p.id, []);
      if (p.name !== null) {
        const key = normalizeName(p.name);
        reg.byName.set(key, [...(reg.byName.get(key) ?? []), p.id]);
      }
    }
    reg.next = file.nextId;
    return reg;
  }

  add(name: string | null, birthSeason: number | null, scope: string): string {
    if (name === null) return this.create(null, birthSeason, scope);
    const key = normalizeName(name);
    const sameName = this.byName.get(key) ?? [];
    const candidates = sameName
      .map(id => this.players.get(id)!)
      .filter(p => !this.scopes.get(p.id)!.includes(scope))
      .filter(p => p.birthSeason === null || birthSeason === null || Math.abs(p.birthSeason - birthSeason) <= 1);

    if (candidates.length === 1) {
      const p = candidates[0];
      if (p.birthSeason === null && birthSeason !== null) p.birthSeason = birthSeason;
      this.scopes.get(p.id)!.push(scope);
      return p.id;
    }
    if (candidates.length > 1) {
      this.report.warn('ambiguous names', `${name} (${scope}) could be any of ${candidates.length} existing players; created a new player`);
    } else if (sameName.length > 0) {
      this.report.info('same name, different player', `${name} (${scope}) was not linked to an existing player with this name (different age or already on this roster)`);
    }
    const id = this.create(name, birthSeason, scope);
    this.byName.set(key, [...sameName, id]);
    return id;
  }

  toFile(): PlayersFile {
    return { nextId: this.next, players: Object.fromEntries(this.players) };
  }

  linkedPlayers(): { id: string; name: string; scopes: string[] }[] {
    return [...this.players.values()]
      .filter(p => p.name !== null && this.scopes.get(p.id)!.length > 1)
      .map(p => ({ id: p.id, name: p.name!, scopes: [...this.scopes.get(p.id)!] }));
  }

  private create(name: string | null, birthSeason: number | null, scope: string): string {
    const id = `p${String(this.next++).padStart(5, '0')}`;
    this.players.set(id, { id, name, birthSeason });
    this.scopes.set(id, [scope]);
    return id;
  }
}
