import * as THREE from 'three'
import { EnemyActor } from './actors'
import { BulletTrails } from './bullet-trails'
import { TEAM_COLORS, TEAM_COLOR_NAMES, type PlayerPose } from '../net/hub'
import type { SoundEvent, Vec3, WeaponName } from './types'

type Mate = {
  id: number
  pose: PlayerPose
  feet: THREE.Vector3
  yaw: number
  actor: EnemyActor | null
  /** Seconds left holding the gun up after a shot, so fire never comes from a lowered rifle. */
  firing: number
  /** The weapon an actor is being built for; a switch keeps the old body until the new one loads. */
  building: WeaponName | null
}

const EYE_HEIGHT = 1.6
/** Poses arrive about 15 times a second; smooth between them and snap after a teleport. */
const FOLLOW_RATE = 14
const SNAP_DISTANCE = 6
const FIRING_HOLD = 1.2

/** Other players in a co-op room, drawn with the shared stickman rig in their team colour. */
export class Teammates {
  private mates = new Map<number, Mate>()
  private trails: BulletTrails
  private disposed = false

  constructor(private scene: THREE.Scene, private play: (event: SoundEvent) => void, private invalidate: () => void) {
    this.trails = new BulletTrails(scene, 'Teammate bullet')
  }

  get count() { return this.mates.size }
  get ids() { return [...this.mates.keys()] }

  pose(id: number, pose: PlayerPose) {
    let mate = this.mates.get(id)
    if (!mate) {
      mate = { id, pose, feet: new THREE.Vector3(...pose.feet), yaw: pose.yaw, actor: null, building: null, firing: 0 }
      this.mates.set(id, mate)
    }
    mate.pose = pose
    const weapon = pose.weapon ?? 'pistol'
    if ((mate.actor?.weapon ?? null) !== weapon && mate.building !== weapon) void this.build(mate, weapon)
    this.invalidate()
  }

  shot(id: number, origin: Vec3, end: Vec3, weapon: WeaponName) {
    const mate = this.mates.get(id)
    const muzzle = mate?.actor?.root.visible ? mate.actor.muzzle() : new THREE.Vector3(...origin)
    mate?.actor?.shoot()
    if (mate) mate.firing = FIRING_HOLD
    this.trails.emit(muzzle, new THREE.Vector3(...end), weapon)
    this.play({ kind: `enemy-shot-${weapon}`, position: muzzle, radius: weapon === 'pistol' ? 38 : 55 })
    this.invalidate()
  }

  remove(id: number) {
    const mate = this.mates.get(id)
    if (!mate) return
    this.mates.delete(id)
    mate.actor?.dispose()
    mate.building = null
    this.invalidate()
  }

  clear() { for (const id of this.ids) this.remove(id); this.trails.clear() }

  update(dt: number) {
    const blend = 1 - Math.exp(-FOLLOW_RATE * dt)
    for (const mate of this.mates.values()) {
      const target = new THREE.Vector3(...mate.pose.feet)
      if (mate.feet.distanceTo(target) > SNAP_DISTANCE) mate.feet.copy(target)
      else mate.feet.lerp(target, blend)
      const turn = Math.atan2(Math.sin(mate.pose.yaw - mate.yaw), Math.cos(mate.pose.yaw - mate.yaw))
      mate.yaw += turn * blend
      const actor = mate.actor
      if (!actor) continue
      actor.root.position.copy(mate.feet)
      actor.root.rotation.y = mate.yaw
      const moving = mate.pose.speed > 0.3
      mate.firing = Math.max(0, mate.firing - dt)
      const eye = mate.feet.clone().setY(mate.feet.y + EYE_HEIGHT)
      const aim = eye.addScaledVector(new THREE.Vector3(Math.sin(mate.pose.yaw) * Math.cos(mate.pose.pitch),
        Math.sin(mate.pose.pitch), Math.cos(mate.pose.yaw) * Math.cos(mate.pose.pitch)), 10)
      actor.update(dt, !mate.pose.alive ? 'dead' : mate.pose.aiming || mate.firing > 0 ? 'combat' : 'patrol', moving, aim, mate.pose.speed)
    }
    this.trails.update(dt)
  }

  dispose() {
    this.disposed = true
    for (const mate of this.mates.values()) mate.actor?.dispose()
    this.mates.clear()
    this.trails.dispose()
  }

  private async build(mate: Mate, weapon: WeaponName) {
    mate.building = weapon
    const actor = await EnemyActor.create(weapon, TEAM_COLORS[mate.id % TEAM_COLORS.length])
    if (this.disposed || this.mates.get(mate.id) !== mate || mate.building !== weapon) { actor.dispose(); return }
    actor.root.name = `Teammate ${TEAM_COLOR_NAMES[mate.id % TEAM_COLOR_NAMES.length]}`
    mate.actor?.dispose()
    mate.actor = actor
    mate.building = null
    this.scene.add(actor.root)
    this.invalidate()
  }
}
