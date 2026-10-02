import assert from 'node:assert/strict'
import * as THREE from 'three'
import { MOVE_SPEED, aimToggles, canSprint } from '../src/game/balance'
import { CollisionWorld } from '../src/player/collision'
import { PlayerBody } from '../src/player/body'

// CS-style: the knife is fastest; each weapon is slower the bigger it is, the sniper rifle slowest at about half.
const w = MOVE_SPEED.weapon
assert(w.knife === 1 && w.knife > w.pistol && w.pistol >= w.silenced && w.silenced > w.smg && w.smg > w.shotgun && w.shotgun > w.ak && w.ak > w.sniper,
  'Knife, pistol, SMG, shotgun, AK, sniper: each slower than the last')
assert(w.sniper >= 0.5 && w.sniper <= 0.6, 'The sniper rifle is about half speed')
assert(MOVE_SPEED.aimed > 0.75 && MOVE_SPEED.aimed < 1, 'Aiming slows you a little')
assert(!canSprint(true) && canSprint(false), 'Aiming stops a sprint; lowering the sights lets you run again')
assert(aimToggles('sniper') && !aimToggles('ak') && !aimToggles('pistol') && !aimToggles(null), 'Only the sniper scope toggles; every other weapon aims while right click is held')

// The body really moves that much slower, walking and sprinting.
const scene = new THREE.Scene()
const floor = new THREE.Mesh(new THREE.BoxGeometry(400, 1, 400), new THREE.MeshBasicMaterial()); floor.position.y = -0.5; scene.add(floor)
const world = new CollisionWorld(scene)
const travel = (scale: number, sprint: boolean) => {
  const body = new PlayerBody(world)
  body.teleport(new THREE.Vector3(0, 0.05, 0)); body.speedScale = scale
  for (let i = 0; i < 30; i++) body.update(1 / 60, new THREE.Vector3(), false)
  for (let t = 0; t < 2; t += 1 / 60) body.update(1 / 60, new THREE.Vector3(0, 0, -1), sprint)
  return -body.position.z
}
for (const sprint of [false, true]) {
  const knife = travel(w.knife, sprint), sniper = travel(w.sniper, sprint), aimedAk = travel(w.ak * MOVE_SPEED.aimed, sprint)
  assert(Math.abs(sniper / knife - w.sniper) < 0.05, `${sprint ? 'Sprinting' : 'Walking'} with the sniper covers ${(sniper / knife * 100).toFixed(0)}% of the knife's ground`)
  assert(aimedAk > 0 && aimedAk < knife, 'Aiming an AK on the move still moves you')
}
world.dispose()
console.log('PASS Movement speed follows the weapon in hand, CS-style; aiming stops a sprint, and the sniper scope toggles')
