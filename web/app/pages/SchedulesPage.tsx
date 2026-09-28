import { useState } from 'react';
import { makeSchedules } from '../../engine/season/moves';
import { gameDays } from '../../engine/season/schedule';
import type { CalendarFile, MetaFile, ResultsFile, ScheduleFile, TeamsFile } from '../../engine/shared/types';
import { useDoc, useSaving, type Versions } from '../api';
import { commitDocs } from '../roster/commit';
import './season.css';

const LABEL = { fba: 'FBA', fbad2: 'D2' } as const;

export function SchedulesPage() {
  const saving = useSaving();
  const { data: meta } = useDoc<MetaFile>('meta.json');
  const season = meta?.currentSeason;
  const p = (league: 'fba' | 'fbad2', doc: string) => (season === undefined ? null : `leagues/${league}/S${season}/${doc}.json`);
  const cal = useDoc<CalendarFile>('calendar.json');
  const fbaTeams = useDoc<TeamsFile>('leagues/fba/teams.json');
  const d2Teams = useDoc<TeamsFile>('leagues/fbad2/teams.json');
  const fbaSched = useDoc<ScheduleFile>(p('fba', 'schedule'));
  const fbaRes = useDoc<ResultsFile>(p('fba', 'results'));
  const d2Sched = useDoc<ScheduleFile>(p('fbad2', 'schedule'));
  const d2Res = useDoc<ResultsFile>(p('fbad2', 'results'));
  const [message, setMessage] = useState('');

  const optional = [fbaSched, fbaRes, d2Sched, d2Res];
  if (season === undefined || !cal.data || !fbaTeams.data || !d2Teams.data || optional.some(d => !d.data && !d.missing)) {
    return <p className="muted">Loading…</p>;
  }
  const leagues = [
    { league: 'fba' as const, teams: fbaTeams.data, schedule: fbaSched.data ?? null, results: fbaRes.data ?? null },
    { league: 'fbad2' as const, teams: d2Teams.data, schedule: d2Sched.data ?? null, results: d2Res.data ?? null },
  ];
  const played = leagues.reduce((n, l) => n + (l.results?.games.length ?? 0), 0);
  const exists = leagues.some(l => l.schedule);

  const make = async () => {
    const r = makeSchedules({
      season, calendar: cal.data!,
      fba: { teams: leagues[0].teams, schedule: leagues[0].schedule, results: leagues[0].results },
      fbad2: { teams: leagues[1].teams, schedule: leagues[1].schedule, results: leagues[1].results },
    }, Math.random);
    if (!r.ok) {
      setMessage(r.problems.join('; '));
      return;
    }
    const versions: Versions = {
      [p('fba', 'schedule')!]: fbaSched.version, [p('fba', 'results')!]: fbaRes.version,
      [p('fbad2', 'schedule')!]: d2Sched.version, [p('fbad2', 'results')!]: d2Res.version,
      'calendar.json': cal.version,
    };
    setMessage('');
    try {
      await commitDocs(r.label, r.writes, versions);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <section>
      <h1>S{season} schedules</h1>
      {leagues.map(l => {
        const perTeam = l.schedule && l.teams.teams.length ? (l.schedule.games.length * 2) / l.teams.teams.length : 0;
        const days = l.schedule ? gameDays(l.schedule.games) : [];
        return (
          <div className="card schedule-card" key={l.league}>
            <h3>{LABEL[l.league]}</h3>
            {l.schedule
              ? <p>{LABEL[l.league]}: {l.schedule.games.length} games · {perTeam} per team · {days.length} game days · {l.results?.games.length ?? 0} played</p>
              : <p className="muted">{LABEL[l.league]}: not made yet</p>}
            {l.schedule && days[0] && (
              <p className="muted">Day 1: {days[0].map(n => `${l.schedule!.games[n - 1].away} @ ${l.schedule!.games[n - 1].home}`).join(' · ')}</p>
            )}
          </div>
        );
      })}
      <button className="btn primary" disabled={saving || played > 0} onClick={make}>{exists ? 'Re-roll schedules' : 'Make schedules'}</button>
      {played > 0 && <p className="muted">Games have been played, so the schedules can't be re-rolled.</p>}
      {message && <p className="error">{message}</p>}
    </section>
  );
}
