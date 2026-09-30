import { useParams } from 'react-router-dom';
import { awardTotals, careerStats, liveCareer } from '../../engine/history/career';
import { playerHonours } from '../../engine/history/honours';
import type { AwardCountsFile, HallOfFameFile, PlayerBiosFile, PlayersFile } from '../../engine/shared/types';
import { useDoc, useHistory } from '../api';
import { CareerSection, hasCareer } from './CareerSection';
import { SkippedWarning } from './PlayerLink';

const dash = (n: number | null) => (n === null ? '—' : String(n));

export function PlayerHistoryPage() {
  const { playerId = '' } = useParams();
  const { seasons, errors, error } = useHistory('fba');
  const players = useDoc<PlayersFile>('players.json');
  const bios = useDoc<PlayerBiosFile>('leagues/fba/playerBios.json');
  const counts = useDoc<AwardCountsFile>('leagues/fba/awardCounts.json');
  const hall = useDoc<HallOfFameFile>('leagues/fba/hallOfFame.json');
  const failure = error ?? players.error ?? (bios.missing ? undefined : bios.error)
    ?? (counts.missing ? undefined : counts.error) ?? (hall.missing ? undefined : hall.error);
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || (!bios.data && !bios.missing) || (!counts.data && !counts.missing) || (!hall.data && !hall.missing)) {
    return <p className="muted">Loading…</p>;
  }
  const player = players.data.players[playerId];
  if (!player) return <p className="muted">Not found</p>;

  const bio = bios.data?.bios.find(b => b.playerId === playerId) ?? null;
  const honours = playerHonours(seasons, playerId);
  const bySeason = new Map<number, string[]>();
  for (const h of honours) bySeason.set(h.season, [...(bySeason.get(h.season) ?? []), h.text]);
  const career = liveCareer(bio, playerId, seasons, hall.data ?? null);
  const totals = awardTotals(playerId, counts.data ?? null, seasons);
  const stats = careerStats(playerId, seasons);
  const hasAwards = Object.values(totals).some(n => n > 0);
  const played = stats.rows.some(r => r.gp !== null);

  return (
    <section>
      <h1>{player.name}</h1>
      <SkippedWarning errors={errors} />
      {!bio && !hasCareer(career) && !hasAwards && honours.length === 0 && stats.rows.length === 0 && <p className="muted">No history recorded</p>}
      <CareerSection career={career} born={bio ? bio.born : null} totals={totals} />
      {honours.length > 0 && (
        <div>
          <h2>Honours</h2>
          <ul>
            {[...bySeason].map(([season, texts]) => <li key={season}>S{season}: {texts.join(', ')}</li>)}
          </ul>
        </div>
      )}
      {stats.rows.length > 0 && (
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
                {stats.rows.map((r, k) => (
                  <tr key={k}>
                    <td>S{r.season}</td>
                    <td>{r.teamId ?? '—'}</td>
                    <td className="n">{dash(r.gp)}</td>
                    <td className="n">{dash(r.pts)}</td>
                    <td className="n">{r.ppg.toFixed(1)}</td>
                    <td className="n">{r.po ? r.po.gp : '—'}</td>
                    <td className="n">{r.po ? r.po.pts : '—'}</td>
                    <td className="n">{r.po ? r.po.ppg.toFixed(1) : '—'}</td>
                  </tr>
                ))}
                {played && (
                  <tr>
                    <td>Career (since S79)</td>
                    <td />
                    <td className="n">{stats.total.gp}</td>
                    <td className="n">{stats.total.pts}</td>
                    <td className="n">{stats.total.ppg.toFixed(1)}</td>
                    <td />
                    <td />
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
