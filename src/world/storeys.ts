import { Draft, type Point } from '../render/ink'
import { WALL_THICKNESS, groundOutline, interiorRoomOutline, piercedWall, roof, steps, windowFrame, type WallOpening } from './architecture'
import { createDoor } from './doors'
import { Furnishing } from './interiors'
import { pipeLadder } from './ladders'
import { cageLamp, darkRoom, doorwayLight, LAMP_AMBER, windowRow } from './lights'

/** Floor-to-floor height of a storey, and the stair geometry that climbs it. */
export const STOREY = 3.3
const RISER = 0.183, TREAD = 0.27, LANE = 1.2, PLINTH = 0.28

/** The part of a floor clear of the stairs, in the building's own units: furniture goes here. */
export type FloorArea = { minX: number; maxX: number; minZ: number; maxZ: number; y: number; floor: number }

export interface StoreyedSpec {
  name: string
  x: number
  z: number
  /** Turns the building; its front (door, balcony) faces local +Z. */
  angle?: number
  /** Ground height under the building (a hill). */
  base?: number
  width: number
  depth: number
  floors: number
  roof: 'gable' | 'flat'
  /** The front door, along the front wall (0 is the middle). */
  door?: { x: number; width?: number }
  /** Which end the stairs climb along: they take a 2.4 m strip of every floor at that end. */
  stairs?: 'left' | 'right'
  /** A balcony on the front at this floor (1 is the first floor up), reached through an opening in the wall. */
  balcony?: { floor: number; x: number; width: number; depth: number }
  /** A flat roof is reached by a ladder up this outside wall. */
  roofLadder?: 'back' | 'left' | 'right'
  /** Furniture for each floor, in the clear area. Use `userData.questItem`/`questCrate` furniture as usual. */
  furnish?: (g: Furnishing, area: FloorArea) => void
  /** How many caged lamps hang on each floor (default: one per 7 m of width). */
  lamps?: number
  windowSpacing?: number
}

/**
 * A walkable building of several storeys, built from the same kit as building(): plinth, walls pierced with real
 * window openings and glazing, a front door with steps, floor slabs with stairwells, switchback stairs that guards
 * and players both climb, a gable or parapeted flat roof, an optional balcony and roof ladder. Every floor is a
 * dark room of its own, lit through its windows, by its door, and by caged lamps that never light the floor above.
 *
 * Stairs: flight n climbs from floor n to n+1 in lane n % 2 of the stair strip, alternately toward the back and the
 * front, so each floor's landing is where the next flight starts. Rails stop anyone walking into the open well.
 */
