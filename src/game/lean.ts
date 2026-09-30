import * as THREE from 'three'
import type { CollisionWorld } from '../player/collision'

/** PUBG-style peeking: how far the head moves sideways (m), how far it tilts (rad), and how fast it gets there. */
export const LEAN = { offset: 0.45, roll: 0.17, rate: 9, wallClearance: 0.15 } as const

/**
 * Holding Q or E leans the view left or right. The lean is applied to the camera for one frame, like the hit
 * reactions, and removed before the controller looks and moves again, so it never accumulates. Walls stop
 * the head moving into them. Reduced Motion keeps the sideways peek but drops the tilt.
 */
export class PlayerLean {
  /** Current lean, -1 (left) to 1 (right), easing toward the held keys. */
  amount = 0
  private applied: { camera: THREE.PerspectiveCamera; offset: THREE.Vector3; roll: number } | null = null

  update(dt: number, target: number) {
    const blend = 1 - Math.exp(-LEAN.rate * Math.max(0, Math.min(dt, 0.1)))
    this.amount += (THREE.MathUtils.clamp(target, -1, 1) - this.amount) * blend
    if (Math.abs(this.amount) < 1e-4 && !target) this.amount = 0
  }

  apply(camera: THREE.PerspectiveCamera, world: Pick<CollisionWorld, 'rayDistance'>, reducedMotion: boolean) {
    this.remove()
    if (!this.amount) return
    const rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
    const right = new THREE.Vector3(Math.cos(rotation.y), 0, -Math.sin(rotation.y))
    const direction = right.clone().multiplyScalar(Math.sign(this.amount))
    const wanted = Math.abs(this.amount) * LEAN.offset
    const room = world.rayDistance(camera.position, direction, wanted + LEAN.wallClearance) - LEAN.wallClearance
    const offset = direction.multiplyScalar(THREE.MathUtils.clamp(room, 0, wanted))
    // Leaning right tilts the view clockwise (negative roll).
    const roll = reducedMotion ? 0 : -this.amount * LEAN.roll
    camera.position.add(offset)
    rotation.z += roll
    camera.quaternion.setFromEuler(rotation)
    camera.updateMatrixWorld(true)
    this.applied = { camera, offset, roll }
  }

  /** Undo the lean but keep anything else that turned the camera meanwhile, such as weapon recoil. */
  remove() {
    if (!this.applied) return
    const { camera, offset, roll } = this.applied
    camera.position.sub(offset)
    const rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
    rotation.z -= roll
    camera.quaternion.setFromEuler(rotation)
    camera.updateMatrixWorld(true)
    this.applied = null
  }

  reset() { this.remove(); this.amount = 0 }
}
