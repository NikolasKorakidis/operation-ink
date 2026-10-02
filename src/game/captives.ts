import * as THREE from 'three'
import type { CollisionWorld } from '../player/collision'
import { HostageActor } from './hostage-actor'
import { EnemyNavigation } from './navigation'
import type { MissionState } from './mission'
import type { CaptiveSpec } from './types'

/** How a freed captive keeps up: close enough to stop, how far before he runs, and his speeds (m/s). */
const FOLLOW = { stop: 2.4, run: 6, walk: 2.2, sprint: 4.6, replan: 1.2 }

/**
 * Prisoners a level holds (MissionWorld.captives): the blue stickman, tied to his chair (world/captive-chair.ts) until a
 * player uses the station that frees him. Then he stands up and follows the nearest player, walking when close and
 * running to catch up, finding his way round walls and through doors, and cowering while guns are firing near him.
 * Freed or not comes from the mission state (usedStations), so it saves, restores and is shared in co-op.
 */
export class Captives {
  private actors: { spec: CaptiveSpec; actor: HostageActor; path: THREE.Vector3[]; replan: number }[] = []
  private disposed = false
  private navigation: EnemyNavigation

  constructor(private scene: THREE.Scene, private specs: readonly CaptiveSpec[], world: CollisionWorld, doors: THREE.Group[]) {
    this.navigation = new EnemyNavigation(world, doors, () => {})
  }

  async init() {
    for (const spec of this.specs) {
      const actor = await HostageActor.create()
      if (this.disposed) { actor.dispose(); return }
      actor.root.name = spec.name ?? `Captive ${spec.id}`
      this.scene.add(actor.root)
      this.actors.push({ spec, actor, path: [], replan: 0 })
    }
  }

  private freed(state: MissionState, spec: CaptiveSpec) { return state.usedStations.includes(spec.station) }

  /** Snap every captive to the state as it stands (load, retry, restart): tied up at his chair, or standing beside it. */
  sync(state: MissionState) {
    for (const entry of this.actors) {
      const captive = !this.freed(state, entry.spec)
      entry.actor.root.position.fromArray(entry.spec.position)
      entry.actor.root.rotation.y = entry.spec.facing
      entry.path = []
      entry.actor.restore(captive)
      entry.actor.animate(0, false, false, false, captive)
    }
  }

  /** Every frame. `leader` is the player he follows once free (none: he stays put); `danger`, guns firing near him. */
  update(dt: number, state: MissionState, danger = false, leader?: THREE.Vector3) {
    for (const entry of this.actors) {
      const { spec, actor } = entry
      const captive = !this.freed(state, spec)
      actor.advanceRelease(dt, captive)
      let moving = false, speed = FOLLOW.walk
      if (!captive && actor.canWalk && leader && !danger) {
        const position = actor.root.position
        const distance = Math.hypot(leader.x - position.x, leader.z - position.z)
        if (distance > FOLLOW.stop) {
          speed = distance > FOLLOW.run ? FOLLOW.sprint : FOLLOW.walk
          // Head straight for the player; when a wall is in the way, plan round it and walk the plan.
          entry.replan -= dt
          let target = entry.path[0] ?? leader
          let next = this.navigation.step(position, target, speed * dt)
          if (!next && entry.replan <= 0) {
            entry.replan = FOLLOW.replan
            entry.path = this.navigation.plan(position, leader)
            target = entry.path[0] ?? leader
            next = this.navigation.step(position, target, speed * dt)
          }
          if (next) {
            const dx = next.x - position.x, dz = next.z - position.z
            if (dx * dx + dz * dz > 1e-8) actor.root.rotation.y = Math.atan2(dx, dz)
            position.copy(next)
            moving = true
            if (entry.path.length && position.distanceTo(entry.path[0]) < 0.4) entry.path.shift()
          }
        }
      }
      actor.animate(dt, moving, !captive && danger, false, captive, speed)
    }
  }

  dispose() {
    this.disposed = true
    for (const { actor } of this.actors) actor.dispose()
    this.actors = []
  }
}