export function storeyed(spec: StoreyedSpec) {
  const { width: w, depth: d, floors, roof: roofKind, base = 0 } = spec
  const g = new Draft(spec.name, spec.x, spec.z, spec.angle)
  g.position.y = base
  const levels = Array.from({ length: floors + 1 }, (_, i) => PLINTH + i * STOREY)
  const top = levels[floors]
  g.userData = { ...g.userData, footprint: [w, d], kind: 'storeyed', enterable: true, floors: levels.slice(0, floors),
    walkableInterior: { width: w - 2 * WALL_THICKNESS, depth: d - 2 * WALL_THICKNESS, floor: PLINTH } }
  g.box(w + 0.3, PLINTH, d + 0.3, 0, PLINTH / 2, 0, 'concrete', 'detail')
  groundOutline(g, 0, 0, w + 0.3, d + 0.3)

  // The stair strip, two lanes wide along one end wall, between a landing at the front and one at the back.
  const inner = { minX: -w / 2 + WALL_THICKNESS, maxX: w / 2 - WALL_THICKNESS, minZ: -d / 2 + WALL_THICKNESS, maxZ: d / 2 - WALL_THICKNESS }
  const left = (spec.stairs ?? 'left') === 'left'
  const laneX = (lane: number) => left ? inner.minX + LANE * (lane + 0.5) : inner.maxX - LANE * (lane + 0.5)
  const risers = Math.ceil(STOREY / RISER), riser = STOREY / risers, run = risers * TREAD
  const zFront = inner.maxZ - 1.3, zBack = zFront - run
  if (floors > 1 && zBack < inner.minZ + 1.2) throw new Error(`${spec.name}: ${d} m is too shallow for its stairs`)
  const stairs = new Draft(`${spec.name} · stairs`)
  const rails = new Draft(`${spec.name} · stair rails`)
  for (let flight = 0; flight < floors - 1; flight++) {
    const y = levels[flight], x = laneX(flight % 2), towardBack = flight % 2 === 0
    for (let k = 0; k < risers; k++) {
      const h = (k + 1) * riser, z = towardBack ? zFront - (k + 0.5) * TREAD : zBack + (k + 0.5) * TREAD
      stairs.box(LANE - 0.04, h, TREAD, x, y + h / 2, z, 'concrete', 'detail')
    }
    // A rail along the open side of the stairwell on the floor above, and across its far end.
    const above = levels[flight + 1]
    const edgeX = left ? inner.minX + LANE * (flight % 2 + 1) : inner.maxX - LANE * (flight % 2 + 1)
    rails.beam([edgeX, above, zBack], [edgeX, above + 1, zBack], 0.06, 'paper', 'detail')
    rails.beam([edgeX, above, zFront], [edgeX, above + 1, zFront], 0.06, 'paper', 'detail')
    rails.beam([edgeX, above + 1, zBack], [edgeX, above + 1, zFront], 0.06, 'paper', 'detail')
    rails.box(0.05, 0.9, run, edgeX, above + 0.45, (zBack + zFront) / 2, 'paper', false)
    // Across the end the flight does not arrive at, so no one steps off into the well.
    const endZ = towardBack ? zFront : zBack
    const laneEdge = left ? inner.minX + LANE * (flight % 2) : inner.maxX - LANE * (flight % 2)
    rails.box(Math.abs(edgeX - laneEdge), 0.9, 0.05, (edgeX + laneEdge) / 2, above + 0.45, endZ, 'paper', false)
    rails.beam([laneEdge, above + 1, endZ], [edgeX, above + 1, endZ], 0.06, 'paper', 'detail')
  }
  g.add(stairs.finish(), rails.finish())

  // Floor slabs above the ground floor, each with its stairwell left open; the top one is the roof deck or ceiling.
  const slabs = new Draft(`${spec.name} · floors`)
  for (let level = 1; level <= floors; level++) {
    const y = levels[level] - 0.1
    const well = level < floors ? level - 1 : -1
    if (well < 0) { slabs.box(w - 2 * WALL_THICKNESS, 0.2, d - 2 * WALL_THICKNESS, 0, y, 0, 'paper', 'detail'); continue }
    const laneEdge = left ? inner.minX + LANE * (well % 2) : inner.maxX - LANE * (well % 2)
    const holeMinX = left ? laneEdge : laneEdge - LANE, holeMaxX = holeMinX + LANE
    // Up to four boxes round the hole.
    const parts: [number, number, number, number][] = [
      [inner.minX, holeMinX, inner.minZ, inner.maxZ], [holeMaxX, inner.maxX, inner.minZ, inner.maxZ],
      [holeMinX, holeMaxX, inner.minZ, zBack], [holeMinX, holeMaxX, zFront, inner.maxZ],
    ]
    for (const [x0, x1, z0, z1] of parts) if (x1 - x0 > 0.01 && z1 - z0 > 0.01) slabs.box(x1 - x0, 0.2, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2, 'paper', false)
    slabs.line([[holeMinX, y + 0.104, zBack], [holeMaxX, y + 0.104, zBack], [holeMaxX, y + 0.104, zFront], [holeMinX, y + 0.104, zFront]], 'detail', true)
  }
  g.add(slabs.finish())

  // Walls, a storey at a time, with their windows; the door on the ground floor and the balcony opening above.
  const walls = new Draft(`${spec.name} · exterior walls`)
  walls.userData.cutaway = true
  walls.userData.kind = 'exterior-walls'
  const spacing = spec.windowSpacing ?? 3.4
  const along = (length: number, avoid: number[] = []) => {
    const count = Math.max(1, Math.floor(length / spacing))
    return Array.from({ length: count }, (_, i) => -length / 2 + length / count * (i + 0.5)).filter(c => avoid.every(a => Math.abs(c - a) > 1.6))
  }
  const doorX = spec.door?.x ?? 0, doorWidth = spec.door?.width ?? 1.5
  const windowsOf: { level: number; wall: 'front' | 'back' | 'west' | 'east'; panes: WallOpening[] }[] = []
  for (let level = 0; level < floors; level++) {
    const y = levels[level]
    const pane = (centre: number): WallOpening => ({ centre, width: 1.3, bottom: 0.95, height: 1.4 })
    const frontAvoid = [...(level === 0 && spec.door ? [doorX] : []), ...(spec.balcony?.floor === level ? [spec.balcony.x] : [])]
    const front = along(w, frontAvoid).map(pane), back = along(w).map(pane)
    const sideCount = d > 9 ? [-d / 4, d / 4] : [0]
    const ends = sideCount.map(pane)
    const frontOpenings = [...front]
    if (level === 0 && spec.door) frontOpenings.push({ centre: doorX, width: doorWidth, bottom: 0, height: 2.45 })
    if (spec.balcony?.floor === level) frontOpenings.push({ centre: spec.balcony.x, width: 1.4, bottom: 0, height: 2.4 })
    // The wall runs the storey's full height; the slab sits inside it.
    const h = level === floors - 1 && roofKind === 'flat' ? STOREY + 1 : STOREY
    piercedWall(walls, w, h, y, d / 2 - WALL_THICKNESS / 2, frontOpenings, false, level === floors - 1)
    piercedWall(walls, w, h, y, -d / 2 + WALL_THICKNESS / 2, back, false, level === floors - 1)
    for (const side of [-1, 1]) piercedWall(walls, d - 2 * WALL_THICKNESS, h, y, side * (w / 2 - WALL_THICKNESS / 2), ends, true, level === floors - 1)
    for (const o of front) windowFrame(walls, o.centre, y + o.bottom, d / 2 + 0.025, o.width, o.height)
    for (const o of back) windowFrame(walls, o.centre, y + o.bottom, -d / 2 - 0.025, o.width, o.height)
    for (const side of [-1, 1]) for (const o of ends) windowFrame(walls, side * (w / 2 + 0.025), y + o.bottom, o.centre, o.width, o.height, true)
    // A ledge between storeys.
    if (level > 0) walls.box(w + 0.12, 0.12, d + 0.12, 0, y - 0.04, 0, 'paper', 'detail')
    windowsOf.push({ level, wall: 'front', panes: front }, { level, wall: 'back', panes: back }, { level, wall: 'west', panes: ends }, { level, wall: 'east', panes: ends })
    interiorRoomOutline(walls, w - 2 * WALL_THICKNESS, d - 2 * WALL_THICKNESS, y, levels[level + 1] - 0.2)
  }
  g.add(walls.finish())

  const rise = Math.min(2.6, d * 0.2)
  const cover = new Draft(`${spec.name} · roof`)
  cover.userData.cutaway = true
  cover.userData.kind = 'roof'
  if (roofKind === 'gable') roof(cover, w, d, top, rise)
  else {
    // A flat roof you can walk on (the top slab), inside a parapet: the top storey's walls run a metre higher.
    cover.hatch([-w / 2 + 0.6, top + 0.01, -d / 2 + 0.6], [Math.min(4, w * 0.3), 0, 0], [0, 0, Math.min(3, d * 0.3)], { spacing: 0.3 })
  }
  g.add(cover.finish())

  // The front door and its steps.
  const doors: ReturnType<typeof createDoor>[] = []
  if (spec.door) {
    const door = createDoor({ name: `${spec.name} · front door`, x: doorX, z: d / 2 + 0.02, floor: PLINTH, width: doorWidth, height: 2.45, exit: true })
    doors.push(door)
    g.add(door)
    steps(g, doorX, d / 2 + 0.29, doorWidth + 0.6, PLINTH, 2)
  }

  // The balcony: a slab out from the front wall, railed on three sides.
  if (spec.balcony) {
    const { floor, x, width: bw, depth: bd } = spec.balcony
    const y = levels[floor], deck = new Draft(`${spec.name} · balcony`)
    deck.box(bw, 0.2, bd, x, y - 0.1, d / 2 + bd / 2, 'paper', 'detail')
    for (const [a, b] of [[[x - bw / 2, d / 2], [x - bw / 2, d / 2 + bd]], [[x - bw / 2, d / 2 + bd], [x + bw / 2, d / 2 + bd]], [[x + bw / 2, d / 2 + bd], [x + bw / 2, d / 2]]] as [[number, number], [number, number]][]) {
      deck.beam([a[0], y + 1, a[1]], [b[0], y + 1, b[1]], 0.07, 'paper', 'detail')
      deck.box(Math.abs(b[0] - a[0]) + 0.05, 0.95, Math.abs(b[1] - a[1]) + 0.05, (a[0] + b[0]) / 2, y + 0.48, (a[1] + b[1]) / 2, 'paper', false)
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.35)
      for (let i = 0; i <= n; i++) {
        const t = i / n
        deck.line([[a[0] + (b[0] - a[0]) * t, y, a[1] + (b[1] - a[1]) * t], [a[0] + (b[0] - a[0]) * t, y + 1, a[1] + (b[1] - a[1]) * t]], 'detail')
      }
    }
    for (const sx of [-1, 1]) deck.beam([x + sx * (bw / 2 - 0.2), y - 0.2, d / 2], [x + sx * (bw / 2 - 0.2), y - 0.9, d / 2 + 0.05], 0.12, 'paper', 'detail')
    g.add(deck.finish())
  }

  // A ladder up an outside wall to a flat roof; it steps off toward the building (pipeLadder's local -Z).
  if (spec.roofLadder && roofKind === 'flat') {
    const side = spec.roofLadder
    const [lx, lz, angle] = side === 'back' ? [left ? w / 4 : -w / 4, -d / 2 - 0.42, Math.PI] : side === 'left' ? [-w / 2 - 0.42, 0, -Math.PI / 2] : [w / 2 + 0.42, 0, Math.PI / 2]
    g.add(pipeLadder({ name: `${spec.name} · roof ladder`, x: lx, z: lz, bottom: 0.03, landingHeight: top + 1, angle, landingDepth: 1.1 }).finish())
  }

  // Each floor is dark: its own windows, the door, and lamps under its ceiling.
  for (let level = 0; level < floors; level++) {
    // Every floor has a flat ceiling (under a gable roof, the loft above is closed off).
    const y = levels[level], ceiling = levels[level + 1] - 0.1
    const bottom = level === 0 ? y - 0.3 : y - 0.1
    const middle = (bottom + ceiling) / 2
    g.add(darkRoom(`${spec.name} · floor ${level}`, [0, middle, 0], [w / 2 + 0.02, (ceiling - bottom) / 2, d / 2 + 0.02], { ambient: 0.035 }))
    for (const row of windowsOf.filter(entry => entry.level === level)) {
      const panes = row.panes
      if (!panes.length) continue
      const at = (o: WallOpening): Point => row.wall === 'front' ? [0, y + o.bottom + o.height / 2, d / 2 - WALL_THICKNESS / 2]
        : row.wall === 'back' ? [0, y + o.bottom + o.height / 2, -d / 2 + WALL_THICKNESS / 2]
        : [(row.wall === 'west' ? -1 : 1) * (w / 2 - WALL_THICKNESS / 2), y + o.bottom + o.height / 2, 0]
      const angle = row.wall === 'front' ? Math.PI : row.wall === 'back' ? 0 : row.wall === 'west' ? Math.PI / 2 : -Math.PI / 2
      const offset = (o: WallOpening) => row.wall === 'front' || row.wall === 'west' ? -o.centre : o.centre
      for (let i = 0; i < panes.length; i += 4) {
        const chunk = panes.slice(i, i + 4)
        g.add(windowRow(`${spec.name} · floor ${level} ${row.wall} windows ${i / 4 + 1}`, at(chunk[0]), angle, chunk.map(offset), chunk[0].width, chunk[0].height))
      }
    }
    const clearMin = left ? inner.minX + 2 * LANE + 0.3 : inner.minX + 0.3, clearMax = left ? inner.maxX - 0.3 : inner.maxX - 2 * LANE - 0.3
    const count = spec.lamps ?? Math.max(1, Math.round((clearMax - clearMin) / 7))
    const lampCeiling = levels[level + 1] - 0.2
    for (let i = 0; i < count; i++) {
      const x = clearMin + (clearMax - clearMin) * (i + 0.5) / count
      g.add(cageLamp(`${spec.name} · floor ${level} lamp ${i + 1}`, [x, lampCeiling, 0], LAMP_AMBER, Math.max(0.45, lampCeiling - (y + 2.6)),
        { intensity: 3.4, range: 8, bounce: 0.12 }))
    }
    if (spec.furnish) {
      const furniture = new Furnishing(`${spec.name} · floor ${level} furniture`)
      spec.furnish(furniture, { minX: clearMin, maxX: clearMax, minZ: inner.minZ + 0.3, maxZ: inner.maxZ - 0.3, y, floor: level })
      g.add(furniture.finish())
    }
  }
  for (const door of doors) doorwayLight(door, -1, { bounce: 0.12 })
  return g.finish()
}
