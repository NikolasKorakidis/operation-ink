import * as THREE from 'three'
import { Draft, wallText, type Point } from '../../render/ink'
import { penRandom } from '../../render/ballpoint'
import { WALL_THICKNESS, building, groundOutline, piercedWall, roof, steps, windowFrame, type WallOpening } from '../../world/architecture'
import { createDoor } from '../../world/doors'
import { Furnishing } from '../../world/interiors'
import { fence, lamp } from '../../world/industrial'
import { pipeLadder } from '../../world/ladders'
import { cageLamp, darkRoom, doorwayLight, LAMP_AMBER, windowRow } from '../../world/lights'
import type { PlanPath } from '../../world/terrain'

const WT = WALL_THICKNESS

/** A standing signboard: two posts, a board and hand-lettered text facing local +Z. */
export function signboard(name: string, text: string, x: number, z: number, angle = 0, size = 0.36, base = 0) {
  const sign = new Draft(`${name} sign`, x, z, angle)
  sign.position.y = base
  for (const sx of [-1.1, 1.1]) sign.beam([sx, 0, 0], [sx, 2.1, 0], 0.09, 'paper', 'detail')
  sign.box(2.6, 0.7, 0.06, 0, 1.75, 0, 'paper', 'detail')
  sign.add(wallText(text, [0, 1.75, 0.04], size))
  return sign.finish()
}

/**
 * A fence round a yard: the rectangle's sides with gates left open. Each gate is on a side ('n', 's', 'e', 'w'),
 * centred `at` metres along it from its middle, `width` wide. Low enough to see over, too high to jump.
 */
export function yardFence(name: string, minX: number, maxX: number, minZ: number, maxZ: number,
  gates: { side: 'n' | 's' | 'e' | 'w'; at?: number; width: number }[], height = 1.25) {
  const g = new THREE.Group()
  g.name = name
  const sides: { side: 'n' | 's' | 'e' | 'w'; a: [number, number]; b: [number, number] }[] = [
    { side: 'n', a: [minX, minZ], b: [maxX, minZ] }, { side: 'e', a: [maxX, minZ], b: [maxX, maxZ] },
    { side: 's', a: [maxX, maxZ], b: [minX, maxZ] }, { side: 'w', a: [minX, maxZ], b: [minX, minZ] },
  ]
  for (const { side, a, b } of sides) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    const cuts = gates.filter(gate => gate.side === side).map(gate => {
      // Distance along the side (from a) of the gate's middle.
      const middle = length / 2 + (side === 's' || side === 'w' ? -(gate.at ?? 0) : gate.at ?? 0)
      return [middle - gate.width / 2, middle + gate.width / 2]
    }).sort((p, q) => p[0] - q[0])
    let start = 0
    const point = (u: number): [number, number] => [a[0] + (b[0] - a[0]) * u / length, a[1] + (b[1] - a[1]) * u / length]
    for (const [from, to] of [...cuts, [length, length]]) {
      if (from - start > 0.4) g.add(fence(`${name} · ${side} ${start.toFixed(0)}`, [point(start), point(from)], height))
      start = to
    }
  }
  return g
}

/** A boulder, lying on the ground at `base`. */
export function boulder(g: Draft, x: number, z: number, size: number, seed: number, base = 0) {
  const random = penRandom(seed)
  const rock = new THREE.DodecahedronGeometry(size, 0)
  rock.scale(1, 0.62 + random() * 0.2, 0.8 + random() * 0.3)
  g.solid(rock, [x, base + size * 0.4, z], 'rock', 'detail', [random() * 0.6, random() * Math.PI, random() * 0.4])
}

/**
 * The church: a long nave with tall windows, its door in the south wall, pews and an altar, and a bell tower at
 * the east end. The tower is dark inside up to the belfry, 12 m up, where a marksman watches the town through
 * open arches; a ladder inside climbs to it. Built round the nave's middle; the nave runs along X.
 */
