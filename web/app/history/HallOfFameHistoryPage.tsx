import type { HofCard, HallOfFameFile, PlayersFile } from '../../engine/shared/types';
import { useDoc, useHistory } from '../api';
import { PlayerLink, SkippedWarning } from './PlayerLink';
import '../pages/league.css';

/** A stored career line: "TEAM: S64" or "TEAM: S65-S76" (FFL or pres. allowed). Everything else is an honour. */
const CAREER_LINE = /^[^:]+: (S\d+|FFL)(-(S\d+|FFL|pres\.))?$/;

function Card({ card, players }: { card: HofCard; players: PlayersFile }) {
  const career = card.lines.filter(l => CAREER_LINE.test(l));
  const honours = card.lines.filter(l => !CAREER_LINE.test(l));
  return (
    <div className="hof-card">
      <h3>{card.playerId ? <PlayerLink id={card.playerId} players={players} /> : card.name}</h3>
      <div className="muted">Retired {card.retiredSeason}</div>
      {career.length > 0 && (
        <>
          <div className="muted">Career</div>
          <ul aria-label="Career">{career.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </>
      )}
      {honours.length > 0 && (
        <>
          <div className="muted">Honours</div>
          <ul aria-label="Honours">{honours.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </>
      )}
    </div>
  );
}

/** The Hall of Fame (/history/fba/hall-of-fame): inducted classes, newest first. Read-only. */
export function HallOfFameHistoryPage() {
  const { seasons, errors, error } = useHistory('fba');
  const players = useDoc<PlayersFile>('players.json');
  const hof = useDoc<HallOfFameFile>('leagues/fba/hallOfFame.json');
  const failure = error ?? players.error ?? (hof.missing ? undefined : hof.error);
  if (failure) return <p className="error">Couldn't load the Hall of Fame: {failure.message}</p>;
  if (!seasons || !players.data || (!hof.data && !hof.missing)) return <p className="muted">Loading…</p>;
  const classes = hof.data ? [...hof.data.classes].reverse() : [];
  return (
    <section>
      <h1>Hall of Fame</h1>
      <SkippedWarning errors={errors} />
      {classes.map(c => (
        <div key={c.season}>
          <h2>{c.season}</h2>
          <div className="hof-grid">
            {c.inductees.map((card, i) => <Card key={`${card.name}${i}`} card={card} players={players.data!} />)}
          </div>
        </div>
      ))}
      {classes.length === 0 && <p className="muted">No one has been inducted yet.</p>}
    </section>
  );
}
