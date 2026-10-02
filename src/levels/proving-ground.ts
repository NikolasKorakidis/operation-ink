import * as THREE from 'three'
import { Draft, wallText, type Point } from '../render/ink'
import { building, container, crates, platform } from '../world/architecture'
import { fence } from '../world/industrial'
import { pipeLadder } from '../world/ladders'
import { drawPine } from '../world/vegetation'
import { enemy } from '../game/enemy-types'
import type { GoalSpec } from '../game/goals'
import type { MissionWorld, Station, Vec3 } from '../game/types'

/**
 * The proving ground: the template level. A small fenced outpost, built only from the shared world kit, with a
 * mission made only of declared goals. Copy this file to start a new level (see levels/README.md).
 *
 * Layout, in metres (north is -Z, the player comes in from the south through the gap in the fence):
 *   Command post   (-14, -18)  administration hut: the officer, a guard, the intel on the briefing table, two radios
 *   North gatehouse (20, -20)  guard room with a radio desk
 *   Store           (18, 16)   warehouse with two quest crates
 *   Watch platform (-30, 8)    a marksman's post, 3 m up, with a ladder
 *   Extraction      (36, -33)  the landing zone, north-east corner
 */
export const PROVING_GROUND = {
  spawn: [0, 0.05, 49] as Vec3,
  lookAt: [0, 1.6, 30] as Vec3,
  bounds: { minX: -50, maxX: 50, minZ: -46, maxZ: 54 },
  fence: { x: 46, z: 42, gate: 4 },
  extraction: { center: [36, 0, -33] as Vec3, radius: 4 },
  intel: [-13.2, 0.28 + 0.945, -18.6] as Vec3,
  platform: { x: -30, z: 8, size: 3, height: 3 },
} as const

/** A standing signboard: two posts, a board and hand-lettered text facing +Z. */
function signpost(root: THREE.Group, text: string, x: number, z: number, angle = 0, height = 0.4) {
  const sign = new Draft(`Proving ground sign · ${text}`, x, z, angle)
  for (const sx of [-1.1, 1.1]) sign.beam([sx, 0, 0], [sx, 2.1, 0], 0.09, 'paper', 'detail')
  sign.box(2.6, 0.7, 0.06, 0, 1.75, 0, 'paper', 'detail')
  sign.add(wallText(text, [0, 1.75, 0.04], height))
  root.add(sign.finish())
}

/** The intel: a field laptop, open, on the command post's briefing table. Its own object, so the station can point at it. */
function laptop(position: Vec3) {
  const g = new Draft('Intel laptop', position[0], position[2], -0.2)
  g.position.y = position[1]
  g.box(0.36, 0.022, 0.25, 0, 0.011, 0, 'roof', 'detail')
  g.box(0.36, 0.24, 0.016, 0, 0.13, -0.12, 'roof', 'detail', [-0.25, 0, 0])
  g.box(0.3, 0.18, 0.004, 0, 0.13, -0.11, 'glass', false, [-0.25, 0, 0])
  return g.finish()
}

