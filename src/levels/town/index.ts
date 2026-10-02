import * as THREE from 'three'
import { Draft, wallText, type Point } from '../../render/ink'
import { building } from '../../world/architecture'
import { fence, waterTower } from '../../world/industrial'
import { storeyed, type FloorArea } from '../../world/storeys'
import type { Furnishing } from '../../world/interiors'
import { bankBarrier, groundLine, pathDistance, terrain, waterSurface, type PlanPath } from '../../world/terrain'
import { drawOak, drawPine } from '../../world/vegetation'
import { penRandom } from '../../render/ballpoint'
import { enemy } from '../../game/enemy-types'
import type { GoalSpec } from '../../game/goals'
import type { EnemySpec, MissionWorld, Station } from '../../game/types'
import { ROADS, TOWN, onBridge, townHeight } from './plan'
import { boulder, c4Cache, checkpoint, church, intelFolder, detentionShed, footbridge, fuelDepot, grainSilo, mapLines, marketSquare, signboard, stoneBridge, townHall, walledGraveyard, yardFence } from './buildings'

/** Whether (x, z) is inside the perimeter fence's rounded rectangle, at least `margin` from it. */
function insideFence(x: number, z: number, margin = 0) {
  const { minX, maxX, minZ, maxZ, radius } = TOWN.fence
  const cx = THREE.MathUtils.clamp(x, minX + radius, maxX - radius), cz = THREE.MathUtils.clamp(z, minZ + radius, maxZ - radius)
  return Math.hypot(x - cx, z - cz) <= radius - margin
}

/** The perimeter fence: a rounded rectangle, open at the north-road gate and cut open behind the graveyard. */
function perimeter(): PlanPath[] {
  const { minX, maxX, minZ, maxZ, radius: r, gate } = TOWN.fence
  const arc = (cx: number, cz: number, from: number, to: number) => Array.from({ length: 7 }, (_, i): [number, number] => {
    const a = from + (to - from) * i / 6
    return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]
  })
  const cut = TOWN.fenceCut
  return [
    [[gate.x + gate.half, minZ], ...arc(maxX - r, minZ + r, -Math.PI / 2, 0), ...arc(maxX - r, maxZ - r, 0, Math.PI / 2),
      ...arc(minX + r, maxZ - r, Math.PI / 2, Math.PI), [minX, cut.z + cut.half]],
    [[minX, cut.z - cut.half], ...arc(minX + r, minZ + r, Math.PI, Math.PI * 1.5), [gate.x - gate.half, minZ]],
  ]
}

/** Upstairs (floor 1), a blue intel folder on the given spot; `desk` puts a desk under it first. */
const withFiles = (furnish: (g: Furnishing, area: FloorArea) => void, name: string, place: (area: FloorArea) => [number, number], desk = false) =>
  (g: Furnishing, area: FloorArea) => {
    furnish(g, area)
    if (area.floor !== 1) return
    const [x, z] = place(area)
    if (desk) g.desk(x, z, area.y, Math.PI)
    g.add(intelFolder(`${name} · intel files`, x - 0.35, area.y + 0.9, z, 0.2))
  }

/** Classroom desks in rows facing the front, and the teacher's desk (with a radio on the ground floor). */
function classroom(g: Furnishing, area: FloorArea) {
  for (let x = area.minX + 1; x < area.maxX - 2.4; x += 2.4) for (const z of [-1.2, 1.4]) {
    g.desk(x, z, area.y, Math.PI)
    g.chair(x, z - 0.95, area.y)
  }
  g.desk(area.maxX - 1.1, area.minZ + 0.6, area.y, 0, area.floor === 0)
  g.chair(area.maxX - 1.1, area.minZ + 1.6, area.y, Math.PI)
  g.wallMap((area.minX + area.maxX) / 2, area.minZ - 0.02, area.y)
}

