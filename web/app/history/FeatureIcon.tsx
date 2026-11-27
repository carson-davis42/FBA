import type { MetaFile, Team } from '../../engine/shared/types';
import { useDoc } from '../api';
import { TeamMark } from '../components/TeamMark';

export type IconName =
  | 'trophy' | 'teams' | 'draft' | 'awards' | 'awardsByPlayer' | 'seasons' | 'leaders' | 'streaks' | 'players' | 'hall' | 'transactions' | 'timeline' | 'recruiting'
  | 'freeAgency' | 'age' | 'retirement' | 'ratings' | 'lottery' | 'picks' | 'rookies' | 'classRanking' | 'collegeRatings' | 'd2draft' | 'trim';

/** Four 34px logos on a zigzag, 44px apart, so even tilted none touches the next. */
const SPOTS = [
  { left: 0, top: 28, size: 34, rot: -6 },
  { left: 44, top: 2, size: 34, rot: 5 },
  { left: 88, top: 28, size: 34, rot: -5 },
  { left: 132, top: 2, size: 34, rot: 6 },
];

/** Four teams spread across a list, for when no teams are singled out. */
export function spreadTeams(teams: Team[]): Team[] {
  return [0.05, 0.3, 0.55, 0.8].map(f => teams[Math.floor(f * teams.length)]).filter(Boolean);
}

/**
 * The given teams' logos (the first four), tilted and apart; empty until the teams load. Each is the logo of the current season, so a team
 * that changed its logo since it made the list shows the new one. `season` is used until the current season is known.
 */
function TeamsIcon({ teams, season }: { teams: Team[]; season: number }) {
  const { data: meta } = useDoc<MetaFile>('meta.json');
  const picks = teams.slice(0, 4);
  return (
    <span className="feature-icon feature-logos" data-icon="teams" aria-hidden="true">
      {picks.map((t, i) => (
        <span key={t.teamId} className="feature-logo" style={{ left: SPOTS[i].left, top: SPOTS[i].top, transform: `rotate(${SPOTS[i].rot}deg)` }}>
          <TeamMark team={t} season={meta?.currentSeason ?? season} size={SPOTS[i].size} silent />
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
  freeAgency: (
    <>
      <circle cx="26" cy="20" r="9" />
      <path d="M8 56c0-12 8-20 18-20s18 8 18 20" />
      <circle className="fill" cx="53" cy="38" r="10" />
      <path d="M53 32v12M47 38h12" />
    </>
  ),
  age: (
    <>
      <path d="M18 6h36M18 58h36" />
      <path d="M21 6c0 16 15 18 15 26S21 42 21 58M51 6c0 16-15 18-15 26s15 10 15 26" />
      <path className="fill" d="M29 55h14l-7-10z" />
    </>
  ),
  retirement: (
    <>
      <rect x="36" y="6" width="26" height="52" rx="3" />
      <path d="M6 32h26M22 22l10 10-10 10" />
      <circle className="fill" cx="55" cy="32" r="2.5" />
    </>
  ),
  ratings: (
    <>
      <path d="M8 16h56M8 32h56M8 48h56" />
      <circle className="fill" cx="46" cy="16" r="6" />
      <circle cx="22" cy="32" r="6" />
      <circle cx="36" cy="48" r="6" />
    </>
  ),
  lottery: (
    <>
      <circle cx="22" cy="42" r="14" />
      <circle cx="50" cy="42" r="14" />
      <circle className="fill" cx="36" cy="20" r="14" />
      <path d="M32 22l4-6v12M18 38h8M46 38h8" />
    </>
  ),
  picks: (
    <>
      <rect x="6" y="18" width="34" height="40" rx="4" />
      <rect className="fill" x="22" y="6" width="34" height="40" rx="4" />
      <path d="M30 20h18M30 30h12" />
      <path d="M48 56h16M58 50l6 6-6 6" />
    </>
  ),
  rookies: (
    <>
      <path d="M24 8L8 18l8 12 8-5v33h24V25l8 5 8-12L48 8c-2 6-6 8-12 8s-10-2-12-8z" />
      <path className="fill" d="M36 28l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z" />
    </>
  ),
  classRanking: (
    <>
      <circle className="fill" cx="13" cy="14" r="7" />
      <circle cx="13" cy="32" r="7" />
      <circle cx="13" cy="50" r="7" />
      <path d="M28 14h36M28 32h30M28 50h24" />
    </>
  ),
  collegeRatings: (
    <>
      <path d="M36 10L6 24l30 14 30-14z" />
      <path d="M18 31v14c0 7 36 7 36 0V31" />
      <path d="M66 26v17" />
      <circle className="fill" cx="66" cy="46" r="3.5" />
    </>
  ),
  d2draft: (
    <>
      <path d="M8 8h56L43 34v20l-14 6V34z" />
      <path className="fill-line" d="M20 18h32" />
      <circle className="fill" cx="36" cy="46" r="3" />
    </>
  ),
  trim: (
    <>
      <circle cx="16" cy="14" r="8" />
      <circle cx="16" cy="50" r="8" />
      <path d="M22 19l40 26M22 45L62 19" />
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
