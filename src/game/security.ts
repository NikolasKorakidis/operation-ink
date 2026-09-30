import * as THREE from 'three'
import type { CollisionWorld } from '../player/collision'
import type { EnemyDirector } from './ai'
import { cameraOnline, type MissionState } from './mission'
import { RESCUE_LAYOUT } from './rescue-layout'
import type { EmitSound, MissionWorld } from './types'

export const SECURITY_RULES = { detectionDwell: 0.75, secondWaveDelay: 14, searchCooldown: 12, reserveLimit: 4, hornInterval: 7 } as const
/** Green while a camera watches; red once its terminal shuts it down (it stays still), and red during an alarm. */
export const CAMERA_LIGHTS = { watching: 0x21db66, alarm: 0xff2929, offline: 0xff2929 } as const
export const CAMERA_PATROL = { holdSeconds: 3.5, turnSeconds: 1.8 } as const
/** A switched-off monitor: near-black glass. */
export const SCREEN_OFF = 0x050807

/** Three lookout directions, with a full stop before each smooth motor turn. */
export function cameraPatrolYaw(elapsed: number, index: number, yaw: number, arc: number) {
  const stops = [0, 1, 0, -1]
  const segment = CAMERA_PATROL.holdSeconds + CAMERA_PATROL.turnSeconds
  const time = Math.max(0, elapsed) + index * 0.8
  const cycleStep = Math.floor((time + 1e-9) / segment)
  const step = cycleStep % stops.length
  const progress = THREE.MathUtils.clamp((time - cycleStep * segment - CAMERA_PATROL.holdSeconds) / CAMERA_PATROL.turnSeconds, 0, 1)
  const smooth = progress * progress * (3 - 2 * progress)
  return yaw + THREE.MathUtils.lerp(stops[step], stops[(step + 1) % stops.length], smooth) * arc
}
/** Security keeps only a confirmed sighting; guard perception remains authoritative afterward. */
export class SecuritySystem {
  private dwell = new Map<string, number>()
  private lastAlarm: MissionState['alarm'] = 'inactive'
  private lampColors = new Map<string, number>()
  private screensPowered = new Map<string, boolean>()
  private hornElapsed = 0

  constructor(private world: CollisionWorld, private missionWorld: MissionWorld, private ai: EnemyDirector, private emit: EmitSound) {}

  reset() {
    this.dwell.clear()
    this.lastAlarm = 'inactive'
    this.lampColors.clear()
    this.screensPowered.clear()
    this.hornElapsed = 0
  }

  /**
   * Each camera terminal's screen shows its own network's feeds, so it goes black, and stops lighting the room,
   * when that terminal is shut down, and comes back on with it (on a checkpoint retry or restart).
   */
  private powerScreens(state: MissionState) {
    for (const station of this.missionWorld.stations ?? []) {
      if (station.kind !== 'cameras') continue
      const on = !state.camerasOff.includes(station.id)
      if (this.screensPowered.get(station.id) === on) continue
      this.screensPowered.set(station.id, on)
      station.object.traverse(object => {
        if (object.userData.neonLight && 'powered' in object.userData) object.userData.powered = on
        const screen = object as THREE.Mesh
        if (!object.userData.cameraScreen || !screen.isMesh) return
        const material = screen.material as THREE.MeshBasicMaterial
        screen.userData.poweredColor ??= material.color.getHex()
        material.color.setHex(on ? screen.userData.poweredColor : SCREEN_OFF)
      })
    }
  }

