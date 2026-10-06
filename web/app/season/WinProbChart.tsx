import type { CSSProperties } from 'react';
import type { SimGame } from '../../engine/season/sim';
import type { SeasonState } from '../../engine/season/state';
import { teamTheme } from '../components/teamColors';
import { TeamMark } from '../components/TeamMark';
import { periodName } from './GameViews';

const W = 300, H = 120, MID = H / 2;

interface Piece { home: boolean; pts: [number, number][] }

/** Splits the home win-probability line into runs on one side of 50%, cutting exactly at each crossing. */
function pieces(history: number[], total: number): Piece[] {
  const pt = (i: number): [number, number] => [(i / Math.max(1, total)) * W, history[i] * H];
  const out: Piece[] = [];
  history.forEach((v, i) => {
    const home = v >= 0.5;
    const cur = out[out.length - 1];
    if (!cur) { out.push({ home, pts: [pt(i)] }); return; }
    if (cur.home !== home) {
      const prev = history[i - 1];
      const t = (0.5 - prev) / (v - prev);
      const [x0] = pt(i - 1), [x1] = pt(i);
      const cross: [number, number] = [x0 + (x1 - x0) * t, MID];
      cur.pts.push(cross);
      out.push({ home, pts: [cross, pt(i)] });
    } else cur.pts.push(pt(i));
  });
  return out;
}

function Key({ state, sim, side, pct }: { state: SeasonState; sim: SimGame; side: 'home' | 'away'; pct: number }) {
  const team = state.teams.teams.find(t => t.teamId === sim[side].teamId);
  return (
    <div className={`wp-key wp-key-${side}`}>
      {team && <TeamMark team={team} season={state.season} size={28} decorative />}
      <span className="wp-abbr">{sim[side].teamId}</span>
      <svg className="wp-swatch" width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" strokeDasharray={side === 'away' ? '6 3' : undefined} /></svg>
      <b className="wp-pct">{Math.round(pct * 100)}%</b>
    </div>
  );
}

/** Both teams' chances through the game: the away team's 100% is the top edge, the home team's the bottom. */
export function WinProbChart({ state, sim, history, prob }: { state: SeasonState; sim: SimGame; history: number[]; prob: number }) {
  const total = sim.possessions.length;
  const colour = (side: 'home' | 'away'): CSSProperties => {
    const t = state.teams.teams.find(x => x.teamId === sim[side].teamId);
    return { color: t ? teamTheme(t, state.league).primary : side === 'home' ? 'var(--accent)' : 'var(--hero-to)' };
  };
  const starts: { period: number; at: number }[] = [];
  sim.possessions.forEach((p, i) => { if (!starts.some(s => s.period === p.period)) starts.push({ period: p.period, at: i }); });
  return (
    <div className="wp-chart" role="img" aria-label={`Win probability: ${sim.away.teamId} ${Math.round((1 - prob) * 100)}%, ${sim.home.teamId} ${Math.round(prob * 100)}%`}>
      <div style={colour('away')}><Key state={state} sim={sim} side="away" pct={1 - prob} /></div>
      <div className="wp-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="140">
          {[0.25, 0.75].map(y => <line key={y} className="wp-grid" x1="0" y1={y * H} x2={W} y2={y * H} />)}
          {starts.slice(1).map(s => <line key={s.period} className="wp-grid" x1={(s.at / total) * W} y1="0" x2={(s.at / total) * W} y2={H} />)}
          <line className="wp-mid" x1="0" y1={MID} x2={W} y2={MID} />
          {pieces(history, total).map((p, i) => {
            const side = p.home ? 'home' : 'away';
            const line = p.pts.map(([x, y]) => `${x},${y}`).join(' ');
            const first = p.pts[0], last = p.pts[p.pts.length - 1];
            return (
              <g key={i} style={colour(side)}>
                <polygon className="wp-fill" points={`${first[0]},${MID} ${line} ${last[0]},${MID}`} />
                <polyline className={`wp-line wp-line-${side}`} fill="none" points={line} />
              </g>
            );
          })}
        </svg>
        <span className="wp-y wp-y-top">100</span><span className="wp-y wp-y-mid">50</span><span className="wp-y wp-y-bot">100</span>
        <div className="wp-periods">
          {starts.map((s, i) => {
            const from = s.at / total, to = (starts[i + 1]?.at ?? total) / total;
            return <span key={s.period} style={{ left: `${((from + to) / 2) * 100}%` }}>{periodName(s.period)}</span>;
          })}
        </div>
      </div>
      <div style={colour('home')}><Key state={state} sim={sim} side="home" pct={prob} /></div>
    </div>
  );
}
