import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isUndoProtected, pathAgreementProblem, schemaForPath } from '../engine/shared/schemaRegistry';
import { SummaryFile } from '../engine/shared/types';

export type Version = string | null;

/** A document's version: the first 16 hex chars of the SHA-256 of its file text, or null when the file doesn't exist. */
export function versionOf(text: string | null): Version {
  return text === null ? null : createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export class StorageError extends Error {
  constructor(readonly status: number, message: string, readonly issues?: unknown, readonly conflicts?: string[]) {
    super(message);
  }
}

export interface BatchWrite {
  path: string;
  doc: unknown;
  /** The version the caller loaded (null = the file must not exist yet). Omitted = unconditional write. */
  baseVersion?: Version;
}

export interface WriteOptions {
  /** Write without a journal entry, then delete every journal entry and backup once all writes succeed. */
  resetUndo?: boolean;
}

interface JournalFile {
  path: string;
  before: string | null;
  after: string;
}

interface JournalEntry {
  id: string;
  label: string;
  files: JournalFile[];
}

const isMissing = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'ENOENT';
const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);
const MAX_JOURNAL = 50;

function isLocked(text: string): boolean {
  try {
    return (JSON.parse(text) as { locked?: unknown })?.locked === true;
  } catch {
    return false;
  }
}

