import { useEffect, useState } from 'react';
import { currentStepIndex } from '../../engine/shared/calendar';
import type { CalendarFile } from '../../engine/shared/types';
import { undoLast, useDoc } from '../api';
import { useTheme } from '../useTheme';

export function TopBar() {
  const { data: cal } = useDoc<CalendarFile>('calendar.json');
  const { theme, toggle } = useTheme();
  let pill = '';
  if (cal) {
    const i = currentStepIndex(cal);
    pill = i < 0 ? `S${cal.season} · Complete` : `S${cal.season} · ${cal.steps[i].label}`;
  }
  const [canUndo, setCanUndo] = useState(false);
  const [undoMsg, setUndoMsg] = useState('');
  useEffect(() => {
    const onSaved = () => { setCanUndo(true); setUndoMsg(''); };
    window.addEventListener('batch-saved', onSaved);
    return () => window.removeEventListener('batch-saved', onSaved);
  }, []);
  const undo = async () => {
    try {
      setUndoMsg(`Undid: ${await undoLast()}`);
    } catch (e) {
      setUndoMsg((e as Error).message);
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
      {canUndo && <button className="btn" onClick={undo}>↶ Undo last move</button>}
      {pill && <span className="pill">{pill}</span>}
      <button className="icon-btn" onClick={toggle} aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
        {theme === 'light' ? '☾' : '☀'}
      </button>
    </header>
  );
}