export function church(x: number, z: number) {
  const L = 22, W = 10, H = 6.5, floor = 0.28, T = 5.5, belfry = 12, towerH = 16
  const g = new Draft('Church and bell tower', x, z)
  g.userData = { ...g.userData, footprint: [L + T, W], kind: 'church', enterable: true }
  g.box(L + 0.3, floor, W + 0.3, 0, floor / 2, 0, 'concrete', 'detail')
  groundOutline(g, 0, 0, L + 0.3, W + 0.3)
  const walls = new Draft('Church · walls')
  walls.userData.cutaway = true
  const tall = (centre: number): WallOpening => ({ centre, width: 1.2, bottom: 1.6, height: 3.4 })
  const south = [-8, 2, 7].map(tall), north = [-8, -3, 2, 7].map(tall)
  const door: WallOpening = { centre: -3, width: 1.9, bottom: 0, height: 2.9 }
  piercedWall(walls, L, H, floor, W / 2 - WT / 2, [...south, door])
  piercedWall(walls, L, H, floor, -W / 2 + WT / 2, north)
  const rose: WallOpening = { centre: 0, width: 1.6, bottom: 2.6, height: 1.8 }
  piercedWall(walls, W - 2 * WT, H, floor, -L / 2 + WT / 2, [rose], true)
  const passage: WallOpening = { centre: 0, width: 1.4, bottom: 0, height: 2.5 }
  piercedWall(walls, W - 2 * WT, H, floor, L / 2 - WT / 2, [passage], true)
  for (const o of south) windowFrame(walls, o.centre, floor + o.bottom, W / 2 + 0.025, o.width, o.height)
  for (const o of north) windowFrame(walls, o.centre, floor + o.bottom, -W / 2 - 0.025, o.width, o.height)
  windowFrame(walls, -L / 2 - 0.025, floor + rose.bottom, 0, rose.width, rose.height, true)
  g.add(walls.finish())
  const cover = new Draft('Church · roof')
  cover.userData.cutaway = true
  const rise = 3.5
  roof(cover, L, W, floor + H, rise, 0, 0, false)
  g.add(cover.finish())
  const entry = createDoor({ name: 'Church door', x: door.centre, z: W / 2 + 0.02, floor, width: door.width, height: door.height, exit: true })
  g.add(entry)
  steps(g, door.centre, W / 2 + 0.29, 2.6, floor, 2)

  // The tower: four walls 16 m tall against the nave's east end, open arches in the belfry, a pyramid spire.
  const tx = L / 2 + T / 2
  const arch = (centre: number): WallOpening => ({ centre, width: 2.2, bottom: belfry + 0.35, height: 2.5 })
  // North and south walls (along X), and the east and west walls (along Z), placed round the tower's middle.
  const towerWalls = new Draft('Church · tower walls')
  towerWalls.userData.cutaway = true
  for (const side of [-1, 1]) {
    const walls2 = new Draft(`Church · tower ${side < 0 ? 'north' : 'south'} wall`, tx, side * (T / 2 - WT / 2))
    piercedWall(walls2, T, towerH, floor, 0, [arch(0)])
    towerWalls.add(walls2.finish())
  }
  const east = new Draft('Church · tower east wall', L / 2 + T - WT / 2, 0)
  piercedWall(east, T - 2 * WT, towerH, floor, 0, [arch(0)], true)
  const west = new Draft('Church · tower west wall', L / 2 + WT / 2, 0)
  piercedWall(west, T - 2 * WT, towerH, floor, 0, [passage, arch(0)], true)
  towerWalls.add(east.finish(), west.finish())
  g.add(towerWalls)
  // The belfry floor, open where the ladder comes up by the east wall.
  const deck = new Draft('Church · belfry floor')
  const inX0 = L / 2 + WT, inX1 = L / 2 + T - WT, inZ = T / 2 - WT, holeX = inX1 - 1.05
  const by = floor + belfry - 0.1
  deck.box(holeX - inX0, 0.2, 2 * inZ, (inX0 + holeX) / 2, by, 0, 'paper', 'detail')
  for (const side of [-1, 1]) deck.box(inX1 - holeX, 0.2, inZ - 0.65, (holeX + inX1) / 2, by, side * (inZ + 0.65) / 2, 'paper', 'detail')
  // The bell, hung from a beam across the belfry, clear of the arches.
  deck.beam([inX0, floor + belfry + 2.9, 0], [inX1, floor + belfry + 2.9, 0], 0.18)
  deck.cylinder(0.55, 0.9, tx - 0.4, floor + belfry + 2.2, 0, 'paper', 0.25)
  deck.ring(0.62, floor + belfry + 1.72, tx - 0.4, 0, 'detail')
  // Spire: a pyramid on a cornice, with a cross.
  const top = floor + towerH, apex = top + 6.5
  deck.box(T + 0.4, 0.3, T + 0.4, tx, top + 0.15, 0, 'paper', 'detail')
  const c = T / 2 + 0.1
  for (const [a, b] of [[[-c, -c], [c, -c]], [[c, -c], [c, c]], [[c, c], [-c, c]], [[-c, c], [-c, -c]]] as [[number, number], [number, number]][]) {
    deck.face([[tx + a[0], top + 0.3, a[1]], [tx + b[0], top + 0.3, b[1]], [tx, apex, 0]], 'roof', 'edge')
  }
  deck.beam([tx, apex - 0.1, 0], [tx, apex + 1.6, 0], 0.12)
  deck.beam([tx, apex + 1.05, -0.45], [tx, apex + 1.05, 0.45], 0.1)
  g.add(deck.finish())
  g.add(pipeLadder({ name: 'Church · bell tower ladder', x: inX1 - 0.42, z: 0, bottom: floor + 0.03, landingHeight: floor + belfry, angle: Math.PI / 2, landingDepth: 0.9 }).finish())

  // Pews either side of the aisle, and the altar at the east end.
  const pews = new Draft('Church · pews and altar')
  for (let px = -8.5; px <= 4.5; px += 2.2) for (const side of [-1, 1]) {
    const pz = side * 2.35
    pews.box(0.45, 0.08, 3, px, floor + 0.46, pz, 'paper', 'detail')
    pews.box(0.07, 0.55, 3, px - 0.22, floor + 0.78, pz, 'paper', 'detail')
    for (const end of [-1, 1]) pews.box(0.5, 0.95, 0.07, px - 0.02, floor + 0.475, pz + end * 1.5, 'paper', 'detail')
  }
  pews.box(3, 0.3, W - 2 * WT, L / 2 - 1.8, floor + 0.15, 0, 'paper', 'detail')
  pews.box(1.6, 1, 0.8, L / 2 - 2, floor + 0.8, 0, 'paper', 'detail')
  pews.beam([L / 2 - 2, floor + 1.3, 0], [L / 2 - 2, floor + 2.1, 0], 0.07)
  pews.beam([L / 2 - 2, floor + 1.85, -0.25], [L / 2 - 2, floor + 1.85, 0.25], 0.06)
  g.add(pews.finish())

  // Light: dark inside, the tall windows, the door, lamps down the nave; the tower is dark up to the belfry.
  const eave = floor + H, roofTop = eave + rise + 0.14, edge = eave - rise * 0.4 / (W / 2) + 0.14, middle = floor + H / 2
  g.add(darkRoom('Church nave', [0, middle, 0], [L / 2 + 0.02, middle - floor + 0.3, W / 2 + 0.02],
    { ambient: 0.035, pitch: { ridge: roofTop - 0.07 - middle, slope: (roofTop - edge) / (W / 2 + 0.4) } }))
  g.add(darkRoom('Church tower', [tx, (floor - 0.3 + floor + belfry - 0.1) / 2, 0], [T / 2 + 0.02, (belfry + 0.2) / 2, T / 2 + 0.02], { ambient: 0.03 }))
  g.add(windowRow('Church · south windows', [0, floor + 3.3, W / 2 - WT / 2], Math.PI, south.map(o => -o.centre), 1.2, 3.4),
    windowRow('Church · north windows', [0, floor + 3.3, -W / 2 + WT / 2], 0, north.map(o => o.centre), 1.2, 3.4),
    windowRow('Church · rose window', [-L / 2 + WT / 2, floor + 3.5, 0], Math.PI / 2, [0], 1.6, 1.8))
  for (const lx of [-7, 0, 7]) g.add(cageLamp(`Church · nave lamp ${lx}`, [lx, eave + rise - 0.4, 0], LAMP_AMBER, eave + rise - 0.4 - (floor + 3.2),
    { intensity: 3.6, range: 9, above: roofTop - (floor + 3.2) + 0.1 }))
  g.add(cageLamp('Church · tower lamp', [tx - 0.6, floor + belfry - 0.3, -1.4], LAMP_AMBER, 2.6, { intensity: 2.6, range: 6 }))
  doorwayLight(entry, -1, { bounce: 0.12 })
  return g.finish()
}

