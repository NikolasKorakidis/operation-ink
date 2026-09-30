import * as THREE from 'three'
import { createPenLines, createPenSilhouette } from '../render/ballpoint'
import { Draft } from '../render/ink'
import type { MissionState } from './mission'
import type { SoundEvent } from './types'

/** A crate takes two pistol rounds; guards within `noiseRadius` hear it go. */
export const CRATE_RULES = { health: 55, noiseRadius: 32 } as const

type Crate = { id: string; object: THREE.Object3D; home: THREE.Vector3; health: number; broken: boolean }
type Piece = { object: Draft; velocity: THREE.Vector3; spin: THREE.Vector3; floor: number; age: number }
type Blast = { root: THREE.Group; age: number; puffs: THREE.Mesh[]; burst: THREE.Object3D; core: THREE.Mesh; glow: THREE.Mesh }

const PIECE_LIFE = 7
const BLAST_LIFE = 1.4
// Flash and smoke glow on their own; neon light and dark rooms must not tint them.
const unlit = (color: number, opacity: number) => Object.assign(new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
  depthWrite: false, toneMapped: false }), { defines: { NEON_UNLIT: '' } })
const sphere = new THREE.SphereGeometry(1, 18, 12)

/**
 * The breakable quest crates (interiors.ts places them with `userData.questCrate`). The mission state owns
 * which crates are broken; this shows exactly those, gives each one hit points, and plays a small explosion
 * when one breaks: an orange flash, an ink burst, smoke, and planks flying out and settling on the floor.
 */
export class QuestCrates {
  readonly crates = new Map<string, Crate>()
  private effects = new THREE.Group()
  private pieces: Piece[] = []
  private blasts: Blast[] = []

  constructor(scene: THREE.Object3D, private play: (event: SoundEvent) => void) {
    scene.traverse(object => {
      const id = object.userData.questCrate as string | undefined
      if (id) this.crates.set(id, { id, object, home: object.position.clone(), health: CRATE_RULES.health, broken: false })
    })
    this.effects.name = 'Crate explosions'
    this.effects.userData.noCollision = true
    scene.add(this.effects)
  }

  /** The unbroken crate a shot surface belongs to, if any. */
  at(mesh: THREE.Object3D | null | undefined): string | null {
    for (let object: THREE.Object3D | null | undefined = mesh; object; object = object.parent) {
      const id = object.userData.questCrate as string | undefined
      if (id) return this.crates.get(id)?.broken === false ? id : null
    }
    return null
  }

  /** The middle of a crate, in world space. */
  center(id: string) {
    const crate = this.crates.get(id)
    return crate ? crate.object.localToWorld(new THREE.Vector3(0, 0.36, 0)) : null
  }

  /** Applies a hit; true when it breaks the crate. The caller records that in the mission state. */
  damage(id: string, amount: number) {
    const crate = this.crates.get(id)
    if (!crate || crate.broken || amount <= 0) return false
    crate.health -= amount
    return crate.health <= 0
  }

  /**
   * Shows exactly the crates `state` has not broken. A crate that breaks now explodes when `animate` is set;
   * checkpoint restores and restarts pass false, and crates that come back are whole again.
   */
  sync(state: MissionState, animate = true) {
    for (const crate of this.crates.values()) {
      const broken = state.brokenCrates.includes(crate.id)
      if (broken === crate.broken) continue
      const center = this.center(crate.id)!, floor = crate.object.getWorldPosition(new THREE.Vector3()).y
      crate.broken = broken
      crate.health = CRATE_RULES.health
      crate.object.visible = !broken
      // Out of the level, so its dynamic collider stops blocking movement, sight and shots.
      crate.object.position.copy(crate.home)
      if (broken) crate.object.position.y -= 1000
      crate.object.updateMatrixWorld(true)
      if (broken && animate) this.explode(center, floor)
    }
  }

  /** Every crate whole again, with no explosion or debris left (checkpoint restore, restart). */
  reset(state: MissionState) {
    this.clear()
    this.sync(state, false)
    for (const crate of this.crates.values()) if (!crate.broken) crate.health = CRATE_RULES.health
  }

