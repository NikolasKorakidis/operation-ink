import type { HitZone } from './hit-reactions'
import type { WeaponItem, WeaponName } from './types'
import { GAIT_SPEED } from '../lab/gait'

// Faster mission running, with stride/cadence adaptation shared with the lab.
export const ENEMY_RUN_SPEED = GAIT_SPEED.run * 1.5
export const HOSTAGE_RUN_SPEED = 2.6

/** Ordinary jumps and drops up to about 2.3 m are safe; taller falls scale with impact energy. */
export function fallDamage(landingSpeed: number) {
  if (!Number.isFinite(landingSpeed) || landingSpeed <= 10) return 0
  return Math.min(100, (landingSpeed * landingSpeed - 100) * 0.3)
}

/** Call of Duty-style player health: every enemy bullet removes a quarter, so the fourth hit is lethal.
 * Each bullet hit grants a second of bullet immunity, so a burst cannot land all four at once.
 * After a short pause without damage, health refills to full. Landings keep energy-based damage. */
/**
 * Aim steadiness, in radians. Sway is a slow drift of the crosshair (shots follow it): small standing still,
 * growing with speed, smaller crouched, smallest prone, and reduced while aiming down the sights. Spread is a
 * random cone added while moving or in the air, scaled by the same stance factors. Every weapon uses these.
 */
export const AIM_STEADINESS = {
  sway: { stand: 0.003, crouch: 0.0017, prone: 0.0007, perSpeed: 0.0015, airborne: 0.004 },
  spread: { perSpeed: 0.0035, airborne: 0.03, unscopedSniper: 0.02 },
  /** Firing without aiming: a base cone per weapon, plus bloom that builds with each hip shot and settles when you stop. */
  hip: { pistol: 0.008, silenced: 0.008, smg: 0.011, ak: 0.012 } as Partial<Record<WeaponName, number>>,
  bloom: { perShot: 0.0045, max: 0.02, settleDelay: 0.3, recoveryPerSecond: 0.06 },
  stance: { stand: 1, crouch: 0.6, prone: 0.35 },
  aimed: 0.6,
} as const

/** Guards never hear walking (or sneaking) feet; sprinting carries only this far, in metres. */
export const SPRINT_FOOTSTEP_RADIUS = 6

export const PLAYER_HEALTH = { max: 100, bulletHits: 4, bulletImmunity: 1, regenDelay: 5, regenPerSecond: 40 } as const
export const PLAYER_BULLET_DAMAGE = PLAYER_HEALTH.max / PLAYER_HEALTH.bulletHits

// No armor or damage immunity: every confirmed hit applies this damage immediately.
export const ENEMY_HEALTH = 100
export const HIT_MULTIPLIERS: Record<HitZone, number> = { head: 2.2, torso: 1, arm: 0.6, leg: 0.7 }
export const WEAPON_RULES = {
  pistol: { label: 'Pistol', capacity: 12, reload: 1.85, interval: 0.25, range: 110, damage: 30, automatic: false, kick: 0.03, settle: 0.55 },
  ak: { label: 'AK rifle', capacity: 30, reload: 2.3, interval: 0.12, range: 170, damage: 34, automatic: true, kick: 0.022, settle: 0.6 },
  smg: { label: 'SMG', capacity: 24, reload: 2.05, interval: 0.085, range: 100, damage: 24, automatic: true, kick: 0.012, settle: 0.65 },
  shotgun: { label: 'Pump shotgun', capacity: 6, reload: 0.65, interval: 0.9, range: 32, damage: 28, automatic: false, kick: 0.11, settle: 0.84 },
  sniper: { label: 'Sniper rifle', capacity: 5, reload: 2.9, interval: 1.35, range: 220, damage: 65, automatic: false, kick: 0.048, settle: 0.85 },
  silenced: { label: 'Silenced pistol', capacity: 12, reload: 1.85, interval: 0.25, range: 110, damage: 30, automatic: false, kick: 0.024, settle: 0.55 },
  // Melee: no magazine, range is arm's reach, and the attack itself is timed by KNIFE below.
  knife: { label: 'Combat knife', capacity: 0, reload: 0, interval: 0.45, range: 1.7, damage: 40, automatic: false, kick: 0, settle: 0 },
} as const