/** The grain silo: a tall drum with a railed flat top where a marksman lies up, reached by a ladder on its south side. */
export function grainSilo(x: number, z: number) {
  const r = 4, h = 14, base = 0.3
  const g = new Draft('Grain silo', x, z)
  g.userData = { ...g.userData, footprint: [2 * r, 2 * r], kind: 'silo' }
  g.box(2 * r + 1.2, base, 2 * r + 1.2, 0, base / 2, 0, 'concrete', 'detail')
  g.cylinder(r, h, 0, base + h / 2, 0)
  const top = base + h + 0.12
  g.cylinder(r + 0.15, 0.12, 0, base + h + 0.06, 0, 'paper')
  for (const y of [base + 3, base + 7, base + 11]) g.ring(r + 0.01, y, 0, 0, 'detail')
  for (const sector of [0.6, 2.4, 3.9, 5.3]) for (let mark = 0; mark < 8; mark++) {
    const angle = sector + mark * 0.05
    g.line(Array.from({ length: 4 }, (_, i): Point => [Math.cos(angle + i * 0.03) * (r + 0.02), base + 1 + mark * 0.15 + i * 0.3, Math.sin(angle + i * 0.03) * (r + 0.02)]), 'mesh')
  }
  // Railing round the top, open over the ladder (south, +Z).
  const rail = r - 0.15, gap = 0.22
  for (let i = 0; i < 24; i++) {
    const a0 = i / 24 * Math.PI * 2, a1 = (i + 1) / 24 * Math.PI * 2
    const mid = (a0 + a1) / 2
    if (Math.abs(Math.atan2(Math.sin(mid - Math.PI / 2), Math.cos(mid - Math.PI / 2))) < gap) continue
    const p0: Point = [Math.cos(a0) * rail, top, Math.sin(a0) * rail], p1: Point = [Math.cos(a1) * rail, top, Math.sin(a1) * rail]
    g.beam([p0[0], top + 1, p0[2]], [p1[0], top + 1, p1[2]], 0.06, 'paper', 'detail')
    g.box(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]), 0.9, 0.04, (p0[0] + p1[0]) / 2, top + 0.45, (p0[2] + p1[2]) / 2, 'paper', false, [0, -mid - Math.PI / 2, 0])
    g.beam(p0, [p0[0], top + 1, p0[2]], 0.06, 'paper', 'detail')
  }
  // Vent and auger housing on the top.
  g.box(1.2, 0.8, 1.2, -1, top + 0.4, -1, 'paper', 'detail')
  g.add(pipeLadder({ name: 'Grain silo · ladder', x: 0, z: r + 0.42, bottom: base + 0.03, landingHeight: top, angle: 0, landingDepth: 1 }).finish())
  return g.finish()
}

