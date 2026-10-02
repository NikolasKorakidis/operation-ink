import assert from 'node:assert/strict'
import * as THREE from 'three'
import { CollisionWorld } from '../src/player/collision'
import { PlayerBody } from '../src/player/body'
import { EnemyNavigation } from '../src/game/navigation'
import { STOREY, storeyed } from '../src/world/storeys'
import { WALL_THICKNESS } from '../src/world/architecture'

// Every storey of a multi-storey building can be climbed to, by players and guards, whichever end the stairs are at.
for (const stairs of ['left', 'right'] as const) {
  const scene = new THREE.Scene()
  const ground = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 60), new THREE.MeshBasicMaterial()); ground.position.y = -0.5; scene.add(ground)
  const w = 17, d = 12, floors = 3
  scene.add(storeyed({ name: `Test hotel ${stairs}`, x: 0, z: 0, width: w, depth: d, floors, roof: 'flat', door: { x: 0 }, stairs }))
  scene.updateMatrixWorld(true)
  const world = new CollisionWorld(scene)
  const inner = w / 2 - WALL_THICKNESS, sign = stairs === 'left' ? -1 : 1
  const laneX = (lane: number) => sign * (inner - 1.2 * (lane + 0.5))
  const zFront = d / 2 - WALL_THICKNESS - 1.3
  const body = new PlayerBody(world)
  const walk = (direction: THREE.Vector3, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 60) body.update(1 / 60, direction, false) }
  body.teleport(new THREE.Vector3(laneX(0), 0.3, zFront + 0.6))
  walk(new THREE.Vector3(), 0.5)
  for (let flight = 0; flight < floors - 1; flight++) {
    // Up the flight in this lane, then step across into the next lane on the landing.
    walk(new THREE.Vector3(0, 0, flight % 2 ? 1 : -1), 6)
    const reached = 0.28 + (flight + 1) * STOREY
    assert(Math.abs(body.position.y - reached) < 0.05, `${stairs} stairs, flight ${flight + 1}: the player reaches floor ${flight + 1} (y ${body.position.y.toFixed(2)}, wanted ${reached.toFixed(2)})`)
    if (flight < floors - 2) {
      const x = laneX((flight + 1) % 2)
      for (let t = 0; t < 3 && Math.abs(body.position.x - x) > 0.05; t += 1 / 60) body.update(1 / 60, new THREE.Vector3(Math.sign(x - body.position.x), 0, 0), false)
    }
  }
  // Guards plan the same climb.
  const navigation = new EnemyNavigation(world, [], () => {})
  const bottom = navigation.floor(new THREE.Vector3(laneX(0), 0.3, zFront + 0.6), false)!
  const top = navigation.floor(new THREE.Vector3(laneX(0), 0.28 + STOREY, -d / 2 + WALL_THICKNESS + 0.6), false)!
  assert(bottom && top, `${stairs}: both ends of the first flight are floor a guard fits on`)
  assert(navigation.plan(bottom, top).length > 0, `${stairs}: a guard can plan a route up the stairs`)
  world.dispose()
}
console.log('PASS Every floor of a multi-storey building can be climbed to, by players and guards, with the stairs at either end')
