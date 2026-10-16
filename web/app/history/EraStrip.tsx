import type { ReactNode } from 'react';
import type { Franchise, LogoManifest, Team } from '../../engine/shared/types';
import { logoUrl } from '../components/logoUrl';
import { TeamMark } from '../components/TeamMark';

/**
 * A franchise's name eras, newest first, one tile per logo its team wore in each era (with the seasons it was worn). A logo that starts after
 * `currentSeason` is not worn yet: it sits in its own "Future logo" tile ahead of the eras, and gets its own tile once its season arrives.
 */
export function EraStrip({ franchise, team, manifest, currentSeason }: {
  franchise: Franchise; team: Team | undefined; manifest: LogoManifest | null; currentSeason: number;
}) {
  const folder = team?.logoFolder ?? null;
  const all = folder && manifest ? manifest.folders[folder] ?? [] : [];
  const isFuture = (e: LogoManifest['folders'][string][number]) => e.variant === 0 && e.from !== null && e.from > currentSeason;
  const future = all.filter(isFuture).sort((a, b) => a.from! - b.from!);
  const entries = all.filter(e => !isFuture(e));
  return (
    <ol className="era-strip">
      {folder && future.map(e => (
        <li key={e.file} className="era-tile future-logo">
          <div className="era-logos">
            <img className="team-mark" src={logoUrl(folder, e.from!)} width={56} height={56} alt={`${franchise.eras[0].name} future logo`} />
          </div>
          <b>Future logo</b>
          <span className="muted">Starts S{e.from}</span>
        </li>
      ))}
      {franchise.eras.flatMap(era => {
        const end = era.to ?? Infinity;
        // One tile per logo worn in this era, each with the seasons it was worn (clipped to the era), newest first.
        const logos = entries
          .filter(e => e.variant === 0 && (e.from ?? 1) <= end && (e.to ?? Infinity) >= era.from)
          .sort((a, b) => (b.from ?? 1) - (a.from ?? 1));
        const tile = (key: string, seasons: string, image: ReactNode) => (
          <li key={key} className="era-tile">
            <div className="era-logos">{image}</div>
            <b>{era.name}</b>
            <span className="muted">{era.abbr} · {era.city}</span>
            <span className="muted">{seasons}</span>
          </li>
        );
        if (!folder || logos.length === 0) {
          return [tile(String(era.from), `S${era.from}–${era.to === null ? 'pres.' : `S${era.to}`}`, team && <TeamMark team={team} season={era.from} size={56} label={era.name} />)];
        }
        return logos.map(e => {
          const from = Math.max(e.from ?? 1, era.from);
          const to = Math.min(e.to ?? Infinity, end);
          // The latest logo of the current era, or one still in use while the next has not started, reads "pres.".
          const open = era.to === null && (to === Infinity || to >= currentSeason);
          const seasons = `S${from}–${open ? 'pres.' : `S${to}`}`;
          return tile(`${era.from}-${e.file}`, seasons, <img className="team-mark" src={logoUrl(folder, from)} width={56} height={56} alt={`${era.name} logo`} />);
        });
      })}
    </ol>
  );
}
