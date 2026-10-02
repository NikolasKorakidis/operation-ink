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

/**
 * The campaign: the missions played one at a time, in order. `mission` is the one you are on (null once the last is
 * done), `completed` those finished. Load game continues it: that mission's checkpoint if it has one, else its
 * briefing. New game starts it over and clears the missions' checkpoints. Free missions never touch it.
 */
export type Campaign = { version: number; mission: string | null; completed: string[]; startedAt: number }
const CAMPAIGN_KEY = 'stickman-ghost-ink.campaign'

/** The campaign in progress, or null. A mission saved before campaigns existed counts as one, on that mission. */
export function readCampaign(): Campaign | null {
  try {
    const campaign = JSON.parse(storage()?.getItem(CAMPAIGN_KEY) ?? 'null') as Campaign | null
    if (campaign?.version === SAVE_VERSION && (campaign.mission === null || LEVELS[campaign.mission])) return campaign
  } catch { /* damaged: as if none */ }
  const [newest] = listSaves()
  return newest ? { version: SAVE_VERSION, mission: newest.level, completed: [], startedAt: newest.savedAt } : null
}

function writeCampaign(campaign: Campaign) {
  try { storage()?.setItem(CAMPAIGN_KEY, JSON.stringify(campaign)) } catch { /* storage unavailable */ }
  return campaign
}

/** A new campaign from the first mission; every mission's checkpoint is cleared. */
export function startCampaign(): Campaign {
  for (const level of Object.keys(LEVELS)) deleteSave(level)
  return writeCampaign({ version: SAVE_VERSION, mission: FIRST_LEVEL, completed: [], startedAt: Date.now() })
}

/** A campaign mission is won: it is done, and the campaign moves on. Returns the next mission's id, or null at the end. */
export function finishCampaignMission(level: string): string | null {
  const campaign = readCampaign() ?? { version: SAVE_VERSION, mission: level, completed: [], startedAt: Date.now() }
  const order = campaignLevels().map(entry => entry.id)
  const next = order[order.indexOf(level) + 1] ?? null
  writeCampaign({ ...campaign, mission: next, completed: [...new Set([...campaign.completed, level])] })
  return next
}

/** The campaign's mission number for a level (1-based), or 0 for one outside it. */
export const missionNumber = (level: string) => campaignLevels().findIndex(entry => entry.id === level) + 1

/**
 * How the next level was entered, kept across the switch to it: from the campaign (it saves, and leads on to the
 * next mission) or as a free mission (no saves, no campaign progress).
 */
export type RunKind = 'campaign' | 'free'
const RUN_KEY = 'stickman-ghost-ink.next-run'
export function setNextRun(kind: RunKind, level: string) {
  try { window.sessionStorage.setItem(RUN_KEY, JSON.stringify({ kind, level })) } catch { /* the level opens without it */ }
}
/** The run kind set for this level before switching to it (read once). */
export function takeRun(level: string): RunKind | null {
  try {
    const next = JSON.parse(window.sessionStorage.getItem(RUN_KEY) ?? 'null') as { kind: RunKind; level: string } | null
    window.sessionStorage.removeItem(RUN_KEY)
    return next?.level === level ? next.kind : null
  } catch { return null }
}