export function createProvingGround(): { ground: THREE.Group; world: MissionWorld } {
  const { fence: perimeter, extraction, platform: post } = PROVING_GROUND
  const ground = new THREE.Group()
  ground.name = 'Proving ground'
  ground.userData = { kind: 'proving-ground' }

  // The field: one solid slab, with paper beyond to the horizon.
  const field = new Draft('Proving ground · field')
  field.box(120, 0.1, 120, 0, -0.05, 4, 'paper', false)
  for (const side of [-1, 1]) field.line([[side * 2.4, 0.01, 52], [side * 2.4, 0.01, 22]], 'landscape')
  ground.add(field.finish())
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshBasicMaterial({ color: 0xffffff }))
  paper.rotation.x = -Math.PI / 2
  paper.position.y = -0.06
  paper.name = 'Unlit paper ground'
  paper.userData.noCollision = true
  ground.add(paper)
  // The fence all round, open only at the south gate.
  const { x: fx, z: fz, gate } = perimeter
  ground.add(fence('Proving ground · perimeter fence', [[-gate, fz], [-fx, fz], [-fx, -fz], [fx, -fz], [fx, fz], [gate, fz]], 2.6))

  // Buildings: their interiors, doors, dark rooms, lamps and windows all come with building().
  ground.add(
    building({ name: 'Command post · administration', x: -14, z: -18, width: 14, depth: 10, height: 3.3 }),
    building({ name: 'North gatehouse', x: 20, z: -20, width: 8, depth: 6, height: 3 }),
    building({ name: 'Store', x: 18, z: 16, width: 16, depth: 10, height: 4.6, type: 'warehouse' }),
  )
  ground.add(laptop(PROVING_GROUND.intel))

  // Cover across the yard: containers, crate stacks and a sandbagged corner.
  ground.add(container('Yard container A', -4, 2, 6.1, 2.45, 0.1), container('Yard container B', 8, -6, 6.1, 2.45, Math.PI / 2 - 0.05),
    container('Yard container C', 30, -4, 6.1, 2.45, 0))
  const cover = new Draft('Proving ground · cover')
  crates(cover, -20, 4, 3)
  crates(cover, 12, 24, 2)
  crates(cover, 28, -28, 3)
  ground.add(cover.finish())

  // The marksman's platform, with a ladder up its west side.
  ground.add(platform('Watch platform', post.x, post.z, post.size, post.size, post.height))
  ground.add(pipeLadder({ name: 'Watch platform · ladder', x: post.x - post.size / 2 - 0.59, z: post.z, bottom: 0.03,
    landingHeight: post.height, angle: -Math.PI / 2, landingDepth: 1.1 }).finish())

  // The extraction point: a painted landing circle with an H, and a sign.
  const pad = new Draft('Extraction point')
  const [ex, , ez] = extraction.center
  pad.line(Array.from({ length: 33 }, (_, i): Point => [ex + Math.cos(i / 32 * Math.PI * 2) * extraction.radius, 0.012, ez + Math.sin(i / 32 * Math.PI * 2) * extraction.radius]), 'detail')
  for (const sx of [-0.8, 0.8]) pad.line([[ex + sx, 0.012, ez - 1.2], [ex + sx, 0.012, ez + 1.2]], 'detail')
  pad.line([[ex - 0.8, 0.012, ez], [ex + 0.8, 0.012, ez]], 'detail')
  ground.add(pad.finish())
  signpost(ground, 'EXTRACTION', ex - 6, ez + 2, 0, 0.36)
  signpost(ground, 'PROVING GROUND', -7, 40, 0, 0.3)

  // Pines outside the fence.
  const trees = new Draft('Proving ground · pines')
  for (let i = 0; i < 40; i++) {
    const side = i % 4, t = (i >> 2) / 9
    const [x, z] = side === 0 ? [-fx - 5 - (i * 7) % 6, -fz + t * fz * 2] : side === 1 ? [fx + 5 + (i * 5) % 6, -fz + t * fz * 2]
      : side === 2 ? [-fx + t * fx * 2, -fz - 5 - (i * 3) % 6] : [-fx + t * (fx - 8), fz + 6 + (i * 7) % 5]
    drawPine(trees, x, z, 7 + (i * 5) % 4, 1200 + i)
  }
  ground.add(trees.finish())
  ground.updateMatrixWorld(true)

  // The mission on it.
  const root = new THREE.Group()
  root.name = 'Proving ground mission'
  const intel = ground.getObjectByName('Intel laptop')!
  const stations: Station[] = [
    { id: 'intel', kind: 'objective', object: intel, point: intel.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0)), label: 'Take the intel' },
  ]
  const enemies = [
    enemy('sidearm', 'officer', [-17, 0.28, -16.2], { name: 'The officer', facing: Math.PI }),
    enemy('gunner', 'post-guard', [-9.3, 0.28, -15.6], { facing: -Math.PI / 2 }),
    // His loop stays out of sight of the gap in the fence (DETECTION.soldier from the insertion).
    enemy('rifleman', 'yard-1', [-6, 0, 3], { patrol: [[-6, 0, 3], [12, 0, 3], [12, 0, -10], [-6, 0, -10]] }),
    enemy('rifleman', 'yard-2', [32, 0, 4], { patrol: [[32, 0, 4], [32, 0, -26], [10, 0, -26]] }),
    enemy('breacher', 'store-guard', [18, 0, 24], { facing: Math.PI / 2 }),
    enemy('rifleman', 'gate-guard', [20, 0, -15], { facing: 0 }),
    // He watches the yard and the north gate, not the fence gap you come in by.
    enemy('marksman', 'watch', [post.x, post.height, post.z], { facing: 2.5 }),
    enemy('rifleman', 'reserve-1', [-17, 0.28, -21], { reserve: true, alarmExit: [-14, 0, -11] }),
    enemy('rifleman', 'reserve-2', [-11, 0.28, -21], { reserve: true, alarmExit: [-14, 0, -11] }),
  ]
  const goals: GoalSpec[] = [
    { id: 'intel', kind: 'interact', station: 'intel', label: 'Take the intel', detail: 'Laptop on the command post table', done: 'Intel taken.' },
    { id: 'officer', kind: 'eliminate', enemies: ['officer'], label: 'Eliminate the officer', detail: 'He works in the command post', done: 'The officer is down.' },
    { id: 'radios', kind: 'destroy', items: 'radios', label: 'Destroy the radios', detail: 'Shoot them, or switch them off (F)', main: false },
    { id: 'crates', kind: 'destroy', items: 'crates', label: 'Destroy the supply crates', detail: 'In the store', main: false },
    { id: 'extract', kind: 'extract', area: { center: extraction.center, radius: extraction.radius }, label: 'Reach the extraction point', detail: 'North-east corner', done: 'Extracted.' },
  ]
  return {
    ground,
    world: {
      level: 'proving-ground', root, stations, enemies, goals, spawn: PROVING_GROUND.spawn, lookAt: PROVING_GROUND.lookAt, bounds: PROVING_GROUND.bounds,
      briefing: {
        title: 'Proving ground', premise: 'Take the intel, drop the officer, get out.', won: 'Extracted.', outro: 'Intel delivered.',
        tips: ['The command post is north-west of the gate; the officer and the intel are both inside.',
          'A marksman watches the yard from the platform in the west. The containers break his line of sight.',
          'The landing zone is in the far north-east corner. It only counts once the intel and the officer are done.'],
      },
    },
  }
}
