import * as THREE from 'three'
import { NEON_GREEN, neonSign } from '../render/neon-sign'

/**
 * Per-door overrides: sign letter height, how far its middle sits above the door's top, and `always` to sign it
 * even when it is its building's only way out.
 */
export type ExitSignSpec = { capHeight?: number; lift?: number; always?: boolean }

const EXIT = { capHeight: 0.22, gap: 0.14, light: { intensity: 3, range: 5.5 } } as const

/** The building a door belongs to: its nearest ancestor with a footprint. */
function buildingOf(door: THREE.Object3D) {
  for (let node = door.parent; node; node = node.parent) if (node.userData.footprint) return node
  return null
}

/**
 * Hang a green neon EXIT sign over the inside of the doors marked `exit` (see createDoor), on whatever wall,
 * lintel or beam is above it. The inside is the door's local -Z. Only buildings with more than one way out are
 * signed, plus mission sites (`userData.missionSite`: cameras, the hostage) and doors marked `always`.
 * Call once, after the whole world is built; returns the signs.
 */
export function addExitSigns(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const doors: THREE.Object3D[] = [], solids: THREE.Mesh[] = []
  root.traverse(object => {
    if (object.userData.kind === 'door' && object.userData.exit) doors.push(object)
    const mesh = object as THREE.Mesh, material = mesh.material as THREE.Material | undefined
    if (mesh.isMesh && material && (material as THREE.MeshBasicMaterial).isMeshBasicMaterial && material.visible && !material.transparent) solids.push(mesh)
  })
  const exitCount = new Map<THREE.Object3D | null, number>()
  for (const door of doors) exitCount.set(buildingOf(door), (exitCount.get(buildingOf(door)) ?? 0) + 1)
  const signed = doors.filter(door => {
    const building = buildingOf(door)
    return door.userData.exit.always || building?.userData.missionSite || (building && exitCount.get(building)! > 1)
  })
  const ray = new THREE.Raycaster(), signs: THREE.Object3D[] = []
  const inside = (object: THREE.Object3D, door: THREE.Object3D) => {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) if (node === door || node.userData.neonLight) return true
    return false
  }
  for (const door of signed) {
    const spec: ExitSignSpec = typeof door.userData.exit === 'object' ? door.userData.exit : {}
    const capHeight = spec.capHeight ?? EXIT.capHeight
    const y = door.userData.height + (spec.lift ?? EXIT.gap + capHeight / 2)
    // Look from inside the room back toward the doorway, just above the door.
    const origin = door.localToWorld(new THREE.Vector3(0, y, -1.5))
    const toWall = new THREE.Vector3(0, 0, 1).transformDirection(door.matrixWorld)
    ray.set(origin, toWall)
    ray.far = 2
    const hit = ray.intersectObjects(solids, false).find(candidate => !inside(candidate.object, door))
    if (!hit) continue
    // Bigger signs carry more tube, so they give more light and reach further.
    const scale = capHeight / EXIT.capHeight
    const light = { intensity: EXIT.light.intensity * scale, range: Math.min(10, EXIT.light.range * Math.sqrt(scale)) }
    const sign = neonSign('EXIT', [0, 0, 0], 0, { capHeight, color: NEON_GREEN, light })
    sign.name = `${door.name} · EXIT sign`
    sign.userData.cutaway = true
    const parent = door.parent ?? root
    const world = new THREE.Matrix4().compose(hit.point.addScaledVector(toWall, -0.003),
      door.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)),
      new THREE.Vector3(1, 1, 1))
    new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(world).decompose(sign.position, sign.quaternion, sign.scale)
    parent.add(sign)
    sign.updateMatrixWorld(true)
    signs.push(sign)
  }
  return signs
}
