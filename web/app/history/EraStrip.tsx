import type { Franchise, LogoManifest, Team } from '../../engine/shared/types';
import { logoUrl } from '../components/logoUrl';
import { TeamMark } from '../components/TeamMark';

/** A franchise's name eras, newest first, each with the logos its team wore then. */
export function EraStrip({ franchise, team, manifest }: { franchise: Franchise; team: Team | undefined; manifest: LogoManifest | null }) {
  const folder = team?.logoFolder ?? null;
  const entries = folder && manifest ? manifest.folders[folder] ?? [] : [];
  return (
    <ol className="era-strip">
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
