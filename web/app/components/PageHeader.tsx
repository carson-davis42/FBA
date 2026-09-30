import type { ReactNode } from 'react';

/** The standard page title block: accent kicker, display h1, right-aligned actions. */
export function PageHeader({ kicker, title, actions }: { kicker?: ReactNode; title: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {kicker && <div className="page-kicker">{kicker}</div>}
        <h1>{title}</h1>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}
