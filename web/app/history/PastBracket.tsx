import { useState } from 'react';
import type { FranchisesFile, PastBracket as PastBracketDoc, PastSeries, PastSide, Team } from '../../engine/shared/types';
import { ChampBadge, SideRow } from '../playoffs/Bracket';
import { TeamFull } from './useTeams';

const SCORE = /^(\d+)[–-](\d+)(?: (\d?OT))?$/;

function Side({ side, wins, won, teams, franchises, season, showRecords }: { side: PastSide | null; wins: number | string; won: boolean; teams: Team[]; franchises: FranchisesFile | null; season: number; showRecords: boolean }) {
  if (!side) return <SideRow seed={null} name="BYE" wins={null} won={false} />;
  return (
    <SideRow
      seed={side.seed}
      name={<>
        <TeamFull teams={teams} franchises={franchises} name={side.name} season={season} variant="abbr" size={20} />
        {showRecords && side.record && <span className="rec">{side.record}</span>}
      </>}
      wins={wins}
      won={won}
    />
  );
}

interface BracketProps { bracket: PastBracketDoc; teams: Team[]; season: number; franchises: FranchisesFile | null; showRecords: boolean }

/** One game or series box: points or wins beside each side, an OT tag, the champion badge on the final. */
function SeriesBox({ s, finals, ...rest }: { s: PastSeries; finals: boolean } & Omit<BracketProps, 'bracket'>) {
  const none = s.unscored ? '' : null;
  const m = s.score ? SCORE.exec(s.score) : null;
  const pts = m ? [m[1], m[2]] : null;
  const winHome = s.winner === 'home';
  return (
    <div className={`series-box${s.score || s.unscored ? ' past' : ''}${finals ? ' finals' : ''}${s.winner ? ' decided' : ''}`}>
      {finals && s.winner && <ChampBadge />}
      <Side side={s.home} wins={none ?? (pts ? pts[winHome ? 0 : 1] : s.homeWins)} won={s.winner === 'home'} {...rest} />
      <Side side={s.away} wins={none ?? (pts ? pts[winHome ? 1 : 0] : s.awayWins)} won={s.winner === 'away'} {...rest} />
      {m?.[3] && <span className="series-ot">{m[3]}</span>}
    </div>
  );
}

/** What a round is called by the number of teams still in it: Round of 64, Round of 32, Sweet 16, Elite 8, Final Four, Championship. */
export function roundLabel(rounds: number, round: number): string {
  const teams = 2 ** (rounds - round + 1);
  return teams === 2 ? 'Championship' : teams === 4 ? 'Final Four' : teams === 8 ? 'Elite 8' : teams === 16 ? 'Sweet 16' : `Round of ${teams}`;
}

