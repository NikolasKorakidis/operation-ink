import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { createPenLines } from '../render/ballpoint'

/**
 * The first-person right hand around the knife handle, in the knife's frame: +Z along the blade, +Y the
 * spine, origin at the middle of the handle. The hold turns the +X side to the player, like Counter-Strike's
 * default knife: the palm sits against the spine side with the knuckles in a column at its front edge,
 * the four fingers wrap across the player's side as stacked bands and on round the edge, and the thumb
 * comes over the top to lie across the index finger under the guard. The wrist leaves the heel of the
 * hand below. Every piece is a smooth closed shape drawn like the arms (paper fill, one pen outline);
 * where they overlap, the outlines draw the creases between them.
 */
export const KNIFE_HAND = {
  /** Where the forearm enters: the heel of the hand, below the little finger on the spine side. */
  wrist: new THREE.Vector3(0.002, 0.03, -0.05),
  cuff: { radius: 0.043, length: 0.05 },
}

type V3 = [number, number, number]
const v = (point: V3) => new THREE.Vector3(...point)

/**
 * A smooth tube along a curve with rounded ends, tapering by `radius(t)` (t = 0..1 along the curve).
 * One closed surface, so a single pen silhouette outlines it cleanly.
 */
function limb(points: THREE.Vector3[], radius: (t: number) => number, segments = 24, sides = 16) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
  const { tangents, normals, binormals } = curve.computeFrenetFrames(segments, false)
  const rings: THREE.Vector3[][] = []
  const ring = (center: THREE.Vector3, normal: THREE.Vector3, binormal: THREE.Vector3, r: number) => {
    rings.push(Array.from({ length: sides }, (_, s) => {
      const angle = s / sides * Math.PI * 2
      return center.clone().addScaledVector(normal, Math.cos(angle) * r).addScaledVector(binormal, Math.sin(angle) * r)
    }))
  }
  const caps = 5, first = curve.getPointAt(0), last = curve.getPointAt(1), r0 = radius(0), r1 = radius(1)
  for (let i = caps - 1; i >= 1; i--) {
    const angle = i / caps * Math.PI / 2
    ring(first.clone().addScaledVector(tangents[0], -r0 * Math.sin(angle)), normals[0], binormals[0], r0 * Math.cos(angle))
  }
  for (let i = 0; i <= segments; i++) ring(curve.getPointAt(i / segments), normals[i], binormals[i], radius(i / segments))
  for (let i = 1; i < caps; i++) {
    const angle = i / caps * Math.PI / 2
    ring(last.clone().addScaledVector(tangents[segments], r1 * Math.sin(angle)), normals[segments], binormals[segments], r1 * Math.cos(angle))
  }
  const positions = [first.clone().addScaledVector(tangents[0], -r0), ...rings.flat(), last.clone().addScaledVector(tangents[segments], r1)]
  const index: number[] = [], at = (r: number, s: number) => 1 + r * sides + (s % sides), end = positions.length - 1
  for (let s = 0; s < sides; s++) {
    index.push(0, at(0, s + 1), at(0, s))
    for (let r = 0; r < rings.length - 1; r++) index.push(at(r, s), at(r, s + 1), at(r + 1, s), at(r, s + 1), at(r + 1, s + 1), at(r + 1, s))
    index.push(end, at(rings.length - 1, s), at(rings.length - 1, s + 1))
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(positions)
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}

/** A rounded block (a sphere pushed toward a box), welded so its normals and outline hull stay closed. */
function block(center: V3, half: V3, squareness = 0.55) {
  const sphere = new THREE.SphereGeometry(1, 32, 24)
  const position = sphere.attributes.position
  const power = (value: number) => Math.sign(value) * Math.abs(value) ** squareness
  for (let i = 0; i < position.count; i++) {
    position.setXYZ(i, power(position.getX(i)) * half[0] + center[0], power(position.getY(i)) * half[1] + center[1],
      power(position.getZ(i)) * half[2] + center[2])
  }
  sphere.deleteAttribute('normal')
  sphere.deleteAttribute('uv')
  const welded = mergeVertices(sphere)
  sphere.dispose()
  welded.computeVertexNormals()
  return welded
}

/** A point at `angle` degrees round the handle (0 = +X, the player's side; -90 = the edge), `reach` from its axis. */
const around = (angle: number, reach: number, z: number) =>
  new THREE.Vector3(Math.cos(THREE.MathUtils.degToRad(angle)) * reach, Math.sin(THREE.MathUtils.degToRad(angle)) * reach, z)

