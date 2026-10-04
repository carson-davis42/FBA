import { useParams } from 'react-router-dom';
import { applyPlacement, awardTotals, careerSpan, careerStats, liveCareer, playerStatus, type Placement } from '../../engine/history/career';
import { d2PlayerHonours } from '../../engine/history/d2';
import { playerHonours } from '../../engine/history/honours';
import type { AwardCountsFile, D2DraftHistoryFile, DraftHistoryFile, HallOfFameFile, MetaFile, PlayerBiosFile, PlayersFile, RostersFile, TeamsFile } from '../../engine/shared/types';
import { useDoc, useHistory } from '../api';
import { Badge } from '../components/Badge';
import { Hero } from '../components/Hero';
import { TeamMark } from '../components/TeamMark';
import { teamTheme } from '../components/teamColors';
import { CareerSection, hasCareer } from './CareerSection';
import { Link } from 'react-router-dom';
import { franchiseByAbbr } from '../../engine/shared/franchises';
import { draftLine, draftTeamId } from './DraftSeasonPage';
import { playerEmblem } from './PlayerEmblem';
import { useJcTeams } from './jc/useJc';
import { SkippedWarning } from './PlayerLink';
import { useD2Teams } from './d2/useD2';
import { findTeam, TeamAbbr, useFbaTeams } from './useTeams';
import './history.css';

const dash = (n: number | null) => (n === null ? '—' : String(n));
const fixed = (n: number | null) => (n === null ? '—' : n.toFixed(1));

/** The last season the FBA stints cover (for reading the era abbreviation of the newest one). */
function latestSeasonOfStints(career: { stints: { kind: string; to: number | 'pres' | null; from: number | null }[] }): number {
  const last = [...career.stints].reverse().find(s => s.kind === 'fba');
  return last ? (typeof last.to === 'number' ? last.to : typeof last.from === 'number' ? last.from : 79) : 79;
}

/** `text` with the team it names in parentheses turned into a link, when the team is known. */
function TeamLinkedText({ text, team, to }: { text: string; team: { id: string; name: string } | undefined; to: (t: { id: string; name: string }) => string }) {
  const at = team ? text.lastIndexOf(`(${team.name})`) : -1;
  if (!team || at < 0) return <>{text}</>;
  return <>{text.slice(0, at + 1)}<Link to={to(team)}>{team.name}</Link>{text.slice(at + 1 + team.name.length)}</>;
}

