import * as THREE from 'three'
import type { EnemyState } from './types'
import './status-tags.css'

type Guard = { spec: { id: string; dummy?: boolean }; state: EnemyState; blind: number; position: THREE.Vector3
  actor: { root: THREE.Object3D; rig?: { bones: { head?: THREE.Object3D } } } }

/** Tags show for guards within this distance (m) whom the camera can actually see. */
const SHOW_WITHIN = 45
/** How often (s) each tag re-checks the line of sight. */
const SIGHT_EVERY = 0.12

/** Seeing a world point from the camera, ignoring `target` (the guard himself). */
export type Seen = (point: THREE.Vector3, target: THREE.Object3D) => boolean

/**
 * Over a guard blinded by a flashbang: a crossed-out eye in a burst of rays, inside a ring that drains as his sight
 * comes back, so you know who is helpless and for how long. Hidden behind walls, like everything you cannot see.
 */
export class StatusTags {
  private layer = document.createElement('div')
  private tags = new Map<Guard, { root: HTMLElement; ring: SVGCircleElement; total: number; last: number; seen: boolean; check: number }>()
  private point = new THREE.Vector3()

  constructor(parent: HTMLElement = document.body) {
    this.layer.className = 'status-tag-layer'
    parent.append(this.layer)
  }

  private tag(guard: Guard) {
    let tag = this.tags.get(guard)
    if (tag) return tag
    const root = document.createElement('div')
    root.className = 'status-tag'
    root.innerHTML = `<svg viewBox="-24 -24 48 48" aria-label="Blinded">
      <circle class="status-ring-track" r="20"/><circle class="status-ring" r="20" pathLength="100" transform="rotate(-90)"/>
      <g class="status-rays">${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="0" y1="-11.5" x2="0" y2="-15" transform="rotate(${a})"/>`).join('')}</g>
      <path class="status-eye" d="M-10 0 Q0 -8.5 10 0 Q0 8.5 -10 0Z"/><circle class="status-pupil" r="3"/>
      <line class="status-slash" x1="-9" y1="9" x2="9" y2="-9"/></svg>`
    this.layer.append(root)
    tag = { root, ring: root.querySelector('.status-ring')!, total: 0, last: 0, seen: false, check: 0 }
    this.tags.set(guard, tag)
    return tag
  }

  update(dt: number, camera: THREE.PerspectiveCamera, guards: readonly Guard[], visible: boolean, seen: Seen) {
    const width = this.layer.clientWidth || innerWidth, height = this.layer.clientHeight || innerHeight
    for (const guard of guards) {
      const blind = guard.state === 'dead' || guard.state === 'reserve' ? 0 : guard.blind
      if (blind <= 0 && !this.tags.has(guard)) continue
      const tag = this.tag(guard)
      // A fresh flash (or a second one on top) restarts the ring from full.
      if (blind > tag.last + 0.05) tag.total = blind
      tag.last = blind
      if (blind <= 0) { tag.root.hidden = true; tag.total = 0; continue }
      const head = guard.actor.rig?.bones.head
      if (head) head.getWorldPosition(this.point); else this.point.copy(guard.position).setY(guard.position.y + 1.7)
      if ((tag.check -= dt) <= 0) { tag.check = SIGHT_EVERY; tag.seen = seen(this.point, guard.actor.root) }
      this.point.y += 0.55 * (guard.actor.root.scale.y || 1)
      const near = camera.position.distanceTo(this.point) < SHOW_WITHIN
      this.point.project(camera)
      const onScreen = this.point.z < 1 && Math.abs(this.point.x) < 1.1 && Math.abs(this.point.y) < 1.1
      const show = visible && near && onScreen && tag.seen
      tag.root.hidden = !show
      if (!show) continue
      tag.root.style.transform = `translate(${((this.point.x + 1) / 2 * width).toFixed(1)}px, ${((1 - this.point.y) / 2 * height).toFixed(1)}px) translate(-50%, -100%)`
      tag.ring.style.strokeDasharray = `${(100 * Math.min(1, blind / Math.max(tag.total, 0.01))).toFixed(1)} 100`
      tag.root.classList.toggle('is-fading', blind < 1)
    }
  }

  dispose() { this.layer.remove(); this.tags.clear() }
}
