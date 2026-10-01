import type { CalendarFile, QualifyingFile, RostersFile, WorldCupFile } from '../shared/types';
import type { WcKey, WcResult } from './state';

type WcDocs = { calendar: CalendarFile; rosters: RostersFile; qualifying?: QualifyingFile | null; worldCup?: WorldCupFile | null };

/** The documents a wc move changed, as `{path, doc}` writes (same order as `changed`). */
export function wcWrites<S extends WcDocs>(result: Extract<WcResult<S>, { ok: true }>): { path: string; doc: unknown }[] {
  const s = result.state;
  const one = (k: WcKey): { path: string; doc: unknown } => {
    switch (k) {
      case 'calendar': return { path: 'calendar.json', doc: s.calendar };
      case 'rosters': return { path: `leagues/fbawc/S${s.rosters.season}/rosters.json`, doc: s.rosters };
      case 'qualifying': return { path: `leagues/fbawc/S${s.qualifying!.season}/qualifying.json`, doc: s.qualifying };
      case 'worldcup': return { path: `leagues/fbawc/S${s.worldCup!.season}/worldcup.json`, doc: s.worldCup };
    }
  };
  return result.changed.map(one);
}
