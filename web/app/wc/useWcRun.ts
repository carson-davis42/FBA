import { useRef, useState } from 'react';
import type { WcResult } from '../../engine/wc/state';
import { wcWrites } from '../../engine/wc/writes';
import { useSaving, type Versions } from '../api';
import { commitDocs } from '../roster/commit';

type WcDocsState = Parameters<typeof wcWrites>[0]['state'];
export type WcOkOrWrites =
  | Extract<WcResult<WcDocsState>, { ok: true }>
  | { ok: true; label: string; writes: { path: string; doc: unknown }[] };
export type WcFail = { ok: false; problems: string[] };

/** Runs one World Cup move: shows its problems, or saves its writes with the loaded versions and reloads. */
export function useWcRun(versions: Versions, reload: () => void): { saving: boolean; error: string; run: (build: () => WcOkOrWrites | WcFail) => Promise<void> } {
  const saving = useSaving();
  const [error, setError] = useState('');
  const busy = useRef(false);

  const run = async (build: () => WcOkOrWrites | WcFail): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setError('');
    try {
      const result = build();
      if (!result.ok) {
        setError(result.problems.join(' '));
        return;
      }
      await commitDocs(result.label, 'writes' in result ? result.writes : wcWrites(result), versions);
      reload();
    } catch (e) {
      setError((e as Error).message);
      reload();
    } finally {
      busy.current = false;
    }
  };
  return { saving, error, run };
}
