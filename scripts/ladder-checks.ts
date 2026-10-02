import assert from 'node:assert/strict'
import * as THREE from 'three'
import { LEVEL_CATALOG, buildLevel } from '../src/levels'
import { CollisionWorld } from '../src/player/collision'
import { PlayerBody } from '../src/player/body'
import { PlayerActions } from '../src/player/actions'

/*
 * Every ladder on every level: climb it, step off where it lands, and get back down again. Coming down must be
 * offered wherever a player who has just climbed up ends up standing, looking toward the ladder from up to a couple
 * of metres away, not only from the exact landing point.
 */
let failures = 0
for (const info of LEVEL_CATALOG) {
  const { ground, world: mission } = buildLevel(info.id)
  const scene = new THREE.Scene()
  scene.add(ground, mission.root)
  scene.updateMatrixWorld(true)
  const world = new CollisionWorld(scene), body = new PlayerBody(world)
  const actions = new PlayerActions(scene, body), camera = new THREE.PerspectiveCamera(75, 1, 0.06, 1600)
  const simulate = (seconds: number) => { for (let t = 0; t < seconds; t += 1 / 60) body.update(1 / 60, new THREE.Vector3(), false) }
  const look = (at: THREE.Vector3) => { actions.syncCamera(camera); camera.lookAt(at); camera.updateMatrixWorld(true) }
  for (const ladder of actions.ladders) {
    const name = `${info.id} · ${ladder.name}`
    try {
      actions.reset()
      const bottom = actions.ladderPoint(ladder, false)
      const outward = new THREE.Vector3(0, 0, 1).transformDirection(ladder.matrixWorld).setY(0).normalize()
      body.teleport(bottom.clone().addScaledVector(outward, 0.8)); simulate(0.4)
      look(bottom.clone().add(new THREE.Vector3(0, 1.25, 0)))
      assert.equal(actions.findTarget(camera)?.object, ladder, 'climbing up is offered at the foot')
      assert(actions.activate(camera))
      for (let i = 0; i < 400 && actions.climbing; i++) actions.updateClimb(0.05)
      simulate(0.6)
      assert(body.grounded, 'stands on the landing')
      const landed = body.position.clone(), rail = actions.ladderPoint(ladder, true, true)
      assert(landed.y > bottom.y + 1.5, `got up (${landed.y.toFixed(2)} m)`)
      // From the landing, and from a step or two back and to the side, looking at the top of the ladder.
      const inward = outward.clone().negate(), side = new THREE.Vector3(-outward.z, 0, outward.x)
      for (const [back, across] of [[0, 0], [0.6, 0], [1.2, 0], [0.8, 0.7], [0.8, -0.7]]) {
        const spot = landed.clone().addScaledVector(inward, back).addScaledVector(side, across)
        body.teleport(spot); simulate(0.3)
        if (!body.grounded || Math.abs(body.position.y - landed.y) > 0.3) continue
        look(new THREE.Vector3(rail.x, body.position.y + 0.9, rail.z))
        const target = actions.findTarget(camera)
        assert(target?.object === ladder && target.descending, `climbing down is offered ${back} m back, ${across} m across (got ${target?.label ?? 'nothing'})`)
      }
      body.teleport(landed); simulate(0.3)
      look(new THREE.Vector3(rail.x, body.position.y + 0.9, rail.z))
      assert(actions.activate(camera) && actions.climbing?.descending, 'climbing down starts')
      for (let i = 0; i < 400 && actions.climbing; i++) actions.updateClimb(0.05)
      simulate(0.6)
      const foot = world.floor(bottom, 0.5, 1.5)
      assert(body.grounded && Math.abs(body.position.y - foot) < 0.3, `back at the foot (${body.position.y.toFixed(2)} vs ${foot.toFixed(2)})`)
      console.log(`PASS ${name}`)
    } catch (error) {
      failures++
      console.error(`FAIL ${name}: ${(error as Error).message}`)
    }
  }
  world.dispose()
}
assert.equal(failures, 0, `${failures} ladder(s) cannot be climbed up and back down`)
console.log('PASS Every ladder on every level can be climbed and climbed back down')
