import * as THREE from 'three'
import { Draft, type Point } from '../render/ink'

type Counts = Record<string, number>

/**
 * The part of a room's floor furniture goes in (clear of any stairs), in the building's own units. `walls` is where the
 * inside faces of the walls are (the area keeps 0.3 m off them), and `openings` every window and door in each wall
 * at this floor, as [centre, width] along the wall (x for front and back, z for the ends): see wallGaps.
 */
export type FloorArea = { minX: number; maxX: number; minZ: number; maxZ: number; y: number; floor: number
  walls: { minX: number; maxX: number; minZ: number; maxZ: number }
  openings: Record<'front' | 'back' | 'ends', [number, number][]>
  /** Window sills are this high over the floor: anything lower can stand under a window. */
  sill: number }

/**
 * Where along a wall something `width` wide can hang or stand without covering a window or door: the middle of each
 * gap between openings (and between `from` and `to`, default the area's extent) that is wide enough, in order.
 */
export function wallGaps(area: FloorArea, wall: 'front' | 'back' | 'ends', width: number, from?: number, to?: number) {
  const lo = from ?? (wall === 'ends' ? area.minZ : area.minX), hi = to ?? (wall === 'ends' ? area.maxZ : area.maxX)
  const blocked = area.openings[wall].map(([c, w]): [number, number] => [c - w / 2 - 0.12, c + w / 2 + 0.12]).sort((a, b) => a[0] - b[0])
  const gaps: number[] = []
  let start = lo
  for (const [a, b] of [...blocked, [hi, hi] as [number, number]]) {
    const end = Math.min(a, hi)
    if (end - start >= width) gaps.push((start + end) / 2)
    start = Math.max(start, b)
  }
  return gaps
}

/** Furniture is built at human scale, leaving the centre of each room as a circulation aisle. */
export class Furnishing extends Draft {
  counts: Counts = {}

  item(kind: string, x: number, z: number, floor: number, angle = 0) {
    this.counts[kind] = (this.counts[kind] ?? 0) + 1
    const item = new Draft(`${this.name} · ${kind} ${this.counts[kind]}`, x, z, angle)
    item.position.y = floor
    item.userData.furniture = kind
    this.add(item)
    return item
  }

  chair(x: number, z: number, floor: number, angle = 0) {
    const g = this.item('chair', x, z, floor, angle)
    g.box(0.56, 0.1, 0.56, 0, 0.49, 0, 'green', 'detail')
    for (const sx of [-0.23, 0.23]) for (const sz of [-0.23, 0.23]) {
      g.beam([sx, 0.04, sz], [sx, sz < 0 ? 1.03 : 0.47, sz], 0.055, 'paper', 'detail')
    }
    g.box(0.56, 0.34, 0.065, 0, 0.89, -0.23, 'green', 'detail')
    g.finish()
  }

  desk(x: number, z: number, floor: number, angle = 0, radio = false) {
    const g = this.item('desk', x, z, floor, angle)
    g.box(1.8, 0.12, 0.84, 0, 0.84, 0, 'paper', 'detail')
    g.box(0.45, 0.75, 0.73, -0.61, 0.405, 0, 'roof', 'detail')
    for (const sz of [-0.32, 0.32]) g.beam([0.73, 0.03, sz], [0.73, 0.81, sz], 0.06, 'paper', 'detail')
    for (const y of [0.22, 0.45, 0.67]) {
      g.line([[-0.78, y, 0.375], [-0.44, y, 0.375]], 'detail')
      g.box(0.15, 0.025, 0.035, -0.61, y + 0.07, 0.38, 'paper', 'detail')
    }
    // Field paperwork and a desk lamp, with a compact radio on communications desks.
    g.box(0.38, 0.025, 0.27, 0.33, 0.915, 0.11, 'paper', 'detail', [0, 0.12, 0])
    g.beam([-0.65, 0.9, -0.24], [-0.65, 1.35, -0.24], 0.035, 'paper', 'detail')
    g.box(0.27, 0.1, 0.18, -0.55, 1.34, -0.24, 'roof', 'detail')
    if (radio) g.add(this.radio())
    g.finish()
  }

  /**
   * A field radio set for the desk top: olive case, dark brown front panel with a dial window and knobs,
   * a carry handle and a whip antenna. Radios are quest items, so they are painted and tagged.
   */
  private radio() {
    this.counts.radio = (this.counts.radio ?? 0) + 1
    const g = new Draft(`${this.name} · radio ${this.counts.radio}`, 0.1, -0.2)
    g.position.y = 0.9
    g.userData.furniture = 'radio'
    g.userData.questItem = 'radio'
    g.box(0.66, 0.3, 0.3, 0, 0.15, 0, 'olive', 'detail')
    g.box(0.6, 0.23, 0.02, 0, 0.15, 0.16, 'umber', 'detail')
    g.box(0.2, 0.1, 0.012, -0.14, 0.17, 0.176, 'glass', 'detail')
    g.line([[-0.2, 0.17, 0.183], [-0.08, 0.17, 0.183]], 'mesh')
    for (const [sx, sy] of [[0.07, 0.19], [0.15, 0.19], [0.23, 0.19], [0.11, 0.1], [0.21, 0.1]]) g.box(0.045, 0.045, 0.035, sx, sy, 0.185, 'olive', 'detail')
    for (const sx of [-0.2, 0.2]) g.beam([sx, 0.3, 0], [sx, 0.37, 0], 0.03, 'umber', 'detail')
    g.beam([-0.2, 0.37, 0], [0.2, 0.37, 0], 0.03, 'umber', 'detail')
    g.beam([0.27, 0.3, -0.07], [0.35, 0.95, -0.07], 0.018, 'umber', 'detail')
    return g.finish()
  }

