import { Link, useParams } from 'react-router-dom';
import type { DraftFile, DraftHistoryDraft, DraftHistoryFile, PlayersFile } from '../../engine/shared/types';
import { resolveHistoryTeam } from '../../engine/shared/franchises';
import type { FranchisesFile, Team } from '../../engine/shared/types';
import { docFailure, docSettled, useDoc } from '../api';
import { PageHeader } from '../components/PageHeader';
import { PlayerLink } from './PlayerLink';
import { findTeam, TeamFull, useFbaTeams } from './useTeams';
import './history.css';

/** The player's draft entry as a line for the player page, or null. A real pick beats an undrafted row. */
export function draftLine(history: DraftHistoryFile | null, playerId: string, teams: Team[] = [], franchises: FranchisesFile | null = null): string | null {
  if (!history) return null;
  const drafts = [...history.drafts].sort((a, b) => a.season - b.season || (a.kind === b.kind ? 0 : a.kind === 'draft' ? -1 : 1));
  let undrafted: number | null = null;
  for (const d of drafts) {
    const p = d.picks.find(x => x.playerId === playerId);
    if (!p) continue;
    if (p.pick === null) { undrafted ??= d.season; continue; }
    const era = p.teamId ? franchises?.franchises.find(f => f.teamId === p.teamId)?.eras.find(e => e.from <= d.season && (e.to === null || d.season <= e.to)) : undefined;
    const team = era?.name ?? (p.teamName ? resolveHistoryTeam(teams, franchises, p.teamName, d.season, p.teamId)?.name ?? p.teamName : p.teamId);
    return `${d.kind === 'expansion' ? 'Expansion draft' : 'Drafted'} S${d.season}, #${p.pick} by ${team ?? 'unknown'}`;
  }
  return undrafted === null ? null : `Undrafted, S${undrafted}`;
}

/** The FBA team that made the player's first real pick (the one `draftLine` names), or null. */
export function draftTeamId(history: DraftHistoryFile | null, playerId: string): string | null {
  if (!history) return null;
  for (const d of [...history.drafts].sort((a, b) => a.season - b.season || (a.kind === b.kind ? 0 : a.kind === 'draft' ? -1 : 1))) {
    const p = d.picks.find(x => x.playerId === playerId);
    if (p && p.pick !== null) return p.teamId ?? null;
  }
  return null;
}

type Teams = ReturnType<typeof useFbaTeams>;

function HistoryTable({ draft, players, fb }: { draft: DraftHistoryDraft; players: PlayersFile; fb: Teams }) {
  const drafted = draft.picks.filter(p => p.pick !== null);
  const viaName = (id: string) => findTeam(fb.teams, id)?.name ?? id;
  return (
    <div className="table-wrap">
      <table className="stat-table">
        <thead><tr><th className="n">Pick</th><th>Team</th><th>Player</th><th>Pos</th><th>{draft.kind === 'expansion' ? 'Age' : 'Class'}</th><th>College</th></tr></thead>
        <tbody>
          {drafted.map(p => (
            <tr key={p.pick}>
              <td className="n">{p.pick}</td>
              <td>
                {p.teamName
                  ? <TeamFull teams={fb.teams} franchises={fb.franchises} teamId={p.teamId} name={p.teamName} season={draft.season} />
                  : '—'}
                {p.viaTeamId && (
                  <span className="muted"> (via <TeamFull teams={fb.teams} franchises={fb.franchises} teamId={p.viaTeamId} name={viaName(p.viaTeamId)} season={draft.season} variant="abbr" />)</span>
                )}
              </td>
              <td>{p.playerId ? <PlayerLink id={p.playerId} players={players} /> : p.name}</td>
              <td>{p.pos}</td>
              <td>{p.detail ?? '—'}</td>
              <td>{p.college ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AppTable({ doc, players, fb }: { doc: DraftFile; players: PlayersFile; fb: Teams }) {
  const name = (id: string) => findTeam(fb.teams, id)?.name ?? id;
  const rows = doc.picks.filter(p => p.playerId !== null).sort((a, b) => a.slot - b.slot);
  return (
    <div className="table-wrap">
      <table className="stat-table">
        <thead><tr><th className="n">Pick</th><th>Team</th><th>Player</th><th>Pos</th><th>Class</th><th>College</th></tr></thead>
        <tbody>
          {rows.map(p => {
            const pr = doc.prospects.find(x => x.playerId === p.playerId);
            return (
              <tr key={p.slot}>
                <td className="n">{p.slot}</td>
                <td>
                  <TeamFull teams={fb.teams} franchises={fb.franchises} teamId={p.owner} name={name(p.owner)} season={doc.season} />
                  {p.originalTeam !== p.owner && (
                    <span className="muted"> (via <TeamFull teams={fb.teams} franchises={fb.franchises} teamId={p.originalTeam} name={name(p.originalTeam)} season={doc.season} variant="abbr" />)</span>
                  )}
                </td>
                <td><PlayerLink id={p.playerId} players={players} /></td>
                <td>{pr?.position ?? '—'}</td>
                <td>{pr?.classYear ?? '—'}</td>
                <td>{pr?.college ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DraftSeasonPage() {
  const { season: seasonParam = '' } = useParams();
  const season = Number(seasonParam);
  const players = useDoc<PlayersFile>('players.json');
  const history = useDoc<DraftHistoryFile>('leagues/fba/draftHistory.json');
  const fb = useFbaTeams();
  const imported = (history.data?.drafts ?? []).filter(d => d.season === season);
  const historySettled = docSettled(history);
  const app = useDoc<DraftFile>(historySettled && imported.length === 0 && Number.isInteger(season) ? `leagues/fba/S${season}/draft.json` : null);
  const failure = players.error ?? docFailure(history) ?? (imported.length === 0 ? docFailure(app) : undefined);
  if (failure) return <p className="error">Couldn't load the draft: {failure.message}</p>;
  if (!players.data || !historySettled || !fb.settled) return <p className="muted">Loading…</p>;
  if (imported.length === 0 && Number.isInteger(season) && !docSettled(app)) return <p className="muted">Loading…</p>;

  const header = <PageHeader title={`S${season} Draft`} actions={<Link to="/history/fba/drafts">← Drafts</Link>} />;
  const main = imported.find(d => d.kind === 'draft');
  const expansion = imported.find(d => d.kind === 'expansion');
  const undrafted = (main?.picks ?? []).filter(p => p.pick === null);
  const playerDoc = players.data;

  if (imported.length > 0) {
    return (
      <section className="stack">
        {header}
        {main && <HistoryTable draft={main} players={playerDoc} fb={fb} />}
        {expansion && (
          <div>
            <h2 className="section-title">Expansion draft</h2>
            <HistoryTable draft={expansion} players={playerDoc} fb={fb} />
          </div>
        )}
        {undrafted.length > 0 && (
          <div>
            <h2 className="section-title">Undrafted</h2>
            <p>
              {undrafted.map((p, i) => (
                <span key={`${p.name}-${i}`}>{i > 0 && ', '}{p.playerId ? <PlayerLink id={p.playerId} players={playerDoc} /> : p.name}</span>
              ))}
            </p>
          </div>
        )}
      </section>
    );
  }

  if (app.data && app.data.started) {
    return <section className="stack">{header}<AppTable doc={app.data} players={playerDoc} fb={fb} /></section>;
  }
  return <section className="stack">{header}<p className="muted">No S{season} draft on record.</p></section>;
}