/**
 * The town hall: one tall hall on a plinth, the boss's arena. Pillars to fight round, a stage at the back, a double
 * door with steps at the front (south), tall windows, a gable roof and a clock tower over the entrance.
 */
export function townHall(x: number, z: number) {
  const w = 22, d = 13, h = 7, floor = 0.45
  const g = new Draft('Town hall', x, z)
  g.userData = { ...g.userData, footprint: [w, d], kind: 'town-hall', enterable: true }
  g.box(w + 0.4, floor, d + 0.4, 0, floor / 2, 0, 'concrete', 'detail')
  groundOutline(g, 0, 0, w + 0.4, d + 0.4)
  const walls = new Draft('Town hall · walls')
  walls.userData.cutaway = true
  const tall = (centre: number): WallOpening => ({ centre, width: 1.5, bottom: 1.5, height: 3.2 })
  const front = [-8.5, -4.5, 4.5, 8.5].map(tall), back = [-8.5, -4.5, 0, 4.5, 8.5].map(tall), ends = [-3, 3].map(tall)
  const doorway: WallOpening = { centre: 0, width: 2.8, bottom: 0, height: 3.4 }
  piercedWall(walls, w, h, floor, d / 2 - WT / 2, [...front, doorway])
  piercedWall(walls, w, h, floor, -d / 2 + WT / 2, back)
  for (const side of [-1, 1]) piercedWall(walls, d - 2 * WT, h, floor, side * (w / 2 - WT / 2), ends, true)
  for (const o of front) windowFrame(walls, o.centre, floor + o.bottom, d / 2 + 0.025, o.width, o.height)
  for (const o of back) windowFrame(walls, o.centre, floor + o.bottom, -d / 2 - 0.025, o.width, o.height)
  for (const side of [-1, 1]) for (const o of ends) windowFrame(walls, side * (w / 2 + 0.025), floor + o.bottom, o.centre, o.width, o.height, true)
  walls.box(w - 2 * WT, 0.25, d - 2 * WT, 0, floor + h - 0.125, 0, 'paper', 'detail')
  g.add(walls.finish())
  const cover = new Draft('Town hall · roof')
  cover.userData.cutaway = true
  roof(cover, w, d, floor + h, 3)
  // The clock tower over the entrance, standing on the roof.
  const ct = floor + h + 1.6
  cover.box(4, 5, 4, 0, ct + 2.5, d / 2 - 2.5, 'paper')
  cover.ring(1.1, ct + 3.4, 0, d / 2 - 0.48, 'edge', 40)
  cover.line([[0, ct + 3.4, d / 2 - 0.47], [0, ct + 4.1, d / 2 - 0.47]], 'edge')
  cover.line([[0, ct + 3.4, d / 2 - 0.47], [0.5, ct + 3.4, d / 2 - 0.47]], 'edge')
  for (const [a, b] of [[[-2.2, -2.2], [2.2, -2.2]], [[2.2, -2.2], [2.2, 2.2]], [[2.2, 2.2], [-2.2, 2.2]], [[-2.2, 2.2], [-2.2, -2.2]]] as [[number, number], [number, number]][]) {
    cover.face([[a[0], ct + 5, d / 2 - 2.5 + a[1]], [b[0], ct + 5, d / 2 - 2.5 + b[1]], [0, ct + 7.5, d / 2 - 2.5]], 'roof', 'edge')
  }
  g.add(cover.finish())
  const entry = createDoor({ name: 'Town hall · double door', x: 0, z: d / 2 + 0.02, floor, width: doorway.width, height: doorway.height, exit: true, open: true })
  g.add(entry)
  steps(g, 0, d / 2 + 0.29, 6, floor, 3)
  // A portico of two columns either side of the door.
  for (const px of [-2.6, 2.6]) g.cylinder(0.3, floor + 4.2, px, (floor + 4.2) / 2, d / 2 + 1.2)
  g.box(6.2, 0.4, 2.2, 0, floor + 4.4, d / 2 + 1.1, 'paper', 'detail')
  // Inside: four pillars, the stage, and the mayor's desk (with a radio) on it.
  const hall = new Furnishing('Town hall · hall')
  for (const px of [-6, 6]) for (const pz of [-2.2, 2.6]) hall.box(0.9, h, 0.9, px, floor + h / 2, pz, 'paper', 'detail')
  hall.box(12, 0.6, 3, 0, floor + 0.3, -d / 2 + WT + 1.5, 'paper', 'detail')
  hall.desk(-2, -d / 2 + WT + 1.3, floor + 0.6, 0, true)
  hall.chair(-2, -d / 2 + WT + 2.25, floor + 0.6, Math.PI)
  hall.wallMap(3, -d / 2 + 0.28, floor + 0.6)
  for (const px of [-4.6, 4.6]) hall.beam([px, floor + 0.6, -d / 2 + WT + 0.3], [px, floor + 4.4, -d / 2 + WT + 0.3], 0.07)
  g.add(hall.finish())
  // Light: dark inside, the windows, the open double door, chandeliers on long drops.
  g.add(darkRoom('Town hall', [0, (floor - 0.3 + floor + h) / 2, 0], [w / 2 + 0.02, (h + 0.3) / 2, d / 2 + 0.02], { ambient: 0.04 }))
  g.add(windowRow('Town hall · front windows', [0, floor + 3.1, d / 2 - WT / 2], Math.PI, front.map(o => -o.centre), 1.5, 3.2),
    windowRow('Town hall · back windows west', [0, floor + 3.1, -d / 2 + WT / 2], 0, back.slice(0, 3).map(o => o.centre), 1.5, 3.2),
    windowRow('Town hall · back windows east', [0, floor + 3.1, -d / 2 + WT / 2], 0, back.slice(3).map(o => o.centre), 1.5, 3.2),
    windowRow('Town hall · west windows', [-w / 2 + WT / 2, floor + 3.1, 0], Math.PI / 2, ends.map(o => -o.centre), 1.5, 3.2),
    windowRow('Town hall · east windows', [w / 2 - WT / 2, floor + 3.1, 0], -Math.PI / 2, ends.map(o => o.centre), 1.5, 3.2))
  for (const lx of [-6, 0, 6]) g.add(cageLamp(`Town hall · chandelier ${lx}`, [lx, floor + h - 0.25, 0.2], LAMP_AMBER, 2.2, { intensity: 4, range: 10, bounce: 0.12 }))
  doorwayLight(entry, -1, { bounce: 0.12, intensity: 6, range: 12 })
  return g.finish()
}

