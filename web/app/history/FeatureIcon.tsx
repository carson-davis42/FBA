import type { Team } from '../../engine/shared/types';
import { TeamMark } from '../components/TeamMark';

export type IconName =
  | 'trophy' | 'teams' | 'draft' | 'awards' | 'awardsByPlayer' | 'seasons' | 'leaders' | 'streaks' | 'players' | 'hall' | 'transactions' | 'timeline' | 'recruiting' | 'schools';

const SPOTS = [
  { left: '0%', top: '36%', size: 38, rot: -12 },
  { left: '24%', top: '0%', size: 42, rot: 8 },
  { left: '50%', top: '34%', size: 40, rot: -6 },
  { left: '74%', top: '2%', size: 36, rot: 14 },
];

/** A few team logos, tilted and overlapping, spread across the teams list; empty until the teams load. */
function TeamsIcon({ teams, season }: { teams: Team[]; season: number }) {
  const picks = [0.05, 0.3, 0.55, 0.8].map(f => teams[Math.floor(f * teams.length)]).filter(Boolean);
  return (
    <span className="feature-icon feature-logos" data-icon="teams" aria-hidden="true">
      {picks.map((t, i) => (
        <span key={t.teamId} className="feature-logo" style={{ left: SPOTS[i].left, top: SPOTS[i].top, transform: `rotate(${SPOTS[i].rot}deg)` }}>
          <TeamMark team={t} season={season} size={SPOTS[i].size} silent />
        </span>
      ))}
    </span>
  );
}

const SHAPES: Record<Exclude<IconName, 'teams'>, JSX.Element> = {
  trophy: (
    <>
      <path d="M22 10h28v18a14 14 0 0 1-28 0z" />
      <path d="M22 15h-9a9 9 0 0 0 9 14M50 15h9a9 9 0 0 1-9 14" />
      <path d="M36 42v9M26 58h20M29 51h14v7" />
      <path className="fill" d="M36 17l2.4 5 5.4.7-4 3.7 1 5.4-4.8-2.7-4.8 2.7 1-5.4-4-3.7 5.4-.7z" />
    </>
  ),
  draft: (
    <>
      <rect x="10" y="6" width="52" height="52" rx="4" />
      <path d="M10 18h52M10 32h52M10 46h52M27 18v40M44 18v40" />
      <rect className="fill" x="12" y="20" width="13" height="10" rx="1.5" />
      <rect className="fill" x="29" y="34" width="13" height="10" rx="1.5" />
      <rect className="fill" x="46" y="48" width="14" height="8" rx="1.5" />
      <path d="M16 12h14" />
    </>
  ),
  awards: (
    <>
      <circle cx="36" cy="25" r="16" />
      <path d="M26 39l-8 20 11-5 5 8M46 39l8 20-11-5-5 8" />
      <path className="fill" d="M36 14l3 6.3 6.8.9-5 4.7 1.3 6.8L36 29.4l-6.1 3.3 1.3-6.8-5-4.7 6.8-.9z" />
    </>
  ),
  awardsByPlayer: (
    <>
      <circle cx="28" cy="20" r="9" />
      <path d="M10 56c0-12 8-20 18-20s18 8 18 20" />
      <circle className="fill" cx="52" cy="40" r="9" />
      <path d="M47 48l-3 12 8-3 8 3-3-12" />
    </>
  ),
  seasons: (
    <>
      <rect x="10" y="12" width="52" height="46" rx="5" />
      <path d="M10 26h52M24 6v12M48 6v12" />
      <circle className="fill" cx="24" cy="36" r="3" />
      <circle cx="36" cy="36" r="3" />
      <circle cx="48" cy="36" r="3" />
      <circle cx="24" cy="48" r="3" />
      <circle cx="36" cy="48" r="3" />
    </>
  ),
  leaders: (
    <>
      <rect x="8" y="34" width="16" height="24" />
      <rect className="fill" x="28" y="20" width="16" height="38" />
      <rect x="48" y="42" width="16" height="16" />
      <path d="M4 58h64" />
      <path d="M36 6l2 4.6 5 .6-3.7 3.4 1 5-4.3-2.5-4.3 2.5 1-5-3.7-3.4 5-.6z" />
    </>
  ),
  streaks: (
    <>
      <rect className="fill" x="5" y="22" width="11" height="20" rx="2" />
      <rect className="fill" x="19" y="22" width="11" height="20" rx="2" />
      <rect className="fill" x="33" y="22" width="11" height="20" rx="2" />
      <rect className="fill" x="47" y="22" width="11" height="20" rx="2" />
      <rect x="61" y="22" width="8" height="20" rx="2" />
      <path d="M5 52h53" />
    </>
  ),
  players: (
    <>
      <circle cx="30" cy="28" r="20" />
      <circle cx="30" cy="22" r="6" />
      <path d="M18 40c1-7 6-10 12-10s11 3 12 10" />
      <path className="thick" d="M45 43l17 17" />
    </>
  ),
  hall: (
    <>
      <path d="M8 22L36 8l28 14z" />
      <path d="M14 28v22M28 28v22M44 28v22M58 28v22" />
      <path d="M8 56h56M12 50h48" />
      <circle className="fill" cx="36" cy="18" r="2.5" />
    </>
  ),
  transactions: (
    <>
      <path d="M8 22h46M44 12l10 10-10 10" />
      <path className="fill-line" d="M64 46H18M28 36L18 46l10 10" />
    </>
  ),
  recruiting: (
    <>
      <rect x="14" y="6" width="44" height="52" rx="4" />
      <path d="M22 18h28M22 27h28M22 36h16" />
      <circle className="fill" cx="46" cy="46" r="8" />
      <path d="M42 54l-2 8 6-3 6 3-2-8" />
    </>
  ),
  schools: (
    <>
      <path d="M36 10L4 24l32 14 32-14z" />
      <path d="M16 31v14c0 5 9 9 20 9s20-4 20-9V31" />
      <path className="fill-line" d="M64 26v18" />
      <circle className="fill" cx="64" cy="47" r="3" />
    </>
  ),
  timeline: (
    <>
      <path d="M6 34h60" />
      <circle className="fill" cx="16" cy="34" r="5" />
      <circle cx="30" cy="34" r="5" />
      <circle className="fill" cx="44" cy="34" r="5" />
      <circle cx="58" cy="34" r="5" />
      <path d="M16 29V16M30 39v13M44 29V16M58 39v13" />
    </>
  ),
};

/** The hub's section symbol: line art in the text colour with accent-filled highlights. Decorative; the card's label names it. */
export function FeatureIcon({ name, teams = [], season = 79 }: { name: IconName; teams?: Team[]; season?: number }) {
  if (name === 'teams') return <TeamsIcon teams={teams} season={season} />;
  return (
    <svg className="feature-icon" data-icon={name} viewBox="0 0 72 64" width="88" height="64" aria-hidden="true" focusable="false">
      {SHAPES[name]}
    </svg>
  );
}
