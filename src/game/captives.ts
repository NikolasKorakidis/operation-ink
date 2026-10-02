import * as THREE from 'three'
import type { CollisionWorld } from '../player/collision'
import { HostageActor } from './hostage-actor'
import { EnemyNavigation } from './navigation'
import { hostageAlive, type MissionState } from './mission'
import type { CaptiveSpec } from './types'

/**
 * How a freed captive keeps up: close enough to stop (each further one `spacing` further back), how far before he
 * runs, and his speeds (m/s). `crumb` is how far apart the leader's trail is recorded (m) and `trail` how many points
 * it keeps. He counts as stuck after `stuck` seconds following without getting `progress` m anywhere, and is lost
 * beyond `lost` m: either way he is put back on the trail `rejoin` m behind the leader.
 */
const FOLLOW = { stop: 2.4, spacing: 1.3, run: 6, walk: 2.2, sprint: 4.6, replan: 0.6, crumb: 0.7, trail: 240, stuck: 3.5, progress: 0.6, lost: 38, rejoin: 3 }

type Entry = { spec: CaptiveSpec; actor: HostageActor; path: THREE.Vector3[]; replan: number; stuckFor: number; anchor: THREE.Vector3 }

/**
 * Prisoners a level holds (MissionWorld.captives): the blue stickman, tied to his chair (world/captive-chair.ts) until a
 * player uses the station that frees him. Then he stands up and follows the nearest player, walking when close and
 * running to catch up, and cowering while guns are firing near him. Freed or not comes from the mission state
 * (usedStations), so it saves, restores and is shared in co-op. Once a freed captive reaches `safe` (the level's
 * extraction, for a goal that is his to reach) he stays there and follows no one. With several following, each
 * keeps a little further back than the one before so they don't crowd into one spot.
 *
 * Finding the way: straight at the leader when nothing is in the way; otherwise along the leader's own trail (every
 * point of it is floor someone just walked, up and down stairs and through doors), picking it up at the newest point
 * he can walk to; otherwise a planned route round the obstacle. A captive who still gets nowhere (a ladder the
 * leader climbed, a jump down, wedged in a corner) or falls far behind is put back on the trail just behind the leader.
 */
export class Captives {
  private actors: Entry[] = []
  private disposed = false
  private navigation: EnemyNavigation
  /** Where the leader has walked, oldest first. */
  private trail: THREE.Vector3[] = []

  constructor(private scene: THREE.Scene, private specs: readonly CaptiveSpec[], world: CollisionWorld, doors: THREE.Group[],
    private safe?: { center: readonly number[]; radius: number }) {
    this.navigation = new EnemyNavigation(world, doors, () => {})
  }

  async init() {
    for (const spec of this.specs) {
      const actor = await HostageActor.create()
      if (this.disposed) { actor.dispose(); return }
      actor.root.name = spec.name ?? `Captive ${spec.id}`
      this.scene.add(actor.root)
      this.actors.push({ spec, actor, path: [], replan: 0, stuckFor: 0, anchor: new THREE.Vector3().fromArray(spec.position) })
    }
  }

  private freed(state: MissionState, spec: CaptiveSpec) { return state.usedStations.includes(spec.station) }

  /** Snap every captive to the state as it stands (load, retry, restart): tied up at his chair, or standing beside it. */
  sync(state: MissionState) {
    this.trail = []
    for (const entry of this.actors) {
      const captive = !this.freed(state, entry.spec)
      entry.actor.root.position.fromArray(entry.spec.position)
      entry.actor.root.rotation.y = entry.spec.facing
      entry.path = []; entry.stuckFor = 0; entry.anchor.copy(entry.actor.root.position)
      entry.actor.restore(captive)
      entry.actor.animate(0, false, false, false, captive)
      if (!hostageAlive(state, entry.spec.id)) entry.actor.die(false, captive)
    }
  }

  /** Where each freed captive is, by id (goals.ts GoalSense.captives). */
  positions(state: MissionState) {
    return Object.fromEntries(this.actors.filter(entry => this.freed(state, entry.spec) && !entry.actor.dead).map(entry => [entry.spec.id, entry.actor.root.position]))
  }

  /** Every captive's body, for shots and blasts that can hit him (game/hostage-harm in runtime). */
  bodies(state: MissionState) {
    return this.actors.map(({ spec, actor }) => ({ id: spec.id, name: spec.name ?? 'A prisoner', actor, seated: !this.freed(state, spec) || !actor.canWalk }))
  }

  private isSafe(position: THREE.Vector3) {
    return !!this.safe && Math.hypot(position.x - this.safe.center[0], position.z - this.safe.center[2]) < this.safe.radius - 0.8
  }

  /** Remember where the leader walks: a point every `crumb` metres, on floor a body fits on. A jump to elsewhere (another player, a respawn) starts afresh. */
  private record(leader: THREE.Vector3) {
    const last = this.trail[this.trail.length - 1]
    if (last && last.distanceTo(leader) > 12) this.trail = []
    if (last && last.distanceTo(leader) < FOLLOW.crumb) return
    const point = this.navigation.floor(leader.clone(), false)
    if (!point) return
    this.trail.push(point)
    if (this.trail.length > FOLLOW.trail) this.trail.shift()
  }

