import path from 'node:path';

/**
 * The folder named by `--data <dir>` or `--data=<dir>`, resolved; `fallback` when the flag is absent.
 * An error when the flag has no value (missing, empty, or followed by another flag).
 */
export function parseDataArg(argv: string[], fallback: string): { dir: string } | { error: string } {
  const missing = { error: '--data needs a folder: the data folder to write.' };
  const eq = argv.find(a => a.startsWith('--data='));
  if (eq !== undefined) {
    const value = eq.slice('--data='.length);
    return value ? { dir: path.resolve(value) } : missing;
  }
  const i = argv.indexOf('--data');
  if (i < 0) return { dir: fallback };
  const value = argv[i + 1];
  if (!value || value.startsWith('--')) return missing;
  return { dir: path.resolve(value) };
}

/**
 * The workbook named by `--file <path>` or `--file=<path>` (a local export of a sheet, used instead of downloading it), resolved; null when
 * the flag is absent. An error when the flag has no value.
 */
export function parseFileArg(argv: string[]): { file: string | null } | { error: string } {
  const missing = { error: '--file needs a path: the .xlsx export to read instead of downloading the sheet.' };
  const eq = argv.find(a => a.startsWith('--file='));
  if (eq !== undefined) {
    const value = eq.slice('--file='.length);
    return value ? { file: path.resolve(value) } : missing;
  }
  const i = argv.indexOf('--file');
  if (i < 0) return { file: null };
  const value = argv[i + 1];
  if (!value || value.startsWith('--')) return missing;
  return { file: path.resolve(value) };
}
