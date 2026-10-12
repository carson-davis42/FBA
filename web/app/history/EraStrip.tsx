import type { Franchise, LogoManifest, Team } from '../../engine/shared/types';
import { logoUrl } from '../components/logoUrl';
import { TeamMark } from '../components/TeamMark';

/**
 * A franchise's name eras, newest first, each with the logos its team wore then. A logo that starts after `currentSeason` is not worn yet:
 * it sits in its own "Future logo" tile ahead of the eras, and joins the current era's tile once its season arrives.
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
      {franchise.eras.map(era => {
        const end = era.to ?? Infinity;
        const logos = entries.filter(e => e.variant === 0 && (e.from ?? 1) <= end && (e.to ?? Infinity) >= era.from);
        return (
          <li key={era.from} className="era-tile">
            <div className="era-logos">
              {folder && logos.length > 0
                ? logos.map(e => (
                  <img
                    key={e.file}
                    className="team-mark"
                    src={logoUrl(folder, Math.max(e.from ?? 1, era.from))}
                    width={56}
                    height={56}
                    alt={`${era.name} logo`}
                  />
                ))
                : team && <TeamMark team={team} season={era.from} size={56} label={era.name} />}
            </div>
            <b>{era.name}</b>
            <span className="muted">{era.abbr} · {era.city}</span>
            <span className="muted">S{era.from}–{era.to === null ? 'pres.' : `S${era.to}`}</span>
          </li>
        );
      })}
    </ol>
  );
}
