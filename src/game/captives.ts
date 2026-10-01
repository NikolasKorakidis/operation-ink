import type * as THREE from 'three'
import { HostageActor } from './hostage-actor'
import type { MissionState } from './mission'
import type { CaptiveSpec } from './types'

/**
 * Prisoners a level holds (MissionWorld.captives): the blue stickman, seated and bound, until a player uses the
 * station that frees him; then he stands up and waits there, cowering while guns are firing nearby. Freed or not
 * comes from the mission state (usedStations), so it saves, restores and is shared in co-op like everything else.
 * Put a chair at each captive's position: he sits on one.
 */
export class Captives {
  private actors: { spec: CaptiveSpec; actor: HostageActor }[] = []
  private disposed = false

  constructor(private scene: THREE.Scene, private specs: readonly CaptiveSpec[]) {}

  async init() {
    for (const spec of this.specs) {
      const actor = await HostageActor.create()
      if (this.disposed) { actor.dispose(); return }
      actor.root.position.fromArray(spec.position)
      actor.root.rotation.y = spec.facing
      actor.root.name = spec.name ?? `Captive ${spec.id}`
      this.scene.add(actor.root)
      this.actors.push({ spec, actor })
    }
  }

  private freed(state: MissionState, spec: CaptiveSpec) { return state.usedStations.includes(spec.station) }

  /** Snap every captive to the state as it stands (load, retry, restart). */
  sync(state: MissionState) {
    for (const { spec, actor } of this.actors) {
      const captive = !this.freed(state, spec)
      actor.restore(captive)
      actor.animate(0, false, false, false, captive)
    }
  }

  update(dt: number, state: MissionState, danger = false) {
    for (const { spec, actor } of this.actors) {
      const captive = !this.freed(state, spec)
      actor.advanceRelease(dt, captive)
      actor.animate(dt, false, !captive && danger, false, captive)
    }
  }

  dispose() {
    this.disposed = true
    for (const { actor } of this.actors) actor.dispose()
    this.actors = []
  }
}
