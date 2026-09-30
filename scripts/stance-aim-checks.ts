import assert from 'node:assert/strict'
import * as THREE from 'three'
import { PlayerBody, STANCES } from '../src/player/body'
import { CollisionWorld } from '../src/player/collision'
import { AimSteadiness, offsetDirection, type AimInput } from '../src/game/aim'
import { FirstPersonWeapons } from '../src/game/weapons'
import type { Shot, WeaponFrame } from '../src/game/types'

const scene = new THREE.Scene()
const floor = new THREE.Mesh(new THREE.BoxGeometry(200, 1, 200), new THREE.MeshBasicMaterial())
floor.position.y = -0.5; scene.add(floor)
const world = new CollisionWorld(scene)
const forward = new THREE.Vector3(0, 0, -1)
const walk = (stance: 'stand' | 'crouch' | 'prone', sprint = false) => {
  const body = new PlayerBody(world)
  body.teleport(new THREE.Vector3(0, 0.01, 0))
  for (let i = 0; i < 90; i++) body.update(1 / 60, forward, sprint, stance)
  return body
}
for (const stance of ['stand', 'crouch', 'prone'] as const) {
  const body = walk(stance)
  assert(Math.abs(Math.hypot(body.velocity.x, body.velocity.z) - STANCES[stance].speed) < 0.05, `${stance} walks at its own speed`)
  assert(Math.abs(body.eyeHeight - STANCES[stance].eye) < 0.02, `${stance} settles at its eye height`)
}
assert(Math.hypot(walk('crouch', true).velocity.x, walk('crouch', true).velocity.z) < 2, 'Sprint does nothing while crouched')
assert(Math.hypot(walk('stand', true).velocity.x, walk('stand', true).velocity.z) > 7, 'Standing sprint still works')
assert(!walk('prone').jump(), 'No jumping while prone'); assert(!walk('crouch').jump(), 'No jumping while crouched'); assert(walk('stand').jump())
assert(STANCES.stand.speed > STANCES.crouch.speed && STANCES.crouch.speed > STANCES.prone.speed, 'Prone crawls slowest')
console.log('PASS Stand, crouch (C) and prone (Z) each have their own speed and eye height; only standing sprints or jumps')

const input = (patch: Partial<AimInput> = {}): AimInput => ({ speed: 0, airborne: false, stance: 'stand', aiming: false, scoped: false, weapon: 'ak', reducedMotion: false, ...patch })
const peakSway = (patch: Partial<AimInput>) => {
  const aim = new AimSteadiness(); let peak = 0
  for (let i = 0; i < 600; i++) { aim.update(1 / 60, input(patch)); peak = Math.max(peak, Math.hypot(aim.sway.yaw, aim.sway.pitch)) }
  return { peak, spread: aim.spread }
}
const still = peakSway({}), crouched = peakSway({ stance: 'crouch' }), prone = peakSway({ stance: 'prone' })
assert(still.peak > crouched.peak && crouched.peak > prone.peak && prone.peak > 0, 'Crouching and lying prone steady the aim')
assert(peakSway({ speed: 4.2 }).peak > still.peak * 3, 'Moving makes the aim drift more')
assert(peakSway({ aiming: true }).peak < still.peak, 'Aiming down the sights steadies it')
assert(still.peak < 0.005, 'Standing still, the drift stays slight')
assert.equal(peakSway({ reducedMotion: true, speed: 4 }).peak, 0, 'Reduced Motion keeps the crosshair still')
assert.equal(peakSway({ weapon: 'knife', speed: 4 }).peak, 0, 'The knife does not sway')
assert.equal(peakSway({ aiming: true }).spread, 0, 'Aimed and standing still, a rifle is exactly as accurate as before')
assert(still.spread > 0.005, 'Firing from the hip without aiming spreads the shots')
{
  const aim = new AimSteadiness(), hip = input(), aimed = input({ aiming: true })
  aim.update(1 / 60, hip); const first = aim.spread
  // An AK's rate of fire: a shot every 0.12 s.
  for (let i = 0; i < 6; i++) { aim.onShot(false); aim.update(0.12, hip) }
  assert(aim.spread > first + 0.015, 'Holding the trigger from the hip widens the spray')
  for (let i = 0; i < 120; i++) aim.update(1 / 60, hip)
  assert(Math.abs(aim.spread - first) < 1e-9, 'The spray settles back once you stop firing')
  for (let i = 0; i < 6; i++) { aim.onShot(true); aim.update(0.1, aimed) }
  assert.equal(aim.spread, 0, 'Aimed shots never build up spread')
}
assert(peakSway({ speed: 4.2 }).spread > peakSway({ speed: 1.9, stance: 'crouch' }).spread, 'Walking spreads shots more than crouch-walking')
assert(peakSway({ airborne: true }).spread > peakSway({ speed: 4.2 }).spread, 'Jumping is least accurate')
assert(peakSway({ weapon: 'sniper' }).spread > 0 && peakSway({ weapon: 'sniper', scoped: true, aiming: true }).spread === 0, 'A sniper is only accurate through its scope')
console.log('PASS Aim drift and spread grow with speed, shrink crouched and prone, and respect Reduced Motion')

{
  const right = offsetDirection(forward, { yaw: 0.02, pitch: 0 })
  assert(right.x > 0 && Math.abs(right.angleTo(forward) - 0.02) < 1e-4, 'Positive yaw turns right by that angle')
  const up = offsetDirection(forward, { yaw: 0, pitch: 0.02 })
  assert(up.y > 0, 'Positive pitch turns up')
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.06, 200); camera.position.set(0, 1.6, 0); scene.add(camera)
  const shots: Shot[] = []
  const weapons = new FirstPersonWeapons({ scene, camera, world, onShot: shot => shots.push(shot), emit() {} })
  weapons.restore({ slots: [null, { id: 'p', name: 'pistol', magazine: 5, reserve: 0 }, null], selected: 1, pickups: [], nextId: 1 })
  const frame: WeaponFrame = { active: true, climbing: false, moving: 0, aiming: false, reducedMotion: false, feet: new THREE.Vector3(), aimOffset: { yaw: 0.03, pitch: 0 } }
  for (let i = 0; i < 30; i++) weapons.update(1 / 60, frame)
  weapons.trigger(true); weapons.trigger(false); weapons.update(1 / 60, frame)
  assert.equal(shots.length, 1)
  assert(shots[0].direction.x > 0.02, 'Shots follow the drifted crosshair, not the centre of the screen')
  weapons.dispose()
}
console.log('PASS Shots leave along the drifted aim')
world.dispose()