  /**
   * The way from here to the leader along his trail. The trail leaves this floor (or ends) at its newest point on it:
   * walk straight there if he can, or plan a way round whatever is in between (furniture the leader squeezed past),
   * then follow the trail on from it. Failing that, pick it up at the newest point he can walk straight to.
   */
  private trailFrom(position: THREE.Vector3) {
    let exit = -1
    for (let i = this.trail.length - 1; i >= 0; i--) if (Math.abs(this.trail[i].y - position.y) < 0.35) { exit = i; break }
    if (exit >= 0) {
      const rest = this.trail.slice(exit + 1).map(p => p.clone())
      if (this.navigation.segment(position, this.trail[exit], false)) return [this.trail[exit].clone(), ...rest]
      const around = this.navigation.plan(position, this.trail[exit])
      if (around.length) return [...around, ...rest]
    }
    let checks = 0
    for (let i = this.trail.length - 1; i >= 0 && checks < 24; i--) {
      const point = this.trail[i]
      if (Math.abs(point.y - position.y) > 0.6 || Math.hypot(point.x - position.x, point.z - position.z) > 9) continue
      checks++
      if (this.navigation.segment(position, point, false)) return this.trail.slice(i).map(p => p.clone())
    }
    return []
  }

  /** Put him back on the trail a few metres behind the leader (or at the leader's feet if there is no trail yet). */
  private rejoin(entry: Entry, leader: THREE.Vector3, behind: number) {
    let spot: THREE.Vector3 | null = null
    for (let i = this.trail.length - 1, walked = 0; i >= 0; i--) {
      if (i < this.trail.length - 1) walked += this.trail[i].distanceTo(this.trail[i + 1])
      if (walked >= behind) { spot = this.trail[i]; break }
    }
    spot = spot ?? this.trail[0] ?? this.navigation.floor(leader.clone(), false)
    if (!spot) return
    entry.actor.root.position.copy(spot)
    entry.actor.root.rotation.y = Math.atan2(leader.x - spot.x, leader.z - spot.z)
    entry.path = []; entry.stuckFor = 0; entry.replan = 0; entry.anchor.copy(spot)
  }

  /** Every frame. `leader` is the player he follows once free (none: he stays put); `danger`, guns firing near him. */
  update(dt: number, state: MissionState, danger = false, leader?: THREE.Vector3) {
    if (leader && this.actors.some(entry => this.freed(state, entry.spec))) this.record(leader)
    let following = 0
    for (const entry of this.actors) {
      const { spec, actor } = entry
      if (actor.dead) { actor.animate(dt, false, false, false, false); continue }
      const captive = !this.freed(state, spec)
      actor.advanceRelease(dt, captive)
      let moving = false, speed = FOLLOW.walk
      const position = actor.root.position
      if (!captive && actor.canWalk && leader && !danger && !this.isSafe(position)) {
        const distance = Math.hypot(leader.x - position.x, leader.z - position.z) + Math.max(0, Math.abs(leader.y - position.y) - 1) * 3
        const keep = FOLLOW.stop + FOLLOW.spacing * following++
        if (distance > FOLLOW.lost) this.rejoin(entry, leader, FOLLOW.rejoin + keep)
        else if (distance > keep) {
          speed = distance > FOLLOW.run ? FOLLOW.sprint : FOLLOW.walk
          moving = this.walk(entry, leader, speed * dt, dt)
          // Getting nowhere: count it; any real progress resets it. Stuck long enough, he rejoins the trail.
          if (position.distanceTo(entry.anchor) > FOLLOW.progress) { entry.anchor.copy(position); entry.stuckFor = 0 }
          else if ((entry.stuckFor += dt) > FOLLOW.stuck) this.rejoin(entry, leader, FOLLOW.rejoin + keep)
        } else { entry.stuckFor = 0; entry.anchor.copy(position) }
      } else { entry.stuckFor = 0; entry.anchor.copy(position) }
      actor.animate(dt, moving, !captive && danger, false, captive, speed)
    }
  }

  /** One frame's walk toward the leader: straight there if he can, else along the trail, else a planned route. */
  private walk(entry: Entry, leader: THREE.Vector3, step: number, dt: number) {
    const position = entry.actor.root.position
    entry.replan -= dt
    // A leader on another floor is never walked at in a straight line: that only leads to the spot above or below him.
    const sameFloor = Math.abs(leader.y - position.y) < 1
    let target = entry.path[0] ?? (sameFloor ? leader : null)
    let next = target ? this.navigation.step(position, target, step) : null
    if (next && Math.abs(next.y - position.y) > 0.45) next = null
    if (!next && entry.replan <= 0) {
      entry.replan = FOLLOW.replan
      entry.path = this.trailFrom(position)
      if (!entry.path.length) entry.path = this.navigation.plan(position, leader)
      target = entry.path[0] ?? (sameFloor ? leader : null)
      next = target ? this.navigation.step(position, target, step) : null
      if (next && Math.abs(next.y - position.y) > 0.45) next = null
    }
    if (!next) return false
    const dx = next.x - position.x, dz = next.z - position.z
    if (dx * dx + dz * dz > 1e-8) entry.actor.root.rotation.y = Math.atan2(dx, dz)
    position.copy(next)
    while (entry.path.length && Math.hypot(position.x - entry.path[0].x, position.z - entry.path[0].z) < 0.35 && Math.abs(position.y - entry.path[0].y) < 0.5) entry.path.shift()
    // Once on a trail or route, a clear straight line to the leader takes over again.
    if (entry.path.length > 1 && Math.abs(leader.y - position.y) < 0.4 && entry.replan <= 0) {
      entry.replan = FOLLOW.replan
      if (this.navigation.segment(position, this.navigation.floor(leader.clone(), false) ?? leader, false)) entry.path = []
    }
    return true
  }

  dispose() {
    this.disposed = true
    for (const { actor } of this.actors) actor.dispose()
    this.actors = []
  }
}
