import { pollRanks } from '../../engine/jc/rankings';
import type { CalendarFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { PageHeader } from '../components/PageHeader';
import { jcGate } from './JcGate';
import { TournamentCard } from './TournamentCard';
import { useJcDocs } from './useJcDocs';
import './jc.css';

export function TournamentsPage() {
  const calendar = useDoc<CalendarFile>('calendar.json');
  const season = calendar.data?.season ?? null;
  const docs = useJcDocs(season);
  const kicker = 'Junior College';

  if (season === null) return <section className="jc-page"><PageHeader kicker={kicker} title="Tournaments" /></section>;
  const gate = jcGate(docs, kicker, 'Tournaments');
  if (gate) return <>{gate}</>;
  const state = docs.state!;
  const title = state.schedule ? `S${season} FBAJC Tournaments` : 'Tournaments';
  if (!state.schedule) return <section className="jc-page"><PageHeader kicker={kicker} title={title} /><p className="muted">The season has not started.</p></section>;
  const ranks = pollRanks(state.rankings?.snapshots);

  return (
    <section className="jc-page">
      <PageHeader kicker={kicker} title={title} />
      <div className="jc-tournaments">
        {state.schedule.tournaments.map(f => <TournamentCard key={f.id} field={f} state={state} season={season} ranks={ranks} />)}
      </div>
    </section>
  );
}
