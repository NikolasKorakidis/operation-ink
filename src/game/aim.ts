import * as THREE from 'three'
import { AIM_STEADINESS } from './balance'
import type { Stance } from '../player/body'
import type { WeaponName } from './types'

export type AimInput = { speed: number; airborne: boolean; stance: Stance; aiming: boolean; scoped: boolean; weapon: WeaponName | null; reducedMotion: boolean }
export type AimOffset = { yaw: number; pitch: number }

/** Turn a view direction by a small yaw (right is positive) and pitch (up is positive), in radians. */
export function offsetDirection(forward: THREE.Vector3, offset: AimOffset, out = new THREE.Vector3()) {
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0))
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0)
  right.normalize()
  const up = new THREE.Vector3().crossVectors(right, forward).normalize()
  return out.copy(forward).addScaledVector(right, Math.tan(offset.yaw)).addScaledVector(up, Math.tan(offset.pitch)).normalize()
}

/**
 * Deterministic sway (a slow Lissajous drift, faster and wider on the move) plus the random-spread radius
 * for the next shot. The knife has neither. Reduced Motion keeps the crosshair still but not the spread.
 */
export class AimSteadiness {
  private phase = 0
  readonly sway: AimOffset = { yaw: 0, pitch: 0 }
  spread = 0
  private bloom = 0
  private sinceShot = Infinity

  /** Each shot fired without aiming widens the cone a little; aimed shots do not. */
  onShot(aiming: boolean) {
    if (aiming) return
    this.bloom = Math.min(AIM_STEADINESS.bloom.max, this.bloom + AIM_STEADINESS.bloom.perShot)
    this.sinceShot = 0
  }

  update(dt: number, input: AimInput) {
    const { sway, spread, stance, aimed } = AIM_STEADINESS
    const speed = Math.max(0, input.speed), steady = stance[input.stance] * (input.aiming ? aimed : 1)
    this.phase += Math.max(0, dt) * (0.9 + speed * 0.12)
    const amplitude = input.weapon === 'knife' || !input.weapon || input.reducedMotion ? 0
      : (sway[input.stance] + (speed * sway.perSpeed + (input.airborne ? sway.airborne : 0)) * stance[input.stance]) * (input.aiming ? aimed : 1)
    this.sway.yaw = amplitude * Math.sin(this.phase)
    this.sway.pitch = amplitude * 0.75 * Math.sin(this.phase * 1.6 + 0.8)
    // The spray only settles once the trigger has been released for a moment.
    this.sinceShot += Math.max(0, dt)
    if (this.sinceShot > AIM_STEADINESS.bloom.settleDelay) this.bloom = Math.max(0, this.bloom - AIM_STEADINESS.bloom.recoveryPerSecond * Math.max(0, dt))
    const hip = input.aiming ? 0 : (AIM_STEADINESS.hip[input.weapon ?? 'knife'] ?? 0) + this.bloom
    this.spread = !input.weapon || input.weapon === 'knife' ? 0
      : (speed * spread.perSpeed + (input.airborne ? spread.airborne : 0)) * steady + hip +
        (input.weapon === 'sniper' && !input.scoped ? spread.unscopedSniper : 0)
  }
}