/** "Drafted S74, #18 by Honolulu Rays" with the franchise linked to its history page. */
function DraftedLine({ text, teamId, teams }: { text: string; teamId: string | null; teams: Parameters<typeof findTeam>[0] }) {
  const at = text.lastIndexOf(' by ');
  if (at < 0 || !teamId || !findTeam(teams, teamId)) return <>{text}</>;
  return <>{text.slice(0, at + 4)}<Link to={`/history/fba/teams/${teamId}`}>{text.slice(at + 4)}</Link></>;
}

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
  const jcTeams = useJcTeams();
  const wcTeams = useDoc<TeamsFile>('leagues/fbawc/teams.json');
  // The live rosters move before any season summary exists (an offseason signing, a trade, a draft pick), so they decide where he is now.
  const meta = useDoc<MetaFile>('meta.json');
  const rosterOf = (lg: 'fba' | 'fbad2' | 'fbajc') => (meta.data ? `leagues/${lg}/S${meta.data.rosterSeason[lg]}/rosters.json` : null);
  const fbaRoster = useDoc<RostersFile>(rosterOf('fba'));
  const d2Roster = useDoc<RostersFile>(rosterOf('fbad2'));
  const jcRoster = useDoc<RostersFile>(rosterOf('fbajc'));
  const rosterSettled = (d: { data?: unknown; missing: boolean; error?: unknown }) => !!d.data || d.missing || !!d.error;
  const failure = error ?? players.error ?? (bios.missing ? undefined : bios.error)
    ?? (counts.missing ? undefined : counts.error) ?? (hall.missing ? undefined : hall.error);
  if (failure) return <p className="error">Couldn't load the history: {failure.message}</p>;
  if (!seasons || !players.data || (!bios.data && !bios.missing) || (!counts.data && !counts.missing) || (!hall.data && !hall.missing) || (!drafts.data && !drafts.missing && !drafts.error) || !settled
    || (!d2.seasons && !d2.error) || (!d2Drafts.data && !d2Drafts.missing && !d2Drafts.error) || !d2Teams.settled || !jcTeams.settled || !(meta.data || meta.missing || meta.error) || (!!meta.data && !(rosterSettled(fbaRoster) && rosterSettled(d2Roster) && rosterSettled(jcRoster))) || (!wcTeams.data && !wcTeams.missing && !wcTeams.error)) {
    return <p className="muted">Loading…</p>;
  }
  const player = players.data.players[playerId];
  if (!player) return <p className="muted">Not found</p>;

  const drafted = draftLine(drafts.data ?? null, playerId, teams, franchises);
  const d2Honours = d2PlayerHonours(playerId, d2.seasons ?? [], d2Drafts.data ?? null, d2Teams.teams);
  const bio = bios.data?.bios.find(b => b.playerId === playerId) ?? null;
  const bornText = bio?.born.trim().replace(/^Born-/, '') ?? '';
  const bioBirth = /^S(-?\d+)$/.exec(bornText) ?? /^FFL S\d+\((-?\d+)\)$/.exec(bornText);
  const birthSeason = player.birthSeason ?? (bioBirth ? Number(bioBirth[1]) : null);
  const rosterEntry = [fbaRoster.data, d2Roster.data, jcRoster.data].flatMap(r =>
    Object.values(r?.teams ?? {}).flat().filter(e => e.playerId === playerId && e.age !== null)
      .map(e => ({ age: e.age!, season: r!.season })),
  )[0];
  const age = meta.data ? (birthSeason !== null ? meta.data.currentSeason - birthSeason
    : rosterEntry ? rosterEntry.age + meta.data.currentSeason - rosterEntry.season : null) : null;
  const honours = playerHonours(seasons, playerId);
  const bySeason = new Map<number, string[]>();
  for (const h of honours) bySeason.set(h.season, [...(bySeason.get(h.season) ?? []), h.text]);
  const placement = ((): { now: Placement; season: number } | null => {
    const onTeam = (doc: RostersFile | undefined) => Object.entries(doc?.teams ?? {}).find(([, es]) => es.some(e => e.playerId === playerId))?.[0];
    const fbaTeam = onTeam(fbaRoster.data);
    if (fbaTeam && meta.data) return { now: { kind: 'fba', team: fbaTeam }, season: meta.data.rosterSeason.fba };
    const d2Team = onTeam(d2Roster.data);
    const d2Name = d2Teams.teams.find(t => t.teamId === d2Team)?.name;
    if (d2Name && meta.data) return { now: { kind: 'd2', team: `D2(${d2Name})` }, season: meta.data.rosterSeason.fbad2 };
    const jcTeam = onTeam(jcRoster.data);
    const jcName = jcTeams.teams.find(t => t.teamId === jcTeam)?.name;
    if (jcName && meta.data) return { now: { kind: 'college', team: jcName }, season: meta.data.rosterSeason.fbajc };
    return null;
  })();
  const career = applyPlacement(liveCareer(bio, playerId, seasons, hall.data ?? null), placement?.now ?? null, placement?.season ?? 0);
  const totals = awardTotals(playerId, counts.data ?? null, seasons);
  const stats = careerStats(playerId, seasons);
  const hasAwards = Object.values(totals).some(n => n > 0);
  const played = stats.rows.some(r => r.gp !== null);

  // The newest FBA stint's last team ("BOS/DEN" counts as DEN); else the newest season line.
  const fbaStints = career.stints.filter(s => s.kind === 'fba');
  const recent = fbaStints.length > 0 ? fbaStints[fbaStints.length - 1].team.split('/').pop() : stats.rows.length > 0 ? stats.rows[stats.rows.length - 1].teamId : null;
  const recentTeam = findTeam(teams, franchiseByAbbr(franchises, recent ?? '', latestSeasonOfStints(career))?.teamId ?? recent);
  const latestFba = seasons.reduce((m, x) => Math.max(m, x.season), 0);
  const status = playerStatus(career, !!player.retired, latestFba);
  const emblemTeams = { fba: teams, d2: d2Teams.teams, college: jcTeams.teams, wc: wcTeams.data?.teams ?? [], franchises };
  const emblem = playerEmblem(status, career.stints[career.stints.length - 1], emblemTeams, recentTeam);
  const latestSeason = stats.rows.length > 0 ? stats.rows[stats.rows.length - 1].season : 0;
  const position = seasons.flatMap(s => (s.players ?? []).filter(l => l.playerId === playerId).map(l => ({ season: s.season, position: l.position })))
    .sort((a, b) => b.season - a.season)[0]?.position;
  const span = careerSpan(career);
  const years = span ? `S${span.from}–${span.to === 'pres' ? 'pres.' : span.to === null ? '' : `S${span.to}`}`.replace(/–$/, '') : null;
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
        theme={emblem ? teamTheme(emblem, emblem === recentTeam ? 'fba' : 'fbajc') : undefined}
        logo={emblem ? <TeamMark team={emblem} season={latestSeason || 79} size={72} /> : undefined}
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
      {drafted && <p className="muted"><DraftedLine text={drafted} teamId={draftTeamId(drafts.data ?? null, playerId)} teams={teams} /></p>}
      <SkippedWarning errors={errors} />
      {!bio && !hasCareer(career) && !hasAwards && honours.length === 0 && d2Honours.length === 0 && stats.rows.length === 0 && <p className="muted">No history recorded</p>}
      <CareerSection career={career} born={bio ? bio.born : null} age={age} totals={totals} teams={{ fba: teams, d2: d2Teams.teams, college: jcTeams.teams, wc: wcTeams.data?.teams ?? [], franchises }} />
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
            {d2Honours.map((h, i) => <li key={i}>S{h.season}: <TeamLinkedText text={h.text} team={h.team} to={t => `/history/fbad2/teams/${t.id}`} /></li>)}
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
                    <td>{r.teamId ? <TeamAbbr teams={teams} teamId={r.teamId} season={r.season} link /> : '—'}</td>
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
