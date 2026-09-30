import type { ReactNode } from 'react';

export type BadgeKind = 'champion' | 'mvp' | 'finals-mvp' | 'all-star' | 'all-fba' | 'hof' | 'clinched' | 'eliminated' | 'final' | 'live' | 'current' | 'done';

export function Badge({ kind, children }: { kind: BadgeKind; children: ReactNode }) {
  return <span className={`badge badge-${kind}`}>{children}</span>;
}
