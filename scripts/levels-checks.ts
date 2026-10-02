import assert from 'node:assert/strict'
import * as THREE from 'three'
import { LEVEL_CATALOG, buildLevel, levelInfo } from '../src/levels'
import { CollisionWorld } from '../src/player/collision'
import { PlayerBody } from '../src/player/body'
import { EnemyNavigation } from '../src/game/navigation'
import { goalHint, goalObjectives, goalsComplete, updateGoals, type GoalSense } from '../src/game/goals'
import { initialMission } from '../src/game/mission'
import { readProjection } from '../src/game/field-map'
import type { Vec3 } from '../src/game/types'

/*
 * Every level in levels/catalog.ts, built and walked in Node: the checks a new level has to pass before anyone
 * plays it. Spawn on solid ground, everything inside the bounds, every guard on floor a guard can stand on, every
 * station reachable by hand, every goal pointing at something real, each goal area reachable from the insertion,
 * and every enterable building dark inside. A failure names the level and the thing that is wrong.
 */
const v = (p: Vec3 | readonly number[]) => new THREE.Vector3(p[0], p[1], p[2])

/** Every ground cell reachable on foot from `start`; returns a test for whether a point is among them. */
function floodFill(navigation: EnemyNavigation, start: THREE.Vector3, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  const cell = 1, key = (x: number, z: number) => `${x},${z}`
  const seen = new Map<string, THREE.Vector3>([[key(Math.round(start.x), Math.round(start.z)), start]])
  const queue: [number, number][] = [[Math.round(start.x), Math.round(start.z)]]
  while (queue.length) {
    const [x, z] = queue.pop()!
    const from = seen.get(key(x, z))!
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx * cell, nz = z + dz * cell
      if (seen.has(key(nx, nz)) || nx < bounds.minX || nx > bounds.maxX || nz < bounds.minZ || nz > bounds.maxZ) continue
      const to = navigation.floor(new THREE.Vector3(nx, from.y, nz))
      if (!to || !navigation.segment(from, to)) continue
      seen.set(key(nx, nz), to)
      queue.push([nx, nz])
    }
  }
  return (point: THREE.Vector3) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => seen.has(key(Math.round(point.x) + dx, Math.round(point.z) + dz)))
}