/** Hotel floors: the lobby with its reception desk (and radio), then rooms of beds and lockers above. */
function hotelFloor(g: Furnishing, area: FloorArea) {
  if (area.floor === 0) {
    g.desk(area.minX + 1.4, area.minZ + 0.7, area.y, 0, true)
    g.chair(area.minX + 1.4, area.minZ + 1.7, area.y, Math.PI)
    g.lockers(area.minX + 4, area.minZ + 0.3, area.y, 3)
    g.table((area.minX + area.maxX) / 2 + 1, 0.2, area.y, 2.6)
    return
  }
  for (let x = area.minX + 0.9; x < area.maxX - 0.8; x += 2.4) g.bunk(x, area.minZ + 1.1, area.y, 0, true)
  g.lockers(area.maxX - 1.5, area.maxZ - 0.3, area.y, 2, Math.PI)
  g.shelf(area.minX + 0.6, area.maxZ - 0.5, area.y, Math.PI)
}

/** The manor's rooms: a dining table and shelves below, a study and beds above. */
function manorFloor(g: Furnishing, area: FloorArea) {
  if (area.floor === 0) {
    g.table((area.minX + area.maxX) / 2 + 1, -0.6, area.y, 3.3)
    for (const x of [-0.4, 1, 2.4]) { g.chair(x, -1.85, area.y); g.chair(x, 0.65, area.y, Math.PI) }
    g.shelf(area.maxX - 0.4, area.minZ + 0.6, area.y)
    g.lockers(area.minX + 1, area.minZ + 0.3, area.y, 2)
    return
  }
  g.desk(area.maxX - 1.3, area.minZ + 0.6, area.y, 0, true)
  g.chair(area.maxX - 1.3, area.minZ + 1.6, area.y, Math.PI)
  for (const x of [area.minX + 1.2, area.minX + 3.6]) g.bunk(x, area.minZ + 1.1, area.y, 0, true)
  g.wallMap(area.minX + 6, area.minZ - 0.02, area.y)
}

