import type { ReactNode } from 'react';
import { teamVars, type TeamTheme } from './teamColors';

export function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return <div className="stat-tile"><div className="v">{value}</div><div className="l">{label}</div></div>;
}

/** Page-top band: logo, kicker, display title, optional children (buttons, badges) and stat tiles. Team colours when `theme` is given. */
export function Hero({ kicker, title, logo, stats, theme, children }: {
  kicker?: ReactNode; title: ReactNode; logo?: ReactNode; stats?: { label: string; value: ReactNode }[]; theme?: TeamTheme; children?: ReactNode;
}) {
  return (
    <section className={`hero${theme ? ' hero-team' : ''}`} style={theme ? teamVars(theme) : undefined}>
      {logo && <div className="hero-logo">{logo}</div>}
      <div className="hero-body">
        {kicker && <div className="hero-kicker">{kicker}</div>}
        <h1 className="hero-title">{title}</h1>
        {children && <div className="hero-extra">{children}</div>}
      </div>
      {stats && stats.length > 0 && <div className="hero-stats">{stats.map(s => <StatTile key={s.label} {...s} />)}</div>}
    </section>
  );
}
