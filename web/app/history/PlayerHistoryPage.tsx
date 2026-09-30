import { useParams } from 'react-router-dom';
import { playerHonours, playerLines } from '../../engine/history/honours';
import type { PlayerBiosFile, PlayersFile, SeasonTotals } from '../../engine/shared/types';
import { useDoc, useHistory } from '../api';
import { SkippedWarning } from './PlayerLink';

const ppg = (t: SeasonTotals | null) => (t && t.g > 0 ? (t.pts / t.g).toFixed(1) : '—');
const games = (t: SeasonTotals | null) => (t ? String(t.g) : '—');
const points = (t: SeasonTotals | null) => (t ? String(t.pts) : '—');

export function PlayerHistoryPage() {
  const { playerId = '' } = useParams();
  const { seasons, errors, error } = useHistory('fba');
  const players = useDoc<PlayersFile>('players.json');
  const bios = useDoc<PlayerBiosFile>('leagues/fba/playerBios.json');
  const failure = error ?? players.error ?? (bios.missing ? undefined : bios.error);
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || (!bios.data && !bios.missing)) return <p className="muted">Loading…</p>;
  const player = players.data.players[playerId];
  if (!player) return <p className="muted">Not found</p>;

  const bio = bios.data?.bios.find(b => b.playerId === playerId) ?? null;
  const honours = playerHonours(seasons, playerId);
  const bySeason = new Map<number, string[]>();
  for (const h of honours) bySeason.set(h.season, [...(bySeason.get(h.season) ?? []), h.text]);
  const lines = playerLines([...seasons].sort((a, b) => a.season - b.season), playerId);

  return (
    <section>
      <h1>{player.name}</h1>
      <SkippedWarning errors={errors} />
      {!bio && honours.length === 0 && lines.length === 0 && <p className="muted">No history recorded</p>}
      {bio && (
        <div>
          <p>Born: {bio.born.replace(/^Born-/, '')}</p>
          <ul>{bio.entries.map((e, k) => <li key={k}>{e}</li>)}</ul>
        </div>
      )}
      {honours.length > 0 && (
        <div>
          <h2>Honours</h2>
          <ul>
            {[...bySeason].map(([season, texts]) => <li key={season}>S{season}: {texts.join(', ')}</li>)}
          </ul>
        </div>
      )}
      {lines.length > 0 && (
        <div>
          <h2>Seasons</h2>
          <div className="table-wrap">
            <table className="standings">
              <thead>
                <tr>
                  <th>Season</th><th>Team</th><th className="n">GP</th><th className="n">PTS</th><th className="n">PPG</th>
                  <th className="n">Playoffs GP</th><th className="n">Playoffs PTS</th><th className="n">Playoffs PPG</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(({ season, line }, k) => (
                  <tr key={k}>
                    <td>S{season}</td>
                    <td>{line.teamId ?? 'Total'}</td>
                    <td className="n">{line.rs.g}</td>
                    <td className="n">{line.rs.pts}</td>
                    <td className="n">{ppg(line.rs)}</td>
                    <td className="n">{games(line.po)}</td>
                    <td className="n">{points(line.po)}</td>
                    <td className="n">{ppg(line.po)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
