import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map(r => r.text).join('').trim();
    if ('result' in o) return cellText(o.result);
    if ('formula' in o || 'sharedFormula' in o) return '';
    if ('text' in o) return cellText(o.text);
    if ('error' in o) return '';
  }
  return String(v).trim();
}

export async function downloadWorkbook(sheetId: string, cacheDir: string): Promise<string> {
  const file = path.join(cacheDir, `${sheetId}.xlsx`);
  if (existsSync(file)) return file;
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`);
  if (!res.ok) {
    throw new Error(`Downloading sheet ${sheetId} failed with HTTP ${res.status}. Is it shared as "Anyone with the link can view"?`);
  }
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

/** Rows of the named tabs, or of every tab whose name the predicate accepts (the workbook is parsed once). */
export async function readTabs(file: string, tabs: string[] | ((name: string) => boolean)): Promise<Record<string, string[][]>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const out: Record<string, string[][]> = {};
  const names = typeof tabs === 'function' ? wb.worksheets.map(ws => ws.name).filter(tabs) : tabs;
  for (const name of names) {
    const ws = wb.getWorksheet(name);
    if (!ws) throw new Error(`Tab "${name}" not found in ${path.basename(file)}`);
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      rows[n - 1] = Array.from(row.values as unknown[]).slice(1).map(cellText);
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    out[name] = rows;
  }
  return out;
}

/** The workbook's tab names, in sheet order. */
export async function tabNames(file: string): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb.worksheets.map(ws => ws.name);
}

/** Cells with underlined text, keyed "<row index>:<column index>" (0-based, matching readTabs rows). */
export async function readUnderlines(file: string, tab: string): Promise<Set<string>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(tab);
  if (!ws) throw new Error(`Tab "${tab}" not found in ${path.basename(file)}`);
  const out = new Set<string>();
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    row.eachCell({ includeEmpty: false }, (c, col) => {
      if (c.font?.underline) out.add(`${n - 1}:${col - 1}`);
    });
  });
  return out;
}
