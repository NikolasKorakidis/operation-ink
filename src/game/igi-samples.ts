/**
 * Every recording lives in public/OST, in a folder for what it is (see public/OST/README.md). Sound ids keep their
 * source names: `igi/<name>.wav` for the Project IGI bank (provenance in public/OST/igi-manifest.json), plain `<name>`
 * for the older CC0 fallbacks. `servedFile` is the path a sound id is fetched from, under OST/.
 */
const FOLDERS: [RegExp, string][] = [
  [/^(walk_gravel|walk_ladder|step_gravel)_/, 'sfx/footsteps'],
  [/^(bul_|hit_world|hit_flesh)/, 'sfx/impacts'],
  [/^(bodyfall|body_fall|door)/, 'sfx/foley'],
  [/^alarm_/, 'sfx/alarms'],
  [/^(detected|ai_hit)_/, 'voice/guards'],
  [/^player_hit_/, 'voice/player'],
  [/./, 'sfx/weapons'],
]
export function servedFile(id: string) {
  const name = id.replace(/^igi\//, '').replace(/\.wav$/, '')
  // IGI recordings ship as mono AAC; the looped alarm is FLAC because AAC tail padding would leave a gap at every loop.
  const extension = name.startsWith('alarm_') ? 'flac' : 'm4a'
  return `${FOLDERS.find(([pattern]) => pattern.test(name))![1]}/${name}.${extension}`
}

/** Curated samples extracted by scripts/extract-igi-audio.py. */
const files = (...names: string[]) => names.map(name => `igi/${name}.wav`)
const series = (prefix: string, count: number, padding = 1) =>
  files(...Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(padding, '0')}`))
export const IGI_SAMPLES: Record<string, { files: string[]; gain: number }> = {
  horn: { files: files('alarm_1'), gain: 0.48 },
  footstep: { files: series('walk_gravel_', 6), gain: 0.42 },
  'enemy-footstep': { files: series('walk_gravel_', 6), gain: 0.34 },
  ladder: { files: series('walk_ladder_', 4), gain: 0.3 },
  'shot-pistol': { files: files('glock_shot_1', 'glock_shot_2'), gain: 0.75 },
  'enemy-shot-pistol': { files: files('glock_shot_1', 'glock_shot_2'), gain: 0.7 },
  'shot-ak': { files: files('ak47_single'), gain: 0.8 },
  'enemy-shot-ak': { files: files('ak47_single'), gain: 0.75 },
  'shot-smg': { files: files('mp5sd_single'), gain: 0.62 },
  'enemy-shot-smg': { files: files('mp5sd_single'), gain: 0.6 },
  // IGI's suppressed MP5 report doubles as the silenced pistol's muffled crack.
  'shot-silenced': { files: files('mp5sd_single'), gain: 0.42 },
  'enemy-shot-silenced': { files: files('mp5sd_single'), gain: 0.36 },
  'shot-shotgun': { files: files('spas12_shot_1'), gain: 0.95 },
  'enemy-shot-shotgun': { files: files('spas12_shot_1'), gain: 0.88 },
  'weapon-pump': { files: files('spas12_pump'), gain: 0.4 },
  'shell-load': { files: series('spas12_bulins_', 4), gain: 0.3 },
  'reload-shotgun': { files: files('spas12_reload_1'), gain: 0.4 },
  'enemy-reload-shotgun': { files: files('spas12_pump'), gain: 0.35 },
  'reload-ready-shotgun': { files: files('spas12_reload_2'), gain: 0.4 },
  'shot-sniper': { files: files('svddrag_shot_1'), gain: 0.9 },
  'enemy-shot-sniper': { files: files('svddrag_shot_1'), gain: 0.82 },
  impact: { files: series('bul_concrete_', 2), gain: 0.35 },
  'enemy-hit': { files: series('bul_flesh_', 5), gain: 0.75 },
  'hit-confirm': { files: series('bul_flesh_', 5), gain: 0.34 },
  'enemy-pain': { files: series('ai_hit_', 3, 2), gain: 0.95 },
  'enemy-down': { files: series('bodyfall_', 9), gain: 0.5 },
  damage: { files: series('player_hit_', 4), gain: 0.5 },
  'player-death': { files: series('player_hit_', 4), gain: 0.62 },
  'player-fall': { files: series('bodyfall_', 9), gain: 0.7 },
  door: { files: files('door_open_1'), gain: 0.3 },
  pickup: { files: files('weaponpickup_1'), gain: 0.4 },
  drop: { files: series('weapondrop_', 2, 2), gain: 0.35 },
  switch: { files: files('new_gun'), gain: 0.3 },
  empty: { files: files('guns_dry_1'), gain: 0.45 },
  reload: { files: files('ak47_reload_1'), gain: 0.4 },
  'enemy-reload': { files: files('ak47_reload_1'), gain: 0.35 },
  'reload-ready': { files: files('ak47_reload_3'), gain: 0.4 },
}

/** Character vocals are IGI-only; remaining dialogue is caption-only. */
export const IGI_VOICES: Record<string, string[]> = {
  spot: series('detected_', 6, 2),
  contact: series('detected_', 6, 2),
  hurt: series('ai_hit_', 3, 2),
}
