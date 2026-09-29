import { useCallback, useEffect, useState } from 'react';
import { currentStepIndex } from '../../engine/shared/calendar';
import { isUndoProtected } from '../../engine/shared/schemaRegistry';
import type { CalendarFile } from '../../engine/shared/types';
import { peekUndo, undoLast, useDoc, useSaving } from '../api';
import { useTheme } from '../useTheme';

export function TopBar() {
  const { data: cal } = useDoc<CalendarFile>('calendar.json');
  const { theme, toggle } = useTheme();
  let pill = '';
  if (cal) {
    const i = currentStepIndex(cal);
    pill = i < 0 ? `S${cal.season} · Complete` : `S${cal.season} · ${cal.steps[i].label}`;
  }
  const [undo, setUndo] = useState<{ available: boolean; label: string | null; blockedBy: string | null }>({ available: false, label: null, blockedBy: null });
  const [undoMsg, setUndoMsg] = useState('');
  const saving = useSaving();

  const refreshUndo = useCallback(async () => {
    try {
      setUndo(await peekUndo());
    } catch {
      // Leave the button's current state alone if the check itself fails.
    }
  }, []);

  useEffect(() => { refreshUndo(); }, [refreshUndo]);
  useEffect(() => {
    const onSaved = () => { refreshUndo(); setUndoMsg(''); };
    window.addEventListener('doc-saved', onSaved);
    return () => window.removeEventListener('doc-saved', onSaved);
  }, [refreshUndo]);

  const doUndo = async () => {
    try {
      setUndoMsg(`Undid: ${await undoLast()}`);
    } catch (e) {
      setUndoMsg((e as Error).message);
    } finally {
      await refreshUndo();
    }
  };
  return (
    <header className="topbar">
      <div className="brand">
        <img src="/logos/FBA/1" alt="" />
        <span>FBA Universe</span>
      </div>
      <div className="spacer" />
      {undoMsg && <span className="muted undo-msg">{undoMsg}</span>}
      {undo.available && (
        <button
          className="btn"
          disabled={saving || undo.blockedBy !== null}
          onClick={doUndo}
          title={undo.blockedBy && isUndoProtected(undo.blockedBy) ? `"${undo.label}" is final and can't be undone`
            : undo.blockedBy ? `Can't undo "${undo.label}": ${undo.blockedBy} has changed since` : undo.label ? `Undo: ${undo.label}` : undefined}
        >↶ Undo last move</button>
      )}
      {pill && <span className="pill">{pill}</span>}
      <button className="icon-btn" onClick={toggle} aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
        {theme === 'light' ? '☾' : '☀'}
      </button>
    </header>
  );
}
