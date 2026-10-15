import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { seasonDocPath } from '../../engine/season/state';
import { pollRanks } from '../../engine/jc/rankings';
import type { CalendarFile, JcRankingsFile, JcScheduleFile, LeagueId, ResultsFile, SummaryFile, Team, TeamsFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { TeamMark } from '../components/TeamMark';
import { useSeasonState } from '../season/useSeasonState';
import { addedKey, jcTickerItems, tickerItems, type TickerItem, type TickerSide } from './tickerItems';
import { SHORT_LABEL } from './useCurrentLeague';

function Side({ side, team, season }: { side: TickerSide; team?: Team; season: number }) {
  return (
    <span className={`side${side.won ? ' won' : ''}`}>
      {team && <TeamMark team={team} season={season} size={16} />}
      {side.rank !== undefined && <span className="rank" title={`Ranked #${side.rank}`}>{side.rank}</span>}
      <span className="abbr">{team?.abbr ?? side.teamId}</span>
      <span className="val">{side.value}</span>
    </span>
  );
}

export function TickerChip({ item, teams, season }: { item: TickerItem; teams: Team[]; season: number }) {
  const find = (id: string | null) => (id ? teams.find(t => t.teamId === id) : undefined);
  const body = item.kind === 'score'
    ? <><Side side={item.away} team={find(item.away.teamId)} season={season} /><Side side={item.home} team={find(item.home.teamId)} season={season} /><span className="note">{item.note}</span></>
    : <>{item.badge && <span className="note">{item.badge}</span>}<span className="side won">{find(item.teamId) && <TeamMark team={find(item.teamId)!} season={season} size={16} />}<span className="txt">{item.text}</span></span></>;
  return item.to ? <Link className="ticker-chip" to={item.to} data-key={item.key}>{body}</Link> : <span className="ticker-chip" data-key={item.key}>{body}</span>;
}

/** Row 2 of the header: recent results or offseason news for the current league. Read-only. */
export function Ticker({ league }: { league: LeagueId }) {
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const { state } = useSeasonState(lg);
  const { data: calendar } = useDoc<CalendarFile>('calendar.json');
  const { data: lastSummary } = useDoc<SummaryFile>(lg && state ? seasonDocPath('summary', lg, state.season - 1) : null);
  // FBAJC has no season state: its latest results come straight from its own results and schedule files.
  const jc = league === 'fbajc';
  const jcSeason = jc ? calendar?.season ?? null : null;
  const jcTeams = useDoc<TeamsFile>(jc ? 'leagues/fbajc/teams.json' : null);
  const jcResults = useDoc<ResultsFile>(jcSeason === null ? null : `leagues/fbajc/S${jcSeason}/results.json`);
  const jcSchedule = useDoc<JcScheduleFile>(jcSeason === null ? null : `leagues/fbajc/S${jcSeason}/schedule.json`);
  const jcRankings = useDoc<JcRankingsFile>(jcSeason === null ? null : `leagues/fbajc/S${jcSeason}/rankings.json`);
  const t = jc
    ? jcTickerItems({ label: SHORT_LABEL[league], results: jcResults.data?.games ?? [], schedule: jcSchedule.data ?? null, calendar: calendar ?? undefined, ranks: pollRanks(jcRankings.data?.snapshots) })
    : tickerItems({ league, label: SHORT_LABEL[league], state, lastSummary, calendar });
  const row = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [t.items.length]);
  // When a new result arrives the row moves to it by itself; between results it is free to scroll by hand.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const keys = t.items.map(i => i.key);
    const key = addedKey(seen.current, t.items, jc);
    seen.current = new Set(keys);
    const el = row.current;
    if (key === null || !el) return;
    const chip = [...el.querySelectorAll<HTMLElement>('[data-key]')].find(c => c.dataset.key === key);
    if (!chip) return;
    const r = el.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    const left = el.scrollLeft + (c.left - r.left) - (el.clientWidth - c.width) / 2;
    el.scrollTo?.({ left: Math.max(0, left), behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [t.items.map(i => i.key).join('|')]);
  const scroll = (dx: number) => row.current?.scrollBy?.({ left: dx, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const teams = jc ? jcTeams.data?.teams ?? [] : state?.teams.teams ?? [];
  const season = jc ? jcSeason ?? 1 : state?.season ?? calendar?.season ?? 1;
  return (
    <section className="ticker" aria-label="Latest results">
      <div className="ticker-label">{t.label}</div>
      {overflow && <button type="button" className="ticker-btn" aria-label="Scroll results left" onClick={() => scroll(-320)}>◀</button>}
      <div ref={row} className="ticker-row">
        {t.items.map(it => <TickerChip key={it.key} item={it} teams={teams} season={season} />)}
      </div>
      {overflow && <button type="button" className="ticker-btn" aria-label="Scroll results right" onClick={() => scroll(320)}>▶</button>}
    </section>
  );
}
