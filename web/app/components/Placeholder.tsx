export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <div className="card muted">{note}</div>
    </section>
  );
}
