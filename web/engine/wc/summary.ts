import type { WritesResult } from '../season/moves';
import type { Champion, SummaryFile, WorldCupFile } from '../shared/types';
import { SummaryFile as SummarySchema } from '../shared/types';
import { tournamentMvpCandidates, type MvpCandidate, type MvpNames } from './mvp';
import { finishWorldCup, type WorldCupState } from './worldcup';

const TITLE = 'World Cup Champion';

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
  return {
    ...(existing ?? {}),
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