export function createTown(): { ground: THREE.Group; world: MissionWorld } {
  const ground = new THREE.Group()
  ground.name = 'The town'
  ground.userData = { kind: 'town' }
  const { bounds } = TOWN

  // The land: one sheet of paper with the river's channel and the manor's hill in it, white paper beyond.
  ground.add(terrain('Town · ground', bounds, 1, townHeight).finish())
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshBasicMaterial({ color: 0xffffff }))
  paper.rotation.x = -Math.PI / 2
  paper.position.y = -2.2
  paper.name = 'Unlit paper ground'
  paper.userData.noCollision = true
  ground.add(paper)

  // The river: water in its channel, its banks inked, crossed only at the stone bridge.
  const { river, riverHalfWidth, bank, waterLevel, bridge } = TOWN
  ground.add(waterSurface('River', river, riverHalfWidth + 0.35, waterLevel))
  ground.add(bankBarrier('River banks', river, riverHalfWidth + bank, onBridge))
  const ink = new Draft('Town · banks, contours and roads')
  groundLine(ink, river, riverHalfWidth + bank, townHeight)
  groundLine(ink, river, riverHalfWidth + 0.5, (x, z) => Math.max(townHeight(x, z), waterLevel + 0.05))
  // Contour rings round the manor's hill, a metre apart, as the plan draws it.
  const { hill } = TOWN
  for (let level = 1; level < hill.height; level++) {
    let r = hill.plateau
    while (r < hill.radius && townHeight(hill.x + r, hill.z) > level) r += 0.1
    ink.line(Array.from({ length: 64 }, (_, i): Point => {
      const a = i / 64 * Math.PI * 2, wobble = 1 + 0.03 * Math.sin(a * 5 + level)
      return [hill.x + Math.cos(a) * r * wobble, level + 0.02, hill.z + Math.sin(a) * r * wobble]
    }), 'landscape', true)
  }
  ink.ring(hill.plateau, hill.height + 0.02, hill.x, hill.z, 'landscape', 64)
  for (const road of ROADS) groundLine(ink, road.path, road.width / 2, townHeight, 2)
  ground.add(ink.finish())
  ground.add(stoneBridge(bridge.x, bridge.z, bridge.length, bridge.width, -TOWN.riverDepth))
  ground.add(mapLines(ROADS, river))

  // The perimeter fence, and the checkpoint in its north gate.
  for (const [i, run] of perimeter().entries()) ground.add(fence(`Town perimeter fence ${i + 1}`, run, 2.6))
  // The cut in the fence behind the graveyard: the wire's ends bent back either side.
  const cutInk = new Draft('Town · fence cut')
  for (const side of [-1, 1]) {
    const z = TOWN.fenceCut.z + side * TOWN.fenceCut.half
    cutInk.line([[TOWN.fence.minX, 0.4, z], [TOWN.fence.minX - 0.5, 0.9, z + side * 0.4], [TOWN.fence.minX - 0.3, 1.6, z + side * 0.2], [TOWN.fence.minX - 0.7, 2.3, z + side * 0.5]], 'detail')
    cutInk.line([[TOWN.fence.minX, 1.2, z], [TOWN.fence.minX - 0.6, 1.5, z + side * 0.6]], 'detail')
  }
  ground.add(cutInk.finish())
  ground.add(footbridge(TOWN.footbridge.x, TOWN.footbridge.z, TOWN.footbridge.length, TOWN.footbridge.width, -TOWN.riverDepth))
  ground.add(checkpoint(TOWN.checkpoint.x, TOWN.checkpoint.z))

  // The quarters, west to east, north to south.
  const { graveyard: yard } = TOWN
  ground.add(walledGraveyard(yard.minX, yard.maxX, yard.minZ, yard.maxZ, yard.gap, yard.backGate))
  ground.add(church(TOWN.church.x, TOWN.church.z))
  ground.add(yardFence('Churchyard fence', -60, -26.5, -20, 0, [{ side: 's', at: -5.5, width: 3 }, { side: 's', at: 10, width: 3 }]))
  ground.add(grainSilo(TOWN.silo.x, TOWN.silo.z))
  ground.add(building({ name: 'Silo shed', x: TOWN.silo.x + 8.5, z: TOWN.silo.z + 1, width: 6, depth: 5, height: 2.8, type: 'utility', angle: -Math.PI / 2 }))
  const siloRing = Array.from({ length: 17 }, (_, i): [number, number] => {
    const a = Math.PI / 2 + 0.28 + i / 16 * (Math.PI * 2 - 0.56)
    return [TOWN.silo.x + 3 + Math.cos(a) * 12, TOWN.silo.z + Math.sin(a) * 9.5]
  })
  ground.add(fence('Silo yard fence', siloRing, 1.25))
  ground.add(waterTower(TOWN.waterTower.x, TOWN.waterTower.z, [TOWN.silo.x, TOWN.silo.z]))
  ground.add(marketSquare(TOWN.market.x, TOWN.market.z, TOWN.market.radius))
  ground.add(townHall(TOWN.townHall.x, TOWN.townHall.z))
  ground.add(yardFence('Town hall yard fence', -15, 11, 1, 22, [{ side: 'n', width: 4 }, { side: 's', width: 6 }]))
  ground.add(building({ name: 'Crew barn', x: TOWN.barn.x, z: TOWN.barn.z, width: 16, depth: 14, height: 5, type: 'warehouse' }))
  ground.add(c4Cache(TOWN.barn.x, 0.65, TOWN.barn.z + 4.4))
  ground.add(wallText('CREW BARN', [TOWN.barn.x, 5.1, TOWN.barn.z + 7.06], 0.7))
  // Hay bales, a cart and a water trough in the barn yard.
  const yardProps = new Draft('Crew barn · yard', TOWN.barn.x, TOWN.barn.z)
  for (const [bx, bz, turn] of [[-9.6, 2.6, 1.5], [-9.6, 4, 1.6], [-9.7, 3.3, 1.55]] as [number, number, number][]) {
    yardProps.solid(new THREE.CylinderGeometry(0.6, 0.6, 1.1, 20).rotateZ(Math.PI / 2), [bx, 0.6, bz], 'paper', false, [0, turn, 0], true)
    for (const u of [-0.3, 0.3]) yardProps.line(Array.from({ length: 13 }, (_, i): Point => {
      const a = i / 12 * Math.PI * 2
      return [bx + Math.cos(turn) * u, 0.6 + Math.sin(a) * 0.61, bz - Math.sin(turn) * u + Math.cos(a) * 0.61]
    }), 'mesh')
  }
  // The cart beside the barn's east wall, shafts down, and a trough on the west.
  yardProps.box(1.4, 0.12, 2.6, 9.9, 0.85, 1, 'paper', 'detail')
  for (const side of [-1, 1]) {
    yardProps.box(0.06, 0.45, 2.6, 9.9 + side * 0.7, 1.1, 1, 'paper', 'detail')
    yardProps.solid(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 20).rotateZ(Math.PI / 2), [9.9 + side * 0.78, 0.5, 1], 'paper', false, [0, 0, 0], true)
  }
  yardProps.beam([9.9, 0.85, 2.3], [9.9, 0.35, 4], 0.08, 'paper', 'detail')
  yardProps.box(0.7, 0.55, 1.8, -9.8, 0.275, -3, 'paper', 'detail')
  ground.add(yardProps.finish())
  ground.add(yardFence('Crew barn fence', 27, 49.5, -28, -8, [{ side: 's', width: 6 }, { side: 'w', at: 3, width: 3 }]))
  ground.add(storeyed({ name: 'School', x: TOWN.school.x, z: TOWN.school.z, width: 20, depth: 10, floors: 2, roof: 'gable',
    door: { x: 3 }, stairs: 'left', furnish: withFiles(classroom, 'School', area => [area.maxX - 1.1, area.minZ + 0.6]), sign: 'SCHOOL' }))
  ground.add(yardFence('School yard fence', 18, 41, -4.5, 14, [{ side: 's', width: 5 }, { side: 'w', at: 6, width: 3 }]))
  ground.add(storeyed({ name: 'Hotel', x: TOWN.hotel.x, z: TOWN.hotel.z, width: 17, depth: 12, floors: 3, roof: 'flat',
    door: { x: -3 }, stairs: 'right', roofLadder: 'back', furnish: withFiles(hotelFloor, 'Hotel', area => [area.minX + 3.6, area.maxZ - 0.6], true), sign: 'HOTEL' }))
  ground.add(storeyed({ name: 'Hill manor', x: TOWN.manor.x, z: TOWN.manor.z, base: hill.height, angle: -Math.PI / 2, width: 20, depth: 12,
    floors: 2, roof: 'gable', door: { x: 0, width: 1.8 }, stairs: 'left', balcony: { floor: 1, x: 0, width: 5, depth: 2 },
    furnish: withFiles(manorFloor, 'Hill manor', area => [area.maxX - 1.6, area.minZ + 0.6]) }))
  ground.add(fuelDepot(TOWN.fuelDepot.x, TOWN.fuelDepot.z))
  ground.add(signboard('Fuel depot', 'FUEL DEPOT · NO SMOKING', TOWN.fuelDepot.x - 6, TOWN.fuelDepot.z - 9.3, Math.PI, 0.24))
  const shed = detentionShed(TOWN.detention.x, TOWN.detention.z)
  ground.add(shed.root)
  ground.add(signboard('Town', 'WELCOME TO THE TOWN', -6.5, -42.5, Math.PI, 0.26))

  // Trees: the orchard's rows, a ring of broadleaves outside the fence, and a few in town; boulders here and there.
  const trees = new Draft('Town · trees and boulders')
  const random = penRandom(7731)
  let seed = 9000
  for (let x = 55; x <= 88; x += 5.5) for (let z = -45; z <= -14; z += 5.5) {
    const px = x + (random() - 0.5) * 1.2, pz = z + (random() - 0.5) * 1.2
    if (!insideFence(px, pz, 4) || Math.abs(pz + 9.5) < 3 || Math.hypot(px - TOWN.waterTower.x, pz - TOWN.waterTower.z) < 9) continue
    drawOak(trees, px, pz, 5 + random() * 1.2, seed++)
  }
  const ring = perimeter().flat()
  for (let i = 1; i < ring.length; i++) {
    const [ax, az] = ring[i - 1], [bx, bz] = ring[i], length = Math.hypot(bx - ax, bz - az)
    for (let u = 0; u < length; u += 7.5) {
      const t = u / length, nx = (bz - az) / length, nz = -(bx - ax) / length
      const out = 5 + random() * 8
      const x = ax + (bx - ax) * t + nx * out, z = az + (bz - az) * t + nz * out
      if (townHeight(x, z) < -0.2 || Math.abs(x - TOWN.checkpoint.x) < 8 && z < TOWN.fence.minZ) continue
      // Keep the way in clear behind the graveyard.
      if (Math.abs(z - TOWN.fenceCut.z) < 7 && x < TOWN.fence.minX) continue
      if (random() < 0.3) drawPine(trees, x, z, 7 + random() * 3, seed++)
      else drawOak(trees, x, z, 6 + random() * 2.5, seed++)
    }
  }
  for (const [x, z, h] of [[-62, -22, 6], [-24, -18, 5.5], [-58, 2, 6], [-70, 14, 5], [-48, 32, 5.5], [12, -30, 5], [-14, -34, 5.5],
    [8, 28, 5], [-36, 26, 5.5], [40, 22, 5], [70, 18, 5.5], [66, 44, 5], [44, 46, 5.5], [-10, 50, 5], [32, 54, 5]] as [number, number, number][]) {
    drawOak(trees, x, z, h, seed++, townHeight(x, z))
  }
  // Boulders only in the rough belt just inside the fence, off the roads.
  for (let i = 0; i < 60; i++) {
    const x = -95 + random() * 190, z = -65 + random() * 120
    if (!insideFence(x, z, 3) || insideFence(x, z, 13) || townHeight(x, z) < -0.1) continue
    if (ROADS.some(road => pathDistance(road.path, x, z).distance < road.width / 2 + 2)) continue
    boulder(trees, x, z, 0.35 + random() * 0.5, 7800 + i, townHeight(x, z))
  }
  ground.add(trees.finish())
  ground.updateMatrixWorld(true)

  // The mission: free the prisoner, defeat Bulky Boy in the town hall, and escape by the north road.
  const root = new THREE.Group()
  root.name = 'The town mission'
  const chair = ground.getObjectByName('Detention shed · prisoner chair')!
  const prisoner = shed.prisoner
  const at = (name: string, lift = 0.05) => {
    const object = ground.getObjectByName(name)!
    return { object, point: object.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, lift, 0)) }
  }
  const stations: Station[] = [
    { id: 'prisoner', kind: 'objective', object: chair, point: new THREE.Vector3(prisoner[0], prisoner[1] + 1, prisoner[2]), label: 'Cut the prisoner free' },
    { id: 'files-school', kind: 'objective', ...at('School · intel files'), label: 'Take the files' },
    { id: 'files-hotel', kind: 'objective', ...at('Hotel · intel files'), label: 'Take the files' },
    { id: 'files-manor', kind: 'objective', ...at('Hill manor · intel files'), label: 'Take the files' },
    { id: 'c4-pickup', kind: 'objective', ...at('C4 package', 0.1), label: 'Take the C4' },
    { id: 'c4-plant', kind: 'objective', ...at('Fuel depot · charge point', 0.35), label: 'Plant the C4' },
  ]
  const toward = (from: [number, number], to: [number, number]) => Math.atan2(to[0] - from[0], to[1] - from[1])
  const hall: [number, number] = [TOWN.townHall.x, TOWN.townHall.z]
  const manorTop = hill.height + 0.28 + 3.3
  const enemies: EnemySpec[] = [
    // The north road and the bridge.
    enemy('rifleman', 'checkpoint-patrol', [-46, 0, -63], { patrol: [[-46, 0, -63], [-28, 0, -61.5], [-12, 0, -60]] }),
    enemy('rifleman', 'checkpoint-gate', [-50.5, 0, -67.5], { facing: 0 }),
    enemy('sidearm', 'checkpoint-booth', [-44, 0, -64], { facing: Math.PI / 2 }),
    enemy('rifleman', 'bridge-guard', [-6, 0, -44], { facing: Math.PI }),
    enemy('gunner', 'bridge-patrol', [-1, 0, -43], { patrol: [[-1, 0, -43], [-1, 0, -27]] }),
    // The market and its lanes.
    enemy('rifleman', 'market-patrol', [-11.5, 0, -14.5], { patrol: [[-11.5, 0, -14.5], [-2, 0, -24.5], [7.5, 0, -14.5], [-2, 0, -5]] }),
    enemy('gunner', 'market-stall', [6, 0, -9.5], { facing: toward([6, -9.5], [-2, -14.5]) }),
    // The church, its tower, the silo and the water tower: the marksmen.
    enemy('rifleman', 'church-door', [-49, 0, 2], { facing: 0 }),
    enemy('sidearm', 'church-nave', [-52, 0.28, -10], { patrol: [[-52, 0.28, -10], [-40, 0.28, -10]] }),
    enemy('marksman', 'church-sniper', [-33.7, 12.28, -11.6], { name: 'Bell tower marksman', facing: 0.35 }),
    enemy('marksman', 'silo-sniper', [-34.8, 14.42, -35.5], { name: 'Grain silo marksman', facing: 0.6 }),
    enemy('rifleman', 'silo-guard', [-26, 0, -29.5], { patrol: [[-26, 0, -29.5], [-38, 0, -27]] }),
    enemy('marksman', 'tower-sniper', [TOWN.waterTower.x - 2.65, 12.61, TOWN.waterTower.z + 2.65], { name: 'Water tower marksman', facing: -0.7 }),
    // The barn, the orchard, the school and the hotel.
    enemy('breacher', 'barn-inside', [38, 0.65, -18], { facing: 0 }),
    enemy('rifleman', 'barn-yard', [30, 0, -10], { patrol: [[30, 0, -10], [47, 0, -10]] }),
    enemy('rifleman', 'orchard-patrol', [58, 0, -36], { patrol: [[58, 0, -36], [82, 0, -36], [82, 0, -19], [58, 0, -19]] }),
    enemy('gunner', 'school-ground', [33, 0.28, 5.7], { patrol: [[33, 0.28, 5.7], [26, 0.28, 5.7]] }),
    enemy('sidearm', 'school-upstairs', [31, 3.58, 5.7], { facing: Math.PI }),
    enemy('rifleman', 'school-yard', [29, 0, 11], { facing: 0 }),
    enemy('gunner', 'hotel-lobby', [61, 0.28, 2], { facing: 0 }),
    enemy('breacher', 'hotel-upstairs', [59, 3.58, 1], { patrol: [[59, 3.58, 1], [55, 3.58, 1]] }),
    enemy('marksman', 'hotel-sniper', [56.5, 10.18, 2.5], { name: 'Hotel roof marksman', facing: toward([56.5, 2.5], hall) }),
    // The town hall: Bulky Boy and his guard.
    enemy('bulky', 'bulky-boy', [-2, 0.45, 10], { name: 'Bulky Boy', facing: 0 }),
    enemy('gunner', 'hall-west', [-9, 0, 19], { facing: 0 }),
    enemy('rifleman', 'hall-east', [5, 0, 19], { facing: 0 }),
    // The hill manor.
    enemy('marksman', 'manor-sniper', [TOWN.manor.x - 7, manorTop, TOWN.manor.z], { name: 'Manor balcony marksman', facing: -Math.PI / 2 }),
    enemy('rifleman', 'manor-inside', [TOWN.manor.x - 3, hill.height + 0.28, TOWN.manor.z + 6], { facing: -Math.PI / 2 }),
    enemy('rifleman', 'manor-patrol', [46.5, hill.height, 27], { patrol: [[46.5, hill.height, 27], [46.5, hill.height, 39]] }),
    // The fuel depot, the detention shed and the graveyard breach.
    enemy('rifleman', 'depot-patrol', [-33, 0, 37], { patrol: [[-33, 0, 37], [-18, 0, 37]] }),
    enemy('gunner', 'depot-gate', [-25, 0, 33], { facing: Math.PI }),
    enemy('rifleman', 'shed-door', [TOWN.detention.x, 0, TOWN.detention.z + 5], { facing: Math.PI }),
    enemy('sidearm', 'shed-yard', [TOWN.detention.x - 6, 0, TOWN.detention.z - 5], { patrol: [[TOWN.detention.x - 6, 0, TOWN.detention.z - 5], [TOWN.detention.x + 6, 0, TOWN.detention.z - 5]] }),
    enemy('rifleman', 'graveyard-keeper', [-49, 0, 23.4], { name: 'Graveyard keeper', patrol: [[-49, 0, 23.4], [-69, 0, 23.4]] }),
    enemy('rifleman', 'graveyard-watch', [-40, 0, 16], { patrol: [[-40, 0, 16], [-40, 0, 29]] }),
    // Reinforcements in the barn, called out by the alarm.
    ...[[34, -16.5], [42, -16.5], [35, -21], [41, -21]].map(([x, z], i) => enemy('rifleman', `reserve-${i + 1}`, [x, 0.65, z], { reserve: true, alarmExit: [38, 0, -9] })),
  ]
  const chargeAt = ground.getObjectByName('Fuel depot · charge point')!.getWorldPosition(new THREE.Vector3())
  const charges = [{ id: 'depot-c4', name: 'C4', pickup: 'c4-pickup', plant: 'c4-plant', fuse: 10, plantTime: 3,
    blast: { center: [chargeAt.x, 0.02, chargeAt.z] as [number, number, number], radius: 16, lethal: 7 },
    destroys: ['Fuel depot · tanks'], wreck: 'Fuel depot · wreck' }]
  const snipers = ['church-sniper', 'silo-sniper', 'tower-sniper', 'hotel-sniper', 'manor-sniper']
  const goals: GoalSpec[] = [
    { id: 'prisoner', kind: 'interact', station: 'prisoner', label: 'Free the prisoner', detail: 'Detention shed, south of the town hall', done: 'He\'s free. Now Bulky Boy.' },
    { id: 'boss', kind: 'eliminate', enemies: ['bulky-boy'], label: 'Defeat Bulky Boy', detail: 'He holds the town hall', done: 'Bulky Boy is down.' },
    { id: 'files', kind: 'collect', stations: ['files-school', 'files-hotel', 'files-manor'], label: 'Collect the files',
      detail: 'Blue folders upstairs in the school, the hotel and the manor', done: 'You have all the files.' },
    { id: 'depot', kind: 'detonate', charge: 'depot-c4', label: 'Destroy the fuel depot', done: 'The fuel depot is gone.',
      steps: { find: 'Take the C4 from the crew barn', carry: 'Plant it at the fuel depot (F), then get clear', armed: 'Get clear!' } },
    { id: 'snipers', kind: 'eliminate', enemies: snipers, label: 'Take out the marksmen', detail: 'Silo, water tower, bell tower, hotel roof, manor balcony', main: false },
    { id: 'radios', kind: 'destroy', items: 'radios', label: 'Destroy the radios', detail: 'Shoot them, or switch them off (F)', main: false },
    { id: 'crates', kind: 'destroy', items: 'crates', label: 'Destroy the supply crates', detail: 'Barn, sheds and depot', main: false },
    { id: 'extract', kind: 'extract', area: { center: TOWN.extraction.center, radius: TOWN.extraction.radius }, label: 'Escape by the north road',
      detail: 'Over the stone bridge, out through the checkpoint', done: 'You\'re out.' },
  ]
  const world: MissionWorld = {
    level: 'town', root, stations, enemies, goals, spawn: TOWN.spawn, lookAt: TOWN.lookAt, bounds,
    captives: [{ id: 'prisoner', name: 'The prisoner', position: prisoner, facing: shed.facing, station: 'prisoner' }], charges,
    briefing: {
      title: 'The town', premise: 'Free the prisoner, take down Bulky Boy, get out by the north road.', won: 'Out of town.', outro: 'The prisoner is free.',
      tips: [
        'The files are in blue folders upstairs in the school, the hotel and the manor. The C4 is just inside the crew barn; plant it at the fuel depot and you have ten seconds to get clear.',
        'You come in behind the walled graveyard: through the cut in the fence, over the footbridge and in by the back gate. A keeper walks its middle path. The broken wall on its east side leads into town.',
        'Five marksmen watch the town: the grain silo, the water tower, the church bell tower, the hotel roof and the manor balcony. Each one you drop opens up the streets.',
        'The prisoner is in the detention shed south of the town hall. Bulky Boy holds the town hall itself: armour soaks body hits, so aim for his head.',
        'The river can only be crossed at the stone bridge. The checkpoint on the north road is the way out.',
      ],
      legend: ['┄ Roads', '≈ River', '◯ Extraction', '▲ You'],
    },
  }
  return { ground, world }
}
