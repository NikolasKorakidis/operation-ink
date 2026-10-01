import { FIRST_LEVEL, campaignLevels } from '../levels/catalog'

/**
 * Saved missions, one slot per level, kept in the browser. A small index (what the Load mission page lists)
 * is stored apart from each level's full checkpoint, so the menu never parses a whole save just to draw itself.
 * Storage can be missing or full (private windows, blocked site data); every call then quietly does nothing.
 */

/** Every campaign level that can be saved, by id (levels/catalog.ts); a save names the level it belongs to. */
export const LEVELS: Record<string, { name: string }> = Object.fromEntries(campaignLevels().map(level => [level.id, { name: level.name }]))
/** The campaign's first level. */
export const CURRENT_LEVEL: string = FIRST_LEVEL

/** Saves from an older format are ignored rather than loaded into a game they no longer fit. */
const SAVE_VERSION = 1
const INDEX_KEY = 'stickman-ghost-ink.saves'
const slotKey = (level: string) => `stickman-ghost-ink.save.${level}`

export type SaveInfo = { level: string; savedAt: number; elapsed: number; objective: string }
type Index = { version: number; saves: SaveInfo[] }

function storage(): Storage | null {
  try { return window.localStorage } catch { return null }
}

// JSON has no Infinity or NaN; checkpoints use them for "never" timers, so they travel as tagged values.
const replacer = (_key: string, value: unknown) =>
  typeof value === 'number' && !Number.isFinite(value) ? { $number: String(value) } : value
const reviver = (_key: string, value: unknown) =>
  value && typeof value === 'object' && '$number' in value && Object.keys(value).length === 1 ? Number((value as { $number: string }).$number) : value

function readIndex(): SaveInfo[] {
  try {
    const index = JSON.parse(storage()?.getItem(INDEX_KEY) ?? 'null') as Index | null
    return index?.version === SAVE_VERSION ? index.saves.filter(save => LEVELS[save.level]) : []
  } catch { return [] }
}

function writeIndex(saves: SaveInfo[]) {
  try { storage()?.setItem(INDEX_KEY, JSON.stringify({ version: SAVE_VERSION, saves } satisfies Index)) } catch { /* storage unavailable */ }
}

/** The saved missions, newest first. */
export function listSaves(): SaveInfo[] {
  return readIndex().sort((a, b) => b.savedAt - a.savedAt)
}

/** Overwrites the level's slot. Returns false when the browser would not store it. */
export function writeSave<T>(info: Omit<SaveInfo, 'savedAt'>, checkpoint: T): boolean {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(slotKey(info.level), JSON.stringify(checkpoint, replacer))
  } catch { return false }
  writeIndex([...readIndex().filter(save => save.level !== info.level), { ...info, savedAt: Date.now() }])
  return true
}

export function readSave<T>(level: string): T | null {
  if (!readIndex().some(save => save.level === level)) return null
  try {
    const text = storage()?.getItem(slotKey(level))
    return text ? JSON.parse(text, reviver) as T : null
  } catch { return null }
}

export function deleteSave(level: string) {
  try { storage()?.removeItem(slotKey(level)) } catch { /* storage unavailable */ }
  const saves = readIndex()
  if (saves.some(save => save.level === level)) writeIndex(saves.filter(save => save.level !== level))
}
