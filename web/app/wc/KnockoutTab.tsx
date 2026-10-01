import type { KnockoutGame, KnockoutRound, PlayersFile, SummaryFile, Team, WorldCupFile } from '../../engine/shared/types';
import type { WorldCupState } from '../../engine/wc/worldcup';
import { TeamName } from '../components/TeamName';
import { MvpCard } from './MvpCard';
import type { WcFail, WcOkOrWrites } from './useWcRun';

const ROUNDS: { id: KnockoutRound; label: string }[] = [
  { id: 'R32', label: 'Round of 32' },
  { id: 'R16', label: 'Round of 16' },
  { id: 'QF', label: 'Quarter-finals' },
  { id: 'SF', label: 'Semi-finals' },
  { id: 'F', label: 'Final' },
];

export function KnockoutTab({ wc, byId, season, state, players, summary, blocked, run }: {
  wc: WorldCupFile;
  byId: Map<string, Team>;
  season: number;
  state: WorldCupState | null;
  players: PlayersFile | null;
  summary: SummaryFile | null;
  blocked: boolean;
  run: (build: () => WcOkOrWrites | WcFail) => Promise<void>;
}) {
  if (wc.knockout.length === 0) return <p className="muted">The knockout starts when the groups finish.</p>;

  const side = (g: KnockoutGame, which: 'home' | 'away') => {
    const id = g[which];
    const team = id ? byId.get(id) : undefined;
    const score = g.game ? g.game[which === 'home' ? 'homePts' : 'awayPts'] : null;
    const won = !!g.game && !!id && ((g.game.homePts > g.game.awayPts ? g.home : g.away) === id);
    return (
      <div className={`wc-side${won ? ' wc-winner' : ''}`}>
        {id === null ? <span className="muted">TBD</span> : team ? <TeamName team={team} season={season} variant="abbr" size={16} /> : <span>{id}</span>}
        <span className="wc-score">{score ?? ''}</span>
      </div>
    );
  };

  const champ = wc.champion ? byId.get(wc.champion) : undefined;
  return (
    <div className="wc-knockout">
      {wc.champion && (
        <div className="card wc-champion">
          {champ ? <TeamName team={champ} season={season} size={28} /> : <strong>{wc.champion}</strong>}
          <span> World Cup champion</span>
        </div>
      )}
      <div className="table-wrap">
        <div className="wc-bracket">
          {ROUNDS.map(r => (
            <div key={r.id} className={`wc-round${r.id === 'F' ? ' wc-round-final' : ''}`}>
              <h4>{r.label}</h4>
              {wc.knockout.filter(k => k.round === r.id).map(g => (
                <div key={g.id} className="card wc-match" aria-label={g.id}>
                  {side(g, 'home')}
                  {side(g, 'away')}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {wc.champion && <MvpCard wc={wc} state={state} players={players} byId={byId} season={season} summary={summary} blocked={blocked} run={run} />}
    </div>
  );
}
