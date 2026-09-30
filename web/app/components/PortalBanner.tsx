import { Link } from 'react-router-dom';
import { portalProblem } from '../../engine/college/portal';
import { boardPath, currentClassBoardSeason } from '../../engine/college/state';
import type { CalendarFile, RecruitingFile } from '../../engine/shared/types';
import { useDoc } from '../api';
import '../pages/pages.css';
import '../college/college.css';

/** While the FBAJC transfer portal is open: how many players are in it, and a link to the portal page. Renders nothing otherwise. */
export function PortalBanner() {
  const calendar = useDoc<CalendarFile>('calendar.json');
  const board = useDoc<RecruitingFile>(calendar.data ? boardPath(currentClassBoardSeason(calendar.data.season)) : null);
  if (!calendar.data || portalProblem(calendar.data) !== null) return null;
  const k = board.data?.portal.length ?? 0;
  return (
    <p className="card headed banner">
      {`The S${calendar.data.season} transfer portal is open · ${k} ${k === 1 ? 'player' : 'players'} in it`}{' '}
      <Link to="/league/fbajc/portal">Open the portal ▸</Link>
    </p>
  );
}
