import type { PlayersFile } from './types'

/** Player ids by lower-cased name; only names that belong to exactly one player are kept (the same rule the importers use). */
export function uniqueNameIndex(players: PlayersFile): Map<string, string> {
  const seen = new Map<string, string | null>()
  for (const p of Object.values(players.players)) {
    if (!p.name) continue
    const key = p.name.trim().toLowerCase()
    seen.set(key, seen.has(key) ? null : p.id)
  }
  return new Map([...seen].filter((e): e is [string, string] => e[1] !== null))
}

/** Names the sheets spell differently from the player record (lower case on both sides). */
const NAME_SPELLING: Record<string, string> = { 'mitchel corey': 'mitchell corey' }

/** The player a name belongs to, when exactly one does. */
export const idForName = (index: Map<string, string>, name: string): string | null => {
  const key = name.trim().toLowerCase()
  return index.get(NAME_SPELLING[key] ?? key) ?? null
}
