import { AWARD_LABEL } from '../../engine/awards/races';
import { gameDays } from '../../engine/season/schedule';
import type { SeasonState } from '../../engine/season/state';
import { currentStepIndex } from '../../engine/shared/calendar';
import type { AwardEntry, CalendarFile, LeagueId, SummaryFile } from '../../engine/shared/types';
import { stepTarget } from '../stepRoutes';

export interface TickerSide { teamId: string; value: string; won: boolean }
export type TickerItem =
  | { kind: 'score'; key: string; to: string; away: TickerSide; home: TickerSide; note: string }
  | { kind: 'text'; key: string; to: string | null; badge: string | null; text: string; teamId: string | null };
export interface Ticker { label: string; items: TickerItem[] }
export interface TickerInput { league: LeagueId; label: string; state?: SeasonState; lastSummary?: SummaryFile | null; calendar?: CalendarFile }

const text = (key: string, badge: string | null, t: string, teamId: string | null, to: string | null = null): TickerItem =>
  ({ kind: 'text', key, to, badge, text: t, teamId });

function nextItem(cal?: CalendarFile): TickerItem | null {
  if (!cal) return null;
  const i = currentStepIndex(cal);
  return i < 0 ? null : text('next', 'Next', cal.steps[i].label, null, stepTarget(cal.steps[i]));
}

function awardItems(awards: AwardEntry[], name: (id: string) => string, league: LeagueId): TickerItem[] {
  return awards.map(a => text(`aw-${a.award}`, AWARD_LABEL[a.award], name(a.playerId), a.teamId, `/league/${league}/awards`));
}

/** What the header ticker shows for one league, in priority order: live playoffs, finished playoffs, regular-season finals, last season's summary. */
export function tickerItems(input: TickerInput): Ticker {
  const { league, label, state } = input;
  const next = nextItem(input.calendar);
  const tail = next ? [next] : [];
  const empty = (lbl: string): Ticker => ({ label: lbl, items: tail.length ? tail : [text('empty', null, 'No results yet', null)] });
  if (!state) return empty(label);
  const name = (id: string) => state.players.players[id]?.name ?? 'Unnamed';
  const po = state.playoffs;

  if (po && !po.outcome && po.games.length > 0) {
    const started = po.series.filter(s => s.home && s.away && s.homeWins + s.awayWins > 0);
    const round = Math.max(...started.map(s => s.round));
    return {
      label: `${label} · Playoffs`,
      items: started.filter(s => s.round === round).map(s => ({
        kind: 'score', key: s.id, to: `/league/${league}/playoffs`,
        away: { teamId: s.away!, value: String(s.awayWins), won: s.winner === s.away },
        home: { teamId: s.home!, value: String(s.homeWins), won: s.winner === s.home },
        note: s.winner ? 'Final' : 'Series',
      })),
    };
  }

  if (po?.outcome) {
    const items: TickerItem[] = [];
    for (const c of po.outcome.champions) {
      items.push(text(`ch-${c.teamId}`, 'Champion', `${c.score} over ${c.runnerUp}`, c.teamId, `/league/${league}/playoffs`));
      if (c.finalsMvp) items.push(text(`fmvp-${c.teamId}`, 'Finals MVP', name(c.finalsMvp), c.teamId, `/league/${league}/playoffs`));
    }
    if (state.awards?.locked) items.push(...awardItems(state.awards.awards, name, league));
    return { label: `${label} · S${state.season} final`, items: [...items, ...tail] };
  }

  const played = state.results?.games ?? [];
  if (state.schedule && played.length > 0) {
    const byNo = new Map(played.map(g => [g.gameNo, g]));
    const days = gameDays(state.schedule.games);
    let d = days.length - 1;
    while (d > 0 && !days[d].some(n => byNo.has(n))) d--;
    const items: TickerItem[] = days[d].filter(n => byNo.has(n)).map(n => {
      const g = byNo.get(n)!;
      return {
        kind: 'score', key: `g${n}`, to: `/league/${league}/game/${n}`,
        away: { teamId: g.away, value: String(g.awayPts), won: g.awayPts > g.homePts },
        home: { teamId: g.home, value: String(g.homePts), won: g.homePts > g.awayPts },
        note: g.ot ? (g.ot > 1 ? `Final/${g.ot}OT` : 'Final/OT') : 'Final',
      };
    });
    return { label: `${label} · Game Day ${d + 1}`, items };
  }

  const sum = input.lastSummary;
  if (sum) {
    const items: TickerItem[] = sum.champions.map((c, i) => text(`ch-${i}`, 'Champion',
      c.runnerUp ? `${c.champion}, ${c.score ? `${c.score} ` : ''}over ${c.runnerUp}` : c.champion, c.teamId ?? null, `/history/fba/season/${sum.season}`));
    items.push(...awardItems(sum.awards ?? [], name, league));
    return { label: `${label} · S${sum.season} final`, items: [...items, ...tail] };
  }
  return empty(label);
}
