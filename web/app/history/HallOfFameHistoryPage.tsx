import { Link } from 'react-router-dom';
import type { HofCard, HallOfFameFile, PlayersFile } from '../../engine/shared/types';
import { useDoc, useHistory } from '../api';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { PlayerLink, SkippedWarning } from './PlayerLink';
import './history.css';

/** A stored career line: "TEAM: S64", "TEAM: S65-S76" (FFL or pres. allowed) or a multi-part "TEAM: S16-S18;S48". Everything else is an honour. */
const CAREER_LINE = /^[^:]+: (S\d+|FFL)(-(S\d+|FFL|pres\.))?(;(S\d+|FFL)(-(S\d+|FFL|pres\.))?)*$/;

function Card({ card, players, inducted }: { card: HofCard; players: PlayersFile; inducted: string }) {
  const career = card.lines.filter(l => CAREER_LINE.test(l));
  const honours = card.lines.filter(l => !CAREER_LINE.test(l));
  return (
    <div className="card headed plaque hof-card">
      <h3 className="plaque-name">{card.playerId ? <PlayerLink id={card.playerId} players={players} /> : card.name}</h3>
      <div><Badge kind="hof">Class of {inducted}</Badge></div>
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
  const { errors } = useHistory('fba');
  const players = useDoc<PlayersFile>('players.json');
  const hof = useDoc<HallOfFameFile>('leagues/fba/hallOfFame.json');
  // The Hall doesn't use the summaries: the page shows as soon as the Hall and players load, and the warning follows the history.
  const failure = players.error ?? (hof.missing ? undefined : hof.error);
  if (failure) return <p className="error">Couldn't load the Hall of Fame: {failure.message}</p>;
  if (!players.data || (!hof.data && !hof.missing)) return <p className="muted">Loading…</p>;
  const classes = hof.data ? [...hof.data.classes].reverse() : [];
  return (
    <section className="stack">
      <PageHeader kicker="FBA history" title="Hall of Fame" />
      <SkippedWarning errors={errors} />
      {classes.map(c => (
        <div key={c.season}>
          <h2 className="section-title">{c.season}</h2>
          <div className="card-grid">
            {c.inductees.map((card, i) => <Card key={`${card.name}${i}`} card={card} players={players.data!} inducted={c.season} />)}
          </div>
        </div>
      ))}
      {classes.length === 0 && <p className="muted">No one has been inducted yet.</p>}
      <p><Link to="/league/fba/hall-of-fame?tab=nominees">Nominees and induction</Link></p>
    </section>
  );
}
