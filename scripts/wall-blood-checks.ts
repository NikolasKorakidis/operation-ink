import assert from 'node:assert/strict'
import * as THREE from 'three'
import { MissionBlood, type HitReaction } from '../src/game/hit-reactions'
import { CollisionWorld } from '../src/player/collision'

/*
 * Blood goes on the walls, not only the floor: a hit throws a splash onto the wall behind the body (a kill's bigger,
 * with spatter round it), droplets that fly into a wall splat there, and no mark hangs past a wall's edge.
 */
function room(wallAt: number, wallWidth = 6) {
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.BoxGeometry(30, 0.2, 30), new THREE.MeshBasicMaterial())
  floor.position.y = -0.1
  const wall = new THREE.Mesh(new THREE.BoxGeometry(wallWidth, 3, 0.2), new THREE.MeshBasicMaterial())
  wall.position.set(0, 1.5, wallAt + 0.1)
  scene.add(floor, wall)
  scene.updateMatrixWorld(true)
  const world = new CollisionWorld(scene)
  const blood = new MissionBlood(scene, world)
  return { blood, world, wallFace: wallAt }
}
const kill: HitReaction = { zone: 'torso', point: new THREE.Vector3(0, 1.2, 0), direction: new THREE.Vector3(0, 0, 1), lethal: true }
const onWall = (stain: { normal?: number[] }) => !!stain.normal

{
  // A kill 1.5 m in front of a wall: a big splash where the shot's line meets it, and spatter round it.
  const { blood, world, wallFace } = room(1.5)
  blood.emitHit(kill)
  const walls = blood.snapshot().stains.filter(onWall)
  assert(walls.length >= 4, `The kill splashes the wall (${walls.length} marks)`)
  for (const stain of walls) {
    assert(Math.abs(stain.position[2] - wallFace) < 0.02, 'Each mark sits on the wall face')
    assert(stain.normal![2] < -0.95, 'and faces out of it, toward the room')
  }
  assert(Math.max(...walls.map(stain => stain.size)) >= 0.2, 'The main mark is a big one')
  const before = walls.length
  for (let i = 0; i < 180; i++) blood.update(1 / 60)
  assert(blood.snapshot().stains.filter(onWall).length > before, 'Droplets flying into the wall splat on it too')
  assert(blood.snapshot().stains.some(stain => !onWall(stain)), 'and the floor still gets its share')
  // A checkpoint keeps the wall marks, facing the same way.
  const saved = blood.snapshot()
  blood.restore(structuredClone(saved))
  assert.deepEqual(blood.snapshot().stains.filter(onWall), saved.stains.filter(onWall))
  world.dispose()
}
console.log('PASS A kill splashes the wall behind with a big mark and spatter; droplets splat on walls; it all restores')

{
  // A wall too far behind gets nothing from the hit itself.
  const { blood, world } = room(6)
  blood.emitHit(kill)
  assert.equal(blood.snapshot().stains.filter(onWall).length, 0, 'A wall 6 m away is out of reach of the splash')
  world.dispose()
}
console.log('PASS A wall far behind is out of reach')

{
  // A narrow pillar: the splash is made small enough to stay on it, never hanging off into the air.
  const { blood, world } = room(1.2, 0.3)
  blood.emitHit(kill)
  for (const stain of blood.snapshot().stains.filter(onWall)) {
    assert(Math.abs(stain.position[0]) + stain.size * 1.8 <= 0.15 + 0.02, `A mark on a 30 cm pillar fits on it (x ${stain.position[0].toFixed(2)}, size ${stain.size.toFixed(2)})`)
  }
  world.dispose()
}
console.log('PASS Marks never hang past a wall\'s edge')
