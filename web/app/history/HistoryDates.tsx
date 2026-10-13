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

/** "Season ran Oct 1 – Oct 12, 2026" for a season played in the app; nothing without a span. */
export function SpanLine({ span }: { span: { opened: string; locked: string } | null | undefined }) {
  const text = span ? formatSpan(span.opened, span.locked) : null;
  return text ? <p className="muted span-line">Season ran {text}</p> : null;
}
