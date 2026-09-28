# FBA

The Java console sims in `FBA/`, `FBAD2/`, `FBAJC/` and `FBAWC/` are being rebuilt as a local web app in `web/`. The Java is the reference implementation (git tag `java-v1`).

- Stack: Vite 5, React 18, React Router 6 (`BrowserRouter`), TypeScript 5, zod 3 (strict schemas), Vitest 2 with jsdom.
- A tiny Node data server saves JSON in `web/data/`.

## Never

- **Read-only inputs:** never modify `FBA/`, `FBAD2/`, `FBAJC/`, `FBAWC/` or `FBA Logos/`.
- **Real save data:** never modify `web/data/**` in tests, scripts or browser checks. It is the user's real league data.
- **The user's servers:** don't start or stop the dev servers on 5173/5174 unless the user asks. They run with `npm run dev` from `web/`, or the `fba-web` entry in `.claude/launch.json`.
- **Stray files:** leave none in the repo. Scratch goes in `.superpowers/sdd/` (git-ignored).

## Commands

Run these from `web/`:

- `npx vitest run [paths]`: tests.
- `npx tsc --noEmit`: typecheck; it must print nothing.
- `npm run dev`: app on http://localhost:5173, data server on 127.0.0.1:5174.

The shell is Git Bash on Windows. PowerShell is also available.

## Browser checks

Browser checks run on a scratch copy of the data, never on the real data:

- a scratch data server on 5184, via `.superpowers/sdd/rscheck/server.ts`;
- Vite on 5183, via `web/rscheck.vite.config.ts`, which is deleted when the check is done;
- data prep via `.superpowers/sdd/rscheck/prep.mjs`, which copies `web/data` and fills empty roster slots.

When done, stop both processes, delete the scratch data and config, and confirm that `git status` is clean.

## How the code is built

- **Engine** (`web/engine/`): pure TypeScript.
  - Every random choice takes an injected `Rng` (`engine/d2/random.ts`: `mulberry32`, `randInt`, `shuffle`).
  - Moves return `{ ok: true, state, changed, label }` or `{ ok: false, problems }`.
- **Schemas:** every saved document type has a strict zod schema in `engine/shared/types.ts` and a path rule in `engine/shared/schemaRegistry.ts`. The committed `web/data` must keep passing `web/data.test.ts`.
- **Saves use optimistic concurrency:**
  - The server uses ETag/If-Match, and batches carry `baseVersion`.
  - The client goes through `web/app/api.ts` (`useDoc`, `putDoc`, `postBatch`, `useSaving`).
  - New write paths must pass the loaded versions via `commitDocs` / `commitMove` (`app/roster/commit.ts`), `commitSeason`, or `useAutosaveDoc`.
  - Chained saves must use the versions returned by the previous save.
- **Tests:** Vitest globals are off, so every jsdom test file calls `cleanup()` in `afterEach`.
- **Gotcha:** `useSaving()` forces an extra render when a save starts. An effect that saves, guarded only by state, will save twice, so guard it with a `useRef`.
- **The calendar drives play:**
  - The engine refuses season steps out of calendar order.
  - Roster locks follow the season phase (`engine/season/locks.ts`).

## Workflow

- Each roadmap part goes through the superpowers skills in order: brainstorming → spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → subagent-driven development → finishing-a-development-branch.
- Implementers and reviewers read `.superpowers/sdd/implementer-instructions.md` and `.superpowers/sdd/reviewer-instructions.md`.
- Progress is tracked in `.superpowers/sdd/progress.md`. Trust it and `git log` after a context reset.
- Work on a feature branch, never directly on `main`.
- The commissioner's league rule history is in `docs/fba-rule-changes.md`. The overall design is in `docs/superpowers/specs/2026-09-25-fba-web-design.md`.

## Commits

End commit messages with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
