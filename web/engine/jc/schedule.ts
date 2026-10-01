import { shuffle, type Rng } from '../d2/random';

export type Pair = [home: string, away: string];

/** Circle method: n-1 rounds of n/2 pairings for an even-sized list. */
function circleRounds<T>(items: readonly T[]): [T, T][][] {
  const n = items.length;
  const m = n - 1;
  const fixed = items[m];
  const rot = items.slice(0, m);
  const rounds: [T, T][][] = [];
  for (let r = 0; r < m; r++) {
    const round: [T, T][] = [[fixed, rot[r]]];
    for (let k = 1; k < n / 2; k++) round.push([rot[(r + k) % m], rot[(r - k + m) % m]]);
    rounds.push(round);
  }
  return rounds;
}

/** Four challenge-day sets: each pairs the conferences into 9 pairs, no conference pair repeated. */
export function challengeSets(confs: Record<string, string[]>, rng: Rng): Pair[][] {
  const order = shuffle(Object.keys(confs), rng);
  const rounds = circleRounds(order).slice(0, 4);
  return rounds.map((round) => {
    const games: Pair[] = [];
    for (const [c1, c2] of round) {
      const a = shuffle(confs[c1], rng);
      const b = shuffle(confs[c2], rng);
      for (let i = 0; i < a.length; i++) games.push(rng() < 0.5 ? [a[i], b[i]] : [b[i], a[i]]);
    }
    return games;
  });
}

/** One conference's 22 rounds: 11 circle rounds twice, home/away reversed in the second half. */
export function conferenceRounds(teamIds: string[], rng: Rng): Pair[][] {
  const base = circleRounds(shuffle(teamIds, rng)).map((r) =>
    r.map(([a, b]): Pair => (rng() < 0.5 ? [a, b] : [b, a])),
  );
  const first = shuffle(base, rng);
  const second = shuffle(
    base.map((r) => r.map(([h, a]): Pair => [a, h])),
    rng,
  );
  return [...first, ...second];
}

/** 22 days of 108 games: every conference's rounds merged by index. */
export function conferenceDays(confs: Record<string, string[]>, rng: Rng): Pair[][] {
  const per = Object.keys(confs).map((c) => conferenceRounds(confs[c], rng));
  return Array.from({ length: 22 }, (_, i) => per.flatMap((rounds) => rounds[i]));
}