  private explode(center: THREE.Vector3, floor: number) {
    this.play({ kind: 'crate-explosion', position: center.clone(), radius: 45 })
    const root = new THREE.Group()
    root.position.copy(center)
    const glow = new THREE.Mesh(sphere, unlit(0xffc24a, 0.95))
    const core = new THREE.Mesh(sphere, unlit(0xff6a1a, 0.9))
    // Cartoon smoke: white puffs with a pen outline that swell, drift up and shrink away.
    const puffs = Array.from({ length: 7 }, (_, i) => {
      const puff = new THREE.Mesh(sphere, unlit(0xffffff, 1))
      // Opaque and depth-writing, so the outline hull behind it only shows around its edge.
      Object.assign(puff.material, { transparent: false, depthWrite: true })
      puff.add(createPenSilhouette(sphere, 2.2))
      const angle = i / 7 * Math.PI * 2
      puff.position.set(Math.cos(angle) * 0.2, 0.05 + (i % 3) * 0.1, Math.sin(angle) * 0.2)
      puff.userData.drift = new THREE.Vector3(Math.cos(angle) * 0.45, 0.55 + (i % 3) * 0.2, Math.sin(angle) * 0.45)
      puff.userData.size = 0.2 + (i % 3) * 0.06
      puff.scale.setScalar(0.001)
      return puff
    })
    // Ink rays thrown out from the blast, like a pen drawing of an explosion.
    const rays = new THREE.Group()
    for (let i = 0; i < 12; i++) {
      const direction = new THREE.Vector3().randomDirection()
      direction.y = Math.abs(direction.y) * 0.8
      direction.normalize()
      rays.add(createPenLines([direction.clone().multiplyScalar(0.25), direction.clone().multiplyScalar(0.55 + Math.random() * 0.35)], 1400 + i, 'edge', 2.4))
    }
    root.add(glow, core, rays, ...puffs)
    this.effects.add(root)
    this.blasts.push({ root, age: 0, puffs, burst: rays, core, glow })
    // Planks and splinters, in the crate's own wood.
    for (let i = 0; i < 11; i++) {
      const piece = new Draft('Crate plank')
      const long = i < 6
      piece.box(long ? 0.5 + Math.random() * 0.25 : 0.12 + Math.random() * 0.1, 0.04, long ? 0.11 : 0.06, 0, 0, 0,
        i % 3 ? 'wood' : 'timber', 'detail')
      piece.finish()
      piece.position.copy(center).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.3) * 0.3, (Math.random() - 0.5) * 0.4))
      piece.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
      const out = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize()
      this.effects.add(piece)
      this.pieces.push({ object: piece, age: 0, floor: floor + 0.02,
        velocity: out.multiplyScalar(0.7 + Math.random() * 1.4).setY(1.6 + Math.random() * 1.8),
        spin: new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16) })
    }
  }

  update(dt: number) {
    const delta = Math.max(0, Math.min(dt, 0.05))
    for (const blast of this.blasts) {
      blast.age += delta
      const t = blast.age
      const flash = Math.max(0, 1 - t / 0.22)
      blast.glow.scale.setScalar(0.25 + 0.75 * Math.min(1, t / 0.12))
      blast.core.scale.setScalar(0.15 + 0.45 * Math.min(1, t / 0.1))
      ;(blast.glow.material as THREE.MeshBasicMaterial).opacity = 0.95 * flash
      ;(blast.core.material as THREE.MeshBasicMaterial).opacity = 0.9 * flash
      blast.glow.visible = blast.core.visible = flash > 0
      blast.burst.scale.setScalar(0.6 + 1.4 * Math.min(1, t / 0.18))
      blast.burst.visible = t < 0.3
      for (const puff of blast.puffs) {
        puff.position.addScaledVector(puff.userData.drift as THREE.Vector3, delta)
        const swell = Math.min(1, t / 0.25), shrink = Math.max(0, 1 - Math.max(0, t - 0.5) / (BLAST_LIFE - 0.5))
        puff.scale.setScalar(Math.max(0.001, (puff.userData.size as number) * swell * shrink))
      }
    }
    for (const blast of this.blasts.filter(blast => blast.age >= BLAST_LIFE)) this.removeBlast(blast)
    for (const piece of this.pieces) {
      piece.age += delta
      const object = piece.object
      if (object.position.y > piece.floor || piece.velocity.y > 0) {
        piece.velocity.y -= 9.8 * delta
        object.position.addScaledVector(piece.velocity, delta)
        object.rotation.x += piece.spin.x * delta; object.rotation.y += piece.spin.y * delta; object.rotation.z += piece.spin.z * delta
        if (object.position.y <= piece.floor) {
          // Land, bounce a little, and lie flat once it stops.
          object.position.y = piece.floor
          piece.velocity.set(piece.velocity.x * 0.35, Math.abs(piece.velocity.y) > 1.2 ? -piece.velocity.y * 0.25 : 0, piece.velocity.z * 0.35)
          piece.spin.multiplyScalar(0.3)
          if (piece.velocity.y === 0) { object.rotation.x = 0; object.rotation.z = 0 }
        }
      }
      if (piece.age > PIECE_LIFE - 1) object.scale.setScalar(Math.max(0.001, PIECE_LIFE - piece.age))
    }
    for (const piece of this.pieces.filter(piece => piece.age >= PIECE_LIFE)) this.removePiece(piece)
  }

  get active() { return this.blasts.length + this.pieces.length }

  private removeBlast(blast: Blast) {
    blast.root.removeFromParent()
    // The flash and smoke materials are the blast's own; the pen rays share the pen material, so keep it.
    for (const mesh of [blast.glow, blast.core, ...blast.puffs]) (mesh.material as THREE.Material).dispose()
    blast.burst.traverse(object => { if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).geometry.dispose() })
    this.blasts.splice(this.blasts.indexOf(blast), 1)
  }

  private removePiece(piece: Piece) {
    piece.object.removeFromParent()
    // Draft fills and ink share their materials; only the geometry is the piece's own.
    piece.object.traverse(object => { if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).geometry.dispose() })
    this.pieces.splice(this.pieces.indexOf(piece), 1)
  }

  clear() {
    for (const blast of [...this.blasts]) this.removeBlast(blast)
    for (const piece of [...this.pieces]) this.removePiece(piece)
  }

  dispose() {
    this.clear()
    this.effects.removeFromParent()
  }
}
