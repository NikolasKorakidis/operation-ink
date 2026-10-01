import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { applyPenMaterial, createPenLines, createPenSilhouette, penPalette } from '../render/ballpoint'
import { HAMMER_RULES } from './balance'
import { rayCapsuleDistance } from './hit-reactions'
import type { EmitSound } from './types'

export type HammerState = 'idle' | 'orbit' | 'windup' | 'flying' | 'stuck' | 'return' | 'broken'
/** What the hammer reads from the world each frame. */
export type HammerSense = {
  /** Its master: where he stands, and whether he is up and fighting. */
  owner: { position: THREE.Vector3; awake: boolean; alive: boolean }
  /** The player, if any: their eye and feet. */
  target: { eye: THREE.Vector3; feet: THREE.Vector3; alive: boolean } | null
  /** Distance along a ray to the first solid surface (the collision world). */
  rayDistance: (origin: THREE.Vector3, direction: THREE.Vector3, max: number) => number
  visible: (from: THREE.Vector3, to: THREE.Vector3) => boolean
  reducedMotion: boolean
}
export type HammerSnapshot = { health: number; state: HammerState }

/** The sledgehammer model, along +Y from the grip (origin) to the head at 0.9: a pale ash handle and a grey steel head. */
export function buildHammer() {
  const hammer = new THREE.Group()
  hammer.name = 'Flying sledgehammer'
  const ash = applyPenMaterial(Object.assign(new THREE.MeshBasicMaterial({ color: penPalette.paper, toneMapped: false }), { defines: { NEON_UNLIT: '' } }),
    { density: 0.05, scale: 30, seed: 4421 })
  const steel = Object.assign(new THREE.MeshBasicMaterial({ color: penPalette.light, toneMapped: false }), { defines: { NEON_UNLIT: '' } })
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 1.02, 14), ash)
  handle.position.y = 0.39
  const end = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.026, 0.05, 14), ash)
  end.position.y = -0.12
  const head = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.15, 0.15, 3, 0.025), steel)
  head.position.y = 0.9
  const faces = [-1, 1].map(side => {
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 18).rotateZ(Math.PI / 2), steel)
    face.position.set(side * 0.215, 0.9, 0)
    return face
  })
  for (const part of [handle, end, head, ...faces]) part.add(createPenSilhouette(part.geometry, 2.1))
  hammer.add(handle, end, head, ...faces,
    createPenLines([new THREE.Vector3(0.012, -0.08, 0.022), new THREE.Vector3(0.008, 0.8, 0.022)], 4431, 'detail', 1),
    createPenLines([new THREE.Vector3(-0.045, 0.98, 0.076), new THREE.Vector3(0.045, 0.98, 0.076), new THREE.Vector3(0.045, 0.82, 0.076),
      new THREE.Vector3(-0.045, 0.82, 0.076), new THREE.Vector3(-0.045, 0.98, 0.076)], 4432, 'detail', 1.2))
  for (const part of hammer.children) part.userData.noCollision = true
  return hammer
}

const up = new THREE.Vector3(0, 1, 0)

/**
 * The Sledge's flying sledgehammer, an enemy of its own. It hovers beside him, circling at shoulder height; every few
 * seconds it rises, turns its head on the player, and hurls itself at them end over end. A hit takes half the
 * player's health. If it misses into a wall or the ground it sticks there for a moment, then flies home. It has its
 * own health: shot down, or when its master falls, it drops out of the air for good. Tunables: HAMMER_RULES.
 */
export class FlyingHammer {
  readonly root = new THREE.Group()
  health: number = HAMMER_RULES.health
  state: HammerState = 'idle'
  private model = buildHammer()
  private timer = 0
  private cooldown: number = HAMMER_RULES.firstAttack
  private angle = 0
  private spin = 0
  private shake = 0
  private velocity = new THREE.Vector3()
  private target = new THREE.Vector3()
  private hit = false
  private seed = 9301
  /** Called when the hammer strikes the player. */
  onHitPlayer: (damage: number, from: THREE.Vector3) => void = () => {}

  constructor(scene: THREE.Object3D, private emit: EmitSound = () => {}) {
    this.root.name = 'The Sledge\'s flying hammer'
    this.root.userData.noCollision = true
    this.root.scale.setScalar(HAMMER_RULES.scale)
    // The model is centred on its balance point, a little below the head, so it spins about its middle.
    this.model.position.y = -0.6
    this.root.add(this.model)
    this.root.visible = false
    scene.add(this.root)
  }