  sync(state: MissionState, visualElapsed = state.elapsed) {
    if (state.alarm === 'silenced' && this.lastAlarm === 'active') {
      this.ai.silenceAlarm()
      this.dwell.clear()
      this.hornElapsed = 0
    }
    this.lastAlarm = state.alarm
    for (const camera of this.missionWorld.rescue?.cameras ?? []) {
      const spec = RESCUE_LAYOUT.cameras.find(candidate => candidate.id === camera.id)
      if (!spec) continue
      const online = cameraOnline(state, camera.id)
      const color = !online ? CAMERA_LIGHTS.offline : state.alarm === 'active' ? CAMERA_LIGHTS.alarm : CAMERA_LIGHTS.watching
      if (online) camera.pivot.rotation.y = cameraPatrolYaw(visualElapsed, RESCUE_LAYOUT.cameras.indexOf(spec), spec.yaw, spec.arc)
      else this.dwell.delete(camera.id)
      if (this.lampColors.get(camera.id) !== color) {
        this.lampColors.set(camera.id, color)
        for (const material of Array.isArray(camera.lamp.material) ? camera.lamp.material : [camera.lamp.material]) {
          if ('color' in material) (material as THREE.MeshBasicMaterial).color.setHex(color)
          if ('emissive' in material) (material as THREE.MeshStandardMaterial).emissiveIntensity = 0
        }
      }
    }
    this.powerScreens(state)
  }

  trigger(state: MissionState, position: THREE.Vector3, running = state.phase === 'active') {
    if (!running || state.alarm === 'active') return false
    state.alarm = 'active'
    state.alarmElapsed = 0
    state.silencedElapsed = 0
    state.alarmPosition = position.toArray() as [number, number, number]
    state.detections++
    const count = Math.min(2, SECURITY_RULES.reserveLimit - state.reservesDispatched)
    state.reservesDispatched += this.ai.respondToAlarm(position, Math.max(0, count))
    this.hornElapsed = 0
    this.emit({ kind: 'horn', position: position.clone(), radius: 100, text: 'ALARM - barracks responding to the camera sighting.' })
    this.sync(state)
    return true
  }

  /** Co-op passes every player's eye, and keeps the compound running while the host is down or paused. */
  update(dt: number, state: MissionState, eye: THREE.Vector3 | THREE.Vector3[], running = state.phase === 'active') {
    this.sync(state)
    if (!running || dt <= 0) return
    const eyes = Array.isArray(eye) ? eye : [eye]
    dt = Math.min(dt, 0.1)
    if (state.alarm === 'active') {
      state.alarmElapsed += dt
      this.hornElapsed += dt
      if (state.alarmPosition && state.alarmElapsed >= SECURITY_RULES.secondWaveDelay && state.reservesDispatched < SECURITY_RULES.reserveLimit) {
        state.reservesDispatched += this.ai.respondToAlarm(new THREE.Vector3(...state.alarmPosition), SECURITY_RULES.reserveLimit - state.reservesDispatched, false)
      }
      if (this.hornElapsed >= SECURITY_RULES.hornInterval) {
        this.hornElapsed %= SECURITY_RULES.hornInterval
        this.emit({ kind: 'horn', position: state.alarmPosition ? new THREE.Vector3(...state.alarmPosition) : undefined, radius: 100 })
      }
    } else if (state.alarm === 'silenced') {
      state.silencedElapsed += dt
      if (state.silencedElapsed >= SECURITY_RULES.searchCooldown) state.alarm = 'inactive'
    }
    for (const camera of this.missionWorld.rescue?.cameras ?? []) {
      const spec = RESCUE_LAYOUT.cameras.find(candidate => candidate.id === camera.id)
      if (!spec || !cameraOnline(state, camera.id)) continue
      const origin = new THREE.Vector3(...spec.position)
      const yaw = camera.pivot.rotation.y
      const seen = eyes.find(eye => {
        const dx = eye.x - origin.x, dz = eye.z - origin.z
        const distance = Math.hypot(dx, dz)
        const inCone = distance > 0.2 && distance <= spec.range && Math.abs(eye.y - origin.y) < 6 &&
          (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / distance >= Math.cos(28 * Math.PI / 180)
        return inCone && this.world.visible(origin, eye, camera.pivot)
      })
      const elapsed = seen ? (this.dwell.get(camera.id) ?? 0) + dt : 0
      this.dwell.set(camera.id, elapsed)
      if (seen && elapsed >= SECURITY_RULES.detectionDwell) this.trigger(state, seen.clone().add(new THREE.Vector3(0, -1.65, 0)), running)
    }
  }
}
