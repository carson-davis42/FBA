import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { schemaForPath } from './engine/shared/schemaRegistry';

const DATA_DIR = path.join(__dirname, 'data');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '.backups') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.json')) out.push(full);
  }
  return out;
}

describe('committed data', () => {
  const files = walk(DATA_DIR);

  it('found at least 19 data files', () => {
    expect(files.length).toBeGreaterThanOrEqual(19);
  });

  it.each(files.map(f => [path.relative(DATA_DIR, f).split(path.sep).join('/'), f] as const))(
    'validates %s',
    (rel, full) => {
      const schema = schemaForPath(rel);
      expect(schema, `no schema registered for ${rel}`).not.toBeNull();

      const doc: unknown = JSON.parse(readFileSync(full, 'utf8'));
      const result = schema!.safeParse(doc);
      if (!result.success) {
        throw new Error(`${rel} failed validation: ${JSON.stringify(result.error.issues.slice(0, 5), null, 2)}`);
      }
      expect(result.success).toBe(true);
    },
  );
});