  private random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296 }
  get alive() { return this.state !== 'broken' }
  /** Attack at the next chance, without waiting out the cooldown. */
  attackNow() { this.cooldown = 0 }
  get active() { return this.state !== 'idle' && this.state !== 'broken' }

  /** Where it hovers when not attacking: circling its master's shoulders. */
  private orbitPoint(owner: THREE.Vector3, out = new THREE.Vector3()) {
    const { radius, height, bob } = HAMMER_RULES.orbit
    return out.set(owner.x + Math.cos(this.angle) * radius, owner.y + height + Math.sin(this.angle * 2.3) * bob, owner.z + Math.sin(this.angle) * radius)
  }
  /** The middle of its head, where it strikes, in world space. */
  headPoint(out = new THREE.Vector3()) { return this.model.localToWorld(out.set(0, 0.9, 0)) }

  update(dt: number, sense: HammerSense) {
    dt = Math.min(Math.max(dt, 0), 0.05)
    const { owner, target } = sense
    if (this.state === 'idle') {
      if (!owner.awake || !owner.alive) return
      this.state = 'orbit'
      this.root.visible = true
      this.root.position.copy(this.orbitPoint(owner.position))
    }
    if (this.state === 'broken') { this.fall(dt, sense); return }
    if (!owner.alive) { this.breakApart(); return }
    this.angle += dt * HAMMER_RULES.orbit.rate
    this.shake = Math.max(0, this.shake - dt)
    const home = this.orbitPoint(owner.position)
    const aim = (point: THREE.Vector3, rate: number) => {
      // Turn its head (local +Y of the model) toward the point.
      const want = new THREE.Quaternion().setFromUnitVectors(up, point.clone().sub(this.root.position).normalize())
      this.root.quaternion.slerp(want, 1 - Math.exp(-rate * dt))
    }
    switch (this.state) {
      case 'orbit': {
        this.root.position.lerp(home, 1 - Math.exp(-4 * dt))
        // Hanging head-up, turning slowly, tilted out a little like it's being carried on the air.
        const hang = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25 * Math.sin(this.angle * 1.7), this.angle * 1.4, 0.35 * Math.cos(this.angle)))
        this.root.quaternion.slerp(hang, 1 - Math.exp(-3 * dt))
        this.cooldown -= dt
        if (this.cooldown <= 0 && target?.alive && target.eye.distanceTo(owner.position) < HAMMER_RULES.range && sense.visible(this.root.position, target.eye)) {
          this.state = 'windup'; this.timer = 0
          this.emit({ kind: 'knife-slash', position: this.root.position.clone(), radius: 30 })
        }
        break
      }
      case 'windup': {
        this.timer += dt
        // Rises, draws back and turns its head on the player, trembling.
        this.root.position.lerp(home.clone().add(new THREE.Vector3(0, 1.1, 0)), 1 - Math.exp(-5 * dt))
        if (target) aim(target.eye, 8)
        if (this.timer >= HAMMER_RULES.windUp) {
          if (!target?.alive) { this.state = 'return'; break }
          this.state = 'flying'; this.timer = 0; this.hit = false
          // Aimed where the player is now, a little past them: they can sidestep it.
          this.target.copy(target.eye).addScaledVector(target.eye.clone().sub(this.root.position).normalize(), 3)
          this.velocity.copy(this.target).sub(this.root.position).normalize().multiplyScalar(HAMMER_RULES.speed)
          this.spin = 0
          this.emit({ kind: 'knife-stab', position: this.root.position.clone(), radius: 40 })
        }
        break
      }
      case 'flying': {
        this.timer += dt
        // End over end about the axis across its flight.
        this.spin += dt * HAMMER_RULES.spin
        const travel = this.velocity.clone().normalize(), across = travel.clone().cross(up).normalize()
        if (across.lengthSq() < 1e-6) across.set(1, 0, 0)
        this.root.quaternion.setFromUnitVectors(up, travel).premultiply(new THREE.Quaternion().setFromAxisAngle(across, this.spin))
        // In short steps, so a slow frame can't carry it through the player or a wall. Its head buries itself in the
        // first surface ahead.
        const length = this.velocity.length() * dt, steps = Math.max(1, Math.ceil(length / 0.25)), step = length / steps
        // A ray reports its full length when it hits nothing.
        const reach = length + 0.6, found = sense.rayDistance(this.root.position, travel, reach + 1), wall = found <= reach ? found : Infinity
        for (let i = 0; i < steps && this.state === 'flying'; i++) {
          const travelled = (i + 1) * step
          this.root.position.addScaledVector(travel, step)
          if (target?.alive && !this.hit && this.touches(target)) {
            this.hit = true
            this.emit({ kind: 'impact', position: target.eye.clone(), radius: 20 })
            this.onHitPlayer(HAMMER_RULES.damage, this.root.position.clone())
            this.state = 'return'
          } else if (travelled + 0.6 >= wall) {
            this.state = 'stuck'; this.timer = 0
            this.emit({ kind: 'knife-wall', position: this.root.position.clone(), radius: 30 })
          }
        }
        if (this.state === 'flying' && this.timer > HAMMER_RULES.flight) this.state = 'return'
        this.root.updateMatrixWorld(true)
        break
      }
      case 'stuck': {
        this.timer += dt
        if (this.timer >= HAMMER_RULES.stuck) this.state = 'return'
        break
      }
      case 'return': {
        const to = home.clone().sub(this.root.position), distance = to.length()
        const move = Math.min(distance, HAMMER_RULES.returnSpeed * dt)
        this.root.position.addScaledVector(to.normalize(), move)
        aim(owner.position.clone().add(new THREE.Vector3(0, 6, 0)), 4)
        if (distance < 0.4) { this.state = 'orbit'; this.cooldown = HAMMER_RULES.cooldown + this.random() * HAMMER_RULES.cooldownJitter }
        break
      }
    }
    // A tremble while winding up, and when it's hit.
    const tremble = (this.state === 'windup' ? 0.06 : 0) + this.shake * 0.25
    this.model.position.set(0, -0.6, 0)
    if (tremble > 0 && !sense.reducedMotion) this.model.position.add(new THREE.Vector3((this.random() - 0.5) * tremble, 0, (this.random() - 0.5) * tremble))
  }

  /** Whether it is within reach of the player's body (a capsule from feet to eye). */
  private touches(target: NonNullable<HammerSense['target']>) {
    const head = this.root.position, axis = target.eye.clone().sub(target.feet)
    const t = THREE.MathUtils.clamp(head.clone().sub(target.feet).dot(axis) / axis.lengthSq(), 0, 1)
    return head.distanceTo(target.feet.clone().addScaledVector(axis, t)) < HAMMER_RULES.reach
  }

  /** How far along a ray the hammer is, or Infinity: a capsule down the handle and one across the head. */
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, max: number) {
    if (!this.root.visible || this.state === 'idle') return Infinity
    this.root.updateMatrixWorld(true)
    const world = (x: number, y: number) => this.model.localToWorld(new THREE.Vector3(x, y, 0))
    const scale = HAMMER_RULES.scale, normal = direction.clone().normalize()
    const handle = rayCapsuleDistance(origin, normal, world(0, -0.12), world(0, 0.82), 0.05 * scale)
    const head = rayCapsuleDistance(origin, normal, world(-0.23, 0.9), world(0.23, 0.9), 0.1 * scale)
    const distance = Math.min(handle, head)
    return distance <= max ? distance : Infinity
  }

  /** A bullet hit: true when it breaks. Shot down mid-flight or stuck, it still falls. */
  damage(amount: number) {
    if (!this.active || amount <= 0) return false
    this.health = Math.max(0, this.health - amount)
    this.shake = 0.25
    if (this.health > 0) return false
    this.breakApart()
    return true
  }

  private breakApart() {
    if (this.state === 'broken') return
    this.state = 'broken'
    this.health = 0
    this.velocity.set((this.random() - 0.5) * 2, 1.5, (this.random() - 0.5) * 2)
    this.spin = 4 + this.random() * 4
    this.emit({ kind: 'crate-explosion', position: this.root.position.clone(), radius: 35 })
  }

  /** Broken: falls, tumbling, and lies where it lands. */
  private fall(dt: number, sense: HammerSense) {
    if (!this.root.visible || this.velocity.lengthSq() === 0) return
    this.velocity.y -= 9.8 * dt
    const step = this.velocity.clone().multiplyScalar(dt)
    const ground = sense.rayDistance(this.root.position, new THREE.Vector3(0, -1, 0), 4)
    this.root.position.add(step)
    this.root.rotateX(this.spin * dt)
    if (ground < 0.35 && this.velocity.y < 0) {
      this.root.position.y -= ground - 0.3
      this.root.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, this.angle, 0))
      this.velocity.set(0, 0, 0)
    }
  }

  snapshot(): HammerSnapshot { return { health: this.health, state: this.state === 'broken' ? 'broken' : this.state === 'idle' ? 'idle' : 'orbit' } }

  /** Back as saved: idle until its master wakes, hovering beside him, or lying broken where he stands. */
  restore(snapshot: HammerSnapshot | undefined, owner: THREE.Vector3) {
    this.health = snapshot?.health ?? HAMMER_RULES.health
    this.state = snapshot?.state ?? 'idle'
    this.cooldown = HAMMER_RULES.firstAttack
    this.velocity.set(0, 0, 0)
    this.shake = 0
    this.root.visible = this.state !== 'idle'
    if (this.state === 'broken') {
      this.root.position.copy(owner).add(new THREE.Vector3(1.5, 0.3, 0))
      this.root.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))
    } else this.root.position.copy(this.orbitPoint(owner))
  }

  dispose() {
    this.root.removeFromParent()
    this.root.traverse(object => {
      const mesh = object as THREE.Mesh
      if (mesh.isMesh) { mesh.geometry.dispose(); (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => material.dispose()) }
    })
  }
}