/**
 * The stone bridge: a deck over the river with parapets either side, piers on the banks and an arch drawn under it.
 * It runs along Z, centred on (x, z).
 */
export function stoneBridge(x: number, z: number, length: number, width: number, bed: number) {
  const g = new Draft('Stone bridge', x, z)
  g.userData.kind = 'bridge'
  const deckTop = 0.3
  g.box(width, 0.4, length, 0, deckTop - 0.2, 0, 'paper', 'detail')
  for (const side of [-1, 1]) {
    g.box(0.45, 1, length, side * (width / 2 - 0.225), deckTop + 0.5, 0, 'paper', 'detail')
    g.box(0.6, 0.12, length + 0.2, side * (width / 2 - 0.225), deckTop + 1.06, 0, 'paper', 'detail')
    // Coursed stone on the parapet faces.
    for (let u = -length / 2 + 0.6; u < length / 2; u += 0.9) g.line([[side * (width / 2 + 0.005), deckTop + 0.15, u], [side * (width / 2 + 0.005), deckTop + 0.95, u]], 'mesh')
    g.line([[side * (width / 2 + 0.005), deckTop + 0.55, -length / 2], [side * (width / 2 + 0.005), deckTop + 0.55, length / 2]], 'mesh')
  }
  // Piers on each bank, and the arch between them under the deck.
  const span = 3.6
  for (const end of [-1, 1]) g.box(width, -bed + deckTop - 0.4, length / 2 - span, 0, (bed + deckTop - 0.4) / 2, end * (span + (length / 2 - span) / 2), 'paper', 'detail')
  const segments = 9
  for (let i = 0; i < segments; i++) {
    const a0 = Math.PI * i / segments, a1 = Math.PI * (i + 1) / segments
    const z0 = -Math.cos(a0) * span, z1 = -Math.cos(a1) * span
    const y0 = deckTop - 0.4 - (1 - Math.sin(a0)) * 1.2, y1 = deckTop - 0.4 - (1 - Math.sin(a1)) * 1.2
    g.box(width, 0.35, Math.abs(z1 - z0) + 0.05, 0, Math.min(y0, y1) - 0.15, (z0 + z1) / 2, 'paper', false)
    for (const side of [-1, 1]) g.line([[side * (width / 2 + 0.01), y0 - 0.3, z0], [side * (width / 2 + 0.01), y1 - 0.3, z1]], 'edge')
  }
  return g.finish()
}

