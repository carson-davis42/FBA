import { CalendarFile } from '../engine/shared/types';

/** Sets `startedAt` on a calendar of the given season; refuses another season or an invalid ISO datetime (UTC, e.g. 2026-10-01T18:30:00Z). */
export function withSeasonStart(cal: CalendarFile, season: number, iso: string): { ok: true; calendar: CalendarFile } | { ok: false; error: string } {
  if (!Number.isInteger(season)) return { ok: false, error: `"${season}" is not a season number.` };
  if (cal.season !== season) return { ok: false, error: `calendar.json is for S${cal.season}, not S${season}.` };
  const checked = CalendarFile.safeParse({ ...cal, startedAt: iso });
  if (!checked.success) return { ok: false, error: `"${iso}" is not a valid ISO datetime (e.g. 2026-10-01T18:30:00Z).` };
  return { ok: true, calendar: checked.data };
}
