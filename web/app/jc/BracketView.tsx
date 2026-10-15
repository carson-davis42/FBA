import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { roundName } from '../../engine/jc/bracket';
import type { Bracket, BracketGame } from '../../engine/shared/types';

function Side({ game, side, teamCell, playIn }: { game: BracketGame; side: 'home' | 'away'; teamCell: (id: string) => ReactNode; playIn?: [string, string] | null }) {
  const id = game[side];
  const seed = side === 'home' ? game.homeSeed : game.awaySeed;
  const r = game.result;
  const pts = r ? (side === 'home' ? r.homePts : r.awayPts) : null;
  const won = !!r && (side === 'home' ? r.homePts > r.awayPts : r.awayPts > r.homePts);
  return (
    <div className={`jc-bside${won ? ' jc-winner' : ''}`}>
      <span className="jc-bseed muted">{seed ?? ''}</span>
      <span className="jc-bteam">{id ? teamCell(id) : playIn ? <span className="jc-bplayin">{teamCell(playIn[0])}<span className="muted"> / </span>{teamCell(playIn[1])}</span> : <span className="muted">TBD</span>}</span>
      <span className="jc-bpts">{pts ?? ''}</span>
    </div>
  );
}

/** The two teams of an unplayed First Four game that feeds this open side, or null. */
function playInOf(bracket: Bracket, game: BracketGame, side: 'home' | 'away'): [string, string] | null {
  if (game[side] !== null) return null;
  const feeder = bracket.games.find(x => x.round === 0 && x.result === null && x.next?.id === game.id && x.next.side === side);
  return feeder && feeder.home !== null && feeder.away !== null ? [feeder.home, feeder.away] : null;
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
    <div className="jc-tree" role="group" aria-label={`${bracket.name} bracket`}>
      {rounds.map(round => (
        <div key={round} className="jc-bround">
          <h3>{roundName(bracket.kind, round)}</h3>
          {games.filter(g => g.round === round).map(g => (
            <div key={g.id} className="jc-bslot"><div className="jc-bgame card" data-game={g.id}>
              <Side game={g} side="home" teamCell={teamCell} playIn={playInOf(bracket, g, 'home')} />
              <Side game={g} side="away" teamCell={teamCell} playIn={playInOf(bracket, g, 'away')} />
              {(() => {
                const link = hrefFor?.(g);
                return link ? <Link className="jc-blink" to={link.to}>{link.label}</Link> : null;
              })()}
            </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