/** The market square: a paved circle with a fountain and its column in the middle, benches, stalls and lamps. */
export function marketSquare(x: number, z: number, radius: number) {
  const root = new THREE.Group()
  root.name = 'Market square'
  const g = new Draft('Market square · paving and fountain', x, z)
  g.ring(radius, 0.03, 0, 0, 'edge', 72)
  g.ring(radius - 0.5, 0.03, 0, 0, 'landscape', 72)
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2
    g.line([[Math.cos(a) * 3.4, 0.03, Math.sin(a) * 3.4], [Math.cos(a) * (radius - 0.5), 0.03, Math.sin(a) * (radius - 0.5)]], 'mesh')
  }
  // The fountain basin: a ring wall with water in it, and a column with a lamp on top.
  for (let i = 0; i < 16; i++) {
    const a = (i + 0.5) / 16 * Math.PI * 2
    g.box(1.06, 0.55, 0.3, Math.cos(a) * 2.6, 0.275, Math.sin(a) * 2.6, 'paper', false, [0, -a + Math.PI / 2, 0])
  }
  g.ring(2.75, 0.55, 0, 0, 'edge', 48)
  g.ring(2.45, 0.55, 0, 0, 'edge', 48)
  g.ring(2.75, 0.02, 0, 0, 'edge', 48)
  g.face(Array.from({ length: 24 }, (_, i): Point => [Math.cos(i / 24 * Math.PI * 2) * 2.45, 0.32, Math.sin(i / 24 * Math.PI * 2) * 2.45]), 'paper', false)
  for (let i = 0; i < 6; i++) g.ring(0.6 + i * 0.3, 0.33, 0, 0, 'mesh', 32)
  g.cylinder(0.45, 0.6, 0, 0.6, 0)
  g.cylinder(0.28, 3.4, 0, 2.6, 0)
  g.cylinder(0.5, 0.25, 0, 4.4, 0, 'paper', 0.3)
  g.cylinder(0.12, 0.5, 0, 4.75, 0)
  // Benches facing the fountain.
  for (const a of [0.4, 2.0, 3.6, 5.2]) {
    const bx = Math.cos(a) * 6.3, bz = Math.sin(a) * 6.3, turn = -a + Math.PI / 2
    g.box(1.9, 0.08, 0.5, bx, 0.45, bz, 'paper', 'detail', [0, turn, 0])
    const back: Point = [Math.cos(a) * 6.55, 0.75, Math.sin(a) * 6.55]
    g.box(1.9, 0.5, 0.06, back[0], back[1], back[2], 'paper', 'detail', [0, turn, 0])
    for (const s of [-0.8, 0.8]) g.box(0.08, 0.45, 0.45, bx + Math.cos(turn) * s, 0.225, bz - Math.sin(turn) * s, 'paper', false)
  }
  root.add(g.finish())
  // Two market stalls on the square's edge: posts, a counter and a sloped canopy.
  for (const [sx, sz, turn] of [[x - 8.2, z + 4.5, 0.6], [x + 7.8, z + 5, -0.5]] as [number, number, number][]) {
    const stall = new Draft('Market stall', sx, sz, turn)
    for (const px of [-1.4, 1.4]) for (const pz of [-0.8, 0.8]) stall.beam([px, 0, pz], [px, pz < 0 ? 2.5 : 2.2, pz], 0.08, 'paper', 'detail')
    stall.box(2.8, 0.9, 0.6, 0, 0.45, 0.6, 'paper', 'detail')
    stall.face([[-1.6, 2.55, -1], [1.6, 2.55, -1], [1.6, 2.15, 1.1], [-1.6, 2.15, 1.1]], 'roof')
    stall.hatch([-1.5, 2.36, -0.9], [3, 0, 0], [0, -0.38, 1.9], { spacing: 0.28 })
    root.add(stall.finish())
  }
  for (const a of [0.8, 2.4, 3.9, 5.5]) root.add(lamp('Market lamp', x + Math.cos(a) * (radius + 0.6), z + Math.sin(a) * (radius + 0.6), 4.5))
  return root
}

/**
 * The walled graveyard: a stone wall all round, broken open on its east side, rows of headstones and crosses,
 * and rubble where the wall came down. The player starts here.
 */