/** Index to little finger: height along the handle, thickness, and length when straightened. */
const FINGERS: { z: number; radius: number; length: number }[] = [
  { z: 0.043, radius: 0.0102, length: 0.078 },
  { z: 0.023, radius: 0.0106, length: 0.084 },
  { z: 0.003, radius: 0.0101, length: 0.078 },
  { z: -0.016, radius: 0.0088, length: 0.064 },
]

export type KnifeHand = {
  root: THREE.Group
  /**
   * 0 is a closed grip; past halfway the fingers straighten and let go of the handle, for tosses and
   * spins (a two-drawing cut, like a cartoon). `keepIndex` leaves the index finger curled as a pivot.
   */
  setOpen(open: number, keepIndex?: boolean): void
  dispose(): void
}

export function buildKnifeHand(shape: (geometry: THREE.BufferGeometry) => THREE.Mesh): KnifeHand {
  const root = new THREE.Group()
  root.name = 'Right hand around the knife handle'
  const geometries: THREE.BufferGeometry[] = []
  const add = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, name: string) => {
    geometries.push(geometry)
    const mesh = shape(geometry)
    mesh.name = name
    parent.add(mesh)
    return mesh
  }
  // Palm and back of the hand, against the spine side of the handle, and the heel it narrows into.
  add(root, block([0.002, 0.035, 0.012], [0.024, 0.014, 0.043]), 'Knife palm')
  add(root, block([0.0, 0.03, -0.03], [0.021, 0.02, 0.026], 0.8), 'Heel of the knife hand')
  const fingers = FINGERS.map(({ z, radius }, index) => {
    // Each finger leaves its knuckle at the front edge of the palm, crosses the player's side and curls on round the edge.
    const knuckle = around(46, 0.036, z)
    const finger = new THREE.Group()
    finger.name = `Knife finger ${index + 1}`
    finger.position.copy(knuckle)
    const path = [around(46, 0.036, z), around(8, 0.029, z - 0.001), around(-40, 0.027, z - 0.002),
      around(-95, 0.026, z - 0.002), around(-150, 0.024, z - 0.001)].map(point => point.sub(knuckle))
    const curled = new THREE.Group()
    add(curled, limb(path, t => radius * (1.1 - 0.28 * t)), `Knife finger ${index + 1} surface`)
    // Straightened: out past the edge side toward the crosshair, fanning a little apart.
    const reach = FINGERS[index].length, fan = (index - 1.5) * 0.008
    const straight = [new THREE.Vector3(), new THREE.Vector3(0.012, -reach * 0.4, fan * 0.5),
      new THREE.Vector3(0.02, -reach * 0.75, fan), new THREE.Vector3(0.019, -reach, fan * 1.4)]
    const opened = new THREE.Group()
    add(opened, limb(straight, t => radius * (1.1 - 0.25 * t)), `Knife finger ${index + 1} open`)
    opened.visible = false
    finger.add(curled, opened)
    // The crease above each lower finger, drawn in the valley between it and the one above, so the
    // fingers read as separate bands across the front. It moves with the finger when the hand opens.
    if (index > 0) {
      const top = z + radius * 0.9
      const crease = [[40, 0.0395], [20, 0.0355], [0, 0.0335], [-25, 0.032], [-55, 0.031]]
        .map(([angle, reach]) => around(angle, reach, top).sub(knuckle))
      const line = createPenLines(crease, 941 + index, 'detail', 1.6)
      geometries.push(line.geometry)
      curled.add(line)
    }
    root.add(finger)
    return { finger, curled, opened }
  })
  // Thumb: from behind the palm, over the top and down across the index finger, its tip past the edge side.
  add(root, limb([v([-0.016, 0.034, 0.03]), v([-0.002, 0.036, 0.052]), v([0.026, 0.018, 0.058]), v([0.036, -0.012, 0.052])],
    t => 0.0122 * (1 - 0.2 * t)), 'Knife thumb')
  return {
    root,
    setOpen(open: number, keepIndex = false) {
      for (const [index, { finger, curled, opened }] of fingers.entries()) {
        const amount = keepIndex && index === 0 ? 0 : open
        opened.visible = amount >= 0.5
        curled.visible = !opened.visible
        // Ease into and out of the cut with a small swing about the knuckle.
        finger.rotation.z = (opened.visible ? amount - 1 : amount) * 0.35
      }
    },
    dispose() { for (const geometry of geometries) geometry.dispose() },
  }
}
