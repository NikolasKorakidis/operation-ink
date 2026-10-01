import assert from 'node:assert/strict'
import * as THREE from 'three'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { BOSS_RULES } from '../src/game/balance'
import { CollisionWorld } from '../src/player/collision'
import { rayCapsuleDistance } from '../src/game/hit-reactions'

// A shot is first tested against a broad sphere round the body, then against its animated capsules. The boss is
// twice a guard's size, so the sphere has to grow with him: his head is above a guard-sized one.
const scene = new THREE.Scene()
const floor = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 60), new THREE.MeshBasicMaterial())
floor.position.y = -0.5; scene.add(floor)
const world = new CollisionWorld(scene)
const scale = BOSS_RULES.scale, head = new THREE.Vector3(0, 1.505 * scale, 0)
const ai = new EnemyDirector({ scene, world, doors: [], specs: [{ id: 'boss', name: 'boss', position: [0, 0, 0], patrol: [[0, 0, 0]], weapon: 'ak', boss: true, health: 1000, armor: 500 }],
  emit() {}, damagePlayer() {}, dropWeapon() {} }, async () => {
  const root = new THREE.Group(); root.scale.setScalar(scale)
  // Just a head, where the boss's really is: a ball 0.24 × scale round.
  const hitVolumes = { raycast: (origin: THREE.Vector3, direction: THREE.Vector3, max: number) => {
    const distance = rayCapsuleDistance(origin, direction, head, head, 0.24 * scale)
    return distance <= max ? { distance, point: origin.clone().addScaledVector(direction, distance), zone: 'head', bone: 'head' } : null
  } }
  return { root, hitVolumes, reactionRemaining: 0, animationTime: 0, deathClip: 'dieBody', update() {}, shoot() {}, react() {}, restore() {}, dispose() {}, makeBoss() {},
    armorLeft() {}, breakArmor() {}, burstHead() {}, muzzle: () => root.position.clone() } as unknown as EnemyActor
})
await ai.init()
const boss = ai.enemies[0]
const eye = new THREE.Vector3(0, 1.65, 6)
const found = ai.findHit({ origin: eye, direction: head.clone().sub(eye).normalize(), range: 60, damage: 30, weapon: 'ak' }, 60)
assert(found && found.zone === 'head', 'A shot at the boss\'s head, 3 m up, reaches his head')
const before = boss.health
ai.hit({ origin: eye, direction: head.clone().sub(eye).normalize(), range: 60, damage: 30, weapon: 'ak' }, 60)
assert(boss.health < before && boss.armor === 500, 'and goes straight through his armour')
ai.dispose(); world.dispose()
console.log('PASS The boss\'s head can be shot: the hit test grows with his size')