  /**
   * A wooden supply crate that can be shot apart: planked sides in a darker frame with a cross brace.
   * Crates are quest items. They collide as dynamic objects so a broken one can leave the collision world.
   */
  crate(x: number, z: number, floor: number, angle = 0) {
    const g = this.item('quest-crate', x, z, floor, angle)
    g.userData.questItem = 'crate'
    g.userData.questCrate = g.name
    g.userData.dynamicCollision = true
    const s = 0.78, h = 0.72, t = 0.06
    g.box(s - 0.02, h - 0.02, s - 0.02, 0, h / 2, 0, 'wood', 'detail')
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(t, h, t, sx * (s - t) / 2, h / 2, sz * (s - t) / 2, 'timber', 'detail')
    for (const y of [t / 2, h - t / 2]) {
      for (const sz of [-1, 1]) g.box(s, t, t, 0, y, sz * (s - t) / 2, 'timber', 'detail')
      for (const sx of [-1, 1]) g.box(t, t, s, sx * (s - t) / 2, y, 0, 'timber', 'detail')
    }
    for (const side of [-1, 1]) {
      const zf = side * (s / 2 + 0.002), xf = side * (s / 2 + 0.002)
      // Plank seams on every face, and a brace across the front and back.
      for (const y of [0.25, 0.47]) {
        g.line([[-s / 2 + t, y, zf], [s / 2 - t, y, zf]], 'mesh')
        g.line([[xf, y, -s / 2 + t], [xf, y, s / 2 - t]], 'mesh')
      }
      g.beam([-s / 2 + t, t, side * (s / 2 + 0.012)], [s / 2 - t, h - t, side * (s / 2 + 0.012)], 0.055, 'timber', 'detail')
    }
    g.finish()
    return g
  }

  bunk(x: number, z: number, floor: number, angle = 0, single = false) {
    const g = this.item(single ? 'medical-cot' : 'bunk-bed', x, z, floor, angle)
    for (const sx of [-0.51, 0.51]) for (const sz of [-1.06, 1.06]) {
      g.beam([sx, 0.02, sz], [sx, single ? 0.95 : 2.08, sz], 0.07, 'paper', 'detail')
    }
    for (const y of single ? [0.62] : [0.5, 1.6]) {
      g.box(1.12, 0.13, 2.2, 0, y, 0, 'roof', 'detail')
      g.box(1.04, 0.18, 2.09, 0, y + 0.13, 0, 'paper', 'detail')
      g.box(1.035, 0.025, 1.35, 0, y + 0.235, 0.3, 'green', 'detail')
      g.hatch([-0.46, y + 0.262, -0.29], [0.32, 0, 0], [0, 0, 0.7],
        { spacing: 0.095, inset: 0.025 })
      g.box(0.7, 0.12, 0.39, 0, y + 0.26, -0.72, 'paper', 'detail')
      g.beam([-0.51, y + 0.36, -1.06], [0.51, y + 0.36, -1.06], 0.065, 'paper', 'detail')
    }
    if (!single) {
      for (const sx of [-0.41, 0.41]) g.beam([sx, 0.03, 1.12], [sx, 1.93, 1.12], 0.055, 'paper', 'detail')
      for (let y = 0.31; y < 1.8; y += 0.31) g.beam([-0.41, y, 1.12], [0.41, y, 1.12], 0.055, 'paper', 'detail')
      g.beam([-0.51, 2.02, 0.45], [-0.51, 2.02, -1.06], 0.055, 'paper', 'detail')
      g.beam([0.51, 2.02, 0.45], [0.51, 2.02, -1.06], 0.055, 'paper', 'detail')
    }
    g.finish()
  }

  lockers(x: number, z: number, floor: number, count = 3, angle = 0) {
    const g = this.item('locker-bank', x, z, floor, angle)
    for (let i = 0; i < count; i++) {
      const sx = (i - (count - 1) / 2) * 0.59
      g.box(0.57, 1.92, 0.55, sx, 1.01, 0, 'green', 'detail')
      g.line([[sx - 0.23, 0.14, 0.281], [sx - 0.23, 1.89, 0.281], [sx + 0.23, 1.89, 0.281], [sx + 0.23, 0.14, 0.281]], 'detail', true)
      g.box(0.04, 0.18, 0.055, sx + 0.14, 1.03, 0.31, 'paper', 'detail')
      for (let v = 0; v < 3; v++) g.line([[sx - 0.16, 1.63 + v * 0.07, 0.286], [sx + 0.16, 1.63 + v * 0.07, 0.286]], 'mesh')
    }
    g.finish()
  }

