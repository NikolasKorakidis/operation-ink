import assert from 'node:assert/strict'
import * as THREE from 'three'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { DETECTION } from '../src/game/balance'
import { CollisionWorld } from '../src/player/collision'
import type { EnemySpec, PlayerSense } from '../src/game/types'

/*
 * How guards spot you: how far each sees, the ? (DETECTION.notice seconds of doubt you can use to hide or drop him),
 * no doubt at point blank, squads that are alerted together, and how a squad fights: shotguns rush, riflemen flank one
 * at a time while another covers.
 */
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const actor = async () => {
  const root = new THREE.Group()
  return { root, reactionRemaining: 0, animationTime: 0, update() {}, shoot() {}, restore() {}, react() {}, dispose() {}, muzzle: () => root.position.clone().add(v(0, 1.4, 0.3)) } as unknown as EnemyActor
}
async function field(specs: Partial<EnemySpec>[], at: THREE.Vector3, mapSpan?: number) {
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  floor.rotation.x = -Math.PI / 2; scene.add(floor)
  const wall = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 0.5), new THREE.MeshBasicMaterial())
  wall.userData.doorHinge = true; wall.position.set(900, 3, 0); scene.add(wall)
  const world = new CollisionWorld(scene)
  const ai = new EnemyDirector({ scene, world, doors: [], mapSpan, emit() {}, damagePlayer() {}, dropWeapon() {},
    specs: specs.map((spec, i) => ({ id: `g${i}`, name: `G${i}`, position: [0, 0, 0], patrol: [], weapon: 'ak', facing: 0, ...spec }) as EnemySpec) }, actor)
  await ai.init()
  const player: PlayerSense = { feet: at.clone(), eye: at.clone().add(v(0, 1.65)), velocity: v(), alive: true, radioEnabled: false }
  const step = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) ai.update(1 / 60, player) }
  const hide = () => { wall.position.set(player.feet.x, 3, player.feet.z - 2); world.refresh() }
  return { ai, player, step, hide, dispose() { ai.dispose(); world.dispose() } }
}

{
  // A soldier sees about DETECTION.soldier m; a sniper half the level's longest side.
  const near = await field([{}], v(0, 0, DETECTION.soldier - 5)), far = await field([{}], v(0, 0, DETECTION.soldier + 5))
  near.step(0.5); far.step(0.5)
  assert(near.ai.enemies[0].canSee && !far.ai.enemies[0].canSee, `A soldier sees ${DETECTION.soldier - 5} m but not ${DETECTION.soldier + 5} m`)
  near.dispose(); far.dispose()
  const span = 220, reach = span * DETECTION.sniper
  const sniper = await field([{ role: 'sniper', weapon: 'sniper' }], v(0, 0, reach - 8), span), beyond = await field([{ role: 'sniper', weapon: 'sniper' }], v(0, 0, reach + 8), span)
  sniper.step(0.5); beyond.step(0.5)
  assert(sniper.ai.enemies[0].canSee && !beyond.ai.enemies[0].canSee, `On a ${span} m level a sniper sees ${reach} m`)
  sniper.dispose(); beyond.dispose()
}
console.log('PASS Soldiers see an average distance; snipers see half the map')

{
  // At 20 m: the ? for DETECTION.notice seconds (no shots), then alerted and firing almost at once.
  const f = await field([{}], v(0, 0, 20))
  const guard = f.ai.enemies[0]
  f.step(DETECTION.notice - 0.4)
  assert.equal(guard.state, 'suspicious'); assert.equal(guard.shots, 0)
  assert(guard.notice > DETECTION.notice - 0.6, 'The ? fills while he watches')
  f.step(1)
  assert.equal(guard.state, 'combat', 'Watched for the full notice time: alerted')
  assert(guard.shots > 0, 'and firing almost at once')
  f.dispose()
}
console.log('PASS The ? gives you the notice time before a guard is sure, then he fires at once')