/** Left click slashes, right click stabs. Any knife hit from behind is lethal, as in Counter-Strike. */
export const KNIFE = {
  range: 1.7,
  slash: { damage: 40, interval: 0.45, duration: 0.34, hitAt: 0.11 },
  stab: { damage: 90, interval: 1.0, duration: 0.72, hitAt: 0.23 },
} as const
export type KnifeAttack = 'slash' | 'stab'

/** Aiming down the sights magnifies the view; the sniper uses its adjustable scope instead. */
export const AIM_ZOOM: Partial<Record<WeaponName, number>> = { pistol: 1.25, silenced: 1.25, smg: 1.5, ak: 2 }
/** How far the shooter's own client plays a suppressed report. Guards never hear it (see EnemyDirector.hear). */
export const SILENCED_REPORT_RADIUS = 5

export const ENEMY_WEAPONS = {
  pistol: { magazine: 12, reload: 1.9, damage: 10, burst: 3, gap: 0.2, pause: [0.65, 0.95] },
  ak: { magazine: 30, reload: 2.4, damage: 9, burst: 4, gap: 0.11, pause: [0.55, 0.85] },
  smg: { magazine: 24, reload: 2.1, damage: 7, burst: 5, gap: 0.08, pause: [0.5, 0.75] },
  shotgun: { magazine: 6, reload: 3.9, damage: 14, burst: 1, gap: 0.9, pause: [1.2, 1.6] },
  sniper: { magazine: 5, reload: 2.9, damage: 32, burst: 1, gap: 1.35, pause: [2.0, 2.6] },
} as const

/** Chance a player's head shot blows the guard's head apart (always lethal). Other weapons never do. */
export const HEAD_BURST_CHANCE: Partial<Record<WeaponName, number>> = { pistol: 0.1, silenced: 0.1, smg: 0.1, ak: 0.25, sniper: 1 }

/**
 * Critical hits, which only the tutorial turns on: the chance a hit is critical by weapon (a head shot doubles it),
 * and how much harder a critical hit lands.
 */
export const CRITICAL_HITS = { chance: { pistol: 0.12, silenced: 0.12, smg: 0.08, ak: 0.1, shotgun: 0.05, sniper: 0.25, knife: 0.15 } as Record<WeaponName, number>, headBonus: 2, multiplier: 1.75 } as const
export const criticalChance = (weapon: WeaponName | undefined, zone: HitZone) =>
  Math.min(1, (CRITICAL_HITS.chance[weapon ?? 'ak'] ?? 0) * (zone === 'head' ? CRITICAL_HITS.headBonus : 1))

/**
 * The Sledge: a giant black riot breacher in an ink-grey helmet, plate vest and pouches, who fights with an AK like
 * his guards (`damage` times their rounds). His gear is his armour: while it holds it soaks body hits from any side
 * and only `bleed` of the damage reaches him; the pouches are shot off at two thirds, the helmet at one third, the
 * vest when it breaks. Head shots go straight through. Sniper rounds hit him for `sniper` times their damage instead
 * of killing outright. He is a better shot than his guards: `accuracy` is added to their hit chance, and he takes
 * `aimDelay` of their aiming time before his first round.
 */
export const BOSS_RULES = { health: 1150, armor: 800, bleed: 0.3, sniper: 2.2, speed: 0.8, scale: 2.05, damage: 1.6, accuracy: 0.12, aimDelay: 0.5 } as const

