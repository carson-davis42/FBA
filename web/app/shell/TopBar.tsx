import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LEAGUES, LEAGUE_LABEL } from '../../engine/shared/leagues';
import { currentStepIndex } from '../../engine/shared/calendar';
import { isUndoProtected } from '../../engine/shared/schemaRegistry';
import type { CalendarFile, LeagueId } from '../../engine/shared/types';
import { peekUndo, undoLast, useDoc, useSaving } from '../api';
import { logoUrl } from '../components/logoUrl';
import { useTheme } from '../useTheme';
import { SHORT_LABEL } from './useCurrentLeague';

export function TopBar({ league }: { league: LeagueId }) {
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
    <header className="masthead">
      <Link to="/" className="brand" aria-label="FBA Universe home"><img src={logoUrl('FBA', 1)} alt="" /><span className="brand-text">FBA Universe</span></Link>
      <nav className="league-switch" aria-label="Leagues">
        {LEAGUES.map(lg => (
          <Link key={lg} to={`/league/${lg}`} className={lg === league ? 'active' : ''} title={LEAGUE_LABEL[lg]}>{SHORT_LABEL[lg]}</Link>
        ))}
      </nav>
      <div className="spacer" />
      {undoMsg && <span className="undo-msg">{undoMsg}</span>}
      {undo.available && (
        <button
          className="btn"
          aria-label="Undo last move"
          disabled={saving || undo.blockedBy !== null}
          onClick={doUndo}
          title={undo.blockedBy && isUndoProtected(undo.blockedBy) ? `"${undo.label}" is final and can't be undone`
            : undo.blockedBy ? `Can't undo "${undo.label}": ${undo.blockedBy} has changed since` : undo.label ? `Undo: ${undo.label}` : undefined}
        >↶<span className="undo-text"> Undo last move</span></button>
      )}
      {pill && <Link to="/calendar" className="pill">{pill}</Link>}
      <button className="icon-btn" onClick={toggle} aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
        {theme === 'light' ? '☾' : '☀'}
      </button>
    </header>
  );
}
