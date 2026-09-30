import assert from 'node:assert/strict'
import * as THREE from 'three'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { ENEMY_HEALTH, HEAD_BURST_CHANCE } from '../src/game/balance'
import type { HitZone } from '../src/game/hit-reactions'
import { initialMission } from '../src/game/mission'
import { SecuritySystem } from '../src/game/security'
import type { EnemyReaction, EnemySpec, MissionWorld, WeaponName } from '../src/game/types'
import { CollisionWorld } from '../src/player/collision'
import { screenLight } from '../src/world/lights'

const scene = new THREE.Scene()
const world = new CollisionWorld(scene)
const reactions: EnemyReaction[] = []
let bursts = 0
const ai = new EnemyDirector({ scene, world, doors: [], specs: [{ id: 'target', name: 'target', position: [0, 0, 0], patrol: [[0, 0, 0]], weapon: 'ak', facing: 0 } satisfies EnemySpec],
  emit() {}, damagePlayer() {}, dropWeapon() {}, onReact: reaction => reactions.push(reaction) }, async () => {
  const root = new THREE.Group()
  return { root, reactionRemaining: 0, animationTime: 0, deathClip: 'dieBody', update() {}, shoot() {}, react() {}, restore() {}, dispose() {},
    burstHead() { bursts++ }, muzzle: () => root.position.clone() } as unknown as EnemyActor
})
await ai.init()
const guard = ai.enemies[0]

/** Shoot the standing guard once in `zone` with `weapon`; true when the head burst. */
function shoot(weapon: WeaponName, zone: HitZone) {
  Object.assign(guard, { health: ENEMY_HEALTH, state: 'guard', headless: false, dropped: true })
  const direction = new THREE.Vector3(0, 0, -1)
  ai.applyHit({ origin: new THREE.Vector3(0, 1.6, 5), direction, range: 50, damage: weapon === 'sniper' ? 65 : 30, weapon },
    { index: 0, zone, point: new THREE.Vector3(0, 1.6, 0), bone: 'head', distance: 5, direction })
  if (guard.headless) assert.equal(guard.state, 'dead', 'A burst head is always a kill')
  return guard.headless
}
const rate = (weapon: WeaponName, zone: HitZone = 'head', shots = 4000) => {
  let count = 0
  for (let i = 0; i < shots; i++) if (shoot(weapon, zone)) count++
  return count / shots
}
for (const weapon of ['pistol', 'silenced', 'smg', 'ak'] as const) {
  const chance = HEAD_BURST_CHANCE[weapon]!, measured = rate(weapon)
  assert(Math.abs(measured - chance) < 0.03, `${weapon}: head shots burst ${(measured * 100).toFixed(1)}% of the time, expected ${chance * 100}%`)
}
assert.deepEqual([HEAD_BURST_CHANCE.pistol, HEAD_BURST_CHANCE.smg, HEAD_BURST_CHANCE.ak, HEAD_BURST_CHANCE.sniper], [0.1, 0.1, 0.25, 1])
assert.equal(rate('sniper', 'head', 200), 1, 'A sniper head shot always bursts the head')
assert.equal(rate('ak', 'torso', 400), 0, 'Only head shots burst heads')
assert.equal(rate('shotgun', 'head', 400), 0, 'The shotgun has no burst chance')
assert.equal(rate('knife', 'head', 400), 0, 'Nor does the knife')
console.log('PASS Head shots burst the head 10% of the time with a pistol or SMG, 25% with the AK and always with the sniper')

reactions.length = 0; bursts = 0
shoot('sniper', 'head')
assert.equal(bursts, 1, 'The guard\'s body loses its head')
assert.equal(reactions.at(-1)?.hit.burst, true, 'Co-op guests are told the head burst')
const saved = ai.snapshot()
Object.assign(guard, { headless: false })
bursts = 0
ai.restore(saved)
assert(guard.headless && bursts === 1, 'A checkpoint keeps the body headless')
Object.assign(guard, { health: ENEMY_HEALTH, state: 'guard', headless: false })
ai.restore(ai.snapshot())
assert(!guard.headless, 'A restored living guard has his head')
const replay = ai.replayReaction({ ...reactions.at(-1)!, index: 0 })
assert(replay?.headBurst && guard.headless, 'A guest replaying the hit sees the head burst')
console.log('PASS The burst reaches co-op guests and survives a checkpoint retry')
ai.dispose()

{
  // The camera terminals' screens go dark with the camera network, light and all.
  const monitor = new THREE.Group()
  const glass = new THREE.MeshBasicMaterial({ color: 0x3dff8c })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), glass)
  screen.userData.cameraScreen = true
  const light = screenLight('Test', [0, 1, 0], 1, 0x3dff8c)
  monitor.add(screen, light)
  const missionWorld = { stations: [{ id: 'office', kind: 'cameras', object: monitor, point: new THREE.Vector3(), label: 'Disable cameras' }] } as unknown as MissionWorld
  const security = new SecuritySystem(world, missionWorld, {} as EnemyDirector, () => {})
  const state = initialMission()
  security.sync(state)
  assert.equal(glass.color.getHex(), 0x3dff8c, 'The screen shows the feeds while the cameras run')
  assert.equal(light.userData.neonLight.dimmer(), 1, 'and lights the room')
  state.camerasOff.push('office')
  security.sync(state)
  assert(glass.color.getHex() < 0x101010, 'Shutting the cameras down blacks the screen out')
  assert.equal(light.userData.neonLight.dimmer(), 0, 'and its light goes out')
  security.reset()
  security.sync(initialMission())
  assert.equal(glass.color.getHex(), 0x3dff8c, 'A restart switches it back on')
  assert.equal(light.userData.neonLight.dimmer(), 1)
}
console.log('PASS The camera terminal screens switch off, light and all, when the cameras are shut down')
world.dispose()