/**
 * The Sledge's flying sledgehammer, an enemy of its own (see flying-hammer.ts). It circles beside him, and every
 * `cooldown` seconds (plus up to `cooldownJitter`) rises for `windUp` seconds and flings itself at a player within
 * `range` it can see, spinning, at `speed` m/s. Passing within `reach` of the body (measured from its middle) takes half the player's health; a
 * miss into a wall sticks it there for `stuck` seconds. It has its own `health`, and falls when shot down or when he
 * dies. Its model is 1 m long; `scale` makes it a giant's hammer.
 */
export const HAMMER_RULES = {
  health: 350,
  scale: 2.3,
  orbit: { radius: 2.1, height: 3.6, rate: 0.7, bob: 0.25 },
  range: 42, cooldown: 4.2, cooldownJitter: 1.6, firstAttack: 2.5,
  windUp: 0.85, speed: 21, flight: 2.4, spin: 13, returnSpeed: 11,
  stuck: 1.3,
  reach: 1.1,
  damage: PLAYER_HEALTH.max / 2,
} as const

/** Player sniper rounds are lethal on any confirmed hit (the boss excepted). */
export function hitDamage(weapon: WeaponName | undefined, zone: HitZone, baseDamage: number, boss = false) {
  if (weapon === 'sniper' && boss) return Math.max(0, baseDamage) * HIT_MULTIPLIERS[zone] * BOSS_RULES.sniper
  if (weapon === 'sniper') return ENEMY_HEALTH
  return Math.max(0, baseDamage) * HIT_MULTIPLIERS[zone]
}

/** Responsive combat: reaction runs alongside weapon presentation, never after it. */
export const ENEMY_COMBAT = {
  passiveRange: 20,
  sniperPassiveRange: 28,
  engagedRange: 60,
  sniperEngagedRange: 110,
  contactMemory: 8,
  senseIdle: 0.1,
  senseCombat: 0.05,
  settle: 0.16,
  aimHalfAngle: 12 * Math.PI / 180,
  turnSpeed: 7.5,
  aimDelay: 0.8,
  reaction: [0.8, 1.0],
  sniperReaction: [0.9, 1.1],
  openingHold: 1.75,
  blockedRetry: 0.05,
  blockedReposition: 0.3,
} as const

export const SHOTGUN_PELLETS = 8
// Buckshot fans out from the muzzle: about 1.57 m across at 10 m, 3.15 m at 20 m. Aiming does
// not change the barrel/choke, so ADS uses the same cone as hip fire.
export const SHOTGUN_BALLISTICS = { halfAngle: 4.5 * Math.PI / 180, fullDamageRange: 8, minimumDamageScale: 0.4 } as const

/** Pattern density does most of the range balancing; individual pellets also lose energy. */
export function shotgunDamageMultiplier(distance: number) {
  const travel = Math.max(0, Math.min(1, (distance - SHOTGUN_BALLISTICS.fullDamageRange) /
    (WEAPON_RULES.shotgun.range - SHOTGUN_BALLISTICS.fullDamageRange)))
  return 1 - travel * (1 - SHOTGUN_BALLISTICS.minimumDamageScale)
}

/** Three slots, one weapon each: 1 knife, 2 sidearm (a pistol or an SMG), 3 primary (an AK, sniper rifle or shotgun). */
export const WEAPON_SLOTS = 3
export const WEAPON_SLOT: Record<WeaponName, number> = { knife: 0, pistol: 1, silenced: 1, smg: 1, ak: 2, sniper: 2, shotgun: 2 }
export const SNIPER_ZOOM = { min: 2, max: 8, initial: 4 } as const
/** Missions start with the knife out. */
export const STARTING_SLOT = 0
export function startingLoadout(): (WeaponItem | null)[] {
  return [
    { id: 'player-knife', name: 'knife', magazine: 0, reserve: 0 },
    { id: 'player-silenced', name: 'silenced', magazine: 12, reserve: 36 },
    null,
  ]
}
