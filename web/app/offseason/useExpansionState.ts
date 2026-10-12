import { expansionPath, type ExpansionState } from '../../engine/offseason/expansion';
import type { AddTeamsState } from '../../engine/season/addExpansionTeams';
import { addTeamsStepId, expansionDraftStepId } from '../../engine/shared/expansion';
import type {
  CalendarFile, DraftHistoryFile, ExpansionFile, MetaFile, PlayersFile, RostersFile, TeamsFile, TransactionsFile,
} from '../../engine/shared/types';
import { useDoc, type DocState, type Versions } from '../api';

const HISTORY_PATH = 'leagues/fba/draftHistory.json';

/**
 * Loads what the Expansion page needs for the current season n. `mode` is 'add' while the S(n+1) "add teams" step is open, 'draft' when
 * the calendar has the season's expansion draft, else 'none'. `versions` holds every doc the moves write; a doc that doesn't exist yet
 * (expansion.json before the start) has version null. `ready` is false until the docs for the mode have loaded.
 */
export function useExpansionState(): {
  addState?: AddTeamsState; draftState?: ExpansionState; versions: Versions; mode: 'add' | 'draft' | 'none'; ready: boolean; error?: Error;
} {
  const meta = useDoc<MetaFile>('meta.json');
  const n = meta.data?.currentSeason;
  const calendar = useDoc<CalendarFile>(n === undefined ? null : 'calendar.json');
  const cal = calendar.data;
  const addStep = n === undefined ? undefined : cal?.steps.find(s => s.id === addTeamsStepId(n + 1));
  const mode: 'add' | 'draft' | 'none' = !cal || n === undefined ? 'none'
    : addStep && !addStep.done ? 'add'
    : cal.steps.some(s => s.id === expansionDraftStepId(n)) ? 'draft'
    : 'none';
  const path = (draftOnly: boolean, p: (n: number) => string) =>
    (n === undefined || mode === 'none' || (draftOnly && mode !== 'draft') ? null : p(n));

  const teams = useDoc<TeamsFile>(path(false, () => 'leagues/fba/teams.json'));
  const tx = useDoc<TransactionsFile>(path(false, s => `leagues/fba/S${s}/transactions.json`));
  const rosters = useDoc<RostersFile>(path(true, s => `leagues/fba/S${s}/rosters.json`));
  const players = useDoc<PlayersFile>(path(true, () => 'players.json'));
  const expansion = useDoc<ExpansionFile>(path(true, expansionPath));
  const history = useDoc<DraftHistoryFile>(path(true, () => HISTORY_PATH));

  const versions: Versions = {};
  if (n !== undefined && mode !== 'none') {
    versions['leagues/fba/teams.json'] = teams.version;
    versions[`leagues/fba/S${n}/transactions.json`] = tx.version;
    versions['calendar.json'] = calendar.version;
    if (mode === 'draft') {
      versions[expansionPath(n)] = expansion.version;
      versions[`leagues/fba/S${n}/rosters.json`] = rosters.version;
      versions[HISTORY_PATH] = history.version;
    }
  }

  const required: DocState<unknown>[] = mode === 'add' ? [teams, tx] : mode === 'draft' ? [teams, tx, rosters, players] : [];
  const optional: DocState<unknown>[] = mode === 'draft' ? [expansion, history] : [];
  const error = meta.error ?? calendar.error
    ?? required.find(d => d.error)?.error ?? optional.find(d => d.error && !d.missing)?.error;
  const base = { versions, mode, error };
  if (n === undefined || !cal) return { ...base, ready: false };
  if (mode === 'none') return { ...base, ready: true };
  if (required.some(d => !d.data) || optional.some(d => !d.data && !d.missing)) return { ...base, ready: false };
  if (mode === 'add') return { ...base, ready: true, addState: { season: n, calendar: cal, teams: teams.data!, tx: tx.data! } };
  return {
    ...base,
    ready: true,
    draftState: {
      season: n,
      calendar: cal,
      teams: teams.data!,
      fba: rosters.data!,
      players: players.data!,
      expansion: expansion.data ?? null,
      tx: tx.data!,
      history: history.data ?? { drafts: [] },
    },
  };
}
