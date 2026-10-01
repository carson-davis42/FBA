import { useRef, useState } from 'react';
import { jcWrites, type JcResult } from '../../engine/jc/state';
import { useSaving, type Versions } from '../api';
import { commitDocs } from '../roster/commit';

/** Runs one Junior College move: shows its problems, or saves its writes with the loaded versions and reloads. */
export function useJcRun(versions: Versions, reload: () => void): { saving: boolean; error: string; run: (build: () => JcResult) => Promise<void> } {
  const saving = useSaving();
  const [error, setError] = useState('');
  const busy = useRef(false);

  const run = async (build: () => JcResult): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setError('');
    try {
      const result = build();
      if (!result.ok) {
        setError(result.problems.join(' '));
        return;
      }
      await commitDocs(result.label, jcWrites(result), versions);
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
