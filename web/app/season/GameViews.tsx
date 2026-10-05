import type { CSSProperties, ReactNode } from 'react';
import { records } from '../../engine/season/standings';
import { playerName, type SeasonState } from '../../engine/season/state';
import type { GameResult, Team } from '../../engine/shared/types';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { TeamMark } from '../components/TeamMark';
import { TeamName } from '../components/TeamName';
import { teamTheme, teamVars } from '../components/teamColors';
import { useSort } from '../components/useSort';
import { SortTh } from '../components/SortTh';
import { LEAGUE_LABEL } from '../../engine/shared/leagues';
import { PlayerName } from '../components/PlayerName';

export const periodName = (p: number) => (p <= 4 ? `Q${p}` : p === 5 ? 'OT' : `${p - 4}OT`);

/** The team with this id, or undefined (imported seasons can name a team that is gone). */
const teamOf = (state: SeasonState, id: string): Team | undefined => state.teams.teams.find(t => t.teamId === id);

/** A team's abbreviation with its logo, or the bare id when the team is unknown. */
export function teamLabel(state: SeasonState, id: string): ReactNode {
  const t = teamOf(state, id);
  return t ? <TeamName team={t} season={state.season} variant="abbr" size={20} /> : id;
}

/** The two halves of the ASG-style scoreboard use the accent colours, because those teams have no Team object. */
export const ACCENT_SIDES: CSSProperties[] = [
  { '--team': 'var(--accent)', '--team-2': 'var(--hero-to)', '--team-ink': 'var(--masthead-text)' } as CSSProperties,
  { '--team': 'var(--hero-to)', '--team-2': 'var(--accent)', '--team-ink': 'var(--masthead-text)' } as CSSProperties,
];

export interface BugSide { label: string; score: number | string; team?: Team; season?: number; style: CSSProperties; /** Small line under the label, such as a record. */ sub?: string }

/** A side of the scorebug for a real team, in its colours. */
export function bugSide(state: SeasonState, teamId: string, score: number, opts: { full?: boolean; record?: boolean } = {}): BugSide {
  const t = teamOf(state, teamId);
  const rec = opts.record && state.results ? records(state.teams.teams.map(x => ({ teamId: x.teamId, group: x.group })), state.results.games).get(teamId) : undefined;
  return t
    ? { label: opts.full ? t.name : t.abbr, sub: rec ? `${rec.w}-${rec.l}` : undefined, score, team: t, season: state.season, style: teamVars(teamTheme(t, state.league)) }
    : { label: teamId, score, style: ACCENT_SIDES[0] };
}

function Half({ side, cls }: { side: BugSide; cls: string }) {
  return (
    <div className={`scorebug-side ${cls}`} style={side.style}>
      {side.team && side.season !== undefined && <TeamMark team={side.team} season={side.season} size={36} />}
      <span className="abbr">{side.label}{side.sub && <small className="rec">{side.sub}</small>}</span>
      <span className="score">{side.score}</span>
    </div>
  );
}

/** Away and home halves in their own colours, with the period or clock in the middle. */
export function ScoreBug({ away, home, middle }: { away: BugSide; home: BugSide; middle?: ReactNode }) {
  return (
    <div className="scorebug">
      <Half side={away} cls="away" />
      {middle !== undefined && <div className="clock">{middle}</div>}
      <Half side={home} cls="home" />
    </div>
  );
}

/** Scoreboard for two named sides with no Team object (the All-Star teams). */
export function SidesBug({ sides, totals }: { sides: string[]; totals: number[] }) {
  return (
    <div className="scorebug">
      {sides.map((s, i) => <Half key={s} cls={i === 0 ? 'away' : 'home'} side={{ label: s, score: totals[i], style: ACCENT_SIDES[i % 2] }} />)}
    </div>
  );
}

export function LineScore({ home, away, periods }: { home: ReactNode; away: ReactNode; periods: { home: number[]; away: number[] } }) {
  return (
    <div className="table-wrap">
      <table className="stat-table line-score">
        <thead><tr><th></th>{periods.home.map((_, i) => <th key={i} className="n">{periodName(i + 1)}</th>)}<th className="n">T</th></tr></thead>
        <tbody>
          <tr><td>{away}</td>{periods.away.map((p, i) => <td key={i} className="n">{p}</td>)}<td className="n"><strong>{periods.away.reduce((a, b) => a + b, 0)}</strong></td></tr>
          <tr><td>{home}</td>{periods.home.map((p, i) => <td key={i} className="n">{p}</td>)}<td className="n"><strong>{periods.home.reduce((a, b) => a + b, 0)}</strong></td></tr>
        </tbody>
      </table>
    </div>
  );
}

type BoxRow = { playerId: string; pts: number };
const boxValue = (r: BoxRow, key: string) => (key === 'pts' ? r.pts : null);

export function BoxTable({ state, title, lines }: { state: SeasonState; title: ReactNode; lines: BoxRow[] }) {
  const { rows, sortProps } = useSort(lines, boxValue);
  return (
    <div className="table-wrap">
      <table className="stat-table box-score">
        <thead><tr><th>{title}</th><SortTh label="PTS" className="n" {...sortProps('pts')} /></tr></thead>
        <tbody>{rows.map(l => <tr key={l.playerId}><td><PlayerName id={l.playerId} name={playerName(state, l.playerId)} /></td><td className="n">{l.pts}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function FinalView({ state, r }: { state: SeasonState; r: GameResult }) {
  const title = `Final${r.ot ? (r.ot > 1 ? ` (${r.ot}OT)` : ' (OT)') : ''}: ${r.away} ${r.awayPts} @ ${r.home} ${r.homePts}`;
  return (
    <section className="stack">
      <PageHeader kicker={`${LEAGUE_LABEL[state.league]} · S${state.season} · Game ${r.gameNo}`} title={title} />
      <ScoreBug
        away={bugSide(state, r.away, r.awayPts)}
        home={bugSide(state, r.home, r.homePts)}
        middle={<Badge kind="final">{r.ot ? (r.ot > 1 ? `${r.ot}OT` : 'OT') : 'Full time'}</Badge>}
      />
      {r.periods && <LineScore home={teamLabel(state, r.home)} away={teamLabel(state, r.away)} periods={r.periods} />}
      {r.box && (
        <div className="live-grid">
          <BoxTable state={state} title={teamLabel(state, r.away)} lines={r.box.away} />
          <BoxTable state={state} title={teamLabel(state, r.home)} lines={r.box.home} />
        </div>
      )}
    </section>
  );
}