export class Storage {
  private seq = 0;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly dataDir: string, private readonly maxBackups = 10) {}

  /** Runs storage mutations one at a time so overlapping requests can't interleave. */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private fullPath(rel: string): string {
    if (!schemaForPath(rel)) throw new StorageError(404, `Unknown document path: ${rel}`);
    return path.join(this.dataDir, ...rel.split('/'));
  }

  private async readRaw(file: string): Promise<string | null> {
    try {
      return await readFile(file, 'utf8');
    } catch (e) {
      if (isMissing(e)) return null;
      throw e;
    }
  }

  private async atomicWrite(file: string, text: string): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${this.seq++}.tmp`;
    await writeFile(tmp, text);
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmp, file);
        return;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code ?? '';
        if (!RETRYABLE.has(code) || attempt >= 5) {
          await unlink(tmp).catch(() => undefined);
          throw e;
        }
        await new Promise(r => setTimeout(r, 20 * (attempt + 1)));
      }
    }
  }

  /** Validates one document for rel and returns its canonical text plus the file's current text. */
  private async prepare(rel: string, doc: unknown): Promise<{ file: string; text: string; before: string | null }> {
    const file = this.fullPath(rel);
    const result = schemaForPath(rel)!.safeParse(doc);
    if (!result.success) throw new StorageError(400, `Invalid document for ${rel}`, result.error.issues);
    const mismatch = pathAgreementProblem(rel, result.data);
    if (mismatch) throw new StorageError(400, mismatch);
    const before = await this.readRaw(file);
    if (before !== null && isLocked(before)) throw new StorageError(409, `${rel} is locked (finished) and can't be changed`);
    return { file, text: JSON.stringify(result.data, null, 2) + '\n', before };
  }

  async read(rel: string): Promise<unknown> {
    const text = await this.readRaw(this.fullPath(rel));
    if (text === null) throw new StorageError(404, `Not found: ${rel}`);
    return JSON.parse(text);
  }

  async readWithVersion(rel: string): Promise<{ doc: unknown; version: string }> {
    const text = await this.readRaw(this.fullPath(rel));
    if (text === null) throw new StorageError(404, `Not found: ${rel}`);
    return { doc: JSON.parse(text), version: versionOf(text)! };
  }

  write(rel: string, doc: unknown, baseVersion?: Version): Promise<{ version: string }> {
    return this.serialize(async () => {
      const p = await this.prepare(rel, doc);
      if (baseVersion !== undefined && versionOf(p.before) !== baseVersion) {
        throw new StorageError(409, `Changed since it was loaded: ${rel}`, undefined, [rel]);
      }
      if (p.before !== null) await this.backup(rel, p.before);
      await this.atomicWrite(p.file, p.text);
      return { version: versionOf(p.text)! };
    });
  }

  writeMany(label: string, writes: BatchWrite[], options: WriteOptions = {}): Promise<{ batchId: string; versions: Record<string, string> }> {
    return this.serialize(async () => {
      const seen = new Set<string>();
      const prepared: { rel: string; file: string; text: string; before: string | null }[] = [];
      for (const w of writes) {
        if (seen.has(w.path)) throw new StorageError(400, `Duplicate path in batch: ${w.path}`);
        seen.add(w.path);
        prepared.push({ rel: w.path, ...(await this.prepare(w.path, w.doc)) });
      }

      const conflicts = writes
        .filter((w, i) => w.baseVersion !== undefined && versionOf(prepared[i].before) !== w.baseVersion)
        .map(w => w.path);
      if (conflicts.length) throw new StorageError(409, `Changed since they were loaded: ${conflicts.join(', ')}`, undefined, conflicts);

      const id = `${Date.now()}-${String(this.seq++).padStart(6, '0')}`;
      if (!options.resetUndo) await this.saveJournal({ id, label, files: prepared.map(p => ({ path: p.rel, before: p.before, after: p.text })) });

      const done: typeof prepared = [];
      try {
        for (const p of prepared) {
          if (p.before !== null) await this.backup(p.rel, p.before);
          await this.atomicWrite(p.file, p.text);
          done.push(p);
        }
      } catch (e) {
        const rollbackFailures: string[] = [];
        for (const p of done.reverse()) {
          try {
            if (p.before === null) await unlink(p.file);
            else await this.atomicWrite(p.file, p.before);
          } catch (re) {
            rollbackFailures.push(`${p.rel}: ${(re as Error).message}`);
          }
        }
        if (rollbackFailures.length && options.resetUndo) {
          console.error(`Batch "${label}" failed and could not be fully rolled back; the previous copies are in .backups/`, rollbackFailures);
          throw new StorageError(500, `Save failed partway and could not be fully undone (${rollbackFailures.join('; ')}). The previous copies are in .backups/.`);
        }
        if (rollbackFailures.length) {
          console.error(`Batch "${label}" failed and could not be fully rolled back; journal ${id} kept for recovery`, rollbackFailures);
          throw new StorageError(500, `Save failed partway and could not be fully undone (${rollbackFailures.join('; ')}). Use Undo last move to restore.`);
        }
        await unlink(this.journalPath(id)).catch(() => undefined);
        throw e;
      }
      if (options.resetUndo) await this.clearUndo();
      return { batchId: id, versions: Object.fromEntries(prepared.map(p => [p.rel, versionOf(p.text)!])) };
    });
  }

  undo(): Promise<{ label: string; paths: string[] }> {
    return this.serialize(async () => {
      const names = await this.journalNames();
      for (let i = names.length - 1; i >= 0; i--) {
        const name = names[i];
        const entry = await this.readJournalEntry(name);
        if (!entry) continue;
        const blockedBy = await this.blockedFile(entry);
        if (blockedBy && isUndoProtected(blockedBy)) throw new StorageError(409, `Can't undo "${entry.label}": it is final`);
        if (blockedBy) throw new StorageError(409, `Can't undo "${entry.label}": ${blockedBy} has changed since then`);
        for (const f of entry.files) {
          const file = this.fullPath(f.path);
          const current = await this.readRaw(file);
          if (current === f.before) continue;
          if (f.before === null) await unlink(file);
          else await this.atomicWrite(file, f.before);
        }
        await unlink(path.join(this.journalDir(), name));
        return { label: entry.label, paths: entry.files.map(f => f.path) };
      }
      throw new StorageError(404, 'Nothing to undo');
    });
  }

  /** Reports the label of the move `undo()` would restore, without consuming it. */
  peekUndo(): Promise<{ label: string; blockedBy: string | null } | null> {
    return this.serialize(async () => {
      const names = await this.journalNames();
      for (let i = names.length - 1; i >= 0; i--) {
        const entry = await this.readJournalEntry(names[i]);
        if (entry) return { label: entry.label, blockedBy: await this.blockedFile(entry) };
      }
      return null;
    });
  }

  /** Every valid leagues/<league>/S<n>/summary.json, ordered by n. A file that is bad JSON or fails the schema is skipped and listed in `errors`. */
  async history(league: string): Promise<{ seasons: unknown[]; errors: { season: number; message: string }[] }> {
    let names: string[];
    try {
      names = await readdir(path.join(this.dataDir, 'leagues', league));
    } catch (e) {
      if (isMissing(e)) return { seasons: [], errors: [] };
      throw e;
    }
    const seasons = names
      .map(n => /^S([1-9]\d*)$/.exec(n))
      .filter((m): m is RegExpExecArray => m !== null)
      .map(m => Number(m[1]))
      .sort((a, b) => a - b);
    const out: unknown[] = [];
    const errors: { season: number; message: string }[] = [];
    for (const n of seasons) {
      const text = await this.readRaw(this.fullPath(`leagues/${league}/S${n}/summary.json`));
      if (text === null) continue;
      let doc: unknown;
      try {
        doc = JSON.parse(text);
      } catch {
        errors.push({ season: n, message: 'bad JSON' });
        continue;
      }
      const parsed = SummaryFile.safeParse(doc);
      if (parsed.success) out.push(doc);
      else {
        const issue = parsed.error.issues[0];
        errors.push({ season: n, message: issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message });
      }
    }
    return { seasons: out, errors };
  }

  /** Deletes the Undo journal and the backups. A failure is logged, not thrown: the batch itself has already been saved. */
  private async clearUndo(): Promise<void> {
    for (const dir of [this.journalDir(), path.join(this.dataDir, '.backups')]) {
      try {
        await rm(dir, { recursive: true, force: true, maxRetries: 5 });
      } catch (e) {
        console.error(`Couldn't clear ${dir}`, e);
      }
    }
  }

  /**
   * What would block undoing the entry, or null: an undo-protected path it wrote (the move is final), else the first path
   * whose current text is neither its `after` nor its `before`.
   */
  private async blockedFile(entry: JournalEntry): Promise<string | null> {
    const final = entry.files.find(f => isUndoProtected(f.path));
    if (final) return final.path;
    for (const f of entry.files) {
      const current = await this.readRaw(this.fullPath(f.path));
      if (current !== f.after && current !== f.before) return f.path;
    }
    return null;
  }

  /** Reads and parses a journal file. A file that fails to parse is renamed to `<name>.corrupt` and skipped. */
  private async readJournalEntry(name: string): Promise<JournalEntry | null> {
    const file = path.join(this.journalDir(), name);
    const text = await readFile(file, 'utf8');
    try {
      return JSON.parse(text) as JournalEntry;
    } catch {
      await rename(file, `${file}.corrupt`);
      return null;
    }
  }

  private journalDir(): string {
    return path.join(this.dataDir, '.journal');
  }

  private journalPath(id: string): string {
    return path.join(this.journalDir(), `${id}.json`);
  }

  private async journalNames(): Promise<string[]> {
    try {
      return (await readdir(this.journalDir())).filter(n => n.endsWith('.json')).sort();
    } catch (e) {
      if (isMissing(e)) return [];
      throw e;
    }
  }

  private async saveJournal(entry: JournalEntry): Promise<void> {
    await mkdir(this.journalDir(), { recursive: true });
    await this.atomicWrite(this.journalPath(entry.id), JSON.stringify(entry));
    const names = await this.journalNames();
    for (const old of names.slice(0, Math.max(0, names.length - MAX_JOURNAL))) await unlink(path.join(this.journalDir(), old));
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
