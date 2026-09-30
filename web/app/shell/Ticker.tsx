import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { seasonDocPath } from '../../engine/season/state';
import type { CalendarFile, LeagueId, SummaryFile, Team } from '../../engine/shared/types';
import { useDoc } from '../api';
import { TeamMark } from '../components/TeamMark';
import { useSeasonState } from '../season/useSeasonState';
import { tickerItems, type TickerItem, type TickerSide } from './tickerItems';
import { SHORT_LABEL } from './useCurrentLeague';

function Side({ side, team, season }: { side: TickerSide; team?: Team; season: number }) {
  return (
    <span className={`side${side.won ? ' won' : ''}`}>
      {team && <TeamMark team={team} season={season} size={16} />}
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
  return item.to ? <Link className="ticker-chip" to={item.to}>{body}</Link> : <span className="ticker-chip">{body}</span>;
}

/** Row 2 of the header: recent results or offseason news for the current league. Read-only. */
export function Ticker({ league }: { league: LeagueId }) {
  const lg = league === 'fba' || league === 'fbad2' ? league : null;
  const { state } = useSeasonState(lg);
  const { data: calendar } = useDoc<CalendarFile>('calendar.json');
  const { data: lastSummary } = useDoc<SummaryFile>(lg && state ? seasonDocPath('summary', lg, state.season - 1) : null);
  const t = tickerItems({ league, label: SHORT_LABEL[league], state, lastSummary, calendar });
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
  const scroll = (dx: number) => row.current?.scrollBy?.({ left: dx, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const teams = state?.teams.teams ?? [];
  const season = state?.season ?? calendar?.season ?? 1;
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
