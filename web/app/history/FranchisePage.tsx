import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { trophyCase, TROPHY_AWARDS } from '../../engine/history/trophies';
import type { CalendarFile, DraftHistoryFile, Franchise, HallOfFameFile, LogoManifest, PlayerBiosFile, PlayersFile, RostersFile } from '../../engine/shared/types';
import { docFailure, docSettled, useDoc, useHistory } from '../api';
import { Hero } from '../components/Hero';
import { teamTheme } from '../components/teamColors';
import { TeamMark } from '../components/TeamMark';
import { SubNav } from '../components/SubNav';
import { EraStrip } from './EraStrip';
import { FranchisePlayers } from './FranchisePlayers';
import { PlayerLink } from './PlayerLink';
import { useFbaTeams } from './useTeams';
import './history.css';

/** The season roster files from S78 (the first with full rosters) through `latest`, once the Players tab asks for them. */
function useRosters(latest: number | null): RostersFile[] | null {
  const [state, setState] = useState<{ latest: number; files: RostersFile[] } | null>(null);
  useEffect(() => {
    if (latest === null) return;
    let live = true;
    const seasons = Array.from({ length: Math.max(0, latest - 77) }, (_, i) => 78 + i);
    Promise.all(seasons.map(n => fetch(`/api/state/leagues/fba/S${n}/rosters.json`)
      .then(res => (res.ok ? res.json() as Promise<RostersFile> : null), () => null)))
      .then(files => { if (live) setState({ latest, files: files.filter((f): f is RostersFile => f !== null) }); });
    return () => { live = false; };
  }, [latest]);
  return latest !== null && state?.latest === latest ? state.files : null;
}

