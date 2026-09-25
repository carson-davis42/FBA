import { currentStepIndex } from '../../engine/shared/calendar';
import type { CalendarFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import { useTheme } from '../useTheme';

export function TopBar() {
  const { data: cal } = useDoc<CalendarFile>('calendar.json');
  const { theme, toggle } = useTheme();
  let pill = '';
  if (cal) {
    const i = currentStepIndex(cal);
    pill = i < 0 ? `S${cal.season} · Complete` : `S${cal.season} · ${cal.steps[i].label}`;
  }
  return (
    <header className="topbar">
      <div className="brand">
        <img src="/logos/FBA/1" alt="" />
        <span>FBA Universe</span>
      </div>
      <div className="spacer" />
      {pill && <span className="pill">{pill}</span>}
      <button className="icon-btn" onClick={toggle} aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
        {theme === 'light' ? '☾' : '☀'}
      </button>
    </header>
  );
}