export function walledGraveyard(worldMinX: number, worldMaxX: number, worldMinZ: number, worldMaxZ: number, worldGap: { minZ: number; maxZ: number }) {
  // Built round its own middle, so the field map finds it where it is.
  const cx = (worldMinX + worldMaxX) / 2, cz0 = (worldMinZ + worldMaxZ) / 2
  const g = new Draft('Walled graveyard', cx, cz0)
  const minX = worldMinX - cx, maxX = worldMaxX - cx, minZ = worldMinZ - cz0, maxZ = worldMaxZ - cz0
  const gap = { minZ: worldGap.minZ - cz0, maxZ: worldGap.maxZ - cz0 }
  const cz = 0
  g.userData.footprint = [maxX - minX, maxZ - minZ]
  g.userData.kind = 'graveyard'
  const H = 1.8, T = 0.5
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    const length = Math.hypot(x1 - x0, z1 - z0)
    if (length < 0.1) return
    const along = x0 !== x1
    g.box(along ? length + T : T, H, along ? T : length + T, (x0 + x1) / 2, H / 2, (z0 + z1) / 2, 'paper', 'detail')
    g.box(along ? length + T + 0.1 : T + 0.12, 0.12, along ? T + 0.12 : length + T + 0.1, (x0 + x1) / 2, H + 0.06, (z0 + z1) / 2, 'paper', 'detail')
    for (let u = 0.8; u < length; u += 1.6) {
      const px = along ? x0 + Math.sign(x1 - x0) * u : x0, pz = along ? z0 : z0 + Math.sign(z1 - z0) * u
      for (const side of [-1, 1]) g.line(along ? [[px, 0.3, pz + side * (T / 2 + 0.005)], [px, H - 0.2, pz + side * (T / 2 + 0.005)]]
        : [[px + side * (T / 2 + 0.005), 0.3, pz], [px + side * (T / 2 + 0.005), H - 0.2, pz]], 'mesh')
    }
  }
  wall(minX, minZ, maxX, minZ)
  wall(minX, maxZ, maxX, maxZ)
  wall(minX, minZ, minX, maxZ)
  wall(maxX, minZ, maxX, gap.minZ)
  wall(maxX, gap.maxZ, maxX, maxZ)
  // The breach: broken wall ends stepping down, and rubble spilled either side.
  for (const [zEnd, dir] of [[gap.minZ, 1], [gap.maxZ, -1]] as [number, number][]) {
    g.box(T, H * 0.55, 0.7, maxX, H * 0.275, zEnd + dir * 0.35, 'paper', 'detail')
    g.box(T, H * 0.25, 0.6, maxX, H * 0.125, zEnd + dir * 1.0, 'paper', 'detail')
  }
  const random = penRandom(4120)
  // Rubble heaped against the broken ends, leaving the middle of the breach clear to walk through.
  for (let i = 0; i < 10; i++) {
    const end = i % 2 ? gap.minZ + 1.1 : gap.maxZ - 1.1, side = i % 2 ? 1 : -1
    boulder(g, maxX + (random() - 0.5) * 2.6, end - side * random() * 0.5, 0.18 + random() * 0.16, 4200 + i)
  }
  // Headstones and crosses in rows, an aisle down the middle.
  for (let row = 0; row < 6; row++) for (let col = 0; col < 8; col++) {
    const x = minX + 3 + col * 3.3, z = minZ + 3.2 + row * 3.6
    if (Math.abs(z - cz) < 1.5 || x > maxX - 3) continue
    if ((row + col) % 3 === 0) {
      g.beam([x, 0, z], [x, 1.25, z], 0.12, 'paper', 'detail')
      g.beam([x, 0.95, z - 0.35], [x, 0.95, z + 0.35], 0.1, 'paper', 'detail')
    } else {
      g.box(0.16, 0.75, 0.62, x, 0.375, z, 'paper', 'detail')
      g.solid(new THREE.CylinderGeometry(0.31, 0.31, 0.16, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), [x, 0.75, z], 'paper', 'detail')
      g.line([[x + 0.085, 0.45, z - 0.15], [x + 0.085, 0.45, z + 0.15]], 'mesh')
    }
    g.line([[x + 0.4, 0.02, z - 0.45], [x + 1.9, 0.02, z - 0.45], [x + 1.9, 0.02, z + 0.45], [x + 0.4, 0.02, z + 0.45]], 'mesh', true)
  }
  g.line([[minX + 1, 0.02, cz - 0.9], [maxX, 0.02, cz - 0.9]], 'landscape')
  g.line([[minX + 1, 0.02, cz + 0.9], [maxX, 0.02, cz + 0.9]], 'landscape')
  return g.finish()
}

