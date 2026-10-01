import * as THREE from 'three'
import { Draft, type Point } from '../render/ink'
import { penRandom } from '../render/ballpoint'

/** A path on the ground plan: [x, z] points in metres. */
export type PlanPath = [number, number][]

/** The nearest distance from (x, z) to a path, and how far along it (0..1 of the nearest segment's index range). */
export function pathDistance(path: PlanPath, x: number, z: number) {
  let best = Infinity, along = 0
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i]
    const dx = bx - ax, dz = bz - az, length2 = dx * dx + dz * dz
    const t = length2 ? THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / length2, 0, 1) : 0
    const distance = Math.hypot(x - (ax + dx * t), z - (az + dz * t))
    if (distance < best) { best = distance; along = i - 1 + t }
  }
  return { distance: best, along }
}

/** Points along a path every `spacing` metres, each with its unit normal (to the left of travel). */
export function samplePath(path: PlanPath, spacing: number) {
  const out: { x: number; z: number; nx: number; nz: number }[] = []
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i]
    const length = Math.hypot(bx - ax, bz - az), count = Math.max(1, Math.round(length / spacing))
    const nx = -(bz - az) / length, nz = (bx - ax) / length
    for (let k = i === 1 ? 0 : 1; k <= count; k++) {
      const t = k / count
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, nx, nz })
    }
  }
  // Smooth the normals at the bends.
  return out.map((p, i) => {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)]
    const nx = a.nx + p.nx + b.nx, nz = a.nz + p.nz + b.nz, l = Math.hypot(nx, nz) || 1
    return { ...p, nx: nx / l, nz: nz / l }
  })
}

/**
 * The ground as one sheet of paper shaped by `height(x, z)`: a grid every `step` metres over `bounds`. It is
 * solid (players and guards walk on it, bullets stop on it) and has no ink of its own; draw banks, contours and
 * roads over it. Anything standing on it should sit at height(x, z).
 */
export function terrain(name: string, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, step: number, height: (x: number, z: number) => number) {
  const columns = Math.ceil((bounds.maxX - bounds.minX) / step), rows = Math.ceil((bounds.maxZ - bounds.minZ) / step)
  const positions: number[] = [], indices: number[] = []
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= columns; c++) {
    const x = bounds.minX + c * step, z = bounds.minZ + r * step
    positions.push(x, height(x, z), z)
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const a = r * (columns + 1) + c, b = a + 1, d = a + columns + 1, e = d + 1
    indices.push(a, d, b, b, d, e)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const g = new Draft(name)
  g.userData.kind = 'terrain'
  g.solid(geometry, [0, 0, 0], 'paper', false)
  return g
}

/**
 * Water along a path: a flat sheet `halfWidth` either side of it at `level`, with the pen's ripples and the
 * water's edge on both banks. It never collides; pair it with a channel in the terrain and bankBarrier().
 */
export function waterSurface(name: string, path: PlanPath, halfWidth: number, level: number, seed = 7) {
  const g = new Draft(name)
  g.userData.noCollision = true
  g.userData.kind = 'water'
  const samples = samplePath(path, 1.5)
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i]
    const corner = (p: typeof a, side: number): Point => [p.x + p.nx * halfWidth * side, level, p.z + p.nz * halfWidth * side]
    g.face([corner(a, -1), corner(b, -1), corner(b, 1), corner(a, 1)], 'paper', false)
  }
  for (const side of [-1, 1]) g.line(samples.map(p => [p.x + p.nx * halfWidth * side, level + 0.01, p.z + p.nz * halfWidth * side] as Point), 'landscape')
  // Ripples: short wavy strokes scattered across the water, following the flow.
  const random = penRandom(seed)
  for (let i = 2; i < samples.length - 2; i += 1) {
    if (random() < 0.35) continue
    const p = samples[i], q = samples[i + 1]
    const offset = (random() * 2 - 1) * halfWidth * 0.75
    const dx = q.x - p.x, dz = q.z - p.z
    const stroke: Point[] = []
    for (let k = 0; k <= 4; k++) {
      const t = k / 4, wave = Math.sin(t * Math.PI * 2 + random()) * 0.12
      stroke.push([p.x + dx * t * 1.4 + p.nx * (offset + wave), level + 0.015, p.z + dz * t * 1.4 + p.nz * (offset + wave)])
    }
    g.line(stroke, 'mesh')
  }
  return g.finish()
}

/**
 * Invisible walls along both banks of a path, `offset` metres out, `height` tall, so the water can only be
 * crossed where `open(x, z)` is true (a bridge). They block walking, not sight or shots.
 */
export function bankBarrier(name: string, path: PlanPath, offset: number, open: (x: number, z: number) => boolean, height = 2.4) {
  const g = new THREE.Group()
  g.name = name
  const panels: { a: [number, number]; b: [number, number]; height: number; blocksSight: boolean; blocksShots: boolean }[] = []
  const samples = samplePath(path, 2)
  for (const side of [-1, 1]) for (let i = 1; i < samples.length; i++) {
    const a: [number, number] = [samples[i - 1].x + samples[i - 1].nx * offset * side, samples[i - 1].z + samples[i - 1].nz * offset * side]
    const b: [number, number] = [samples[i].x + samples[i].nx * offset * side, samples[i].z + samples[i].nz * offset * side]
    if (open((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue
    panels.push({ a, b, height, blocksSight: false, blocksShots: false })
  }
  // Round the ends of the water too, so it can't be walked into from its tip.
  for (const end of [samples[0], samples[samples.length - 1]]) {
    const ax = end.x + end.nx * offset, az = end.z + end.nz * offset, bx = end.x - end.nx * offset, bz = end.z - end.nz * offset
    panels.push({ a: [ax, az], b: [bx, bz], height, blocksSight: false, blocksShots: false })
  }
  g.userData.collisionPanels = panels
  return g
}

/** Pen lines along a path at ground height: a road's two edges, dashed like the plan, or a single bank line. */
export function groundLine(g: Draft, path: PlanPath, offset: number, height: (x: number, z: number) => number, dash = 0) {
  const samples = samplePath(path, 1)
  for (const side of offset ? [-1, 1] : [0]) {
    let run: Point[] = []
    samples.forEach((p, i) => {
      const x = p.x + p.nx * offset * side, z = p.z + p.nz * offset * side
      run.push([x, height(x, z) + 0.03, z])
      const breakHere = dash > 0 && i % (dash * 2) === dash * 2 - 1
      if (breakHere || i === samples.length - 1) { if (run.length > 1) g.line(run, 'landscape'); run = [] }
      if (dash > 0 && i % (dash * 2) >= dash) run = []
    })
  }
}
