export type Level = 'error' | 'warn' | 'info';

export interface ReportEntry {
  level: Level;
  topic: string;
  message: string;
}

const HEADINGS: Record<Level, string> = { error: 'Errors', warn: 'Warnings', info: 'Info' };

export class Report {
  readonly entries: ReportEntry[] = [];

  error(topic: string, message: string): void { this.entries.push({ level: 'error', topic, message }); }
  warn(topic: string, message: string): void { this.entries.push({ level: 'warn', topic, message }); }
  info(topic: string, message: string): void { this.entries.push({ level: 'info', topic, message }); }

  get hasErrors(): boolean {
    return this.entries.some(e => e.level === 'error');
  }

  count(level: Level): number {
    return this.entries.filter(e => e.level === level).length;
  }

  toMarkdown(title: string): string {
    const out = [`# ${title}`, '', `Errors: ${this.count('error')} · Warnings: ${this.count('warn')} · Info: ${this.count('info')}`];
    for (const level of ['error', 'warn', 'info'] as Level[]) {
      const items = this.entries.filter(e => e.level === level);
      if (!items.length) continue;
      out.push('', `## ${HEADINGS[level]}`);
      const topics = [...new Set(items.map(e => e.topic))];
      for (const topic of topics) {
        out.push('', `### ${topic}`, '');
        for (const e of items.filter(x => x.topic === topic)) out.push(`- ${e.message}`);
      }
    }
    return out.join('\n') + '\n';
  }
}