export function FranchisePage() {
  const { teamId = '' } = useParams();
  const { seasons, error } = useHistory('fba');
  const players = useDoc<PlayersFile>('players.json');
  const hof = useDoc<HallOfFameFile>('leagues/fba/hallOfFame.json');
  const drafts = useDoc<DraftHistoryFile>('leagues/fba/draftHistory.json');
  const manifest = useDoc<LogoManifest>('logos/manifest.json');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'players' ? 'players' : 'overview';
  const bios = useDoc<PlayerBiosFile>(tab === 'players' ? 'leagues/fba/playerBios.json' : null);
  const calendar = useDoc<CalendarFile>('calendar.json');
  const rosters = useRosters(tab === 'players' ? Math.max(79, calendar.data?.season ?? 0) : null);
  const { settled, teams, franchises } = useFbaTeams();
  const failure = error ?? players.error ?? docFailure(hof) ?? docFailure(drafts) ?? docFailure(manifest) ?? docFailure(bios);
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || !settled || !docSettled(hof) || !docSettled(drafts) || !docSettled(manifest) || (tab === 'players' && (!docSettled(bios) || rosters === null))) return <p className="muted">Loading…</p>;

  if (!franchises) return <p className="muted">No franchise history yet. Run npm run import -- --franchises.</p>;

  const playerDoc: PlayersFile = players.data;
  const team = teams.find(t => t.teamId === teamId);
  const franchise: Franchise | undefined = franchises.franchises.find(f => f.teamId === teamId)
    ?? (team ? { teamId, eras: [{ name: team.name, abbr: team.abbr, city: '', from: 1, to: null }] } : undefined);
  if (!franchise) return <p className="error">Unknown franchise "{teamId}".</p>;

  // The logo is the team's current one: the calendar's season, which runs ahead of the last finished season's summary.
  const latest = Math.max(79, calendar.data?.season ?? 0, ...seasons.map(s => s.season), ...franchise.eras.map(e => e.from));
  const c = trophyCase(teamId, { summaries: seasons, teams, franchises, hallOfFame: hof.data ?? null });
  const name = team?.name ?? franchise.eras[0].name;
  const chips = (title: string, list: number[]) => (
    <div>
      <h2 className="section-title">{title}</h2>
      {list.length === 0 ? <p className="muted">None yet</p> : (
        <ul className="chips">
          {list.map(n => <li key={n}><Link className="chip" to={`/history/fba/season/${n}`}>S{n}</Link></li>)}
        </ul>
      )}
    </div>
  );
  const awardRows = TROPHY_AWARDS.map(a => ({ award: a, wins: c.awards.filter(x => x.award === a) })).filter(r => r.wins.length > 0);
  const picks = (drafts.data?.drafts ?? [])
    .flatMap(d => d.picks.filter(p => p.teamId === teamId).map(p => ({ ...p, season: d.season, kind: d.kind })))
    .sort((a, b) => b.season - a.season || (a.pick ?? Infinity) - (b.pick ?? Infinity));

  return (
    <section className="stack">
      <Hero
        theme={team ? teamTheme(team, 'fba') : undefined}
        logo={team ? <TeamMark team={team} season={latest} size={96} /> : undefined}
        kicker="FBA franchise"
        title={name}
        stats={[
          { label: 'Titles', value: c.championships.length },
          { label: 'Finals', value: c.finals.length },
          { label: 'Conf. titles', value: c.confTitles.length },
          { label: 'Tournaments', value: c.tournaments.length },
        ]}
      />
      <EraStrip franchise={franchise} team={team} manifest={manifest.data ?? null} />
      <SubNav label="Franchise" items={[{ id: 'overview', label: 'Overview' }, { id: 'players', label: 'Players' }]} active={tab} onSelect={id => setParams(id === 'players' ? { tab: 'players' } : {})} />
      {tab === 'players' ? (
        <div id="panel-players" role="tabpanel" aria-labelledby="tab-players">
          <FranchisePlayers franchise={franchise} players={playerDoc} bios={bios.data ?? null} summaries={seasons} hof={hof.data ?? null} rosters={rosters ?? []} latest={latest} />
        </div>
      ) : (
        <>
        {chips('Championships', c.championships)}
        {chips('Finals appearances', c.finals)}
        {chips('Conference titles', c.confTitles)}
        {chips('Tournament appearances', c.tournaments)}
        <div>
          <h2 className="section-title">Awards</h2>
          {awardRows.length === 0 ? <p className="muted">None yet</p> : (
            <ul className="plain-list">
              {awardRows.map(r => (
                <li key={r.award}>
                  <b>{r.award}</b>{' '}
                  {r.wins.map((w, i) => (
                    <span key={`${w.playerId}-${w.season}`}>{i > 0 && ', '}<PlayerLink id={w.playerId} players={playerDoc} /> (S{w.season})</span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="section-title">Hall of Famers</h2>
          {c.hallOfFamers.length === 0 ? <p className="muted">None yet</p> : (
            <ul className="plain-list">
              {c.hallOfFamers.map(h => (
                <li key={`${h.season}-${h.name}`}>
                  {h.playerId ? <PlayerLink id={h.playerId} players={playerDoc} /> : h.name} <span className="muted">{h.season}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {picks.length > 0 && (
          <div>
            <h2 className="section-title">Draft picks</h2>
            <div className="table-wrap">
              <table className="stat-table">
                <thead><tr><th>Season</th><th className="n">Pick</th><th>Player</th><th>Pos</th><th>College</th></tr></thead>
                <tbody>
                  {picks.map((p, i) => (
                    <tr key={`${p.season}-${p.kind}-${i}`}>
                      <td>S{p.season}</td>
                      <td className="n">{p.kind === 'expansion' ? 'Exp.' : p.pick ?? '—'}</td>
                      <td>{p.playerId ? <PlayerLink id={p.playerId} players={playerDoc} /> : p.name}</td>
                      <td>{p.pos}</td>
                      <td>{p.college ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p><Link to={`/history/fba/transactions?team=${teamId}`}>Transactions →</Link></p>
        </>
      )}
    </section>
  );
}