/** The north road checkpoint: a gatehouse with its radio, a raised boom, sandbags either side and a sign. */
export function checkpoint(x: number, z: number) {
  const root = new THREE.Group()
  root.name = 'North road checkpoint'
  root.add(building({ name: 'Checkpoint gatehouse', x: x + 10, z: z + 5.2, width: 7, depth: 5, height: 2.8 }))
  const g = new Draft('North road checkpoint · boom and sandbags', x, z)
  // Gate posts in the fence gap, and the boom raised on its pivot.
  for (const side of [-1, 1]) g.box(0.5, 2.9, 0.5, side * 3.6, 1.45, 0, 'concrete', 'detail')
  g.box(0.6, 1.1, 0.6, -2.6, 0.55, 1.6, 'concrete', 'detail')
  g.beam([-2.6, 1.15, 1.6], [-1.4, 6.2, 1.6], 0.14)
  for (let u = 0.12; u < 1; u += 0.18) {
    const a: Point = [-2.6 + 1.2 * u, 1.15 + 5.05 * u, 1.6]
    g.line([a, [a[0] + 0.08, a[1] + 0.3, a[2]]], 'detail')
  }
  for (const side of [-1, 1]) for (let row = 0; row < 3; row++) for (let i = 0; i < 5 - (row % 2); i++) {
    g.box(0.6, 0.26, 0.4, side * (5 + i * 0.62 + (row % 2) * 0.31), 0.13 + row * 0.25, 2.8, 'concrete', 'detail')
  }
  root.add(g.finish())
  root.add(signboard('Checkpoint', 'CHECKPOINT', x - 6.5, z + 3.5, 0, 0.34))
  root.add(lamp('Checkpoint floodlight', x + 4.4, z + 1.2, 5.5))
  return root
}

/** The fuel depot: three fuel tanks on bunded pads, a pump house, drums, and its fence with a gate to the north. */
export function fuelDepot(x: number, z: number) {
  const root = new THREE.Group()
  root.name = 'Fuel depot'
  const g = new Draft('Fuel depot · tanks', x, z)
  g.userData.footprint = [20, 18]
  for (const tx of [-6.5, 0, 6.5]) {
    g.box(5.2, 0.3, 5.2, tx, 0.15, -3, 'concrete', 'detail')
    for (const side of [-1, 1]) {
      g.box(5.4, 0.45, 0.16, tx, 0.45, -3 + side * 2.6, 'paper', 'detail')
      g.box(0.16, 0.45, 5.4, tx + side * 2.6, 0.45, -3, 'paper', 'detail')
    }
    g.cylinder(2.1, 5.2, tx, 0.3 + 2.6, -3)
    g.cylinder(2.1, 0.6, tx, 0.3 + 5.5, -3, 'paper', 0.4)
    for (const y of [1.2, 3.6]) g.ring(2.11, y, tx, -3, 'detail')
    g.beam([tx + 2.1, 1, -3], [tx + 3.6, 1, -3], 0.12, 'paper', 'detail')
  }
  // Drums by the pump house.
  for (let i = 0; i < 6; i++) g.cylinder(0.3, 0.9, -8 + (i % 3) * 0.66, 0.45, 4.5 + Math.floor(i / 3) * 0.66)
  root.add(g.finish())
  root.add(building({ name: 'Fuel pump house', x: x + 4, z: z + 5.6, width: 7, depth: 4.6, height: 2.8, type: 'utility' }))
  root.add(yardFence('Fuel depot fence', x - 10.5, x + 10.5, z - 8, z + 9.5, [{ side: 'n', width: 5 }]))
  return root
}

/**
 * The detention shed: a small concrete hut in a fenced yard, with the prisoner tied to a chair inside, facing the
 * door (south, +Z). Returns the shed, where the prisoner sits (world space), and which way he faces.
 */
export function detentionShed(x: number, z: number) {
  const root = new THREE.Group()
  root.name = 'Detention shed yard'
  const shed = building({ name: 'Detention shed', x, z, width: 8, depth: 6, height: 2.9, type: 'utility' })
  const chairAt: [number, number, number] = [x + 0.3, 0.28, z + 0.5]
  const chair = new Furnishing('Detention shed · prisoner chair')
  chair.chair(chairAt[0], chairAt[2], chairAt[1], 0)
  root.add(shed, chair.finish())
  root.add(yardFence('Detention shed fence', x - 8, x + 8, z - 7, z + 7.5, [{ side: 'n', at: 0, width: 3 }]))
  root.add(signboard('Detention shed', 'NO ENTRY', x - 4.5, z - 8.2, Math.PI, 0.34))
  return { root, prisoner: chairAt, facing: Math.PI }
}

/** Paths drawn on the field map: the town's roads and its river. */
export function mapLines(roads: { path: PlanPath }[], river: PlanPath) {
  const marker = new THREE.Object3D()
  marker.name = 'Town map lines'
  marker.userData.mapLines = [...roads.map(road => ({ kind: 'road', points: road.path })), { kind: 'water', points: river }]
  return marker
}
