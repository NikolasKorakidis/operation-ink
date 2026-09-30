import * as THREE from 'three'
import { Draft } from '../render/ink'
import type { MissionState } from './mission'
import type { SoundEvent } from './types'

/** A radio shot apart is heard this far away. */
export const RADIO_RULES = { noiseRadius: 24 } as const

type Radio = { id: string; object: THREE.Object3D; home: THREE.Vector3; led: THREE.Mesh; remains: THREE.Object3D; status: 'live' | 'off' | 'destroyed' }
type Spark = { mesh: THREE.Mesh; velocity: THREE.Vector3; age: number; life: number }
type Piece = { object: THREE.Object3D; velocity: THREE.Vector3; spin: THREE.Vector3; floor: number; age: number }

const PIECE_LIFE = 6
// The status light and sparks shine on their own; neon light and dark rooms must not tint them.
const glowing = (color: number) => Object.assign(new THREE.MeshBasicMaterial({ color, toneMapped: false }), { defines: { NEON_UNLIT: '' } })
const LED = { live: glowing(0x3dff6a), off: glowing(0x1a1f1a) }
const sparkGeometry = new THREE.SphereGeometry(1, 6, 4)
const sparkColors = [glowing(0xfff2a8), glowing(0xffc24a), glowing(0xffffff)]

/**
 * The enemy field radios (interiors.ts places them on communications desks with `userData.questItem = 'radio'`).
 * A live radio shows a blinking green light. Switching it off (F, a mission station) puts the light out; shooting
 * it blows it apart in sparks and olive casing. The mission state owns which radios are off or destroyed.
 */
export class QuestRadios {
  readonly radios = new Map<string, Radio>()
  private effects = new THREE.Group()
  private sparks: Spark[] = []
  private pieces: Piece[] = []
  private clock = 0

