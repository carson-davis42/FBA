/**
 * A sheet "Date" cell as `YYYY-MM-DD`, or null for `X`, a blank or anything else.
 * `readTabs` renders a date cell (exceljs gives a `Date` at UTC midnight) as that ISO day already; only the Date columns go through this,
 * because Excel also stores some series scores ("2-1") as dates.
 */
export function dateCell(text: string | undefined): string | null {
  const t = (text ?? '').trim();
  // An Excel serial day (a date cell exported as a number).
  if (/^\d+(\.\d+)?$/.test(t) && Number(t) >= 20000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 864e5).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t ? null : t;
}
