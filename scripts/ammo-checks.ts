import assert from 'node:assert/strict'
import * as THREE from 'three'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { AMMO, ENEMY_WEAPONS, WEAPON_RULES } from '../src/game/balance'
import { FirstPersonWeapons } from '../src/game/weapons'
import { CollisionWorld } from '../src/player/collision'
import type { EnemySpec, PlayerSense, WeaponItem } from '../src/game/types'

/*
 * Ammunition. Guards carry a magazine and AMMO.spare more; reloading spends what they carry. Out of everything, a guard
 * runs to the nearest supply crate still standing and restocks; with none left he takes cover and stops shooting. A
 * sniper rifle taken from a guard holds one magazine. The player restocks at the crates too.
 */
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const actor = async () => {
  const root = new THREE.Group()
  return { root, reactionRemaining: 0, animationTime: 0, update() {}, shoot() {}, restore() {}, react() {}, dispose() {}, muzzle: () => root.position.clone().add(v(0, 1.4, 0.3)) } as unknown as EnemyActor
}
async function field(weapon: EnemySpec['weapon'], crates: { id: string; position: THREE.Vector3 }[], playerZ = -80) {
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  floor.rotation.x = -Math.PI / 2; scene.add(floor)
  const world = new CollisionWorld(scene), drops: WeaponItem[] = []
  const ai = new EnemyDirector({ scene, world, doors: [], specs: [{ id: 'g', name: 'Guard', position: [0, 0, 0], patrol: [], weapon, facing: 0 }],
    emit() {}, damagePlayer() {}, dropWeapon: item => drops.push(item), supplies: () => crates }, actor)
  await ai.init()
  const player: PlayerSense = { feet: v(0, 0, playerZ), eye: v(0, 1.65, playerZ), velocity: v(), alive: true, radioEnabled: false }
  const step = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) ai.update(1 / 60, player) }
  return { ai, guard: ai.enemies[0], player, drops, step, dispose() { ai.dispose(); world.dispose() } }
}

{
  // He starts with a magazine and two more; a reload takes a magazine from what he carries.
  const f = await field('ak', [])
  const magazine = ENEMY_WEAPONS.ak.magazine
  assert.equal(f.guard.magazine, magazine)
  assert.equal(f.guard.reserve, magazine * AMMO.spare, 'Two spare magazines on him')
  f.guard.magazine = 0
  f.step(ENEMY_WEAPONS.ak.reload + 0.5)
  assert.equal(f.guard.magazine, magazine, 'He reloads')
  assert.equal(f.guard.reserve, magazine * (AMMO.spare - 1), 'and it comes out of what he carries')
  f.dispose()
}
console.log('PASS Guards carry two spare magazines and reloading spends them')

{
  // Dry, with a crate 12 m off: he runs to it and restocks, then fights on.
  const crate = { id: 'crate-1', position: v(12, 0, 0) }
  const f = await field('ak', [crate])
  f.guard.magazine = 0; f.guard.reserve = 0
  f.step(0.2)
  assert(f.guard.supply?.id === 'crate-1', 'He heads for the crate')
  for (let i = 0; i < 60 * 15 && f.guard.magazine === 0; i++) f.ai.update(1 / 60, f.player)
  assert(f.guard.magazine > 0 && f.guard.reserve === ENEMY_WEAPONS.ak.magazine * AMMO.spare, `He restocked (${f.guard.magazine} + ${f.guard.reserve})`)
  assert(f.guard.position.distanceTo(crate.position) < 2, 'at the crate')
  f.dispose()
}
console.log('PASS A guard out of ammunition runs to a supply crate and restocks')

{
  // Dry with every crate destroyed, the player in plain sight: he never fires again.
  const f = await field('ak', [], 14)
  f.guard.magazine = 0; f.guard.reserve = 0
  f.step(6)
  assert.equal(f.guard.shots, 0, 'With no ammunition and no crates he cannot shoot')
  assert.equal(f.guard.magazine, 0)
  f.dispose()
}
console.log('PASS With the crates gone, a guard out of ammunition stops shooting')

{
  // What a dead guard drops: his gun with what was left; a sniper rifle with exactly one magazine.
  for (const weapon of ['sniper', 'ak'] as const) {
    const f = await field(weapon, [])
    f.guard.magazine = 2; f.guard.reserve = 7
    const eye = v(0, 1.65, 3), chest = f.guard.position.clone().add(v(0, 1.3, 0))
    assert(f.ai.hit({ origin: eye, direction: chest.clone().sub(eye).normalize(), range: 20, damage: 999, weapon: 'sniper' }, 20), 'The shot lands')
    const item = f.drops[0]
    assert(item, `${weapon}: he drops his gun`)
    if (weapon === 'sniper') assert.deepEqual([item.magazine, item.reserve], [WEAPON_RULES.sniper.capacity, 0], 'A sniper rifle from a guard holds one magazine')
    else assert.deepEqual([item.magazine, item.reserve], [2, 7], 'Other guns keep what he had left')
    f.dispose()
  }
}
console.log('PASS Dropped guns carry what the guard had left; a sniper rifle holds one magazine')

{
  // The player restocks at a crate: each gun's spare ammunition up to AMMO.player magazines.
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.06, 100)
  scene.add(camera)
  const world = new CollisionWorld(scene)
  const weapons = new FirstPersonWeapons({ scene, camera, world, onShot() {}, emit() {} })
  weapons.restore({ slots: [{ id: 'k', name: 'knife', magazine: 0, reserve: 0 }, { id: 'p', name: 'silenced', magazine: 3, reserve: 1 }, { id: 'a', name: 'ak', magazine: 0, reserve: 0 }], selected: 1, pickups: [], nextId: 1 })
  assert(weapons.resupply(), 'Taking ammunition refills')
  assert.deepEqual(weapons.slots.map(item => item?.reserve), [0, WEAPON_RULES.silenced.capacity * AMMO.player, WEAPON_RULES.ak.capacity * AMMO.player])
  assert(!weapons.resupply(), 'Already full, nothing to take')
  weapons.dispose(); world.dispose()
}
console.log('PASS The player restocks every gun at a supply crate')