  constructor(scene: THREE.Object3D, private play: (event: SoundEvent) => void) {
    scene.traverse(object => {
      if (object.userData.questItem !== 'radio') return
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), LED.live)
      led.name = 'Radio status light'
      // Top left of the front panel, above the dial window.
      led.position.set(-0.24, 0.245, 0.18)
      led.userData.noCollision = true
      object.add(led)
      const remains = this.remains(object)
      this.radios.set(object.name, { id: object.name, object, home: object.position.clone(), led, remains, status: 'live' })
    })
    this.effects.name = 'Radio wreckage'
    this.effects.userData.noCollision = true
    scene.add(this.effects)
  }

  get count() { return this.radios.size }

  /** The radio a shot surface belongs to, unless it is already wrecked. A switched-off radio can still be shot. */
  at(mesh: THREE.Object3D | null | undefined): string | null {
    for (let object: THREE.Object3D | null | undefined = mesh; object; object = object.parent) {
      if (object.userData.questItem === 'radio') return this.radios.get(object.name)?.status === 'destroyed' ? null : object.name
    }
    return null
  }

  center(id: string) {
    const radio = this.radios.get(id)
    return radio ? radio.object.localToWorld(new THREE.Vector3(0, 0.15, 0)) : null
  }

  /** Shows each radio as the mission state has it; a radio destroyed now bursts apart when `animate` is set. */
  sync(state: MissionState, animate = true) {
    for (const radio of this.radios.values()) {
      const status = state.destroyedRadios.includes(radio.id) ? 'destroyed' : state.disabledRadios.includes(radio.id) ? 'off' : 'live'
      if (status === radio.status) continue
      const center = this.center(radio.id)!, floor = this.floorBelow(radio)
      radio.status = status
      radio.led.material = status === 'live' ? LED.live : LED.off
      radio.led.visible = true
      radio.object.visible = status !== 'destroyed'
      radio.remains.visible = status === 'destroyed'
      // Out of the level, so its collider stops blocking shots and sight.
      radio.object.position.copy(radio.home)
      if (status === 'destroyed') radio.object.position.y -= 1000
      radio.object.updateMatrixWorld(true)
      if (status === 'off' && animate) this.play({ kind: 'switch', position: center })
      if (status === 'destroyed' && animate) this.burst(center, floor)
    }
  }

  /** Every radio as the state has it, with no sparks or wreckage left (checkpoint restore, restart). */
  reset(state: MissionState) {
    this.clear()
    this.sync(state, false)
  }

  /** What a shot leaves on the desk: the scorched chassis, a torn panel and the bent antenna. */
  private remains(radio: THREE.Object3D) {
    const g = new Draft(`${radio.name} · wreck`)
    g.box(0.58, 0.05, 0.27, 0, 0.025, 0, 'umber', 'detail', [0, 0.08, 0])
    g.box(0.24, 0.1, 0.2, -0.14, 0.07, 0.01, 'olive', 'detail', [0.2, -0.15, 0.25])
    g.box(0.16, 0.025, 0.12, 0.17, 0.06, 0.04, 'olive', 'detail', [0, 0.5, -0.4])
    g.line([[0.2, 0.05, -0.07], [0.3, 0.2, -0.05], [0.46, 0.24, 0.02]], 'edge')
    g.finish()
    g.position.copy(radio.position)
    g.rotation.copy(radio.rotation)
    g.visible = false
    g.userData.noCollision = true
    radio.parent?.add(g)
    return g
  }

  /** Wreckage lands on the desk top the radio stood on. */
  private floorBelow(radio: Radio) {
    return (radio.object.parent ?? radio.object).localToWorld(radio.home.clone()).y
  }

  private burst(center: THREE.Vector3, floor: number) {
    this.play({ kind: 'impact', position: center.clone(), radius: RADIO_RULES.noiseRadius, intensity: 1 })
    for (let i = 0; i < 26; i++) {
      const mesh = new THREE.Mesh(sparkGeometry, sparkColors[i % sparkColors.length])
      mesh.position.copy(center)
      mesh.scale.setScalar(0.012 + Math.random() * 0.012)
      const velocity = new THREE.Vector3().randomDirection().multiplyScalar(1.5 + Math.random() * 3.5)
      velocity.y = Math.abs(velocity.y) + 1
      this.effects.add(mesh)
      this.sparks.push({ mesh, velocity, age: 0, life: 0.35 + Math.random() * 0.5 })
    }
    // Olive casing, the brown panel and a knob or two.
    for (let i = 0; i < 7; i++) {
      const piece = new Draft('Radio fragment')
      piece.box(i < 3 ? 0.18 + Math.random() * 0.12 : 0.05 + Math.random() * 0.05, 0.03, 0.08 + Math.random() * 0.06, 0, 0, 0,
        i % 3 === 1 ? 'umber' : 'olive', 'detail')
      piece.finish()
      piece.position.copy(center)
      piece.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
      this.effects.add(piece)
      this.pieces.push({ object: piece, age: 0, floor: floor + 0.015,
        velocity: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().multiplyScalar(0.2 + Math.random() * 0.45).setY(1 + Math.random() * 0.8),
        spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14) })
    }
  }

  update(dt: number) {
    const delta = Math.max(0, Math.min(dt, 0.05))
    this.clock += delta
    // A live radio's light blinks: on most of the second, briefly off.
    const lit = this.clock % 1.2 < 0.85
    for (const radio of this.radios.values()) if (radio.status === 'live') radio.led.visible = lit
    this.sparks = this.sparks.filter(spark => {
      spark.age += delta
      if (spark.age >= spark.life) { spark.mesh.removeFromParent(); return false }
      spark.velocity.y -= 9 * delta
      spark.mesh.position.addScaledVector(spark.velocity, delta)
      spark.mesh.scale.multiplyScalar(1 - delta * 1.5)
      return true
    })
    this.pieces = this.pieces.filter(piece => {
      piece.age += delta
      if (piece.age > PIECE_LIFE) { piece.object.removeFromParent(); return false }
      if (piece.object.position.y > piece.floor || piece.velocity.y > 0) {
        piece.velocity.y -= 9.8 * delta
        piece.object.position.addScaledVector(piece.velocity, delta)
        piece.object.rotation.x += piece.spin.x * delta; piece.object.rotation.y += piece.spin.y * delta; piece.object.rotation.z += piece.spin.z * delta
        if (piece.object.position.y <= piece.floor) { piece.object.position.y = piece.floor; piece.velocity.set(0, 0, 0) }
      }
      return true
    })
    return this.sparks.length > 0 || this.pieces.some(piece => piece.velocity.lengthSq() > 0)
  }

  clear() {
    for (const spark of this.sparks) spark.mesh.removeFromParent()
    for (const piece of this.pieces) piece.object.removeFromParent()
    this.sparks = []; this.pieces = []
  }

  dispose() {
    this.clear()
    this.effects.removeFromParent()
    for (const radio of this.radios.values()) { radio.led.removeFromParent(); radio.remains.removeFromParent() }
  }
}
