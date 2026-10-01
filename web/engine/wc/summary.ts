import type { WritesResult } from '../season/moves';
import type { Champion, PastSeries, SummaryFile, WorldCupFile } from '../shared/types';
import { PastBracket, SummaryFile as SummarySchema } from '../shared/types';
import { tournamentMvpCandidates, type MvpCandidate, type MvpNames } from './mvp';
import { finishWorldCup, type WorldCupState } from './worldcup';

const TITLE = 'World Cup Champion';

const ROUND_NO: Record<string, number> = { R32: 1, R16: 2, QF: 3, SF: 4, F: 5 };

function knockoutBracket(wc: WorldCupFile, names: MvpNames): PastBracket | null {
  if (wc.knockout.length === 0) return null;
  const series: PastSeries[] = [];
  for (const k of wc.knockout) {
    const r = ROUND_NO[k.round];
    if (!k.game || !r || !k.home || !k.away) return null;
    const homeWon = k.game.homePts > k.game.awayPts;
    const hi = Math.max(k.game.homePts, k.game.awayPts);
    const lo = Math.min(k.game.homePts, k.game.awayPts);
    series.push({
      id: `R${r}-${k.id.split('-')[1]}`,
      round: r,
      home: { name: names.team(k.home), record: null, seed: null },
      away: { name: names.team(k.away), record: null, seed: null },
      homeWins: homeWon ? 1 : 0,
      awayWins: homeWon ? 0 : 1,
      winner: homeWon ? 'home' : 'away',
      score: `${hi}–${lo}`,
    });
  }
  const parsed = PastBracket.safeParse({ rounds: 5, series });
  return parsed.success ? parsed.data : null;
}

export function buildWcSummary(wc: WorldCupFile, names: MvpNames, mvp: MvpCandidate, existing: SummaryFile | null): SummaryFile {
  const final = wc.knockout.find(k => k.round === 'F')?.game ?? null;
  const score = final ? `${Math.max(final.homePts, final.awayPts)}–${Math.min(final.homePts, final.awayPts)}` : null;
  const champion: Champion = {
    title: TITLE,
    champion: names.team(wc.champion!),
    runnerUp: names.team(wc.runnerUp!),
    score,
    teamId: wc.champion!,
    runnerUpId: wc.runnerUp!,
    finalsMvp: mvp.generated ? null : mvp.key,
    ...(mvp.generated ? { mvpName: mvp.name.replace(/ \(Generated\)$/, '') } : {}),
  };
  const bracket = knockoutBracket(wc, names);
  return {
    ...(existing ?? {}),
    ...(bracket ? { pastBracket: bracket } : {}),
    league: 'fbawc',
    season: wc.season,
    locked: true,
    host: names.team(wc.host),
    champions: [champion, ...(existing?.champions ?? []).filter(c => c.title !== TITLE)],
  };
}

export function finishWorldCupWithMvp(state: WorldCupState, mvpKey: string, names: MvpNames, existing: SummaryFile | null): WritesResult {
  const wc = state.worldCup;
  if (!wc) return { ok: false, problems: ['The World Cup has not been started'] };
  const fin = finishWorldCup(state);
  if (!fin.ok) return fin;
  const mvp = tournamentMvpCandidates(wc, names).find(c => c.key === mvpKey);
  if (!mvp) return { ok: false, problems: ['That player is not an MVP candidate'] };
  const summary = SummarySchema.parse(buildWcSummary(wc, names, mvp, existing));
  return {
    ok: true,
    label: `World Cup finished: ${names.team(wc.champion!)}, MVP ${mvp.name}`,
    writes: [
      { path: 'calendar.json', doc: fin.state.calendar },
      { path: `leagues/fbawc/S${wc.season}/summary.json`, doc: summary },
    ],
  };
}
