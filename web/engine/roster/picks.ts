import type { PickCondition, PickObligation } from '../shared/types';

export const LOTTERY_SIZE = 14;

export function pickLabel(ob: PickObligation): string {
  const c = ob.condition;
  if (c.kind === 'swap') return `S${ob.season} Pick Swap(${ob.originalTeam}/${c.otherTeam})(${c.betterTo} gets better)`;
  const base = `S${ob.season} Draft Pick(via ${ob.originalTeam})`;
  switch (c.kind) {
    case 'none': return base;
    case 'top': return `${base}(${c.n}P)`;
    case 'lottery': return `${base}(LP)`;
    case 'custom': return `${base}(${c.text})`;
  }
}

export function isProtected(c: PickCondition, slot: number, lotterySize: number): boolean {
  if (c.kind === 'top') return slot <= c.n;
  if (c.kind === 'lottery') return slot <= lotterySize;
  return false;
}

export function shrink(c: PickCondition, lotterySize: number): PickCondition {
  const n = c.kind === 'lottery' ? lotterySize - 1 : c.kind === 'top' ? c.n - 1 : null;
  if (n === null) return c;
  return n >= 1 ? { kind: 'top', n } : { kind: 'none' };
}

export function futureSeasons(season: number): number[] {
  return [1, 2, 3, 4].map(i => season + i);
}

const byPriority = (a: PickObligation, b: PickObligation) => a.priority - b.priority || a.id.localeCompare(b.id);

export function owedFrom(obligations: PickObligation[], season: number, originalTeam: string): PickObligation[] {
  return obligations.filter(o => o.season === season && o.originalTeam === originalTeam).sort(byPriority);
}

export function nextPriority(obligations: PickObligation[], season: number, originalTeam: string): number {
  return owedFrom(obligations, season, originalTeam).reduce((m, o) => Math.max(m, o.priority), 0) + 1;
}

export interface ResolvedPick {
  slot: number;
  originalTeam: string;
  owner: string;
  obligationId: string | null;
  flag: string | null;
}

export function resolvePicks(input: { season: number; order: string[]; lotterySize: number; obligations: PickObligation[] }): {
  picks: ResolvedPick[];
  obligations: PickObligation[];
} {
  const { season, order, lotterySize } = input;
  const slotOf = new Map(order.map((t, i) => [t, i + 1]));
  const holder = new Map<string, Omit<ResolvedPick, 'slot' | 'originalTeam'>>(
    order.map(t => [t, { owner: t, obligationId: null, flag: null }]),
  );
  const kept = input.obligations.filter(o => o.season !== season);
  const current = input.obligations.filter(o => o.season === season);
  const unknown = [...new Set(current.flatMap(o => [o.originalTeam, ...(o.condition.kind === 'swap' ? [o.condition.otherTeam] : [])]))].filter(t => !slotOf.has(t));
  if (unknown.length) throw new Error(`S${season} picks name teams not in the draft order: ${unknown.join(', ')}`);
  const rolled: PickObligation[] = [];

  const swaps = current.filter(o => o.condition.kind === 'swap');
  const swapTeams = new Set<string>();
  for (const s of swaps) {
    if (s.condition.kind !== 'swap') continue;
    const a = s.originalTeam;
    const b = s.condition.otherTeam;
    swapTeams.add(a).add(b);
    const slotA = slotOf.get(a);
    const slotB = slotOf.get(b);
    if (slotA === undefined || slotB === undefined) {
      kept.push(s);
      continue;
    }
    const better = slotA < slotB ? a : b;
    const worse = better === a ? b : a;
    const other = s.condition.betterTo === a ? b : a;
    holder.set(better, { owner: s.condition.betterTo, obligationId: s.id, flag: null });
    holder.set(worse, { owner: other, obligationId: s.id, flag: null });
  }

  for (const team of order) {
    const queue = current.filter(o => o.originalTeam === team && o.condition.kind !== 'swap').sort(byPriority);
    if (!queue.length) continue;
    if (swapTeams.has(team)) {
      holder.set(team, { ...holder.get(team)!, flag: 'Pick is part of a swap and also owed: decide manually' });
      kept.push(...queue);
      continue;
    }
    if (queue.some(o => o.condition.kind === 'custom')) {
      holder.set(team, { owner: team, obligationId: null, flag: 'Custom condition: decide manually' });
      kept.push(...queue);
      continue;
    }
    const slot = slotOf.get(team)!;
    let conveyed = false;
    for (const o of queue) {
      if (!conveyed && !isProtected(o.condition, slot, lotterySize)) {
        conveyed = true;
        holder.set(team, { owner: o.owner, obligationId: o.id, flag: null });
        continue;
      }
      rolled.push({
        ...o,
        season: season + 1,
        condition: shrink(o.condition, lotterySize),
        rolls: [...o.rolls, { fromSeason: season, reason: conveyed ? 'already-owed' : 'protected' }],
      });
    }
  }

  const placed: PickObligation[] = [];
  for (const r of rolled) placed.push({ ...r, priority: nextPriority([...kept, ...placed], r.season, r.originalTeam) });

  return {
    picks: order.map((t, i) => ({ slot: i + 1, originalTeam: t, ...holder.get(t)! })),
    obligations: [...kept, ...placed],
  };
}