  table(x: number, z: number, floor: number, width = 3.3) {
    const g = this.item('briefing-table', x, z, floor)
    g.box(width, 0.14, 1.35, 0, 0.86, 0, 'roof', 'detail')
    for (const sx of [-width / 2 + 0.18, width / 2 - 0.18]) for (const sz of [-0.48, 0.48]) {
      g.beam([sx, 0.02, sz], [sx, 0.79, sz], 0.09, 'paper', 'detail')
    }
    g.box(width * 0.58, 0.018, 0.91, 0, 0.94, 0, 'green', 'detail')
    g.line([[-0.8, 0.952, -0.25], [-0.32, 0.952, 0.12], [0.11, 0.952, -0.16], [0.63, 0.952, 0.18]], 'detail')
    g.finish()
  }

  shelf(x: number, z: number, floor: number, angle = 0) {
    const g = this.item('supply-shelf', x, z, floor, angle)
    for (const sx of [-1.08, 1.08]) for (const sz of [-0.34, 0.34]) {
      g.beam([sx, 0.02, sz], [sx, 2.22, sz], 0.065, 'paper', 'detail')
    }
    for (const y of [0.18, 0.94, 1.71]) {
      g.box(2.3, 0.075, 0.82, 0, y, 0, 'roof', 'detail')
      for (const sx of [-0.69, 0.05, 0.72]) {
        g.box(0.52, 0.45, 0.6, sx, y + 0.27, 0, 'green', 'detail')
        g.box(0.22, 0.12, 0.014, sx, y + 0.31, 0.307, 'paper', 'detail')
        g.line([[sx - 0.26, y + 0.14, 0.309], [sx + 0.26, y + 0.14, 0.309]], 'mesh')
      }
    }
    g.finish()
  }

  pallet(x: number, z: number, floor: number, double = false) {
    const g = this.item('supply-pallet', x, z, floor)
    for (const sx of [-0.57, 0, 0.57]) g.box(0.16, 0.15, 1.4, sx, 0.075, 0, 'roof', 'detail')
    for (let i = 0; i < 5; i++) g.box(1.4, 0.07, 0.2, 0, 0.19, -0.58 + i * 0.29, 'paper', 'detail')
    for (let level = 0; level < (double ? 2 : 1); level++) {
      const y = 0.68 + level * 0.92
      g.box(1.22, 0.88, 1.2, 0, y, 0, 'green', 'detail')
      for (const sx of [-0.39, 0.39]) g.box(0.08, 0.91, 1.23, sx, y, 0, 'roof', 'detail')
      g.box(0.34, 0.18, 0.015, 0, y + 0.08, 0.61, 'paper', 'detail')
    }
    g.finish()
  }

  wallMap(x: number, z: number, floor: number) {
    const g = this.item('operations-map', x, z, floor)
    g.box(2.4, 1.3, 0.08, 0, 1.91, 0, 'roof', 'detail')
    g.box(2.18, 1.09, 0.016, 0, 1.91, 0.049, 'green', 'detail')
    const route: Point[] = [[-0.87, 1.58, 0.062], [-0.49, 1.94, 0.062], [-0.05, 1.79, 0.062], [0.32, 2.23, 0.062], [0.87, 2.17, 0.062]]
    g.line(route, 'detail')
    for (const [sx, sy] of [[-0.49, 1.94], [0.32, 2.23], [0.6, 1.68]]) g.box(0.18, 0.14, 0.024, sx, sy, 0.067, 'paper', 'detail')
    g.finish()
  }

  workbench(x: number, z: number, floor: number) {
    const g = this.item('maintenance-workbench', x, z, floor)
    g.box(3.4, 0.14, 0.95, 0, 0.98, 0, 'roof', 'detail')
    for (const sx of [-1.47, 1.47]) for (const sz of [-0.34, 0.34]) g.beam([sx, 0.02, sz], [sx, 0.91, sz], 0.09, 'paper', 'detail')
    g.box(3.1, 0.09, 0.76, 0, 0.25, 0, 'paper', 'detail')
    g.box(2.7, 1.15, 0.08, 0, 1.82, -0.43, 'green', 'detail')
    for (const sx of [-0.98, -0.49, 0, 0.49, 0.98]) {
      g.beam([sx, 1.52, -0.37], [sx, 2.12, -0.37], 0.045, 'paper', 'detail')
      g.box(0.2, 0.1, 0.065, sx, 2.12, -0.37, 'paper', 'detail')
    }
    g.box(0.67, 0.27, 0.4, -0.8, 1.185, 0, 'green', 'detail')
    g.beam([-1.02, 1.34, 0], [-0.59, 1.34, 0], 0.05, 'paper', 'detail')
    g.box(0.25, 0.21, 0.27, 1.04, 1.14, 0.35, 'concrete', 'detail')
    g.beam([0.91, 1.18, 0.54], [1.3, 1.18, 0.54], 0.045, 'paper', 'detail')
    g.finish()
  }

  // Furniture for town interiors. Each faces +Z, its back against a wall on its -Z side.

  /** A blackboard on the wall: frame, chalk ledge and a few lines of chalk. */
  blackboard(x: number, z: number, floor: number, angle = 0, width = 2.6) {
    const g = this.item('blackboard', x, z, floor, angle)
    g.box(width, 1.15, 0.05, 0, 1.55, 0, 'roof', 'detail')
    g.box(width + 0.1, 0.05, 0.12, 0, 0.95, 0.05, 'paper', 'detail')
    for (const [y, a, b] of [[1.85, -0.9, 0.4], [1.65, -0.9, 0.1], [1.45, -0.9, 0.7], [1.25, -0.2, 0.9]]) g.line([[a * width / 2.6, y, 0.03], [b * width / 2.6, y, 0.03]], 'mesh')
    g.finish()
  }

