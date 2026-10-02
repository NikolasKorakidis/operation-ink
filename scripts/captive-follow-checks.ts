import assert from 'node:assert/strict'
import * as THREE from 'three'
import { buildLevel } from '../src/levels'
import { CollisionWorld } from '../src/player/collision'
import { setDoorOpen, updateDoors } from '../src/world/doors'
import { PlayerBody } from '../src/player/body'
import { Captives } from '../src/game/captives'
import { initialMission } from '../src/game/mission'
import { TOWN } from '../src/levels/town/plan'

/*
 * Freed prisoners keep up with the player wherever he goes: down three floors of stairs and out of the door on foot,
 * and when he climbs a ladder or the prisoner is wedged somewhere he cannot walk out of, he is put back on the
 * player's trail just behind him rather than left behind.
 */
const { ground, world: mission } = buildLevel('town')
const scene = new THREE.Scene()
scene.add(ground, mission.root)
scene.updateMatrixWorld(true)
const world = new CollisionWorld(scene), body = new PlayerBody(world)
const doors: THREE.Group[] = []
scene.traverse(object => { if (object.userData.kind === 'door') doors.push(object as THREE.Group) })
const spec = mission.captives!.find(captive => captive.id === 'prisoner-2')!

/** Captives with a stand-in body (the real one loads the stickman model): free, standing, and walking at once. */
function follower() {
  const captives = new Captives(new THREE.Scene(), [spec], world, doors)
  const root = new THREE.Object3D()
  root.position.fromArray(spec.position)
  const actor = { root, canWalk: true, advanceRelease() {}, animate() {}, restore() {}, dispose() {} }
  ;(captives as unknown as { actors: unknown[] }).actors.push({ spec, actor, path: [], replan: 0, stuckFor: 0, anchor: root.position.clone() })
  let rejoins = 0
  const rejoin = (captives as unknown as { rejoin: (...args: unknown[]) => void }).rejoin.bind(captives)
  ;(captives as unknown as { rejoin: (...args: unknown[]) => void }).rejoin = (...args) => { rejoins++; if (process.env.DEBUG) console.log('rejoin from', root.position.toArray().map((v, i) => (v - [TOWN.hotel.x, 0, TOWN.hotel.z][i]).toFixed(2)).join(','), 'leader', (args[1] as THREE.Vector3).toArray().map((v, i) => (v - [TOWN.hotel.x, 0, TOWN.hotel.z][i]).toFixed(2)).join(',')); rejoin(...args) }
  const state = initialMission([])
  state.usedStations.push(spec.station)
  return { captives, root, state, rejoins: () => rejoins }
}

const hotel = (x: number, y: number, z: number) => new THREE.Vector3(TOWN.hotel.x + x, y, TOWN.hotel.z + z)
const dt = 1 / 60

{
  // Down from the top floor: across to the stairs, down both flights, along the lobby and out of the front door.
  const { captives, root, state, rejoins } = follower()
  body.teleport(hotel(1, 6.9, 2)); for (let i = 0; i < 20; i++) body.update(dt, new THREE.Vector3(), false)
  const tick = (direction: THREE.Vector3) => { body.update(dt, direction, false); captives.update(dt, state, false, body.position) }
  const walkTo = (x: number, z: number, seconds = 8) => {
    const goal = hotel(x, 0, z)
    for (let t = 0; t < seconds && Math.hypot(goal.x - body.position.x, goal.z - body.position.z) > 0.15; t += dt) {
      tick(new THREE.Vector3(goal.x - body.position.x, 0, goal.z - body.position.z).normalize())
    }
  }
  const walk = (direction: THREE.Vector3, seconds: number) => { for (let t = 0; t < seconds; t += dt) tick(direction) }
  walkTo(6.56, 5.1)
  walk(new THREE.Vector3(0, 0, -1), 6)
  assert(Math.abs(body.position.y - (0.28 + 3.3)) < 0.1, `the player is down one floor (${body.position.y.toFixed(2)})`)
  walkTo(7.76, body.position.z - TOWN.hotel.z)
  walk(new THREE.Vector3(0, 0, 1), 6)
  assert(Math.abs(body.position.y - 0.28) < 0.1, `the player is on the ground floor (${body.position.y.toFixed(2)})`)
  walkTo(4, 3.5); walkTo(-3, 3.5)
  setDoorOpen(doors.find(door => door.name === 'Hotel · front door')!, true, false, body.position)
  for (let t = 0; t < 1; t += dt) { updateDoors(doors, dt); scene.updateMatrixWorld(true); world.refresh(); tick(new THREE.Vector3()) }
  walkTo(-3, 9); walkTo(-3, 12)
  assert(body.position.y < 0.2, 'the player is out of the hotel')
  for (let t = 0; t < 12; t += dt) tick(new THREE.Vector3())
  const gap = root.position.distanceTo(body.position)
  assert(gap < 6 && root.position.y < 0.4, `the prisoner followed him down and out (${gap.toFixed(1)} m away, at y ${root.position.y.toFixed(2)})`)
  assert.equal(rejoins(), 0, 'he walked it, down the stairs and through the door, without being put back')
}
console.log('PASS A freed prisoner follows the player down three floors of stairs and out of the door on foot')

{
  // The player goes up the hotel's roof ladder: the prisoner can't climb, so he rejoins the trail behind him.
  const { captives, root, state, rejoins } = follower()
  root.position.copy(hotel(0, 0, 9)).setY(0.02)
  body.teleport(hotel(0, 0, 8)); for (let i = 0; i < 20; i++) body.update(dt, new THREE.Vector3(), false)
  for (let t = 0; t < 1; t += dt) captives.update(dt, state, false, body.position)
  body.teleport(hotel(-4, 10.2, -3)); for (let i = 0; i < 30; i++) body.update(dt, new THREE.Vector3(), false)
  for (let t = 0; t < 2; t += dt) { body.update(dt, new THREE.Vector3(0, 0, 1), false); captives.update(dt, state, false, body.position) }
  for (let t = 0; t < 6; t += dt) captives.update(dt, state, false, body.position)
  assert(rejoins() > 0 && root.position.distanceTo(body.position) < 6, `he is back with the player (${root.position.distanceTo(body.position).toFixed(1)} m)`)
}
console.log('PASS A prisoner who cannot follow (a ladder) is put back on the trail behind the player')

{
  // Wedged in a corner behind the fuel depot's fence with the player on the far side: he gets out within seconds.
  const { captives, root, state } = follower()
  body.teleport(new THREE.Vector3(TOWN.market.x, 0.05, TOWN.market.z)); for (let i = 0; i < 20; i++) body.update(dt, new THREE.Vector3(), false)
  root.position.set(TOWN.hotel.x + 2, 6.9, TOWN.hotel.z)
  for (let t = 0; t < 1; t += dt) { body.update(dt, new THREE.Vector3(1, 0, 0), false); captives.update(dt, state, false, body.position) }
  for (let t = 0; t < 6; t += dt) captives.update(dt, state, false, body.position)
  assert(root.position.distanceTo(body.position) < 6, `a prisoner far off on another floor comes back to the player (${root.position.distanceTo(body.position).toFixed(1)} m)`)
}
console.log('PASS A prisoner left far behind or on another floor rejoins the player')
world.dispose()
