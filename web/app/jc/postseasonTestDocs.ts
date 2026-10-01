import type { JcState } from '../../engine/jc/state';

/** The JSON docs a postseason page loads for a state, keyed by api path. */
export function docsOf(s: JcState): Record<string, unknown> {
  const p = `leagues/fbajc/S${s.season}`;
  const docs: Record<string, unknown> = {
    'calendar.json': s.calendar,
    'players.json': s.players,
    'leagues/fbajc/teams.json': s.teams,
    [`${p}/rosters.json`]: s.rosters,
  };
  if (s.schedule) docs[`${p}/schedule.json`] = s.schedule;
  if (s.results) docs[`${p}/results.json`] = s.results;
  if (s.rankings) docs[`${p}/rankings.json`] = s.rankings;
  if (s.postseason) docs[`${p}/postseason.json`] = s.postseason;
  if (s.awards) docs[`${p}/awards.json`] = s.awards;
  if (s.summary) docs[`${p}/summary.json`] = s.summary;
  return docs;
}