  /** A tall bookcase full of books, some leaning. */
  bookcase(x: number, z: number, floor: number, angle = 0, width = 1.6) {
    const g = this.item('bookcase', x, z, floor, angle)
    g.box(width, 2.1, 0.06, 0, 1.05, -0.17, 'paper', 'detail')
    for (const sx of [-1, 1]) g.box(0.05, 2.1, 0.38, sx * (width / 2 - 0.025), 1.05, 0, 'paper', 'detail')
    for (const y of [0.05, 0.55, 1.05, 1.55, 2.08]) g.box(width, 0.04, 0.38, 0, y, 0, 'paper', 'detail')
    for (const y of [0.07, 0.57, 1.07, 1.57]) {
      let u = -width / 2 + 0.08
      for (let i = 0; u < width / 2 - 0.12; i++) {
        const thick = 0.04 + ((i * 7 + Math.round(y * 10)) % 4) * 0.012, tall = 0.3 + ((i * 5) % 3) * 0.05
        if ((i + Math.round(y * 4)) % 9 === 8) { g.box(thick, tall, 0.26, u + 0.08, y + tall / 2 - 0.04, 0.02, 'paper', 'detail', [0, 0, -0.35]); u += 0.2; continue }
        g.box(thick, tall, 0.26, u + thick / 2, y + tall / 2, 0.02, 'paper', 'detail')
        u += thick + 0.005
      }
    }
    g.finish()
  }

  /** A two-seat sofa with arms and cushions. */
  sofa(x: number, z: number, floor: number, angle = 0) {
    const g = this.item('sofa', x, z, floor, angle)
    g.box(1.8, 0.4, 0.8, 0, 0.2, 0, 'green', 'detail')
    g.box(1.8, 0.5, 0.2, 0, 0.65, -0.3, 'green', 'detail')
    for (const sx of [-1, 1]) g.box(0.18, 0.55, 0.8, sx * 0.81, 0.4, 0, 'green', 'detail')
    for (const sx of [-0.4, 0.4]) g.box(0.7, 0.1, 0.55, sx, 0.45, 0.05, 'paper', 'detail')
    g.finish()
  }

  /** A deep armchair. */
  armchair(x: number, z: number, floor: number, angle = 0) {
    const g = this.item('armchair', x, z, floor, angle)
    g.box(0.85, 0.42, 0.8, 0, 0.21, 0, 'green', 'detail')
    g.box(0.85, 0.55, 0.18, 0, 0.7, -0.31, 'green', 'detail')
    for (const sx of [-1, 1]) g.box(0.16, 0.6, 0.8, sx * 0.35, 0.42, 0, 'green', 'detail')
    g.box(0.55, 0.1, 0.55, 0, 0.47, 0.05, 'paper', 'detail')
    g.finish()
  }

  /** A rug: just its pattern, inked on the floor. */
  rug(x: number, z: number, floor: number, w = 2.6, d = 1.8, angle = 0) {
    const g = this.item('rug', x, z, floor, angle)
    for (const inset of [0, 0.15, 0.32]) g.line([[-w / 2 + inset, 0.012, -d / 2 + inset], [w / 2 - inset, 0.012, -d / 2 + inset], [w / 2 - inset, 0.012, d / 2 - inset], [-w / 2 + inset, 0.012, d / 2 - inset]], inset ? 'mesh' : 'detail', true)
    g.line([[-w / 2 + 0.5, 0.012, 0], [0, 0.012, -d / 2 + 0.5], [w / 2 - 0.5, 0.012, 0], [0, 0.012, d / 2 - 0.5]], 'mesh', true)
    for (let u = -w / 2; u <= w / 2 + 0.01; u += 0.15) for (const side of [-1, 1]) g.line([[u, 0.012, side * d / 2], [u, 0.012, side * (d / 2 + 0.08)]], 'mesh')
    g.finish()
  }

  /** A potted plant: a pot and a round, leafy bush. */
  plant(x: number, z: number, floor: number, tall = 1) {
    const g = this.item('plant', x, z, floor)
    g.solid(new THREE.CylinderGeometry(0.2, 0.15, 0.38, 16), [0, 0.19, 0], 'paper', false, [0, 0, 0], true)
    g.ring(0.2, 0.38, 0, 0, 'detail', 16)
    g.solid(new THREE.IcosahedronGeometry(0.32 * tall, 1), [0, 0.38 + 0.38 * tall, 0], 'green', false, [0, 0, 0], true)
    for (let i = 0; i < 6; i++) { const a = i * 1.05; g.line([[0, 0.4, 0], [Math.cos(a) * 0.25 * tall, 0.45 + 0.5 * tall, Math.sin(a) * 0.25 * tall]], 'mesh') }
    g.finish()
  }

