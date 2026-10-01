// Usage: npx tsx importers/history/convertBracketsRun.ts <wc|d2>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertTranscript, type BracketEntry } from './convertBrackets';

const kind = process.argv[2];
if (kind !== 'wc' && kind !== 'd2') { console.error('Usage: convertBracketsRun.ts <wc|d2>'); process.exit(1); }
const dir = dirname(fileURLToPath(import.meta.url));
const tdir = join(dir, 'transcripts');
const files = readdirSync(tdir).filter(f => f.startsWith(`${kind}-`) && f.endsWith('.txt')).sort();
const order = ['PL', 'WL', 'UL', 'IL'];
try {
  const text = files.map(f => readFileSync(join(tdir, f), 'utf8')).join('\n');
  const { entries, warnings } = convertTranscript(text);
  entries.sort((a: BracketEntry, b: BracketEntry) => a.season - b.season || order.indexOf(a.group ?? '') - order.indexOf(b.group ?? ''));
  writeFileSync(join(dir, `${kind}Brackets.json`), JSON.stringify(entries, null, 2) + '\n');
  for (const w of warnings) console.error(w);
  console.log(`${entries.length} entries: ${entries.map(e => 'S' + e.season + (e.group ? e.group : '')).join(' ')}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