/** The big college pages (32 or 64 slots): one round at a time as a vertical list of games, with tabs to move between rounds. No sideways scrolling. */
function RoundsBracket({ bracket, ...rest }: BracketProps) {
  const R = bracket.rounds;
  const num = (id: string) => Number(id.split('-')[1]);
  const rounds = Array.from({ length: R }, (_, i) => i + 1).map(r => {
    const all = bracket.series.filter(s => s.round === r && (s.home || s.away)).sort((a, b) => num(a.id) - num(b.id));
    return { r, games: all.filter(s => s.home && s.away), byes: all.filter(s => !s.home || !s.away) };
  }).filter(x => x.games.length > 0);
  const [picked, setPicked] = useState<number | null>(null);
  if (rounds.length === 0) return null;
  const at = Math.max(0, rounds.findIndex(x => x.r === picked));
  const cur = rounds[at];
  const final = bracket.series.find(s => s.round === R);
  const champion = final ? final[final.winner] : null;
  const go = (i: number) => setPicked(rounds[i].r);
  return (
    <div className="rounds-bracket">
      {champion && (
        <div className="bracket-champion">
          <ChampBadge />
          <Side side={champion} wins="" won teams={rest.teams} franchises={rest.franchises} season={rest.season} showRecords={rest.showRecords} />
        </div>
      )}
      <div className="round-tabs" role="tablist" aria-label="Rounds">
        {rounds.map((x, i) => (
          <button key={x.r} type="button" role="tab" aria-selected={i === at} className={`chip${i === at ? ' active' : ''}`} onClick={() => go(i)}>{roundLabel(R, x.r)}</button>
        ))}
      </div>
      <div role="tabpanel" aria-label={roundLabel(R, cur.r)}>
        <h3 className="round-title">{roundLabel(R, cur.r)} <span className="muted">· {cur.games.length} {cur.games.length === 1 ? 'game' : 'games'}</span></h3>
        <div className="round-games">
          {cur.games.map(s => <SeriesBox key={s.id} s={s} finals={cur.r === R} {...rest} />)}
        </div>
        {cur.byes.length > 0 && (
          <p className="muted round-byes">Byes: {cur.byes.map(s => (s.home ?? s.away)!.name).join(', ')}</p>
        )}
      </div>
      <div className="round-nav">
        <button type="button" className="btn" disabled={at === 0} onClick={() => go(at - 1)}>← {at > 0 ? roundLabel(R, rounds[at - 1].r) : 'Previous'}</button>
        <button type="button" className="btn" disabled={at === rounds.length - 1} onClick={() => go(at + 1)}>{at < rounds.length - 1 ? roundLabel(R, rounds[at + 1].r) : 'Next'} →</button>
      </div>
    </div>
  );
}

/** The small brackets (up to 16 teams) in the app bracket's style: left half, the final, mirrored right half. */
function TreeBracket({ bracket, ...rest }: BracketProps) {
  const R = bracket.rounds;
  const byId = new Map(bracket.series.map(s => [s.id, s]));
  const pick = (r: number, half: 'left' | 'right'): PastSeries[] => {
    const n = 2 ** (R - r);
    const out: PastSeries[] = [];
    for (let k = half === 'left' ? 1 : n / 2 + 1; k <= (half === 'left' ? n / 2 : n); k++) {
      const s = byId.get(`R${r}-${k}`);
      if (s) out.push(s);
    }
    return out;
  };
  const left = Array.from({ length: R - 1 }, (_, i) => pick(i + 1, 'left'));
  const right = Array.from({ length: R - 1 }, (_, i) => pick(R - 1 - i, 'right'));
  const centre = [byId.get(`R${R}-1`)].filter((s): s is PastSeries => !!s);
  const columns = [
    ...left.map(col => ({ col, dir: 'l' })),
    { col: centre, dir: 'mid' },
    ...right.map(col => ({ col, dir: 'r' })),
  ];
  return (
    <div className="bracket">
      {columns.map(({ col, dir }, k) => (
        <div key={k} className={`bracket-col ${dir}`}>
          {col.map(s => (!s.home && !s.away
            ? <div key={s.id} className="series-box empty" aria-hidden="true" />
            : <SeriesBox key={s.id} s={s} finals={dir === 'mid'} {...rest} />))}
        </div>
      ))}
    </div>
  );
}

/**
 * A transcribed historical bracket. Pages of 32 or more slots (the college pages) show one round at a time as a vertical list with round tabs,
 * like a phone bracket app; smaller ones keep the two-sided tree. A scored game shows its points (with an OT tag), `showRecords` prints each
 * team's record after its name, and `layout` forces one of the two views.
 */
export function PastBracket({ bracket, teams, season, franchises = null, showRecords = false, layout = 'auto' }: {
  bracket: PastBracketDoc; teams: Team[]; season: number; franchises?: FranchisesFile | null; showRecords?: boolean; layout?: 'auto' | 'tree' | 'rounds';
}) {
  const props = { bracket, teams, season, franchises, showRecords };
  const rounds = layout === 'rounds' || (layout === 'auto' && bracket.rounds >= 5);
  return rounds ? <RoundsBracket {...props} /> : <TreeBracket {...props} />;
}
