import { formatDay, formatSpan } from '../../engine/shared/dates';

/** A real-life day as an inline muted note (" · Oct 12, 2026"); nothing when the date is null, absent or invalid. */
export function DayStamp({ date, label }: { date: string | null | undefined; label?: string }) {
  const text = formatDay(date);
  return text ? <span className="muted day-stamp"> · {label ? `${label} ` : ''}{text}</span> : null;
}

/** "Finals: Oct 12, 2026" as its own line; nothing when the date is null, absent or invalid. */
export function DayLine({ label, date }: { label: string; date: string | null | undefined }) {
  const text = formatDay(date);
  return text ? <p className="muted day-line">{label}: {text}</p> : null;
}

/** One dated event: "Oct 1" or "Oct 1 – Oct 12, 2026" (a start or end alone shows just that day); null when neither bound is known. */
function eventText(e: { start: string | null; end: string | null }): string | null {
  const start = formatDay(e.start);
  const end = formatDay(e.end);
  if (start && end) return start === end ? end : formatSpan(`${e.start}T00:00:00Z`, `${e.end}T00:00:00Z`);
  return end ?? start;
}

/** The season's dated events as a small list (Draft, D2 season, FBA playoffs…); nothing when there are none with a date. */
export function EventDates({ events }: { events: { label: string; start: string | null; end: string | null }[] | null | undefined }) {
  const rows = (events ?? []).map(e => ({ label: e.label, text: eventText(e) })).filter((r): r is { label: string; text: string } => r.text !== null);
  if (rows.length === 0) return null;
  return (
    <ul className="muted event-dates" aria-label="Dated events">
      {rows.map(r => <li key={r.label}><span>{r.label}</span> · {r.text}</li>)}
    </ul>
  );
}

/** "Season ran Oct 1 – Oct 12, 2026" for a season played in the app; nothing without a span. */
export function SpanLine({ span }: { span: { opened: string; locked: string } | null | undefined }) {
  const text = span ? formatSpan(span.opened, span.locked) : null;
  return text ? <p className="muted span-line">Season ran {text}</p> : null;
}
