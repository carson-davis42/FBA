import type { ReactNode } from 'react';
import { PageHeader } from '../components/PageHeader';
import type { JcDocs } from './useJcDocs';

/** The load failure, a missing required doc, or "Loading..." under a title that doesn't name a season; null once the state is ready. */
export function jcGate(docs: JcDocs, kicker: string, title: string): ReactNode | null {
  const note = docs.error ? <p className="error">{docs.error}</p>
    : docs.missing ? <p className="muted">{docs.missing}</p>
    : !docs.state ? <p className="muted">Loading...</p>
    : null;
  return note ? <section className="jc-page"><PageHeader kicker={kicker} title={title} />{note}</section> : null;
}
