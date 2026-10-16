import type { JcRecruitingHistoryFile, PlayersFile, RecruitingFile, TeamsFile } from '../shared/types';

export type JcRecruitingClass = JcRecruitingHistoryFile['classes'][number];

const desc = (a: number | null, b: number | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : b - a);

/**
 * The recruiting classes the app itself ran after the imported history: each locked board whose class (`classOf`) is later than
 * `throughSeason` becomes a past class, in the history's own shape (recruits ranked by consensus, then rating; the portal by rating).
 * Unlocked boards, boards with no class yet and classes already in the imported history are left out. Oldest class first.
 */
export function liveRecruitingClasses(boards: RecruitingFile[], teams: TeamsFile, players: PlayersFile, throughSeason: number): JcRecruitingClass[] {
  const school = (teamId: string | null) => ({ name: teamId ? teams.teams.find(t => t.teamId === teamId)?.name ?? null : null, teamId });
  const nameOf = (id: string) => players.players[id]?.name ?? id;
  return boards
    .filter(b => b.locked && b.created && b.classOf > throughSeason)
    .sort((a, b) => a.classOf - b.classOf)
    .map(b => ({
      season: b.classOf,
      recruits: [...b.recruits]
        .sort((x, y) => desc(x.consensus ?? null, y.consensus ?? null) || desc(x.rating, y.rating) || nameOf(x.playerId).localeCompare(nameOf(y.playerId)))
        .map((r, i) => ({
          rank: i + 1, stars: r.stars, pos: r.position, name: nameOf(r.playerId), playerId: r.playerId, rating: r.rating, consensus: r.consensus ?? null,
          school: school(r.committedTo).name, teamId: school(r.committedTo).name ? r.committedTo : null,
        })),
      portal: [...b.portal]
        .sort((x, y) => desc(x.rating, y.rating) || nameOf(x.playerId).localeCompare(nameOf(y.playerId)))
        .map((p, i) => ({
          rank: i + 1, pos: p.position, name: nameOf(p.playerId), playerId: p.playerId, rating: p.rating,
          fromSchool: school(p.fromTeam).name, fromTeamId: school(p.fromTeam).name ? p.fromTeam : null,
          toSchool: school(p.committedTo).name, toTeamId: school(p.committedTo).name ? p.committedTo : null,
        })),
    }));
}
