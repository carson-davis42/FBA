import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { schemaForPath } from '../engine/shared/schemaRegistry';

export class StorageError extends Error {
  constructor(readonly status: number, message: string, readonly issues?: unknown) {
    super(message);
  }
}

const isMissing = (e: unknown) => (e as NodeJS.ErrnoException).code === 'ENOENT';

export class Storage {
  private seq = 0;

  constructor(private readonly dataDir: string, private readonly maxBackups = 10) {}

  private fullPath(rel: string): string {
    if (!schemaForPath(rel)) throw new StorageError(404, `Unknown document path: ${rel}`);
    return path.join(this.dataDir, ...rel.split('/'));
  }

  async read(rel: string): Promise<unknown> {
    const file = this.fullPath(rel);
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch (e) {
      if (isMissing(e)) throw new StorageError(404, `Not found: ${rel}`);
      throw e;
    }
  }

  async write(rel: string, doc: unknown): Promise<void> {
    const file = this.fullPath(rel);
    const result = schemaForPath(rel)!.safeParse(doc);
    if (!result.success) throw new StorageError(400, `Invalid document for ${rel}`, result.error.issues);

    let existing: string | null = null;
    try {
      existing = await readFile(file, 'utf8');
    } catch (e) {
      if (!isMissing(e)) throw e;
    }
    if (existing !== null) {
      const prev = JSON.parse(existing) as { locked?: unknown };
      if (prev && prev.locked === true) throw new StorageError(409, `${rel} belongs to a finished (locked) season and can't be changed`);
      await this.backup(rel, existing);
    }

    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${this.seq++}.tmp`;
    await writeFile(tmp, JSON.stringify(result.data, null, 2) + '\n');
    await rename(tmp, file);
  }

  private async backup(rel: string, content: string): Promise<void> {
    const dir = path.join(this.dataDir, '.backups');
    await mkdir(dir, { recursive: true });
    const prefix = `${rel.replaceAll('/', '__')}.`;
    await writeFile(path.join(dir, `${prefix}${Date.now()}-${String(this.seq++).padStart(6, '0')}.json`), content);
    const mine = (await readdir(dir)).filter(f => f.startsWith(prefix)).sort();
    for (const old of mine.slice(0, Math.max(0, mine.length - this.maxBackups))) await unlink(path.join(dir, old));
  }
}
