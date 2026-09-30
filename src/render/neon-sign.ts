import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Draft, palette, type Point } from './ink'
import type { NeonLightSpec } from './neon'

/** Security signs. */
export const NEON_BLUE = 0x46b4ff
/** Exit signs: the international "way out" green. */
export const NEON_GREEN = 0x3dff8a

type Stroke = [number, number][]
type Glyph = { width: number; strokes: Stroke[] }

/** Points round an ellipse, degrees measured counter-clockwise from +X. */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number): Stroke {
  const steps = Math.max(2, Math.ceil(Math.abs(to - from) / 12))
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = THREE.MathUtils.degToRad(from + (to - from) * i / steps)
    return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]
  })
}

/**
 * A single-line tube alphabet, cap height 1, baseline 0: each stroke is one bent length of glass, as a neon
 * bender would make it. Only the letters the signs use so far; add more the same way.
 */
const GLYPHS: Record<string, Glyph> = {
  C: { width: 0.62, strokes: [arc(0.33, 0.5, 0.33, 0.5, 48, 312)] },
  E: { width: 0.5, strokes: [[[0.5, 1], [0, 1], [0, 0], [0.5, 0]], [[0, 0.5], [0.4, 0.5]]] },
  I: { width: 0, strokes: [[[0, 1], [0, 0]]] },
  R: { width: 0.56, strokes: [[[0, 0], [0, 1], [0.28, 1], ...arc(0.28, 0.75, 0.26, 0.25, 90, -90), [0, 0.5]], [[0.24, 0.5], [0.56, 0]]] },
  S: { width: 0.58, strokes: [[...arc(0.29, 0.75, 0.28, 0.25, 20, 270), ...arc(0.29, 0.25, 0.29, 0.25, 90, -160)]] },
  T: { width: 0.6, strokes: [[[0, 1], [0.6, 1]], [[0.3, 1], [0.3, 0]]] },
  U: { width: 0.58, strokes: [[[0, 1], ...arc(0.29, 0.29, 0.29, 0.29, 180, 360), [0.58, 1]]] },
  X: { width: 0.58, strokes: [[[0, 1], [0.58, 0]], [[0.58, 1], [0, 0]]] },
  Y: { width: 0.6, strokes: [[[0, 1], [0.3, 0.5], [0.6, 1]], [[0.3, 0.5], [0.3, 0]]] },
}
const LETTER_GAP = 0.3

/** A tube's centre line with every bend rounded off, as glass is heated and bent rather than mitred. */
function bentPath(points: THREE.Vector3[], bend: number) {
  const path = new THREE.CurvePath<THREE.Vector3>()
  let from = points[0]
  for (let i = 1; i < points.length - 1; i++) {
    const corner = points[i], before = points[i - 1], after = points[i + 1]
    const radius = Math.min(bend, corner.distanceTo(before) * 0.45, corner.distanceTo(after) * 0.45)
    const enter = corner.clone().addScaledVector(before.clone().sub(corner).normalize(), radius)
    const leave = corner.clone().addScaledVector(after.clone().sub(corner).normalize(), radius)
    if (from.distanceTo(enter) > 1e-5) path.add(new THREE.LineCurve3(from, enter))
    path.add(new THREE.QuadraticBezierCurve3(enter, corner, leave))
    from = leave
  }
  path.add(new THREE.LineCurve3(from, points[points.length - 1]))
  return path
}