{
  // Hide before the ? fills: he never becomes sure, and the ? drains; he comes to look instead.
  const f = await field([{}], v(0, 0, 20))
  const guard = f.ai.enemies[0]
  f.step(DETECTION.notice * 0.6)
  f.hide()
  f.step(3)
  assert.notEqual(guard.state, 'combat'); assert.equal(guard.shots, 0)
  assert(guard.notice < DETECTION.notice * 0.6, 'The ? drains once he cannot see you')
  f.dispose()
}
console.log('PASS Breaking sight during the ? keeps you undetected')

{
  // Point blank: no doubt at all.
  const f = await field([{}], v(0, 0, DETECTION.pointBlank - 2))
  f.step(1)
  assert.equal(f.ai.enemies[0].state, 'combat'); assert(f.ai.enemies[0].shots > 0, 'Too close: he fires at once')
  f.dispose()
}
console.log('PASS Too close and they open fire at once')

{
  // Squads: two guards 20 m apart are one; a third 120 m off is not; a named squad joins guards however far apart.
  const f = await field([{}, { position: [20, 0, 0], facing: Math.PI }, { position: [120, 0, 0], facing: Math.PI }, { position: [200, 0, 0], squad: 'a' }, { position: [-200, 0, 0], squad: 'a' }], v(0, 0, 6))
  const [a, b, c, d, e] = f.ai.enemies
  assert.equal(a.squad, b.squad); assert.notEqual(a.squad, c.squad); assert.equal(d.squad, e.squad); assert.notEqual(d.squad, a.squad)
  f.step(0.5)
  assert.equal(a.state, 'combat')
  assert.equal(b.state, 'combat', 'His squadmate is alerted with him, though he never saw you')
  assert(b.lastKnown && b.lastKnown.distanceTo(f.player.feet) < 1, 'and knows where you are')
  assert.equal(c.state, 'guard', 'Another squad is not')
  f.dispose()
}
console.log('PASS One guard alerted alerts his squad, and only his squad')

{
  // How a squad fights: the shotgun rushes you, one rifleman flanks while the other covers.
  const f = await field([{ weapon: 'shotgun' }, { position: [6, 0, 0] }, { position: [-6, 0, 0] }], v(0, 0, 30))
  const [shotgun, ...rifles] = f.ai.enemies
  for (const guard of f.ai.enemies) guard.suspicion = 1
  let rushed = false, flanked = 0, covering = false
  for (let i = 0; i < 60 * 4; i++) {
    f.step(1 / 60)
    rushed ||= shotgun.tactic === 'charge'
    flanked = Math.max(flanked, rifles.filter(r => r.tactic === 'flank').length)
    covering ||= rifles.some(r => r.tactic === 'hold' && r.canSee) && rifles.some(r => r.tactic === 'flank')
  }
  assert(rushed && shotgun.position.distanceTo(f.player.feet) < 22, `The shotgun rushes in (now ${shotgun.position.distanceTo(f.player.feet).toFixed(1)} m off)`)
  assert.equal(flanked, 1, 'One rifleman flanks at a time')
  assert(covering, 'while the other covers him')
  f.dispose()
}
console.log('PASS A squad fights together: shotguns rush, riflemen flank one at a time under cover')

{
  // Low and slow: the ? fills 20% slower against a crouched player, half as fast against a prone one.
  const fill = async (eye: number) => {
    const f = await field([{}], v(0, 0, 20))
    f.player.eye.y = eye
    f.step(1.5)
    const notice = f.ai.enemies[0].notice
    f.dispose()
    return notice
  }
  const stand = await fill(1.65), crouch = await fill(1.12), prone = await fill(0.42)
  assert(stand > 1.2, `Standing, the ? fills at full speed (${stand.toFixed(2)} s in 1.5)`)
  assert(Math.abs(crouch / stand - DETECTION.stance.crouch) < 0.08, `Crouched, 20% slower (${(crouch / stand).toFixed(2)})`)
  assert(Math.abs(prone / stand - DETECTION.stance.prone) < 0.08, `Prone, half as fast (${(prone / stand).toFixed(2)})`)
}
console.log('PASS Crouching slows the ? by a fifth, lying prone halves it')
