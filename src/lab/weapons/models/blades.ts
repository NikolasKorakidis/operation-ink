import * as THREE from 'three'
import { box, dark, gun, metal, part, path, tube } from './common'

/** Extrude a side silhouette across the blade's thickness. Points are [Z, Y], like the long-gun stocks. */
function profile(points: [number, number][], thickness: number) {
  const shape = new THREE.Shape()
  points.forEach(([z, y], i) => i ? shape.lineTo(-z, y) : shape.moveTo(-z, y))
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false })
  geometry.rotateY(Math.PI / 2).translate(-thickness / 2, 0, 0)
  return part(geometry, metal, [0, 0, 0])
}

/**
 * A big survival bowie in the "Rambo" style: clip point, saw-toothed spine, a straight cross guard,
 * a cord-wrapped hollow handle and a screw-cap pommel. Held like a pistol grip; the edge faces down.
 */
export function buildKnife() {
  return gun('knife', 'pistol', false, [0, 0.004, 0.318], [0, 0, 0], g => {
    const guard = 0.068, tip = 0.318
    // Edge runs along the bottom and sweeps up into the clip point; saw teeth cut the spine.
    const blade: [number, number][] = [[guard, -0.017], [0.11, -0.02], [0.2, -0.021], [0.262, -0.015], [0.296, -0.006], [tip, 0.004],
      [0.278, 0.017], [0.245, 0.023]]
    for (let z = 0.214; z > 0.1; z -= 0.0085) blade.push([z, 0.0285], [z - 0.0042, 0.023])
    blade.push([0.092, 0.023], [guard, 0.022])
    g.add(profile(blade, 0.0065))
    // Fuller groove and the honed bevel line, drawn on both faces.
    for (const side of [-1, 1]) {
      const x = side * 0.0034
      g.add(path([new THREE.Vector3(x, 0.006, 0.082), new THREE.Vector3(x, 0.006, 0.232)], 17 + side, 1.3))
      g.add(path([new THREE.Vector3(x, -0.01, 0.075), new THREE.Vector3(x, -0.012, 0.205), new THREE.Vector3(x, -0.006, 0.27),
        new THREE.Vector3(x, 0.002, 0.304)], 23 + side, 1))
    }
    // Straight cross guard with rounded quillon ends.
    g.add(box(0.016, 0.086, 0.012, [0, 0.003, guard - 0.004], dark))
    for (const end of [-1, 1]) g.add(part(new THREE.SphereGeometry(0.0095, 12, 8), dark, [0, 0.003 + end * 0.043, guard - 0.004]))
    // Hollow handle: a plain tube wrapped in cord, capped by a knurled pommel.
    g.add(tube(0.0155, 0.118, [0, 0, 0.003], dark))
    for (let z = -0.048; z <= 0.054; z += 0.0085) {
      const ring = Array.from({ length: 13 }, (_, i) => {
        const angle = i / 12 * Math.PI * 2
        return new THREE.Vector3(Math.cos(angle) * 0.0162, Math.sin(angle) * 0.0162, z + i / 12 * 0.0045)
      })
      g.add(path(ring, Math.round(z * 1000) + 101, 0.9))
    }
    g.add(tube(0.019, 0.022, [0, 0, -0.068], metal))
    g.add(tube(0.012, 0.008, [0, 0, -0.082], dark))
  })
}