const glassVertex = /* glsl */`
  varying vec3 vNormalView;
  varying vec3 vToEye;
  void main() {
    vec4 view = modelViewMatrix * vec4( position, 1.0 );
    vNormalView = normalize( normalMatrix * normal );
    vToEye = -view.xyz;
    gl_Position = projectionMatrix * view;
  }
`
/** Lit glass: the gas colour, deepening toward the tube's edges, with a thin white-hot line down its middle. */
function tubeMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: { glow: { value: color }, core: { value: color.clone().lerp(new THREE.Color(1, 1, 1), 0.85) } },
    vertexShader: glassVertex,
    fragmentShader: /* glsl */`
      uniform vec3 glow;
      uniform vec3 core;
      varying vec3 vNormalView;
      varying vec3 vToEye;
      void main() {
        float facing = abs( dot( normalize( vNormalView ), normalize( vToEye ) ) );
        gl_FragColor = vec4( mix( glow * mix( 0.7, 1.0, facing ), core, smoothstep( 0.55, 0.95, facing ) * 0.9 ), 1.0 );
        #include <colorspace_fragment>
      }
    `,
  })
}
/** The glowing gas seen around the tube: a soft shell, drawn behind the glass, fading at its rim. */
function haloMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: { glow: { value: color } },
    vertexShader: glassVertex,
    fragmentShader: /* glsl */`
      uniform vec3 glow;
      varying vec3 vNormalView;
      varying vec3 vToEye;
      void main() {
        float facing = abs( dot( normalize( vNormalView ), normalize( vToEye ) ) );
        gl_FragColor = vec4( glow, pow( facing, 1.6 ) * 0.55 );
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide, transparent: true, depthWrite: false,
  })
}
const materials = new Map<number, { tube: THREE.ShaderMaterial; halo: THREE.ShaderMaterial }>()
function glass(color: number) {
  let pair = materials.get(color)
  if (!pair) {
    const linear = new THREE.Color(color)
    pair = { tube: tubeMaterial(linear), halo: haloMaterial(linear) }
    materials.set(color, pair)
  }
  return pair
}
// Painted-out tube returns, electrode boots and support clips. The tubes are the light, so none of this is tinted.
const unlit = (color: number) => Object.assign(new THREE.MeshBasicMaterial({ color }), { defines: { NEON_UNLIT: '' } })
const hardware = { boot: unlit(palette.ink), support: unlit(0x808080) }

export type NeonSignOptions = {
  /** Letter height (m). */
  capHeight?: number
  color?: number
  /** Tube radius (m); real neon glass is 5–8 mm. */
  radius?: number
  /** How far the tubes stand off the wall (m). */
  standoff?: number
  light?: Partial<Pick<NeonLightSpec, 'intensity' | 'range'>>
}

/**
 * A real neon sign on a wall: bent glass tubes spelling `text`, standing off the wall on black supports, their
 * ends painted out and bent back into a slim wall-mounted raceway that holds the transformer. Local +Z faces
 * out of the wall; the origin is on the wall at the middle of the lettering. It is also a real light
 * (`userData.neonLight`, see neon.ts) that lights everything in front of it.
 */
export function neonSign(text: string, position: Point, angle = 0, options: NeonSignOptions = {}) {
  const { capHeight = 0.3, color = NEON_BLUE, standoff = 0.14 } = options
  const radius = options.radius ?? Math.max(0.006, capHeight * 0.04)
  const root = new THREE.Group()
  root.name = `Neon sign · ${text}`
  root.position.set(...position)
  root.rotation.y = angle
  root.userData = { noCollision: true, decorative: true, text }

  const letters = [...text.toUpperCase()].map(char => GLYPHS[char]).filter(Boolean)
  const width = (letters.reduce((sum, glyph) => sum + glyph.width, 0) + LETTER_GAP * (letters.length - 1)) * capHeight
  const raceway = { height: capHeight * 0.34, depth: 0.05 }
  const backAt = (y: number) => Math.abs(y) <= raceway.height / 2 ? raceway.depth : 0
  const tubes: THREE.BufferGeometry[] = [], halos: THREE.BufferGeometry[] = [], boots: THREE.BufferGeometry[] = [], supports: THREE.BufferGeometry[] = []
  // A straight length of rod or tube from `a` to `b`.
  const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    const geometry = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 10, 1)
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()))
    return geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  }
  let x = -width / 2
  letters.forEach((glyph, index) => {
    for (const [strokeIndex, stroke] of glyph.strokes.entries()) {
      // Where two strokes of one letter cross, the second bends over the first.
      const z = standoff + (strokeIndex > 0 && glyph === GLYPHS.X ? radius * 2.4 : 0)
      const points = stroke.map(([u, v]) => new THREE.Vector3(x + u * capHeight, (v - 0.5) * capHeight, z))
        .filter((point, i, all) => i === 0 || point.distanceTo(all[i - 1]) > 1e-4)
      const path = bentPath(points, capHeight * 0.07)
      const segments = Math.max(8, Math.ceil(path.getLength() / 0.012))
      tubes.push(new THREE.TubeGeometry(path, segments, radius, 12, false))
      halos.push(new THREE.TubeGeometry(path, segments, radius * 4.5, 12, false))
      for (const end of [points[0], points[points.length - 1]]) {
        // Round glass end, then the painted-out elbow and electrode boot going back to the wall.
        tubes.push(new THREE.SphereGeometry(radius, 12, 8).translate(end.x, end.y, end.z))
        const back = new THREE.Vector3(end.x, end.y, backAt(end.y))
        supports.push(rod(end, back, radius * 0.7))
        boots.push(rod(back.clone().setZ(back.z + 0.03), back, radius * 1.25))
      }
      // A glass support clip holding the middle of each tube.
      const middle = path.getPointAt(0.5)
      supports.push(rod(new THREE.Vector3(middle.x, middle.y, backAt(middle.y)), middle.clone().setZ(middle.z - radius), 0.0025),
        new THREE.TorusGeometry(radius * 1.2, radius * 0.22, 6, 14).translate(middle.x, middle.y, middle.z - radius * 0.3))
    }
    x += (glyph.width + (index < letters.length - 1 ? LETTER_GAP : 0)) * capHeight
  })
  const { tube, halo } = glass(color)
  const glassMesh = new THREE.Mesh(mergeGeometries(tubes), tube)
  glassMesh.name = `${text} neon tubes`
  const haloMesh = new THREE.Mesh(mergeGeometries(halos), halo)
  haloMesh.name = `${text} neon glow`
  haloMesh.renderOrder = 2
  const bootMesh = new THREE.Mesh(mergeGeometries(boots), hardware.boot)
  bootMesh.name = `${text} neon electrode boots`
  const supportMesh = new THREE.Mesh(mergeGeometries(supports), hardware.support)
  supportMesh.name = `${text} neon supports`
  const box = new Draft(`${text} neon raceway`)
  box.box(width + capHeight * 0.3, raceway.height, raceway.depth, 0, 0, raceway.depth / 2, 'paper', 'detail')
  root.add(box.finish(), bootMesh, supportMesh, glassMesh, haloMesh)
  for (const child of root.children) child.userData.noCollision = true

  const reach = width / 2 - radius
  root.userData.neonLight = {
    start: [-reach, 0, standoff], end: [reach, 0, standoff], color, standoff,
    intensity: 5.5, range: 7, ...options.light,
  } satisfies NeonLightSpec
  return root
}