for (const info of LEVEL_CATALOG) {
  const { ground, world } = buildLevel(info.id)
  assert(world, `${info.id}: builds a mission`)
  const label = (what: string) => `${info.id}: ${what}`
  assert.equal(world.level, info.id, label('the mission names its own level'))
  assert.equal(levelInfo(world.level)?.kind, info.kind)
  const scene = new THREE.Scene()
  scene.add(ground, world.root)
  scene.updateMatrixWorld(true)
  const collision = new CollisionWorld(scene)
  const doors: THREE.Group[] = []
  scene.traverse(object => { if (object.userData.kind === 'door') doors.push(object as THREE.Group) })
  const navigation = new EnemyNavigation(collision, doors, () => {})
  const { minX, maxX, minZ, maxZ } = world.bounds
  const within = (p: THREE.Vector3) => p.x > minX && p.x < maxX && p.z > minZ && p.z < maxZ

  // The insertion: inside the bounds, on solid ground, with room to stand, and the player stays put there.
  const spawn = v(world.spawn)
  assert(within(spawn), label('the insertion is inside the bounds'))
  const body = new PlayerBody(collision)
  body.teleport(spawn)
  for (let i = 0; i < 90; i++) body.update(1 / 60, new THREE.Vector3(), false)
  assert(body.grounded && body.position.distanceTo(spawn) < 0.5, label(`the player lands and stands at the insertion (moved ${body.position.distanceTo(spawn).toFixed(2)} m)`))

  // Guards: unique ids, inside the bounds, on floor they can stand on, and so is every patrol point.
  const ids = new Set<string>()
  for (const spec of world.enemies) {
    assert(!ids.has(spec.id), label(`enemy id ${spec.id} is unique`)); ids.add(spec.id)
    for (const [i, point] of [spec.position, ...spec.patrol].entries()) {
      const p = v(point)
      assert(within(p), label(`${spec.id} ${i ? `patrol point ${i}` : 'post'} is inside the bounds`))
      assert(navigation.floor(p, false), label(`${spec.id} ${i ? `patrol point ${i}` : 'post'} at ${p.toArray().map(n => n.toFixed(1))} is floor a guard fits on`))
    }
  }

  // Stations: inside the bounds, and somewhere within arm's reach a player can stand and see them from.
  const reachable = (point: THREE.Vector3, ignore: THREE.Object3D) => {
    for (const radius of [0.7, 1.1, 1.5, 1.9]) for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2
      const stand = navigation.floor(new THREE.Vector3(point.x + Math.cos(angle) * radius, point.y - 1, point.z + Math.sin(angle) * radius), false)
        ?? navigation.floor(new THREE.Vector3(point.x + Math.cos(angle) * radius, Math.max(0, point.y - 1.6), point.z + Math.sin(angle) * radius), false)
      if (!stand) continue
      const eye = stand.clone().add(new THREE.Vector3(0, 1.65, 0))
      if (eye.distanceTo(point) <= 2.6 && collision.visible(eye, point, ignore)) return true
    }
    return false
  }
  for (const station of world.stations) {
    assert(within(station.point), label(`station ${station.id} is inside the bounds`))
    assert(reachable(station.point, station.object), label(`station ${station.id} (${station.kind}) can be reached and seen from where a player stands`))
  }

  // Captives sit at a chair and are freed at an 'objective' station that exists.
  for (const captive of world.captives ?? []) {
    assert(world.stations.some(station => station.id === captive.station && station.kind === 'objective'), label(`captive ${captive.id} is freed at an 'objective' station`))
    assert(within(v(captive.position)), label(`captive ${captive.id} is inside the bounds`))
  }

  // Charges: picked up and planted at 'objective' stations that exist, going off inside the play area.
  for (const charge of world.charges ?? []) {
    for (const id of [charge.pickup, charge.plant]) assert(world.stations.some(station => station.id === id && station.kind === 'objective'), label(`charge ${charge.id} uses an 'objective' station ${id}`))
    assert(within(v(charge.blast.center)) && charge.blast.lethal < charge.blast.radius, label(`charge ${charge.id} goes off inside the play area`))
    for (const name of charge.destroys) assert(scene.getObjectByName(name), label(`charge ${charge.id} destroys ${name}, which exists`))
    if (charge.wreck) assert(scene.getObjectByName(charge.wreck), label(`charge ${charge.id}'s wreck exists`))
  }

  // Goals: real targets, sensible order, and reachable areas.
  const goals = world.goals ?? []
  const goalIds = new Set(goals.map(goal => goal.id))
  assert.equal(goalIds.size, goals.length, label('goal ids are unique'))
  let crates = 0, radios = 0
  scene.traverse(object => { if (object.userData.questCrate) crates++; if (object.userData.questItem === 'radio') radios++ })
  for (const goal of goals) {
    for (const id of goal.after ?? []) assert(goalIds.has(id), label(`goal ${goal.id} comes after a goal that exists (${id})`))
    if (goal.kind === 'collect') for (const id of goal.stations) assert(world.stations.some(station => station.id === id && station.kind === 'objective'), label(`goal ${goal.id} collects at an 'objective' station ${id}`))
    if (goal.kind === 'detonate') assert(world.charges?.some(charge => charge.id === goal.charge), label(`goal ${goal.id} sets off a charge that exists (${goal.charge})`))
    if (goal.kind === 'interact') assert(world.stations.some(station => station.id === goal.station && station.kind === 'objective'), label(`goal ${goal.id} uses an 'objective' station ${goal.station}`))
    if (goal.kind === 'eliminate' && goal.enemies !== 'all') for (const id of goal.enemies) assert(ids.has(id), label(`goal ${goal.id} targets an enemy that exists (${id})`))
    if (goal.kind === 'destroy') assert((goal.items === 'crates' ? crates : radios) > 0, label(`goal ${goal.id} has ${goal.items} to destroy`))
    if (goal.kind === 'reach' || goal.kind === 'extract') {
      const center = v(goal.area.center)
      assert(within(center), label(`goal ${goal.id}'s area is inside the bounds`))
      assert(navigation.floor(center, false), label(`goal ${goal.id}'s area is on open ground`))
    }
  }
  if (goals.length) {
    assert(goals.some(goal => goal.main !== false), label('there is at least one main goal'))
    // Walkable from the insertion to every goal area: a flood fill over the ground, a metre a cell, stepping only
    // where a body fits all the way (closed doors open). Unlike the guards' planner it has no distance limit.
    const walkable = floodFill(navigation, navigation.floor(spawn, false)!, world.bounds)
    const targets = goals.flatMap(goal => goal.kind === 'reach' || goal.kind === 'extract' ? [{ id: goal.id, point: v(goal.area.center) }] : [])
    for (const { id, point } of targets) assert(walkable(point), label(`goal ${id} can be walked to from the insertion`))
    // The goals play out: a run that does everything wins, and one that skips a main goal does not.
    const state = initialMission([])
    const enemies = world.enemies.map(spec => ({ spec, state: 'dead' as const }))
    const sense = (players: THREE.Vector3[]): GoalSense => ({ players, enemies, totals: { crates, radios }, radiosOut: radios })
    state.brokenCrates = Array.from({ length: crates }, (_, i) => `crate-${i}`)
    state.usedStations = world.stations.map(station => station.id)
    state.chargesExploded = (world.charges ?? []).map(charge => charge.id)
    updateGoals(state, goals, sense(targets.map(target => target.point)))
    assert(goalsComplete(state, goals), label(`doing everything wins the mission (done: ${state.goalsDone.join(', ')})`))
    assert(goalObjectives(state, goals, sense([])).length === goals.length && goalHint(state, goals), label('the goals list in the objectives panel'))
  }

  // Briefing: campaign and developer missions have one, with a field map the HUD can place the player on.
  if (info.kind !== 'training') {
    assert(world.briefing, label('has a briefing'))
    assert(world.briefing.map && /id="field-player"/.test(world.briefing.map), label('the briefing has a field map with the player marker'))
    const projection = world.briefing.map.match(/data-scale="([\d.]+)"/)
    assert(projection && Number(projection[1]) > 0, label('the field map says where the world is on it'))
  }

  // Lighting: every building you can walk into is dark inside (lit by its own lamps, windows and doors).
  const rooms: THREE.Object3D[] = []
  scene.traverse(object => { if (object.userData.darkRoom) rooms.push(object) })
  const dark = (point: THREE.Vector3) => rooms.some(room => {
    const local = room.worldToLocal(point.clone()), half = room.userData.darkRoom.half as number[]
    return Math.abs(local.x) <= half[0] && Math.abs(local.y) <= half[1] && Math.abs(local.z) <= half[2]
  })
  scene.traverse(object => {
    if (!object.userData.enterable) return
    const inside = object.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.4, 0))
    assert(dark(inside), label(`${object.name} is dark inside`))
  })
  collision.dispose()
  console.log(`PASS ${info.name} (${info.id}): insertion, ${world.enemies.length} enemies, ${world.stations.length} stations, ${goals.length} goals, lighting`)
}

// The field map's projection is read back exactly as written.
{
  const { ground, world } = buildLevel('proving-ground')
  const holder = { dataset: {} as Record<string, string> }
  for (const [, key, value] of world!.briefing!.map!.matchAll(/data-(origin-x|origin-z|scale|pad)="([^"]+)"/g)) holder.dataset[key.replace(/-(\w)/, (_, c: string) => c.toUpperCase())] = value
  const projection = readProjection(holder as unknown as Element)!
  const [x, , z] = world!.spawn
  const mx = (x + projection.originX) * projection.scale + projection.pad, mz = (z + projection.originZ) * projection.scale + projection.pad
  assert(mx > 0 && mx < 460 && mz > 0 && mz < 260, `The insertion lands on the map: ${mx.toFixed(0)}, ${mz.toFixed(0)}`)
  ground.clear()
}
console.log('PASS Field maps place the player where they are')
