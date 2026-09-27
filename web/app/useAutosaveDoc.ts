import { useCallback, useEffect, useRef, useState } from 'react';
import { putDoc, type Version } from './api';

export interface AutosaveDoc<T> {
  doc: T | undefined;
  /** The version of the last save or load this hook knows about. Send it with any batch that also writes this doc. */
  version: Version;
  /** Applies a change to the latest local copy and queues a save. */
  update: (change: (current: T) => T) => void;
  error: string;
}

/**
 * A local copy of one document that saves every change with PUT + If-Match.
 * Saves run one at a time, each with the version the previous save returned, so quick edits never conflict with each other.
 * New server data replaces the local copy only while no save is pending; after a failed save it falls back to the server copy.
 */
export function useAutosaveDoc<T>(path: string, data: T | undefined, version: Version): AutosaveDoc<T> {
  const [local, setLocal] = useState<{ doc: T | undefined; version: Version }>({ doc: data, version });
  const [error, setError] = useState('');
  const docRef = useRef<T | undefined>(data);
  const versionRef = useRef<Version>(version);
  const pending = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef({ data, version });
  latest.current = { data, version };

  const resync = useCallback(() => {
    docRef.current = latest.current.data;
    versionRef.current = latest.current.version;
    setLocal({ doc: latest.current.data, version: latest.current.version });
  }, []);

  useEffect(() => {
    if (pending.current === 0) resync();
  }, [data, version, resync]);

  const update = useCallback((change: (current: T) => T) => {
    if (docRef.current === undefined) return;
    const next = change(docRef.current);
    docRef.current = next;
    setLocal(l => ({ ...l, doc: next }));
    setError('');
    pending.current++;
    let failed = false;
    chain.current = chain.current
      .then(async () => {
        const v = await putDoc(path, next, versionRef.current);
        versionRef.current = v;
        setLocal(l => ({ ...l, version: v }));
      })
      .catch((e: unknown) => {
        failed = true;
        setError((e as Error).message);
      })
      .finally(() => {
        pending.current--;
        if (pending.current === 0 && failed) resync();
      });
  }, [path, resync]);

  return { doc: local.doc, version: local.version, update, error };
}
