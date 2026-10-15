# FBAJC Bracketology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a projected March Madness bracket on the FBAJC Postseason page until the real fields are set, built by the same selection code as the real fields.

**Architecture:** Extract the "ranking + champions -> field + regions + brackets" step of `setFields` into `computeField`. A pure `projectBracket(state)` calls it with real-or-projected conference champions and adds bubble/bids/seed-line data. A new `Bracketology` tab renders the projection with `BracketView`; it is derived from state with `useMemo`, so it follows every ranking update and writes nothing.

**Tech Stack:** TypeScript 5, React 18, Vitest 2 (jsdom), existing `engine/jc/*`.

**Spec:** `docs/superpowers/specs/2026-10-15-fbajc-bracketology-design.md`

## Global Constraints

- Run commands from `web/`: `npx vitest run [paths]`, `npx tsc --noEmit` (must print nothing).
- Never modify `web/data/**`, `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/`, `FBA Logos/`. Never start/stop the dev servers on 5173/5174.
- Do not stage or commit `web/app/season/LiveGame.tsx`, `web/app/shell/Layout.tsx`, `web/app/shell/useScrollMemory.ts` or `web/data/**`. Stage by explicit path, never `git add -A`.
- Files are CRLF: prefer single-line `Edit` anchors; apostrophes in `it('...')` titles are fine in TS files but avoid them in shell heredocs.
- jsdom test files call `cleanup()` in `afterEach` (vitest globals are off).
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (project CLAUDE.md).
- Work on branch `bracketology`.

## Review Focus

- Conference with no tournament yet and a team missing from the ranking: no crash, conference simply has no projected champion.
- Projected champion equals a team the real rules would also pick at-large: it must appear once, and not count as "last four in".
- A major-conference quota case (`majorLeft >= 52 - a`): projection must equal `setFields` because it shares `computeField`.
- Ranking not yet published (no snapshots): section shows an empty-state message, not an error.
- Fields already set: tab is hidden and a stale `?tab=bracketology` URL falls back to the default tab.

---

### Task 1: Extract `computeField` and add `projectBracket`

**Files:**
- Modify: `web/engine/jc/fieldMoves.ts` (add `computeField`, use it in `setFields`)
- Create: `web/engine/jc/bracketology.ts`
- Create: `web/engine/jc/bracketology.test.ts`

**Interfaces:**
- Produces:
  - `computeField(ranking: string[], champions: string[], rsChampions: string[], confOf: (id: string) => string): ComputedField`
  - `interface ComputedField { mmTeams: string[]; leftover: string[]; nitTeams: string[]; warnings: string[]; seeds: Record<string, number>; regions: string[][]; mm: Bracket; nit: Bracket }`
  - `projectBracket(state: JcState): Projection | null`
  - `interface Projection { afterDay: number; champions: Record<string, { teamId: string; projected: boolean }>; seeds: Record<string, number>; regions: string[][]; mmTeams: string[]; mm: Bracket; seedLines: string[][]; lastFourIn: string[]; firstFourOut: string[]; bids: { conf: string; count: number; teams: string[] }[]; nit: string[]; warnings: string[] }`

- [ ] **Step 1: Write the failing test** `web/engine/jc/bracketology.test.ts`

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { mulberry32 } from '../d2/random';
import { projectBracket } from './bracketology';
import { playAllConf, startConfTournaments } from './confTourney';
import { setFields } from './fieldMoves';
import { jcPlayedFixture, jcStateFixture } from './testFixtures';
import { conferenceOf, type JcState } from './state';

let played: JcState;
let afterConf: JcState;
beforeAll(() => {
  played = jcPlayedFixture();
  const s = startConfTournaments(played);
  if (!s.ok) throw new Error(s.problems.join());
  const r = playAllConf(s.state, mulberry32(5));
  if (!r.ok) throw new Error(r.problems.join());
  afterConf = r.state;
}, 240000);

