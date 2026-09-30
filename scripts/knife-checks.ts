import assert from 'node:assert/strict'
import * as THREE from 'three'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { ENEMY_HEALTH, KNIFE } from '../src/game/balance'
import { CollisionWorld } from '../src/player/collision'
import { createMissionWorld } from '../src/game/world'
import type { EnemySpec, Shot, SoundEvent } from '../src/game/types'

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
async function fixture(specs: EnemySpec[]) {
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  floor.rotation.x = -Math.PI / 2; scene.add(floor)
  const world = new CollisionWorld(scene), events: SoundEvent[] = []
  const ai = new EnemyDirector({ scene, world, doors: [], specs, emit: e => events.push(e), damagePlayer() {}, dropWeapon() {} }, async () => {
    const root = new THREE.Group()
    return { root, reactionRemaining: 0, animationTime: 0, deathClip: 'dieBody', update() {}, shoot() {}, react() {}, restore() {}, dispose() {},
      muzzle: () => root.position.clone().add(v(0, 1.4, 0.3)) } as unknown as EnemyActor
  })
  await ai.init()
  return { ai, world, events, dispose() { ai.dispose(); world.dispose() } }
}
const guard = (id: string, x: number, facing = 0): EnemySpec => ({ id, name: id, position: [x, 0, 0], patrol: [[x, 0, 0]], weapon: 'ak', facing })
const knife = (origin: THREE.Vector3, direction: THREE.Vector3, damage: number): Shot =>
  ({ origin, direction: direction.normalize(), range: KNIFE.range, damage, weapon: 'knife' })
const strike = (ai: EnemyDirector, shot: Shot) => ai.hit(shot, KNIFE.range)

{
  const f = await fixture([guard('back', 0)])
  assert(strike(f.ai, knife(v(0, 1.1, -1), v(0, 0, 1), KNIFE.slash.damage)), 'A slash at arm\'s length connects')
  assert.equal(f.ai.enemies[0].state, 'dead', 'A slash in the back is lethal')
  f.dispose()
}
{
  const f = await fixture([guard('front', 0)])
  strike(f.ai, knife(v(0, 1.1, 1), v(0, 0, -1), KNIFE.slash.damage))
  assert(f.ai.enemies[0].health > 0 && f.ai.enemies[0].health < ENEMY_HEALTH, 'A slash from the front wounds but does not kill')
  strike(f.ai, knife(v(0, 1.1, 1), v(0, 0, -1), KNIFE.stab.damage))
  assert.equal(f.ai.enemies[0].state, 'dead', 'A following stab finishes the job')
  assert(!strike(f.ai, knife(v(0, 1.1, 3), v(0, 0, -1), KNIFE.slash.damage)), 'A dead guard cannot be struck again')
  f.dispose()
}
{
  const f = await fixture([guard('reach', 0)])
  assert(!strike(f.ai, knife(v(0, 1.1, -2.2), v(0, 0, 1), KNIFE.stab.damage)), 'The blade does not reach beyond arm\'s length')
  f.dispose()
}
console.log('PASS Knife: any hit from behind kills; from the front a slash wounds and a stab is heavy; reach is arm\'s length')

{
  // Two lookouts 7 m apart, both facing +Z. Knifing one must not alert the other; a gunshot kill does.
  const quiet = await fixture([guard('west', -3.5), guard('east', 3.5)])
  strike(quiet.ai, knife(v(-3.5, 1.1, -1), v(0, 0, 1), KNIFE.slash.damage))
  assert.equal(quiet.ai.enemies[0].state, 'dead')
  assert.equal(quiet.ai.enemies[1].state, 'guard', 'The other lookout, facing away, does not notice a silent kill')
  quiet.dispose()
  const loud = await fixture([guard('west', -3.5), guard('east', 3.5)])
  loud.ai.enemies[0].health = 1
  loud.ai.hit({ origin: v(-3.5, 1.1, -1), direction: v(0, 0, 1), range: 50, damage: 30, weapon: 'pistol' }, 50)
  assert.equal(loud.ai.enemies[0].state, 'dead')
  assert.equal(loud.ai.enemies[1].state, 'investigate', 'A body dropped by gunfire is still reported by a nearby guard')
  loud.dispose()
  const suppressed = await fixture([guard('west', -3.5), guard('east', 3.5)])
  suppressed.ai.enemies[0].health = 1
  suppressed.ai.hit({ origin: v(-3.5, 1.1, -1), direction: v(0, 0, 1), range: 50, damage: 30, weapon: 'silenced' }, 50)
  assert.equal(suppressed.ai.enemies[0].state, 'dead')
  assert.equal(suppressed.ai.enemies[1].state, 'guard', 'A suppressed kill is as quiet as a knife kill to a lookout facing away')
  suppressed.dispose()
  const watching = await fixture([guard('west', -3.5), guard('east', 3.5, -Math.PI / 2)])
  strike(watching.ai, knife(v(-3.5, 1.1, -1), v(0, 0, 1), KNIFE.slash.damage))
  assert.equal(watching.ai.enemies[1].state, 'investigate', 'A lookout looking straight at the kill does notice it')
  watching.dispose()
}
console.log('PASS A knife or suppressed kill is silent: only a guard actually looking at the body reacts')

{
  // A guard 2 m away, facing the shooter with a clear line of sight, ignores the suppressed pistol
  // but investigates an ordinary pistol shot from the same spot.
  for (const [kind, expected] of [['shot-silenced', 'guard'], ['shot-pistol', 'investigate']] as const) {
    const f = await fixture([guard('near', 0)])
    f.ai.hear({ kind, position: v(0, 1.5, 2), radius: kind === 'shot-silenced' ? 5 : 38 })
    assert.equal(f.ai.enemies[0].state, expected, `${kind} at 2 m in plain view leaves the guard in ${expected}`)
    f.dispose()
  }
}
console.log('PASS No guard hears or reacts to the suppressed pistol, even at arm\'s length in plain view')

{
  const mission = createMissionWorld()
  const lookouts = mission.enemies.filter(enemy => enemy.id.startsWith('roof-lookout'))
  assert.equal(lookouts.length, 1, 'Exactly one lookout guards the mess-hall roof')
  for (const lookout of lookouts) {
    assert.equal(lookout.weapon, 'ak'); assert.equal(lookout.facing, 0); assert.equal(lookout.patrol.length, 1)
    assert(lookout.position[1] > 6, 'The lookout stands on the mess-hall roof')
  }
  const spawn = new THREE.Vector3(...mission.spawn)
  for (const lookout of lookouts) {
    const toSpawn = spawn.clone().sub(new THREE.Vector3(...lookout.position)).setY(0).normalize()
    assert(toSpawn.z < -0.5, 'The insertion point is behind the lookouts')
  }
}
console.log('PASS One AK lookout on the mess-hall roof faces the yard with his back to the insertion')
