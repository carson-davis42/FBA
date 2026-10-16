import type { JcRecruitingHistoryFile, PlayersFile, RecruitingFile, TeamsFile } from '../shared/types';

export type JcRecruitingClass = JcRecruitingHistoryFile['classes'][number];

const desc = (a: number | null, b: number | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : b - a);

/** A locked board with its class made, as a past class in the history's own shape: recruits ranked by consensus then rating, the portal by rating. */
function classOfBoard(b: RecruitingFile, teams: TeamsFile, players: PlayersFile): JcRecruitingClass {
  const school = (teamId: string | null): { name: string | null; teamId: string | null } => {
    const name = teamId ? teams.teams.find(t => t.teamId === teamId)?.name ?? null : null;
    return { name, teamId: name ? teamId : null };
  };
  const nameOf = (id: string) => players.players[id]?.name ?? id;
  return {
    season: b.classOf,
    recruits: [...b.recruits]
      .sort((x, y) => desc(x.consensus ?? null, y.consensus ?? null) || desc(x.rating, y.rating) || nameOf(x.playerId).localeCompare(nameOf(y.playerId)))
      .map((r, i) => ({
        rank: i + 1, stars: r.stars, pos: r.position, name: nameOf(r.playerId), playerId: r.playerId, rating: r.rating, consensus: r.consensus ?? null,
        school: school(r.committedTo).name, teamId: school(r.committedTo).teamId,
      })),
    portal: [...b.portal]
      .sort((x, y) => desc(x.rating, y.rating) || nameOf(x.playerId).localeCompare(nameOf(y.playerId)))
      .map((p, i) => ({
        rank: i + 1, pos: p.position, name: nameOf(p.playerId), playerId: p.playerId, rating: p.rating,
        fromSchool: school(p.fromTeam).name, fromTeamId: school(p.fromTeam).teamId,
        toSchool: school(p.committedTo).name, toTeamId: school(p.committedTo).teamId,
      })),
  };
}

const ready = (b: RecruitingFile | null): b is RecruitingFile => !!b && b.locked && b.created;

/**
 * The classes the app ran that the history file doesn't hold yet: each locked board whose class (`classOf`) is not in `have` and whose
 * season has been played (`classOf` before `before`, the current season). Oldest first. This is what the history page shows for classes the
 * "Finish season" move has not saved yet.
 */
export function liveRecruitingClasses(
  boards: RecruitingFile[], teams: TeamsFile, players: PlayersFile, opts: { have: ReadonlySet<number>; before: number },
): JcRecruitingClass[] {
  return boards
    .filter(b => ready(b) && !opts.have.has(b.classOf) && b.classOf < opts.before)
    .sort((a, b) => a.classOf - b.classOf)
    .map(b => classOfBoard(b, teams, players));
}

/**
 * The history file with the class of `board` added (the file is created when there is none), or null when there is nothing to add: no board,
 * a board that isn't locked or has no class yet, or a class the file already holds. `throughSeason` still means "imported through".
 */
export function archiveRecruitingClass(
  history: JcRecruitingHistoryFile | null, board: RecruitingFile | null, teams: TeamsFile, players: PlayersFile,
): JcRecruitingHistoryFile | null {
  if (!ready(board) || history?.classes.some(c => c.season === board.classOf)) return null;
  const cls = classOfBoard(board, teams, players);
  const base = history ?? { league: 'fbajc' as const, throughSeason: board.classOf - 1, classes: [] };
  return { ...base, classes: [...base.classes, cls].sort((a, b) => a.season - b.season) };
}