describe('projectBracket', () => {
  it('is null before there is a ranking', () => {
    expect(projectBracket(jcStateFixture())).toBeNull();
  });

  it('matches setFields exactly once every conference champion is known', () => {
    const real = setFields(afterConf);
    if (!real.ok) throw new Error(real.problems.join());
    const p = projectBracket(afterConf)!;
    const f = real.state.postseason!.field!;
    expect(p.mmTeams).toEqual(f.mm.teams);
    expect(p.seeds).toEqual(f.mm.seeds);
    expect(p.regions).toEqual(f.mm.regions);
    expect(p.nit).toEqual(f.nit.teams);
    expect(Object.values(p.champions).every(c => !c.projected)).toBe(true);
  });

  it('projects the best-ranked team of each conference before the tournaments', () => {
    const p = projectBracket(played)!;
    const ranking = played.rankings!.snapshots.at(-1)!.order;
    for (const [conf, c] of Object.entries(p.champions)) {
      expect(c.projected).toBe(true);
      expect(c.teamId).toBe(ranking.find(id => conferenceOf(played.teams, id) === conf));
    }
    expect(p.mmTeams).toHaveLength(64);
    expect(p.mmTeams).toEqual(expect.arrayContaining(Object.values(p.champions).map(c => c.teamId)));
  });

  it('has four teams on every seed line, four bubble teams each side, and bids that add up to 64', () => {
    const p = projectBracket(played)!;
    expect(p.seedLines).toHaveLength(16);
    expect(p.seedLines.every(l => l.length === 4)).toBe(true);
    expect(p.lastFourIn).toHaveLength(4);
    expect(p.firstFourOut).toHaveLength(4);
    const champs = new Set(Object.values(p.champions).map(c => c.teamId));
    expect(p.lastFourIn.some(t => champs.has(t))).toBe(false);
    expect(p.lastFourIn.every(t => p.mmTeams.includes(t))).toBe(true);
    expect(p.firstFourOut.some(t => p.mmTeams.includes(t))).toBe(false);
    expect(p.bids.reduce((n, b) => n + b.count, 0)).toBe(64);
    expect(p.bids.map(b => b.count)).toEqual([...p.bids.map(b => b.count)].sort((a, b) => b - a));
  });

  it('uses the real champion for a finished conference and the best-ranked team for the rest', () => {
    const ps = afterConf.postseason!;
    const keep = ps.conf[0];
    const partial: JcState = { ...afterConf, postseason: { ...ps, conf: ps.conf.map((b, i) => (i === 0 ? b : { ...b, champion: null })) } };
    const p = projectBracket(partial)!;
    expect(p.champions[keep.id]).toEqual({ teamId: keep.champion, projected: false });
    expect(Object.entries(p.champions).filter(([id]) => id !== keep.id).every(([, c]) => c.projected)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run engine/jc/bracketology.test.ts`
Expected: FAIL (cannot resolve `./bracketology`).

- [ ] **Step 3: Extract `computeField` in `engine/jc/fieldMoves.ts`**

Add `import type { Bracket, JcPostseasonFile } from '../shared/types';` (replace the existing `JcPostseasonFile`-only import line) and add before `setFields`:

```ts
export interface ComputedField {
  mmTeams: string[];
  leftover: string[];
  nitTeams: string[];
  warnings: string[];
  seeds: Record<string, number>;
  regions: string[][];
  mm: Bracket;
  nit: Bracket;
}

/** The one place the March Madness and NIT fields are chosen and placed: the real "Set the fields" and Bracketology both use it. */
export function computeField(ranking: string[], champions: string[], rsChampions: string[], confOf: (id: string) => string): ComputedField {
  const { field, leftover } = selectMarchMadness(ranking, champions, confOf);
  const nit = selectNit(leftover, rsChampions);
  const placed = placeRegions(field, confOf);
  return {
    mmTeams: field, leftover, nitTeams: nit.teams, warnings: nit.warnings, seeds: placed.seeds, regions: placed.regions,
    mm: buildMarchMadness(placed.regions, placed.seeds), nit: buildNit(nit.teams),
  };
}
```

Replace the body of `setFields` after the `ranking` null check (the `selectMarchMadness`, `selectNit`, `withField` lines) with:

```ts
  const c = computeField(ranking, ps.conf.map(b => b.champion!), Object.values(ps.rsChampions).flat(), confOfTeam(state));
  const postseason: JcPostseasonFile = {
    ...ps,
    field: { mm: { teams: c.mmTeams, seeds: c.seeds, regions: c.regions }, nit: { teams: c.nitTeams }, warnings: c.warnings },
    mm: c.mm,
    nit: c.nit,
  };
```

`withField` stays for `swapField`.

- [ ] **Step 4: Create `engine/jc/bracketology.ts`**

```ts
import type { Bracket } from '../shared/types';
import { confTables, latestRanking } from './confTourney';
import { computeField } from './fieldMoves';
import { conferenceOf, type JcState } from './state';

export interface Projection {
  /** The last regular-season or tournament day the ranking was published after. */
  afterDay: number;
  /** One champion per conference: the real one once its tournament is finished, else the best-ranked team. */
  champions: Record<string, { teamId: string; projected: boolean }>;
  seeds: Record<string, number>;
  regions: string[][];
  mmTeams: string[];
  mm: Bracket;
  /** Seed 1..16, four teams each. */
  seedLines: string[][];
  lastFourIn: string[];
  firstFourOut: string[];
  bids: { conf: string; count: number; teams: string[] }[];
  nit: string[];
  warnings: string[];
}

/** The bracket as it would be picked now. Uses `computeField`, the same code as "Set the fields". Null before the first ranking. */
export function projectBracket(state: JcState): Projection | null {
  const ranking = latestRanking(state);
  if (!ranking || ranking.length < 96) return null;
  const confOf = (id: string): string => conferenceOf(state.teams, id);

  const conferences = [...new Set(state.teams.teams.map(t => t.group))].filter(Boolean).sort();
  const champions: Projection['champions'] = {};
  for (const conf of conferences) {
    const real = state.postseason?.conf.find(b => b.id === conf)?.champion ?? null;
    if (real) {
      champions[conf] = { teamId: real, projected: false };
      continue;
    }
    const best = ranking.find(id => confOf(id) === conf);
    if (best) champions[conf] = { teamId: best, projected: true };
  }
  const championIds = Object.values(champions).map(c => c.teamId);
  const rsChampions = state.postseason ? Object.values(state.postseason.rsChampions).flat() : confTables(state).flatMap(t => t.champions);

  const c = computeField(ranking, championIds, rsChampions, confOf);
  const champSet = new Set(championIds);
  const byConf = new Map<string, string[]>();
  for (const t of c.mmTeams) byConf.set(confOf(t), [...(byConf.get(confOf(t)) ?? []), t]);
  const bids = [...byConf].map(([conf, teams]) => ({ conf, count: teams.length, teams }))
    .sort((a, b) => b.count - a.count || a.conf.localeCompare(b.conf));

  return {
    afterDay: state.rankings!.snapshots.at(-1)!.afterDay,
    champions,
    seeds: c.seeds,
    regions: c.regions,
    mmTeams: c.mmTeams,
    mm: c.mm,
    seedLines: Array.from({ length: 16 }, (_, i) => c.mmTeams.filter(t => c.seeds[t] === i + 1)),
    lastFourIn: c.mmTeams.filter(t => !champSet.has(t)).slice(-4),
    firstFourOut: c.leftover.slice(0, 4),
    bids,
    nit: c.nitTeams,
    warnings: c.warnings,
  };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run engine/jc/bracketology.test.ts engine/jc/fieldMoves.test.ts engine/jc/field.test.ts` then `npx tsc --noEmit`
Expected: PASS; tsc prints nothing. If `jcStateFixture()` has a ranking, the null test must use `jcUnstartedFixture()` instead.

- [ ] **Step 6: Commit**

```bash
git add web/engine/jc/fieldMoves.ts web/engine/jc/bracketology.ts web/engine/jc/bracketology.test.ts
git commit -m "FBAJC: projectBracket shares computeField with Set the fields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Bracketology tab

**Files:**
- Create: `web/app/jc/Bracketology.tsx`
- Modify: `web/app/jc/PostseasonPage.tsx` (tab list, default tab, render)
- Modify: `web/app/jc/PostseasonPage.test.tsx` (new tests)

**Interfaces:**
- Consumes: `projectBracket`, `Projection` from `engine/jc/bracketology`; `BracketView` from `./BracketView`.
- Produces: `Bracketology({ state, teamCell }: { state: JcState; teamCell: (id: string) => ReactNode })`.

- [ ] **Step 1: Write the failing tests** (append inside `describe('PostseasonPage', ...)` in `PostseasonPage.test.tsx`)

```tsx
  it('shows Bracketology as the first tab and opens on it before the conference tournaments', async () => {
    mount(played);
    const tab = await screen.findByRole('tab', { name: 'Bracketology' });
    expect(tab.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Last four in' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'First four out' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Watch' })).toBeNull();
  });

  it('keeps Bracketology reachable after the conference tournaments but hides it once the fields are set', async () => {
    mount(afterConf, '/league/fbajc/postseason?tab=bracketology');
    expect(await screen.findByRole('heading', { name: 'Last four in' })).toBeTruthy();
    cleanup();
    const set = setFields(afterConf);
    if (!set.ok) throw new Error(set.problems.join());
    mount(set.state, '/league/fbajc/postseason?tab=bracketology');
    await screen.findByRole('tab', { name: 'Field' });
    expect(screen.queryByRole('tab', { name: 'Bracketology' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Last four in' })).toBeNull();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run app/jc/PostseasonPage.test.tsx -t Bracketology`
Expected: FAIL (no Bracketology tab).

- [ ] **Step 3: Create `web/app/jc/Bracketology.tsx`**

```tsx
import { useMemo, useState, type ReactNode } from 'react';
import { projectBracket } from '../../engine/jc/bracketology';
import type { JcState } from '../../engine/jc/state';
import { BracketView } from './BracketView';

/** The projected March Madness bracket, derived from the latest ranking. Read-only; nothing is saved. */
export function Bracketology({ state, teamCell }: { state: JcState; teamCell: (id: string) => ReactNode }) {
  const p = useMemo(() => projectBracket(state), [state]);
  const [region, setRegion] = useState(0);
  if (!p) return <p className="muted">There is no ranking yet. Bracketology appears once the first rankings are out.</p>;
  const champ = new Map(Object.values(p.champions).map(c => [c.teamId, c.projected]));
  const mark = (id: string): ReactNode => (champ.has(id)
    ? <span className="muted"> ({champ.get(id) ? 'projected conference champion' : 'conference champion'})</span> : null);
  const real = Object.values(p.champions).filter(c => !c.projected).length;
  return (
    <section>
      <p className="muted">
        Projected with the same selection rules as the real fields, from the ranking after day {p.afterDay}.
        {' '}{real} of {Object.keys(p.champions).length} conference champions are decided; the rest are the best-ranked team in their conference.
      </p>
      {p.warnings.map(w => <p key={w} className="error">{w}</p>)}
      <h2>Projected bracket</h2>
      <div className="jc-regions">
        {p.regions.map((reg, k) => (
          <div key={k} className="card jc-field">
            <h3>Region {k + 1}</h3>
            <ol>
              {[...reg].sort((a, b) => p.seeds[a] - p.seeds[b]).map(id => <li key={id}>{p.seeds[id]}. {teamCell(id)}{mark(id)}</li>)}
            </ol>
          </div>
        ))}
      </div>
      <div className="jc-regions">
        <div className="card jc-field">
          <h3>Last four in</h3>
          <ol>{p.lastFourIn.map(id => <li key={id}>{p.seeds[id]}. {teamCell(id)}</li>)}</ol>
        </div>
        <div className="card jc-field">
          <h3>First four out</h3>
          <ol>{p.firstFourOut.map(id => <li key={id}>{teamCell(id)}</li>)}</ol>
        </div>
      </div>
      <h2>Seed lines</h2>
      <div className="card jc-field">
        <ol>{p.seedLines.map((line, i) => (
          <li key={i}>{i + 1}: {line.map((id, j) => <span key={id}>{j > 0 && ', '}{teamCell(id)}</span>)}</li>
        ))}</ol>
      </div>
      <h2>Bids by conference</h2>
      <div className="card jc-field">
        <ul>{p.bids.map(b => (
          <li key={b.conf}>{b.conf}: {b.count} {b.count === 1 ? 'bid' : 'bids'}</li>
        ))}</ul>
      </div>
      <h2>Bracket</h2>
      <div className="jc-tabs">
        {[0, 1, 2, 3].map(r => <button key={r} type="button" className="btn" aria-pressed={region === r} onClick={() => setRegion(r)}>Region {r + 1}</button>)}
        <button type="button" className="btn" aria-pressed={region === -1} onClick={() => setRegion(-1)}>Final Four</button>
      </div>
      <BracketView bracket={p.mm} teamCell={teamCell} filter={g => (region === -1 ? g.round >= 5 : g.region === region && g.round < 5)} />
      <h2>NIT teams</h2>
      <div className="card jc-field">
        <ol>{p.nit.map(id => <li key={id}>{teamCell(id)}</li>)}</ol>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire it into `PostseasonPage.tsx`**

Single-line edits:

1. `import { BracketView } from './BracketView';` -> add below it `import { Bracketology } from './Bracketology';`.
2. `type Tab = 'conference' | 'field' | 'nit' | 'mm';` -> `type Tab = 'bracketology' | 'conference' | 'field' | 'nit' | 'mm';`
3. `const TABS: [Tab, string][] = [['conference', ...` -> prepend `['bracketology', 'Bracketology'],`.
4. `DEFAULT_TAB` `regular: 'conference'` -> `regular: 'bracketology'` (conf/fields keep their action tabs; the commissioner's next step is there).
5. Replace the `tab` and tab-list rendering so the tab is hidden once `state.postseason?.field` exists:

```tsx
  const fieldsSet = !!state.postseason?.field;
  const visibleTabs = TABS.filter(([id]) => id !== 'bracketology' || !fieldsSet);
  const tab = (visibleTabs.find(([id]) => id === params.get('tab'))?.[0]) ?? (DEFAULT_TAB[stage] === 'bracketology' && fieldsSet ? 'conference' : DEFAULT_TAB[stage]);
```
   and map over `visibleTabs` instead of `TABS` in the `role="tablist"` div.
6. Add before the `{tab === 'field' && ...}` line: `{tab === 'bracketology' && <Bracketology state={state} teamCell={teamCell} />}`.

- [ ] **Step 5: Run tests, full suite, typecheck**

Run: `npx vitest run app/jc/PostseasonPage.test.tsx`, then `npx vitest run`, then `npx tsc --noEmit`
Expected: all PASS (2936 + new), tsc prints nothing. Read the vitest output before committing.

- [ ] **Step 6: Commit**

```bash
git add web/app/jc/Bracketology.tsx web/app/jc/PostseasonPage.tsx web/app/jc/PostseasonPage.test.tsx
git commit -m "FBAJC Postseason: Bracketology tab with a projected March Madness bracket

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

- Spec coverage: shared rules (Task 1 `computeField`), projected champions (Task 1), bubble/bids/seed lines/NIT list (Task 1), tab visible until fields set + default (Task 2), updates on ranking change (`useMemo` on `state`), no saves (no `run` used), not browser-verified (reported at the end).
- One deliberate narrowing of the spec's default-tab rule: the tab opens by default in the `regular` stage only; in `conf` and `fields` the existing action tabs stay default, and Bracketology is one click away until the fields are set.
