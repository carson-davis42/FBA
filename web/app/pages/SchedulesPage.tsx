import { useState } from 'react';
import { makeSchedules, scheduleStepProblem } from '../../engine/season/moves';
import { gameDays } from '../../engine/season/schedule';
import type { CalendarFile, MetaFile, ResultsFile, ScheduleFile, TeamsFile } from '../../engine/shared/types';
import { useDoc, useSaving, type Versions } from '../api';
import { PageHeader } from '../components/PageHeader';
import { TeamName } from '../components/TeamName';
import { commitDocs } from '../roster/commit';
import './season.css';

const LABEL = { fba: 'FBA', fbad2: 'D2' } as const;

export function SchedulesPage() {
  const saving = useSaving();
  const meta = useDoc<MetaFile>('meta.json');
  const season = meta.data?.currentSeason;
  const p = (league: 'fba' | 'fbad2', doc: string) => (season === undefined ? null : `leagues/${league}/S${season}/${doc}.json`);
  const cal = useDoc<CalendarFile>('calendar.json');
  const fbaTeams = useDoc<TeamsFile>('leagues/fba/teams.json');
  const d2Teams = useDoc<TeamsFile>('leagues/fbad2/teams.json');
  const fbaSched = useDoc<ScheduleFile>(p('fba', 'schedule'));
  const fbaRes = useDoc<ResultsFile>(p('fba', 'results'));
  const d2Sched = useDoc<ScheduleFile>(p('fbad2', 'schedule'));
  const d2Res = useDoc<ResultsFile>(p('fbad2', 'results'));
  const [message, setMessage] = useState('');

  const required = [meta, cal, fbaTeams, d2Teams];
  const optional = [fbaSched, fbaRes, d2Sched, d2Res];
  const error = required.find(d => d.error)?.error ?? optional.find(d => d.error && !d.missing)?.error;
  if (error) {
    return <p className="error">{error.message}</p>;
  }
  if (season === undefined || !cal.data || !fbaTeams.data || !d2Teams.data || optional.some(d => !d.data && !d.missing)) {
    return <p className="muted">Loading…</p>;
  }
  const leagues = [
    { league: 'fba' as const, teams: fbaTeams.data, schedule: fbaSched.data ?? null, results: fbaRes.data ?? null },
    { league: 'fbad2' as const, teams: d2Teams.data, schedule: d2Sched.data ?? null, results: d2Res.data ?? null },
  ];
  const played = leagues.reduce((n, l) => n + (l.results?.games.length ?? 0), 0);
  const exists = leagues.some(l => l.schedule);
  const stepProblem = scheduleStepProblem(cal.data, season);

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
    <section className="stack">
      <PageHeader kicker="Regular season" title={`S${season} schedules`} actions={
        <button className="btn primary" disabled={saving || played > 0 || !!stepProblem} onClick={make}>{exists ? 'Re-roll schedules' : 'Make schedules'}</button>
      } />
      {leagues.map(l => {
        const perTeam = l.schedule && l.teams.teams.length ? (l.schedule.games.length * 2) / l.teams.teams.length : 0;
        const days = l.schedule ? gameDays(l.schedule.games) : [];
        return (
          <div className="card headed schedule-card" key={l.league}>
            <div className="card-head"><h3>{LABEL[l.league]}</h3></div>
            {l.schedule
              ? <p>{LABEL[l.league]}: {l.schedule.games.length} games · {perTeam} per team · {days.length} game days · {l.results?.games.length ?? 0} played</p>
              : <p className="muted">{LABEL[l.league]}: not made yet</p>}
            {l.schedule && days[0] && (
              <>
                <p className="muted">Day 1</p>
                <div className="table-wrap">
                  <table className="stat-table">
                    <thead><tr><th>Away</th><th>Home</th></tr></thead>
                    <tbody>
                      {days[0].map(n => {
                        const g = l.schedule!.games[n - 1];
                        const team = (id: string) => { const t = l.teams.teams.find(x => x.teamId === id); return t ? <TeamName team={t} season={season} variant="abbr" size={20} /> : id; };
                        return <tr key={n}><td>{team(g.away)}</td><td>{team(g.home)}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        );
      })}
      {stepProblem && <p className="muted">{stepProblem}</p>}
      {!stepProblem && played > 0 && <p className="muted">Games have been played, so the schedules can't be re-rolled.</p>}
      {message && <p className="error">{message}</p>}
    </section>
  );
}
