import * as THREE from 'three'
import { Draft, type Point } from '../render/ink'
import { penRandom, penSeed } from '../render/ballpoint'

export const treeSeed = (x: number, z: number) => penSeed(`pine:${x}:${z}`)
export const treeRadius = (height: number) => height * .30

/** The original three-tier pine, with small, repeatable variations in its proportions. `base` is the ground height. */
export function drawPine(g: Draft, x: number, z: number, maxHeight: number, seed: number, base = 0) {
  const random = penRandom(seed)
  const range = (low: number, high: number) => low + random() * (high - low)
  const height = maxHeight * range(.88, 1)
  const width = range(.78, 1)
  const leanX = range(-.018, .018), leanZ = range(-.018, .018)
  const point = (px: number, py: number, pz: number): Point =>
    [x + height * (px + leanX * py), base + height * py, z + height * (pz + leanZ * py)]

  const trunkRadius = range(.015, .021)
  const trunk = new THREE.CylinderGeometry(trunkRadius * .68, trunkRadius, .43, 20)
  const trunkVertices = trunk.getAttribute('position')
  for (let i = 0; i < trunkVertices.count; i++) {
    trunkVertices.setXYZ(i, ...point(trunkVertices.getX(i), trunkVertices.getY(i) + .215, trunkVertices.getZ(i)))
  }
  trunk.computeVertexNormals()
  g.solid(trunk, [0, 0, 0], 'paper', false, [0, 0, 0], true)
  g.ring(trunkRadius * height, base, x, z, 'landscape', 24)

  for (let tier = 0; tier < 3; tier++) {
    const radius = (.255 - tier * .052) * width * range(.93, 1.04)
    const bottom = [.125, .3475, .57][tier] + range(-.016, .016)
    const top = tier === 2 ? 1 : [.635, .79][tier] + range(-.022, .022)
    const phase = range(0, Math.PI * 2)
    const oval = range(.91, 1)
    // Broad, gentle asymmetry keeps the familiar conical silhouette.
    const spread = (angle: number) => 1 + .026 * Math.sin(angle * 3 + phase) + .012 * Math.sin(angle * 7 - phase)
    const rimY = (angle: number) => .006 * Math.sin(angle * 5 + phase)
    const surface = (angle: number, t: number, lift = 0): Point => {
      const r = radius * t * spread(angle) + lift
      return point(Math.cos(angle) * r, top + (bottom - top) * t + rimY(angle) * t,
        Math.sin(angle) * r * oval)
    }

    const cone = new THREE.ConeGeometry(1, 1, 40)
    const vertices = cone.getAttribute('position')
    for (let i = 0; i < vertices.count; i++) {
      const px = vertices.getX(i), pz = vertices.getZ(i)
      const t = .5 - vertices.getY(i)
      // Keep the cap centre on the trunk axis while deforming its perimeter.
      const p = Math.hypot(px, pz) < .001 && t > .5
        ? point(0, bottom, 0) : surface(Math.atan2(pz, px), t)
      vertices.setXYZ(i, ...p)
    }
    cone.computeVertexNormals()
    g.solid(cone, [0, 0, 0], 'green', false, [0, 0, 0], true)

    // Preserve the original loose downward branch marks and scalloped tier rims.
    const count = 7 + Math.floor(random() * 3)
    for (let branch = 0; branch < count; branch++) {
      const angle = branch / count * Math.PI * 2 + phase
      const trail: Point[] = []
      for (let step = 0; step < 5; step++) {
        const t = .14 + step * .205
        trail.push(surface(angle + (step % 2 ? .075 : -.055), t, .003))
      }
      g.line(trail, 'landscape')
      const tip = trail[trail.length - 1]
      const end = surface(angle, 1.025, .002)
      g.line([tip, end], 'landscape')
    }
    g.line(Array.from({ length: 40 }, (_, i) => surface(i / 40 * Math.PI * 2, 1, .001)), 'landscape', true)
  }
  return height
}

/**
 * A broadleaf tree, as the town plan draws them: a short trunk and a round, lumpy crown outlined in pen with a few
 * loose scallops for the leaves. `base` is the ground height. Returns the tree's height.
 */
export function drawOak(g: Draft, x: number, z: number, maxHeight: number, seed: number, base = 0) {
  const random = penRandom(seed)
  const range = (low: number, high: number) => low + random() * (high - low)
  const height = maxHeight * range(.85, 1)
  const trunkTop = height * range(.36, .44), radius = height * range(.3, .36)
  const centre = trunkTop + radius * .78
  const trunk = new THREE.CylinderGeometry(height * .028, height * .042, trunkTop + radius * .3, 16)
  g.solid(trunk, [x, base + (trunkTop + radius * .3) / 2, z], 'paper', false, [0, 0, 0], true)
  g.ring(height * .042, base, x, z, 'landscape', 20)
  // The crown: a sphere pushed in and out a little so it reads as foliage, not a ball.
  const crown = new THREE.IcosahedronGeometry(1, 3)
  const vertices = crown.getAttribute('position')
  const phase = range(0, Math.PI * 2), squash = range(.82, .95)
  for (let i = 0; i < vertices.count; i++) {
    const vx = vertices.getX(i), vy = vertices.getY(i), vz = vertices.getZ(i)
    const angle = Math.atan2(vz, vx)
    const lump = 1 + .07 * Math.sin(angle * 5 + phase + vy * 3) + .04 * Math.sin(vy * 7 - phase)
    vertices.setXYZ(i, x + vx * radius * lump, base + centre + vy * radius * squash * lump, z + vz * radius * lump)
  }
  crown.computeVertexNormals()
  g.solid(crown, [0, 0, 0], 'green', false, [0, 0, 0], true)
  // Leaf scallops: short curved strokes around the crown's waist and upper half.
  for (let ring = 0; ring < 3; ring++) {
    const y = base + centre + radius * squash * [-.15, .25, .6][ring], r = radius * [1.01, .97, .78][ring]
    const count = 9 - ring * 2
    for (let k = 0; k < count; k++) {
      const a = k / count * Math.PI * 2 + phase + ring
      g.line([0, .1, .2].map(t => [x + Math.cos(a + t) * r, y - Math.sin(t * 10) * .12, z + Math.sin(a + t) * r] as Point), 'landscape')
    }
  }
  return height
}
