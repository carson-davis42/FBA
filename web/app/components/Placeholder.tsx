import { PageHeader } from './PageHeader';

export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section>
      <PageHeader title={title} />
      <div className="card muted">{note}</div>
    </section>
  );
}
