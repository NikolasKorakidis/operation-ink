import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import { CollisionWorld } from './collision'

export type Stance = 'stand' | 'crouch' | 'prone'
/**
 * Eye height (m), walking speed (m/s) and body height (m, the collision capsule) per stance. Only standing can sprint
 * or jump. Crouched you fit under 1.4 m, prone under about 0.65 m.
 */
export const STANCES: Record<Stance, { eye: number; speed: number; height: number }> = {
  stand: { eye: 1.65, speed: 4.2, height: 1.8 },
  crouch: { eye: 1.12, speed: 1.9, height: 1.35 },
  prone: { eye: 0.42, speed: 0.75, height: 0.6 },
}
const LOWER: Record<Stance, Stance | null> = { stand: 'crouch', crouch: 'prone', prone: null }
export const EYE_HEIGHT = STANCES.stand.eye
const SPRINT_SPEED = 7.6
/** How quickly the view glides to a new stance's eye height (per second). */
const STANCE_BLEND = 10
const RADIUS = 0.28
const STEP_HEIGHT = 0.34
const SUPPORT_RADIUS = RADIUS + 0.04

/** Metres and seconds; short simulation steps prevent sprinting through thin walls. */
export class PlayerBody {
  readonly position = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  grounded = false
  /** Downward speed at ground contact, retained across this frame's substeps. */
  landingSpeed = 0
  /** The stance the body is in: the one asked for, or lower while there is no room overhead to rise into it. */
  stance: Stance = 'stand'
  /** Current eye height above the feet, easing toward the stance's height. */
  eyeHeight = EYE_HEIGHT
  private capsule = new Capsule(new THREE.Vector3(), new THREE.Vector3(), RADIUS)
  private candidate = new THREE.Vector3()
  private delta = new THREE.Vector3()

  constructor(readonly world: CollisionWorld) {}

  teleport(position: THREE.Vector3) {
    this.position.copy(position)
    this.velocity.set(0, 0, 0)
    this.grounded = false
    this.landingSpeed = 0
  }

  private placeCapsule(position = this.position, height = STANCES[this.stance].height) {
    this.capsule.start.copy(position).y += RADIUS
    this.capsule.end.copy(position).y += height - RADIUS
    return this.capsule
  }

  /** Whether the body has room to be in `stance` where it stands (no ceiling, beam or barrier in the way). */
  hasRoom(stance: Stance) {
    if (STANCES[stance].height <= STANCES[this.stance].height) return true
    const fits = this.world.fits(this.placeCapsule(this.position, STANCES[stance].height))
    this.placeCapsule()
    return fits
  }

  jump() {
    if (!this.grounded || this.stance !== 'stand') return false
    this.velocity.y = 7
    this.grounded = false
    return true
  }

  /** Sprinting only works standing; crouching and lying prone move at their own slower speeds. */
  update(dt: number, direction: THREE.Vector3, sprint: boolean, stance: Stance = 'stand') {
    this.landingSpeed = 0
    // Rising needs room overhead: under something low, stay as low as it takes, and get up once clear.
    let fitted: Stance | null = stance
    while (fitted && !this.hasRoom(fitted)) fitted = LOWER[fitted]
    this.stance = fitted ?? this.stance
    stance = this.stance
    const blend = 1 - Math.exp(-STANCE_BLEND * Math.max(0, Math.min(dt, 0.1)))
    this.eyeHeight += (STANCES[stance].eye - this.eyeHeight) * blend
    const steps = Math.max(1, Math.ceil(Math.min(dt, 0.05) / (1 / 120)))
    const step = Math.min(dt, 0.05) / steps
    for (let i = 0; i < steps; i++) this.step(step, direction, sprint && stance === 'stand')
  }

  private step(dt: number, direction: THREE.Vector3, sprint: boolean) {
    const wasGrounded = this.grounded
    const acceleration = 1 - Math.exp(-(wasGrounded ? 18 : 5) * dt)
    const speed = sprint ? SPRINT_SPEED : STANCES[this.stance].speed
    this.velocity.x += (direction.x * speed - this.velocity.x) * acceleration
    this.velocity.z += (direction.z * speed - this.velocity.z) * acceleration
    if (wasGrounded && this.velocity.y < 0) this.velocity.y = 0
    this.velocity.y -= 22 * dt
    this.delta.copy(this.velocity).multiplyScalar(dt)
    this.candidate.copy(this.position).add(this.delta)

    if (wasGrounded) {
      const floor = this.world.floor(this.candidate, STEP_HEIGHT, STEP_HEIGHT, SUPPORT_RADIUS)
      const rise = floor - this.position.y
      if (rise > 0.002 && rise <= STEP_HEIGHT) {
        this.candidate.y = floor + 0.002
        if (this.world.fits(this.placeCapsule(this.candidate))) {
          this.position.y = this.candidate.y
          this.delta.y = 0
          this.velocity.y = 0
        }
      }
    }

    this.position.add(this.delta)
    this.placeCapsule()
    const downwardSpeed = Math.max(0, -this.velocity.y)
    this.grounded = this.world.resolve(this.capsule, this.velocity)
    this.position.copy(this.capsule.start).y -= RADIUS

    // Follow descending stairs while grounded; jumping and free falls retain gravity.
    if (wasGrounded && this.velocity.y <= 0) {
      const floor = this.world.floor(this.position, 0.025, STEP_HEIGHT, SUPPORT_RADIUS)
      if (floor >= this.position.y - STEP_HEIGHT && floor <= this.position.y + 0.025) {
        this.candidate.copy(this.position).y = floor + 0.002
        if (this.world.fits(this.placeCapsule(this.candidate))) {
          this.position.copy(this.candidate)
          this.grounded = true
        }
      }
    }
    if (this.grounded) {
      if (!wasGrounded) this.landingSpeed = Math.max(this.landingSpeed, downwardSpeed)
      this.velocity.y = 0
    }
    if (this.velocity.lengthSq() < 0.00001) this.velocity.set(0, 0, 0)
  }
}