  /** A fireplace against the wall: hearth, surround, mantel with a clock, logs and a chimney breast. */
  fireplace(x: number, z: number, floor: number, angle = 0, ceiling = 3) {
    const g = this.item('fireplace', x, z, floor, angle)
    g.box(1.9, ceiling, 0.5, 0, ceiling / 2, -0.1, 'paper', 'detail')
    g.box(2.1, 0.08, 0.7, 0, 1.25, 0.1, 'paper', 'detail')
    g.box(2.2, 0.06, 0.6, 0, 0.03, 0.4, 'concrete', 'detail')
    g.box(0.9, 0.8, 0.12, 0, 0.45, 0.16, 'roof', false)
    g.line([[-0.45, 0.05, 0.22], [-0.45, 0.85, 0.22], [0.45, 0.85, 0.22], [0.45, 0.05, 0.22]], 'edge')
    for (const [a, b] of [[-0.3, 0.25], [-0.2, 0.32]]) g.beam([a, 0.12, 0.25], [b, 0.2, 0.3], 0.1, 'paper', 'detail')
    g.box(0.2, 0.25, 0.12, 0.6, 1.42, 0.1, 'paper', 'detail')
    g.box(0.12, 0.3, 0.08, -0.6, 1.44, 0.1, 'paper', 'detail')
    g.finish()
  }

  /** A wardrobe with two doors. */
  wardrobe(x: number, z: number, floor: number, angle = 0) {
    const g = this.item('wardrobe', x, z, floor, angle)
    g.box(1.2, 2, 0.6, 0, 1, 0, 'paper', 'detail')
    g.box(1.26, 0.06, 0.64, 0, 2.03, 0, 'paper', 'detail')
    g.line([[0, 0.1, 0.305], [0, 1.9, 0.305]], 'detail')
    for (const sx of [-0.08, 0.08]) g.box(0.03, 0.18, 0.03, sx, 1.05, 0.32, 'paper', false)
    g.finish()
  }

  /** A bed with a headboard against the wall, a pillow and a turned-down blanket. `double` is wider. */
  bed(x: number, z: number, floor: number, angle = 0, double = false) {
    const g = this.item('bed', x, z, floor, angle)
    const w = double ? 1.5 : 0.95
    g.box(w, 0.32, 2, 0, 0.26, 0.15, 'paper', 'detail')
    g.box(w + 0.1, 1, 0.08, 0, 0.5, -0.88, 'roof', 'detail')
    g.box(w - 0.1, 0.12, 1.3, 0, 0.47, 0.42, 'green', 'detail')
    g.box(w - 0.1, 0.13, 0.25, 0, 0.47, -0.32, 'green', 'detail')
    for (const sx of double ? [-0.35, 0.35] : [0]) g.box(0.55, 0.1, 0.3, sx, 0.48, -0.65, 'paper', 'detail')
    for (const sx of [-1, 1]) for (const sz of [-0.82, 1.1]) g.beam([sx * (w / 2 - 0.05), 0, sz], [sx * (w / 2 - 0.05), 0.12, sz], 0.06, 'paper', false)
    g.finish()
  }

  /** A bedside table with a lamp. */
  nightstand(x: number, z: number, floor: number, angle = 0) {
    const g = this.item('nightstand', x, z, floor, angle)
    g.box(0.45, 0.55, 0.4, 0, 0.275, 0, 'paper', 'detail')
    g.line([[-0.2, 0.32, 0.205], [0.2, 0.32, 0.205]], 'detail')
    g.solid(new THREE.CylinderGeometry(0.03, 0.06, 0.25, 12), [0, 0.67, 0], 'paper', false, [0, 0, 0], true)
    g.solid(new THREE.CylinderGeometry(0.09, 0.14, 0.16, 16, 1, true), [0, 0.85, 0], 'paper', false, [0, 0, 0], true)
    g.finish()
  }

  /** A framed picture on the wall: a sketched landscape or a portrait. */
  painting(x: number, z: number, floor: number, angle = 0, portrait = false) {
    const g = this.item('painting', x, z, floor, angle)
    const w = portrait ? 0.7 : 1.2, h = portrait ? 0.95 : 0.75
    g.box(w, h, 0.05, 0, 1.75, 0, 'paper', 'detail')
    g.line([[-w / 2 + 0.07, 1.75 - h / 2 + 0.07, 0.03], [w / 2 - 0.07, 1.75 - h / 2 + 0.07, 0.03], [w / 2 - 0.07, 1.75 + h / 2 - 0.07, 0.03], [-w / 2 + 0.07, 1.75 + h / 2 - 0.07, 0.03]], 'detail', true)
    if (portrait) g.line(Array.from({ length: 13 }, (_, i): Point => [Math.cos(i / 12 * Math.PI * 2) * 0.13, 1.85 + Math.sin(i / 12 * Math.PI * 2) * 0.17, 0.03]), 'detail')
    else g.line([[-w / 2 + 0.1, 1.62, 0.03], [-0.2, 1.88, 0.03], [0.05, 1.7, 0.03], [0.3, 1.92, 0.03], [w / 2 - 0.1, 1.66, 0.03]], 'detail')
    g.finish()
  }

