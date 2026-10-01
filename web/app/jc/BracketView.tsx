import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { roundName } from '../../engine/jc/bracket';
import type { Bracket, BracketGame } from '../../engine/shared/types';

function Side({ game, side, teamCell }: { game: BracketGame; side: 'home' | 'away'; teamCell: (id: string) => ReactNode }) {
  const id = game[side];
  const seed = side === 'home' ? game.homeSeed : game.awaySeed;
  const r = game.result;
  const pts = r ? (side === 'home' ? r.homePts : r.awayPts) : null;
  const won = !!r && (side === 'home' ? r.homePts > r.awayPts : r.awayPts > r.homePts);
  return (
    <div className={`jc-bside${won ? ' jc-winner' : ''}`}>
      <span className="jc-bseed muted">{seed ?? ''}</span>
      <span className="jc-bteam">{id ? teamCell(id) : <span className="muted">TBD</span>}</span>
      <span className="jc-bpts">{pts ?? ''}</span>
    </div>
  );
}

/** A bracket as columns of games, one column per round. `filter` limits it to some games (a region, or the final rounds). */
export function BracketView({ bracket, teamCell, filter, hrefFor }: {
  bracket: Bracket; teamCell: (id: string) => ReactNode; filter?: (g: BracketGame) => boolean;
  /** A link for a game (its box score once played, Watch when it is up next), or null. */
  hrefFor?: (g: BracketGame) => { label: string; to: string } | null;
}) {
  const games = bracket.games.filter(g => !filter || filter(g));
  const rounds = [...new Set(games.map(g => g.round))].sort((a, b) => a - b);
  return (
    <div className="jc-bracket" role="group" aria-label={`${bracket.name} bracket`}>
      {rounds.map(round => (
        <div key={round} className="jc-bround">
          <h3>{roundName(bracket.kind, round)}</h3>
          {games.filter(g => g.round === round).map(g => (
            <div key={g.id} className="jc-bgame card" data-game={g.id}>
              <Side game={g} side="home" teamCell={teamCell} />
              <Side game={g} side="away" teamCell={teamCell} />
              {(() => {
                const link = hrefFor?.(g);
                return link ? <Link className="jc-blink" to={link.to}>{link.label}</Link> : null;
              })()}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
