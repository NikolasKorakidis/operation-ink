import assert from 'node:assert/strict'
import * as THREE from 'three'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { HOSTAGE } from '../src/game/balance'
import { hostageAlong, hostagesNear, type HostageBody } from '../src/game/hostage-harm'
import { SHARED_MISSION_KEYS, applySharedMission, hostageAlive, hostageHealth, hurtHostage, initialMission, sharedMission } from '../src/game/mission'
import { CollisionWorld } from '../src/player/collision'
import type { PlayerSense } from '../src/game/types'

/*
 * Hostages can be hurt and killed, by anyone's rounds, blades and blasts; one dying loses the mission. Guards hold
 * fire rather than shoot through a hostage at the player, but their misses can still hit one.
 */
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const body = (id: string, at: THREE.Vector3, seated = false): HostageBody => {
  const root = new THREE.Object3D(); root.position.copy(at)
  return { id, name: `Hostage ${id}`, seated, actor: { root, dead: false } }
}

// The hit volume: a standing hostage from his feet to the top of his head, a seated one lower; the head on top.
{
  const standing = body('a', v(0, 0, -5)), seated = body('b', v(3, 0, -5), true)
  const toward = (x: number, y: number) => v(x, y, -5).sub(v(0, 1.6, 0)).normalize()
  assert.equal(hostageAlong([standing], v(0, 1.6, 0), toward(0, 1.2), 50)?.body.id, 'a', 'A shot at his chest hits him')
  assert(hostageAlong([standing], v(0, 1.6, 0), toward(0, 1.7), 50)?.head, 'A shot at his head is a head hit')
  assert(!hostageAlong([standing], v(0, 1.6, 0), toward(0, 1.2), 50)?.head, 'His chest is not')
  assert.equal(hostageAlong([standing], v(0, 1.6, 0), toward(0.8, 1.2), 50), null, 'A shot past his side misses')
  assert.equal(hostageAlong([standing], v(0, 1.6, 0), toward(0, 1.2), 3), null, 'A round stopped short (a wall) never reaches him')
  assert.equal(hostageAlong([seated], v(3, 1.6, 0), v(3, 1.7, -5).sub(v(3, 1.6, 0)).normalize(), 50), null, 'Over a seated hostage\'s head is clear')
  assert.equal(hostageAlong([seated], v(3, 1.6, 0), v(3, 0.9, -5).sub(v(3, 1.6, 0)).normalize(), 50)?.body.id, 'b', 'Tied to his chair he can still be hit')
  const near = body('c', v(0, 0, -2)), far = body('d', v(0, 0, -6))
  assert.equal(hostageAlong([far, near], v(0, 1.6, 0), v(0, 0, -1), 50)?.body.id, 'c', 'The nearer of two takes the round')
  near.actor.dead = true
  assert.equal(hostageAlong([far, near], v(0, 1.6, 0), v(0, 0, -1), 50)?.body.id, 'd', 'A dead hostage no longer stops rounds')
  assert.deepEqual(hostagesNear([far, standing], v(0, 1, -5.5), 2).map(entry => entry.body.id).sort(), ['a', 'd'], 'A blast reaches the hostages near it')
  assert.equal(hostagesNear([far, standing], v(0, 1, -20), 2).length, 0, 'and not those far off')
}
console.log('PASS Shots hit hostages standing or tied to a chair, in the head or the body, and never through a wall')

// Damage: health goes down, a head hit is deadlier, death loses the mission (shared with co-op) and stops more harm.
{
  const state = initialMission([])
  assert.equal(hostageHealth(state, 'prisoner'), HOSTAGE.health, 'Hostages start unhurt')
  assert.equal(hurtHostage(state, 'prisoner', 30, 'The prisoner'), 'hurt')
  assert.equal(hostageHealth(state, 'prisoner'), HOSTAGE.health - 30)
  assert.equal(state.phase, 'active', 'A wounded hostage is still a mission')
  assert(SHARED_MISSION_KEYS.includes('hostageHealth') && SHARED_MISSION_KEYS.includes('failure'), 'Co-op shares hostages\' health and the failure')
  assert.equal(hurtHostage(state, 'prisoner', 999, 'The prisoner'), 'killed')
  assert(!hostageAlive(state, 'prisoner') && state.phase === 'dead' && /prisoner was killed/i.test(state.failure ?? ''), 'His death loses the mission and says why')
  assert.equal(hurtHostage(state, 'prisoner', 10), null, 'The dead take no more')
  const guest = initialMission([])
  applySharedMission(guest, sharedMission(state))
  assert.equal(guest.phase, 'dead', 'The mission is lost for a co-op guest too')
}
console.log('PASS Hostages are hurt, a death loses the mission for everyone, and the reason is kept')

// Guards: no shot through a hostage at the player; with him out of the way, they fire.
{
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  floor.rotation.x = -Math.PI / 2; scene.add(floor)
  const world = new CollisionWorld(scene)
  const actor = async () => {
    const root = new THREE.Group()
    return { root, reactionRemaining: 0, animationTime: 0, update() {}, shoot() {}, restore() {}, react() {}, dispose() {}, muzzle: () => root.position.clone().add(v(0, 1.4, 0.3)) } as unknown as EnemyActor
  }
  const shield = body('shield', v(0, 0, 6))
  let struck = 0
  const ai = new EnemyDirector({ scene, world, doors: [], specs: [{ id: 'g', name: 'Guard', position: [0, 0, 0], patrol: [], weapon: 'ak', facing: 0 }],
    emit() {}, damagePlayer() {}, dropWeapon() {},
    bystander: (from, direction, reach, damage) => {
      const hit = hostageAlong([shield], from, direction, reach)
      if (hit && damage) struck++
      return hit?.distance ?? null
    } }, actor)
  await ai.init()
  const player: PlayerSense = { feet: v(0, 0, 12), eye: v(0, 1.65, 12), velocity: v(), alive: true, radioEnabled: false }
  for (let i = 0; i < 60 * 4; i++) ai.update(1 / 60, player)
  assert.equal(ai.enemies[0].state, 'combat', 'He has seen the player')
  const guard = ai.enemies[0]
  // Blocked, he never puts a round through the hostage: he holds, or steps aside for a clear line and fires from there.
  assert.equal(struck, 0, 'No round of his went through the hostage standing between them')
  assert(guard.shots === 0 || Math.abs(guard.position.x) > 0.3, 'If he fired at all, he moved off the line first')
  // Misses that stray across the hostage hit him: put him just beside the line of fire.
  shield.actor.root.position.set(guard.position.x + (player.feet.x - guard.position.x) * 0.66 + 0.85, 0, guard.position.z + (player.feet.z - guard.position.z) * 0.66)
  for (let i = 0; i < 60 * 8 && !struck; i++) ai.update(1 / 60, player)
  assert(struck > 0, 'A stray round finds the hostage beside the player')
  ai.dispose(); world.dispose()
}
console.log('PASS Guards never shoot through a hostage at the player, but their misses can hit him')