  /** A tall grandfather clock. */
  clock(x: number, z: number, floor: number, angle = 0) {
    const g = this.item('grandfather-clock', x, z, floor, angle)
    g.box(0.5, 1.9, 0.35, 0, 0.95, 0, 'roof', 'detail')
    g.box(0.58, 0.12, 0.4, 0, 1.96, 0, 'paper', 'detail')
    g.solid(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 24).rotateX(Math.PI / 2), [0, 1.6, 0.18], 'paper', false, [0, 0, 0], true)
    g.line([[0, 1.6, 0.2], [0, 1.72, 0.2]], 'detail')
    g.line([[0, 1.6, 0.2], [0.09, 1.6, 0.2]], 'detail')
    g.line([[0, 1.3, 0.18], [0, 0.75, 0.18]], 'detail')
    g.ring(0.07, 0.7, 0, 0.18, 'detail', 12)
    g.finish()
  }

  /** A long wooden bench. */
  bench(x: number, z: number, floor: number, angle = 0, length = 2.4) {
    const g = this.item('bench', x, z, floor, angle)
    g.box(length, 0.07, 0.4, 0, 0.45, 0, 'paper', 'detail')
    g.box(length, 0.4, 0.06, 0, 0.75, -0.2, 'paper', 'detail')
    for (const sx of [-1, 1]) g.box(0.07, 0.45, 0.4, sx * (length / 2 - 0.1), 0.225, 0, 'paper', false)
    g.finish()
  }

  /** A speaker's podium. */
  podium(x: number, z: number, floor: number, angle = 0) {
    const g = this.item('podium', x, z, floor, angle)
    g.box(0.7, 1.05, 0.5, 0, 0.525, 0, 'roof', 'detail')
    g.box(0.8, 0.06, 0.55, 0, 1.1, 0.05, 'paper', 'detail', [-0.25, 0, 0])
    g.beam([0.2, 1.12, 0.1], [0.12, 1.4, 0.25], 0.025, 'paper', 'detail')
    g.finish()
  }

  /** A flag on a pole in a weighted stand. */
  flag(x: number, z: number, floor: number, angle = 0) {
    const g = this.item('flag', x, z, floor, angle)
    g.solid(new THREE.CylinderGeometry(0.22, 0.25, 0.12, 16), [0, 0.06, 0], 'paper', false, [0, 0, 0], true)
    g.beam([0, 0.1, 0], [0, 2.4, 0], 0.05, 'paper', 'detail')
    g.face([[0.03, 2.3, 0], [0.95, 2.22, 0.05], [0.9, 1.6, 0.08], [0.03, 1.68, 0]], 'paper', 'edge')
    g.line([[0.1, 2.0, 0.03], [0.85, 1.92, 0.07]], 'detail')
    g.finish()
  }

  /** A coat rack with a coat on it. */
  coatRack(x: number, z: number, floor: number) {
    const g = this.item('coat-rack', x, z, floor)
    g.beam([0, 0, 0], [0, 1.8, 0], 0.05, 'paper', 'detail')
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.beam([0, 0.02, 0], [Math.cos(a) * 0.3, 0.02, Math.sin(a) * 0.3], 0.04, 'paper', false); g.beam([0, 1.7, 0], [Math.cos(a) * 0.18, 1.78, Math.sin(a) * 0.18], 0.03, 'paper', false) }
    g.box(0.45, 0.9, 0.18, 0.12, 1.2, 0.05, 'green', 'detail')
    g.finish()
  }

  /** A globe on a stand, for a desk. */
  globe(x: number, z: number, floor: number) {
    const g = this.item('globe', x, z, floor)
    g.solid(new THREE.CylinderGeometry(0.06, 0.08, 0.04, 12), [0, 0.02, 0], 'paper', false, [0, 0, 0], true)
    g.beam([0, 0.03, 0], [0, 0.1, 0], 0.02, 'paper', false)
    g.solid(new THREE.SphereGeometry(0.13, 16, 12), [0, 0.24, 0], 'paper', false, [0, 0, 0], true)
    g.ring(0.131, 0.24, 0, 0, 'mesh', 20)
    g.line([[-0.08, 0.3, 0.1], [0.02, 0.28, 0.12], [0.06, 0.2, 0.1]], 'mesh')
    g.finish()
  }

  /** A round hay bale on its side. */
  hayBale(x: number, z: number, floor: number, angle = 0) {
    const g = this.item('hay-bale', x, z, floor, angle)
    g.solid(new THREE.CylinderGeometry(0.6, 0.6, 1.1, 20).rotateZ(Math.PI / 2), [0, 0.6, 0], 'paper', false, [0, 0, 0], true)
    for (const u of [-0.3, 0.3]) g.line(Array.from({ length: 17 }, (_, i): Point => [u, 0.6 + Math.sin(i / 16 * Math.PI * 2) * 0.61, Math.cos(i / 16 * Math.PI * 2) * 0.61]), 'mesh')
    for (let i = 0; i < 6; i++) g.line([[0.56, 0.6, 0], [0.56, 0.6 + Math.sin(i) * 0.45, Math.cos(i) * 0.45]], 'mesh')
    g.finish()
  }

  /**
   * A hotel's reception counter, `length` long: a panelled front to chest height, a top with a service bell and the
   * guest book, and a shelf behind for the clerk. `radio` puts the front desk's radio on it.
   */
  counter(x: number, z: number, floor: number, angle = 0, length = 2.6, radio = false) {
    const g = this.item('reception-counter', x, z, floor, angle)
    g.box(length, 1.05, 0.12, 0, 0.525, 0.25, 'roof', 'detail')
    g.box(length + 0.1, 0.06, 0.72, 0, 1.08, 0, 'paper', 'detail')
    g.box(length, 0.06, 0.45, 0, 0.75, -0.08, 'paper', 'detail')
    for (const sx of [-1, 1]) g.box(0.08, 1.05, 0.6, sx * (length / 2 - 0.04), 0.525, 0, 'roof', 'detail')
    for (let u = -length / 2 + 0.45; u < length / 2 - 0.2; u += 0.65) g.line([[u, 0.12, 0.315], [u, 0.95, 0.315], [u + 0.45, 0.95, 0.315], [u + 0.45, 0.12, 0.315]], 'mesh', true)
    // The bell, and the open guest book.
    g.solid(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), [length / 2 - 0.35, 1.11, 0.15], 'paper', false, [0, 0, 0], true)
    g.box(0.5, 0.02, 0.32, -0.2, 1.12, 0.1, 'paper', 'detail', [0, 0.15, 0])
    g.line([[-0.2, 1.135, -0.05], [-0.2, 1.135, 0.25]], 'detail')
    if (radio) {
      const set = this.radio()
      set.position.set(length / 2 - 0.8, 1.11, -0.1)
      g.add(set)
    }
    g.finish()
  }

  /** The key board behind a reception: a row of numbered hooks with keys and tags, and pigeonholes for post. */
  keyRack(x: number, z: number, floor: number, angle = 0) {
    const g = this.item('key-rack', x, z, floor, angle)
    g.box(1.3, 0.9, 0.06, 0, 1.75, 0, 'roof', 'detail')
    for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {
      const sx = -0.5 + i * 0.2, sy = 2.0 - row * 0.28
      g.beam([sx, sy, 0.03], [sx, sy, 0.08], 0.015, 'paper', false)
      if ((i + row * 2) % 5 !== 3) g.box(0.05, 0.12, 0.012, sx, sy - 0.1, 0.075, 'paper', 'detail')
    }
    for (let i = 0; i < 4; i++) g.box(0.26, 0.2, 0.05, -0.39 + i * 0.26, 1.42, 0.04, 'paper', 'detail')
    g.finish()
  }

  /** A low sideboard: cupboard doors, a runner on top with two candlesticks and a stack of plates. */
  sideboard(x: number, z: number, floor: number, angle = 0, length = 2) {
    const g = this.item('sideboard', x, z, floor, angle)
    g.box(length, 0.82, 0.5, 0, 0.45, 0, 'roof', 'detail')
    g.box(length + 0.06, 0.04, 0.54, 0, 0.88, 0, 'paper', 'detail')
    for (const sx of [-1, 1]) g.beam([sx * (length / 2 - 0.08), 0, 0.18], [sx * (length / 2 - 0.08), 0.06, 0.18], 0.05, 'paper', false)
    for (let i = 1; i < 4; i++) g.line([[-length / 2 + length * i / 4, 0.12, 0.255], [-length / 2 + length * i / 4, 0.78, 0.255]], 'detail')
    g.box(length * 0.7, 0.008, 0.3, 0, 0.904, 0, 'paper', 'detail')
    for (const sx of [-length * 0.32, length * 0.32]) {
      g.solid(new THREE.CylinderGeometry(0.025, 0.06, 0.28, 10), [sx, 1.04, 0], 'paper', false, [0, 0, 0], true)
      g.beam([sx, 1.18, 0], [sx, 1.3, 0], 0.03, 'paper', false)
    }
    for (let i = 0; i < 4; i++) g.solid(new THREE.CylinderGeometry(0.13, 0.11, 0.02, 18), [0.1, 0.915 + i * 0.022, 0], 'paper', false, [0, 0, 0], true)
    g.finish()
  }

  /** Planks nailed across a window from inside, `width` wide, its middle `centre` m up: a room made into a cell. */
  boards(x: number, z: number, floor: number, angle = 0, width = 1.5, centre = 1.65) {
    const g = this.item('boarded-window', x, z, floor, angle)
    for (const [dy, tilt] of [[-0.45, 0.06], [0, -0.1], [0.42, 0.04]] as [number, number][]) {
      g.box(width + 0.2, 0.17, 0.035, 0, centre + dy, 0, 'roof', 'detail', [0, 0, tilt])
      for (const sx of [-1, 1]) g.box(0.025, 0.025, 0.02, sx * (width / 2 - 0.02), centre + dy + sx * tilt * width / 2, 0.025, 'paper', false)
    }
    g.finish()
  }

  /** A suitcase standing on its end, handle up. */
  suitcase(x: number, z: number, floor: number, angle = 0) {
    const g = this.item('suitcase', x, z, floor, angle)
    g.box(0.5, 0.7, 0.2, 0, 0.36, 0, 'roof', 'detail')
    g.line([[-0.25, 0.36, 0.101], [0.25, 0.36, 0.101]], 'mesh')
    g.beam([-0.1, 0.71, 0], [-0.1, 0.78, 0], 0.025, 'paper', false)
    g.beam([0.1, 0.71, 0], [0.1, 0.78, 0], 0.025, 'paper', false)
    g.beam([-0.1, 0.78, 0], [0.1, 0.78, 0], 0.025, 'paper', false)
    g.finish()
  }
}

