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

export async function readTabs(file: string, tabs: string[]): Promise<Record<string, string[][]>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const out: Record<string, string[][]> = {};
  for (const name of tabs) {
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
