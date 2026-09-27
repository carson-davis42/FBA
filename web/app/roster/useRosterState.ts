import { DOC_KEYS, docPath, type RosterState } from '../../engine/roster/state';
import type { MetaFile } from '../../engine/shared/types';
import { useDoc } from '../api';

export function useRosterState(): { state?: RosterState; error?: Error } {
  const meta = useDoc<MetaFile>('meta.json');
  const season = meta.data?.currentSeason;
  const rel = (k: (typeof DOC_KEYS)[number]) => (season === undefined ? null : docPath(k, season));
  const fba = useDoc<RosterState['fba']>(rel('fba'));
  const d2 = useDoc<RosterState['d2']>(rel('d2'));
  const freeAgents = useDoc<RosterState['freeAgents']>(rel('freeAgents'));
  const reserves = useDoc<RosterState['reserves']>(rel('reserves'));
  const picks = useDoc<RosterState['picks']>(rel('picks'));
  const players = useDoc<RosterState['players']>(rel('players'));
  const fbaTx = useDoc<RosterState['fbaTx']>(rel('fbaTx'));
  const d2Tx = useDoc<RosterState['d2Tx']>(rel('d2Tx'));
  const docs = [fba, d2, freeAgents, reserves, picks, players, fbaTx, d2Tx];
  const error = meta.error ?? docs.find(d => d.error)?.error;
  if (season === undefined || docs.some(d => !d.data)) return { error };
  return {
    state: {
      season, fba: fba.data!, d2: d2.data!, freeAgents: freeAgents.data!, reserves: reserves.data!,
      picks: picks.data!, players: players.data!, fbaTx: fbaTx.data!, d2Tx: d2Tx.data!,
    },
  };
}