export function militaryInterior(name: string, type: string, w: number, d: number, floor: number) {
  const g = new Furnishing(`${name} · furnished interior`)
  const back = -d / 2 + 0.7
  const left = -w / 2 + 1.5, right = w / 2 - 1.5
  let variant: string

  if (type === 'warehouse') {
    variant = 'quartermaster stores'
    const count = Math.max(2, Math.min(8, Math.floor((w - 4) / 6)))
    for (let i = 0; i < count; i++) {
      const x = -w / 2 + 2.5 + (w - 5) * i / (count - 1)
      g.shelf(x, back, floor)
      g.pallet(x, -d / 2 + 3.1, floor, i % 2 === 0)
    }
    g.desk(left + 0.5, d / 2 - 1.3, floor, Math.PI)
    g.chair(left + 0.5, d / 2 - 2.3, floor)
    g.lockers(right, d / 2 - 0.75, floor, 3, Math.PI)
    // Quest crates: one beside the lockers, one against the west end wall.
    g.crate(right - 1.6, d / 2 - 0.75, floor, 0.1)
    g.crate(-w / 2 + 0.95, 0.2, floor, -0.12)
  } else if (/administration|service/i.test(name) && type !== 'utility') {
    variant = 'administration and briefing room'
    for (const x of [left + 1, right - 1]) {
      g.desk(x, back + 0.3, floor, 0, true)
      g.chair(x, back + 1.35, floor, Math.PI)
    }
    g.table(0, -0.5, floor, 4.2)
    for (const x of [-1.3, 0, 1.3]) {
      g.chair(x, -1.75, floor)
      g.chair(x, 0.8, floor, Math.PI)
    }
    g.wallMap(0, -d / 2 + 0.28, floor)
    g.lockers(left + 0.2, d / 2 - 0.7, floor, 4, Math.PI)
    g.shelf(right - 0.2, d / 2 - 0.8, floor, Math.PI)
  } else if (/gatehouse/i.test(name)) {
    variant = 'guard room and radio post'
    g.desk(left + 0.7, back + 0.1, floor, 0, true)
    g.chair(left + 0.7, back + 1.2, floor, Math.PI)
    g.wallMap(1, -d / 2 + 0.28, floor)
    g.lockers(right - 0.2, back, floor, 3)
    g.shelf(right - 0.2, d / 2 - 0.8, floor, Math.PI)
    g.bunk(left - 0.1, d / 2 - 2, floor, Math.PI / 2, true)
  } else if (/hut B/i.test(name)) {
    variant = 'field medical station'
    g.bunk(left, 0, floor, 0, true)
    g.bunk(left + 2.25, 0, floor, 0, true)
    g.desk(right - 0.5, back + 0.3, floor, 0, true)
    g.chair(right - 0.5, back + 1.4, floor, Math.PI)
    g.lockers(right - 0.3, d / 2 - 0.7, floor, 3, Math.PI)
    const cabinet = g.item('medical-cabinet', 0, back, floor)
    cabinet.box(1.5, 1.7, 0.55, 0, 0.9, 0, 'paper', 'detail')
    cabinet.box(0.45, 0.13, 0.03, 0, 1.19, 0.29, 'green', 'detail')
    cabinet.box(0.13, 0.45, 0.035, 0, 1.19, 0.293, 'green', 'detail')
    cabinet.finish()
  } else if (type === 'utility') {
    variant = /hut A/i.test(name) ? 'signals equipment and repair' : 'maintenance and equipment room'
    g.workbench(left + 1, back + 0.25, floor)
    g.shelf(right - 0.3, back + 0.1, floor)
    g.lockers(left, d / 2 - 0.75, floor, 3, Math.PI)
    if (w > 12) {
      g.desk(right - 0.3, d / 2 - 1.1, floor, Math.PI, true)
      g.chair(right - 0.3, d / 2 - 2.2, floor)
    } else {
      g.pallet(right, d / 2 - 1.1, floor)
      g.crate(0.4, back + 0.4, floor, 0.08)
    }
  } else {
    variant = 'barracks sleeping quarters'
    const count = Math.max(2, Math.min(5, Math.floor((w - 3) / 3.3)))
    const rowZ = -d / 2 + 1.65
    for (let i = 0; i < count; i++) {
      const x = left + (right - left) * i / (count - 1)
      g.bunk(x, rowZ, floor)
    }
    g.lockers(left + 0.6, d / 2 - 0.7, floor, Math.min(5, count), Math.PI)
    g.shelf(right - 0.7, d / 2 - 0.8, floor, Math.PI)
    g.crate(w / 2 - 0.75, d * 0.08, floor, 0.15)
    if (d > 9) {
      g.table(0, 0.5, floor, 2.8)
      for (const x of [-0.85, 0.85]) {
        g.chair(x, -0.7, floor)
        g.chair(x, 1.7, floor, Math.PI)
      }
    }
  }

  g.userData.interiorVariant = variant
  g.userData.furnitureCounts = g.counts
  g.userData.roomBounds = { min: [-w / 2 + 0.2, floor, -d / 2 + 0.2], max: [w / 2 - 0.2, floor + 2.7, d / 2 - 0.2] }
  g.userData.clearEntryAisle = 1.6
  return g.finish()
}
