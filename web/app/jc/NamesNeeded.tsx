import { useState } from 'react';
import { completeNamed, incompleteNamed, namePlayers, BIOS_PATH } from '../../engine/jc/names';
import { namesNeeded } from '../../engine/jc/start';
import type { JcState } from '../../engine/jc/state';
import type { PlayerBiosFile, PlayersFile } from '../../engine/shared/types';
import { useDoc, useSaving } from '../api';
import { commitDocs } from '../roster/commit';
import './jc.css';

/**
 * The college players who have passed a naming threshold (Jr 80, So 78, Fr 76) and still have no name, with a box for each. Naming one
 * makes him an official player: his name is saved, and he gets a bio so he is listed in player history with his school.
 */
export function NamesNeeded({ state, onSaved }: { state: JcState; onSaved: () => void }) {
  const players = useDoc<PlayersFile>('players.json');
  const bios = useDoc<PlayerBiosFile>(BIOS_PATH);
  const saving = useSaving();
  const [text, setText] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const needed = namesNeeded(state);
  const nameState = players.data ? { season: state.season, players: players.data, bios: bios.data ?? null, rosters: state.rosters, teams: state.teams } : null;
  const incomplete = nameState && (bios.data || bios.missing) ? incompleteNamed(nameState) : [];
  if (needed.length === 0 && incomplete.length === 0) return null;
  const school = (id: string) => state.teams.teams.find(t => t.teamId === id)?.name ?? id;
  const typed = needed.filter(n => (text[n.playerId] ?? '').trim() !== '');
  const ready = !!players.data && (!!bios.data || bios.missing);

  const save = async (): Promise<void> => {
    setError('');
    if (!players.data) return;
    const r = namePlayers(
      { season: state.season, players: players.data, bios: bios.data ?? null, rosters: state.rosters, teams: state.teams, awards: state.awards },
      typed.map(n => ({ playerId: n.playerId, name: text[n.playerId] })),
    );
    if (!r.ok) { setError(r.problems.join('; ')); return; }
    try {
      await commitDocs(r.label, r.writes, { 'players.json': players.version, [BIOS_PATH]: bios.version });
      setText({});
      players.reload();
      bios.reload();
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const complete = async (): Promise<void> => {
    setError('');
    if (!nameState) return;
    const r = completeNamed(nameState);
    if (!r.ok) { setError(r.problems.join('; ')); return; }
    try {
      await commitDocs(r.label, r.writes, { 'players.json': players.version, [BIOS_PATH]: bios.version });
      players.reload();
      bios.reload();
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const repair = incomplete.length > 0 && (
    <section className="card" aria-label="Records to complete">
      <h2>Records to complete · {incomplete.length}</h2>
      <p className="muted">Named players with no birth season or no bio. Completing them gives each a birth season (18 in his first season) and a bio with his school.</p>
      <p><button className="btn" disabled={saving || !ready} onClick={() => void complete()}>Complete {incomplete.length} {incomplete.length === 1 ? 'player' : 'players'}</button></p>
      {needed.length === 0 && error && <p className="error">{error}</p>}
    </section>
  );
  if (needed.length === 0) return repair || null;

  return (
    <>
    {repair}
    <section className="card" aria-label="Names needed">
      <h2>Names needed · {needed.length}</h2>
      <p className="muted">Players past the naming line (Jr 80, So 78, Fr 76) who still have no name. A named player becomes official and is listed in player history.</p>
      <div className="table-wrap">
        <table className="stat-table">
          <thead><tr><th>School</th><th>Pos</th><th>Class</th><th className="num">Rating</th><th>Name</th></tr></thead>
          <tbody>
            {needed.map(n => (
              <tr key={n.playerId}>
                <td>{school(n.teamId)}</td>
                <td>{n.position}</td>
                <td>{n.classYear}</td>
                <td className="num">{n.rating}{n.reason === 'poty' && <span className="muted"> (conference player of the year)</span>}</td>
                <td>
                  <input
                    type="text" aria-label={`Name for ${school(n.teamId)} ${n.position} (${n.classYear}, ${n.rating})`} maxLength={40}
                    value={text[n.playerId] ?? ''} placeholder="Full name" disabled={saving}
                    onChange={e => setText(t => ({ ...t, [n.playerId]: e.target.value }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <button className="btn primary" disabled={saving || !ready || typed.length === 0} onClick={() => void save()}>
          Save {typed.length || ''} {typed.length === 1 ? 'name' : 'names'}
        </button>
      </p>
      {error && <p className="error">{error}</p>}
    </section>
    </>
  );
}
