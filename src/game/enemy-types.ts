import { BOSS_RULES } from './balance'
import type { EnemySpec, Vec3 } from './types'

/**
 * The kinds of enemy a level can place, so a level reads as a cast list rather than a page of flags. Each is the one
 * stickman rig (public/models/stickman.glb) with a weapon and a behaviour; balance numbers live in balance.ts.
 *
 * - rifleman: AK, patrols or holds a post, the backbone of a garrison.
 * - gunner: SMG, close quarters, indoors.
 * - breacher: shotgun, short range, hits hard.
 * - sidearm: pistol, officers, guards at desks.
 * - marksman: sniper rifle on a high post; holds it and never comes down to the alarm.
 * - sledge: the armoured boss, twice the size, with his flying hammer (see actors.makeBoss, flying-hammer.ts).
 * - dummy: a practice target that never fights back and gets up again.
 */
export const ENEMY_TYPES = {
  rifleman: { weapon: 'ak' },
  gunner: { weapon: 'smg' },
  breacher: { weapon: 'shotgun' },
  sidearm: { weapon: 'pistol' },
  marksman: { weapon: 'sniper', role: 'sniper' },
  sledge: { weapon: 'ak', boss: true, health: BOSS_RULES.health, armor: BOSS_RULES.armor },
  dummy: { weapon: 'pistol', dummy: true, respawn: 4 },
} as const satisfies Record<string, Partial<EnemySpec> & Pick<EnemySpec, 'weapon'>>
export type EnemyType = keyof typeof ENEMY_TYPES

/**
 * One enemy of a kind, standing at `position`. Give `patrol` (points walked in a loop, starting with where he
 * stands) to make him walk; without it he holds his post facing `facing` (radians, 0 faces +Z). `reserve` keeps him
 * out of sight until the alarm calls him (or, with `held`, until a script wakes him). Anything else in EnemySpec
 * can be overridden.
 */
export function enemy(type: EnemyType, id: string, position: Vec3, options: Partial<Omit<EnemySpec, 'id' | 'position'>> = {}): EnemySpec {
  const name = options.name ?? `${type[0].toUpperCase()}${type.slice(1)} ${id}`
  return { ...ENEMY_TYPES[type], name, patrol: [position], ...options, id, position } as EnemySpec
}
