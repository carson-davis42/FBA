# Sheet backups

Snapshots of the Google Sheets the importers read, saved for future reference (what a sheet said on a given day). They are read-only copies: the importers read the live sheets, not these files, and nothing in `web/` depends on them. Do not edit them; add a new dated copy instead.

| File | Source sheet | Used by |
|---|---|---|
| `FBAJC history (2026-10-01).xlsx` | "FBAJC" (`1jgB8AI5dMjSXuSNQm3szoeRF5rIYcgmPXin-idAgE84`): recruiting, transfer portal, national and NIT champions, national and conference awards, All-Americans, conference and preseason champions, total March Madness wins | part 6c (`--jc-history`) |
| `FBA JC School History (2026-10-01).xlsx` | "FBA JC School History" (`1T1gR1wQBVLfzL0o6cO2QKMTDsLDMIo03OJrF4t0CZZ8`): 18 conference tabs, March Madness rounds and conference titles per school | part 6c (`--jc-schools`) |
| `FBA JC School History - Big 12 tab (2026-10-01).pdf` | The Big 12 tab of the same sheet, as a PDF | reference only |
| `FBA - Players (2026-10-01).pdf` | "FBA - Players" tab: every player ever, one row, with careers and honour counts (PDF export, not a workbook) | reference; the registry is already imported into `web/data/players.json` |

The bracket PDF lives in `Past Brackets/`.

Note on the college league's season numbers (S1–S18, then S48 on): see `docs/superpowers/specs/2026-10-01-fbajc-history-6c-design.md` section 1a.
