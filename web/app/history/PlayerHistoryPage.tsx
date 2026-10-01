import { useParams } from 'react-router-dom';
import { awardTotals, careerStats, liveCareer } from '../../engine/history/career';
import { d2PlayerHonours } from '../../engine/history/d2';
import { playerHonours } from '../../engine/history/honours';
import type { AwardCountsFile, D2DraftHistoryFile, DraftHistoryFile, HallOfFameFile, PlayerBiosFile, PlayersFile } from '../../engine/shared/types';
import { useDoc, useHistory } from '../api';
import { Badge } from '../components/Badge';
import { Hero } from '../components/Hero';
import { TeamMark } from '../components/TeamMark';
import { teamTheme } from '../components/teamColors';
import { CareerSection, hasCareer } from './CareerSection';
import { draftLine } from './DraftSeasonPage';
import { SkippedWarning } from './PlayerLink';
import { useD2Teams } from './d2/useD2';
import { findTeam, TeamAbbr, useFbaTeams } from './useTeams';
import './history.css';

const dash = (n: number | null) => (n === null ? '—' : String(n));
const fixed = (n: number | null) => (n === null ? '—' : n.toFixed(1));

export function PlayerHistoryPage() {
  const { playerId = '' } = useParams();
  const { seasons, errors, error } = useHistory('fba');
  const players = useDoc<PlayersFile>('players.json');
  const bios = useDoc<PlayerBiosFile>('leagues/fba/playerBios.json');
  const counts = useDoc<AwardCountsFile>('leagues/fba/awardCounts.json');
  const hall = useDoc<HallOfFameFile>('leagues/fba/hallOfFame.json');
  const drafts = useDoc<DraftHistoryFile>('leagues/fba/draftHistory.json');
  const { settled, teams, franchises } = useFbaTeams();
  // The D2 history is decoration: an error or a missing doc just means no D2 block.
  const d2 = useHistory('fbad2');
  const d2Drafts = useDoc<D2DraftHistoryFile>('leagues/fbad2/draftHistory.json');
  const d2Teams = useD2Teams();
  const failure = error ?? players.error ?? (bios.missing ? undefined : bios.error)
    ?? (counts.missing ? undefined : counts.error) ?? (hall.missing ? undefined : hall.error);
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || (!bios.data && !bios.missing) || (!counts.data && !counts.missing) || (!hall.data && !hall.missing) || (!drafts.data && !drafts.missing && !drafts.error) || !settled
    || (!d2.seasons && !d2.error) || (!d2Drafts.data && !d2Drafts.missing && !d2Drafts.error) || !d2Teams.settled) {
    return <p className="muted">Loading…</p>;
  }
  const player = players.data.players[playerId];
  if (!player) return <p className="muted">Not found</p>;

  const drafted = draftLine(drafts.data ?? null, playerId, teams, franchises);
  const d2Honours = d2PlayerHonours(playerId, d2.seasons ?? [], d2Drafts.data ?? null, d2Teams.teams);
  const bio = bios.data?.bios.find(b => b.playerId === playerId) ?? null;
  const honours = playerHonours(seasons, playerId);
  const bySeason = new Map<number, string[]>();
  for (const h of honours) bySeason.set(h.season, [...(bySeason.get(h.season) ?? []), h.text]);
  const career = liveCareer(bio, playerId, seasons, hall.data ?? null);
  const totals = awardTotals(playerId, counts.data ?? null, seasons);
  const stats = careerStats(playerId, seasons);
  const hasAwards = Object.values(totals).some(n => n > 0);
  const played = stats.rows.some(r => r.gp !== null);

  // The newest FBA stint's last team ("BOS/DEN" counts as DEN); else the newest season line.
  const fbaStints = career.stints.filter(s => s.kind === 'fba');
  const recent = fbaStints.length > 0 ? fbaStints[fbaStints.length - 1].team.split('/').pop() : stats.rows.length > 0 ? stats.rows[stats.rows.length - 1].teamId : null;
  const recentTeam = findTeam(teams, recent);
  const latestSeason = stats.rows.length > 0 ? stats.rows[stats.rows.length - 1].season : 0;
  const position = seasons.flatMap(s => (s.players ?? []).filter(l => l.playerId === playerId).map(l => ({ season: s.season, position: l.position })))
    .sort((a, b) => b.season - a.season)[0]?.position;
  const years = fbaStints.length > 0 && fbaStints[0].range ? `${fbaStints[0].range.split('-')[0]}–${fbaStints[fbaStints.length - 1].range.split('-').pop()}` : null;
  const kicker = [position, years].filter(Boolean).join(' · ') || 'Player';
  const heroStats: { label: string; value: string | number }[] = [];
  if (stats.rows.length > 0) heroStats.push({ label: 'Seasons', value: new Set(stats.rows.map(r => r.season)).size });
  if (played) heroStats.push({ label: 'Points', value: stats.total.pts }, { label: 'PPG', value: stats.total.gp > 0 ? stats.total.ppg.toFixed(1) : '—' });
  if (totals.CHAMPION > 0) heroStats.push({ label: 'Titles', value: totals.CHAMPION });
  const allFba = totals.ALL_FBA_1 + totals.ALL_FBA_2;

  return (
    <section className="stack">
      <Hero
        kicker={kicker}
        title={player.name}
        theme={recentTeam ? teamTheme(recentTeam, 'fba') : undefined}
        logo={recentTeam ? <TeamMark team={recentTeam} season={latestSeason || 79} size={72} /> : undefined}
        stats={heroStats}
      >
        {(totals.MVP > 0 || allFba > 0 || totals.ALL_STAR > 0 || totals.CHAMPION > 0 || career.hof !== null) && (
          <div className="badge-row">
            {totals.MVP > 0 && <Badge kind="mvp">MVP ×{totals.MVP}</Badge>}
            {allFba > 0 && <Badge kind="all-fba">All-FBA ×{allFba}</Badge>}
            {totals.ALL_STAR > 0 && <Badge kind="all-star">All-Star ×{totals.ALL_STAR}</Badge>}
            {totals.CHAMPION > 0 && <Badge kind="champion">Champion ×{totals.CHAMPION}</Badge>}
            {career.hof !== null && <Badge kind="hof">Hall of Fame</Badge>}
          </div>
        )}
      </Hero>
      {drafted && <p className="muted">{drafted}</p>}
      <SkippedWarning errors={errors} />
      {!bio && !hasCareer(career) && !hasAwards && honours.length === 0 && d2Honours.length === 0 && stats.rows.length === 0 && <p className="muted">No history recorded</p>}
      <CareerSection career={career} born={bio ? bio.born : null} totals={totals} />
      {honours.length > 0 && (
        <div>
          <h2>Honours</h2>
          <ul>
            {[...bySeason].map(([season, texts]) => <li key={season}>S{season}: {texts.join(', ')}</li>)}
          </ul>
        </div>
      )}
      {d2Honours.length > 0 && (
        <div>
          <h2>D2 honours</h2>
          <ul>
            {d2Honours.map((h, i) => <li key={i}>S{h.season}: {h.text}</li>)}
          </ul>
        </div>
      )}
      {stats.rows.length > 0 && (
        <div>
          <h2>Seasons</h2>
          <div className="table-wrap">
            <table className="stat-table">
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
                    <td>{r.teamId ? <TeamAbbr teams={teams} teamId={r.teamId} season={r.season} /> : '—'}</td>
                    <td className="n">{dash(r.gp)}</td>
                    <td className="n">{dash(r.pts)}</td>
                    <td className="n">{fixed(r.ppg)}</td>
                    <td className="n">{r.po ? r.po.gp : '—'}</td>
                    <td className="n">{r.po ? r.po.pts : '—'}</td>
                    <td className="n">{r.po ? fixed(r.po.ppg) : '—'}</td>
                  </tr>
                ))}
                {played && (
                  <tr>
                    <td>Career (since S79)</td>
                    <td />
                    <td className="n">{stats.total.gp}</td>
                    <td className="n">{stats.total.pts}</td>
                    <td className="n">{stats.total.gp > 0 ? stats.total.ppg.toFixed(1) : '—'}</td>
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
