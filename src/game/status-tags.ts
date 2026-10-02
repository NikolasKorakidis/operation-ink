import * as THREE from 'three'
import { DETECTION } from './balance'
import type { EnemyState } from './types'
import './status-tags.css'

type Guard = { spec: { id: string; dummy?: boolean; role?: string }; state: EnemyState; blind: number; notice: number; canSee: boolean
  position: THREE.Vector3; actor: { root: THREE.Object3D; rig?: { bones: { head?: THREE.Object3D } }; muzzle?: () => THREE.Vector3 } }

/** Tags show for guards within this distance (m) whom the camera can actually see. */
const SHOW_WITHIN = 240
/** How often (s) each tag re-checks the line of sight. */
const SIGHT_EVERY = 0.12

/** Seeing a world point from the camera, ignoring `target` (the guard himself). */
export type Seen = (point: THREE.Vector3, target: THREE.Object3D) => boolean

/** A manga burst balloon's outline: `spikes` points round a centre, alternating out to `outer` and in to `inner`. */
const burst = (spikes: number, outer: number, inner: number, turn = 0) => Array.from({ length: spikes * 2 }, (_, i) => {
  const a = turn + i / (spikes * 2) * Math.PI * 2, r = i % 2 ? inner : outer * (0.9 + 0.1 * ((i * 7) % 3) / 2)
  return `${(Math.sin(a) * r).toFixed(1)},${(-Math.cos(a) * r).toFixed(1)}`
}).join(' ')
/**
 * A marker drawn like a manga sound effect, after killer7 and Borderlands: a spiky burst balloon cut out of white
 * paper and inked heavy black, its colour filling it from the bottom up (`--fill`, the clip's level), screentone dots
 * where it is empty, emphasis lines round it, and the glyph in poster capitals across it.
 */
const balloon = (kind: 'notice' | 'alert', glyph: string, spikes: number, turn: number) => {
  const shape = burst(spikes, 25, 17, turn)
  return `
  <svg class="status-glyph status-${kind}" viewBox="-34 -34 68 68" aria-label="${kind === 'notice' ? 'Suspicious' : 'Alerted'}">
    <defs>
      <clipPath id="status-fill-${kind}-ID"><rect class="status-level" x="-40" y="-34" width="80" height="68"/></clipPath>
      <pattern id="status-tone-${kind}-ID" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="0.85" fill="#000" opacity="0.55"/></pattern>
    </defs>
    <g class="status-ticks"><path d="M27 -27 L33 -33 M31 -16 L38 -18 M18 -31 L19 -38 M-27 -27 L-32 -32"/></g>
    <polygon class="status-edge" points="${shape}"/>
    <polygon class="status-ink" points="${shape}"/>
    <polygon class="status-paper" points="${shape}"/>
    <polygon class="status-tone" points="${shape}" fill="url(#status-tone-${kind}-ID)"/>
    <polygon class="status-color" points="${shape}" clip-path="url(#status-fill-${kind}-ID)"/>
    <text class="status-letter" x="1" y="11" text-anchor="middle">${glyph}</text>
  </svg>`
}
const QUESTION = balloon('notice', '?', 11, 0.12)
const BANG = balloon('alert', '!', 13, -0.08)
const BLIND = `<svg class="status-glyph status-blind" viewBox="-24 -24 48 48" aria-label="Blinded">
  <circle class="status-ring-track" r="20"/><circle class="status-ring" r="20" pathLength="100" transform="rotate(-90)"/>
  <g class="status-rays">${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="0" y1="-11.5" x2="0" y2="-15" transform="rotate(${a})"/>`).join('')}</g>
  <path class="status-eye" d="M-10 0 Q0 -8.5 10 0 Q0 8.5 -10 0Z"/><circle class="status-pupil" r="3"/>
  <line class="status-slash" x1="-9" y1="9" x2="9" y2="-9"/></svg>`
const GLINT = `<svg viewBox="-20 -20 40 40" aria-label="Sniper glint"><path d="M0 -19 L3 -3 L19 0 L3 3 L0 19 L-3 3 L-19 0 L-3 -3Z"/><circle r="4.5"/></svg>`

type Mode = 'blind' | 'alert' | 'notice' | null
type Tag = { root: HTMLElement; level: SVGRectElement; ring: SVGCircleElement; glint: HTMLElement; total: number; last: number
  seen: boolean; gunSeen: boolean; check: number; mode: Mode }

/**
 * Over each guard, what he makes of you, Borderlands-style: a yellow ? while he has spotted you but is not sure (it
 * fills over DETECTION.notice seconds: that is your time to hide or drop him), a red ! once he is alerted and has you
 * in view, and a crossed-out eye (with a draining ring) while a flashbang has him blind. A sniper watching you
 * shows a glint on his rifle. All of it hidden behind walls, like anything you cannot see.
 */
export class StatusTags {
  private layer = document.createElement('div')
  private tags = new Map<Guard, Tag>()
  private point = new THREE.Vector3()
  private ids = 0

  constructor(parent: HTMLElement = document.body) {
    this.layer.className = 'status-tag-layer'
    parent.append(this.layer)
  }

  private tag(guard: Guard) {
    let tag = this.tags.get(guard)
    if (tag) return tag
    const id = String(this.ids++)
    const root = document.createElement('div')
    root.className = 'status-tag'
    root.innerHTML = (QUESTION + BANG).replaceAll('-ID', `-${id}`) + BLIND
    const glint = document.createElement('div')
    glint.className = 'sniper-glint'
    glint.innerHTML = GLINT
    glint.hidden = true
    this.layer.append(root, glint)
    tag = { root, level: root.querySelector('.status-notice .status-level')!, ring: root.querySelector('.status-ring')!, glint,
      total: 0, last: 0, seen: false, gunSeen: false, check: 0, mode: null }
    this.tags.set(guard, tag)
    return tag
  }

  private place(element: HTMLElement, camera: THREE.PerspectiveCamera, at: THREE.Vector3, width: number, height: number) {
    this.point.copy(at).project(camera)
    if (this.point.z >= 1 || Math.abs(this.point.x) > 1.1 || Math.abs(this.point.y) > 1.1) return false
    element.style.transform = `translate(${((this.point.x + 1) / 2 * width).toFixed(1)}px, ${((1 - this.point.y) / 2 * height).toFixed(1)}px) translate(-50%, -100%)`
    return true
  }

  update(dt: number, camera: THREE.PerspectiveCamera, guards: readonly Guard[], visible: boolean, seen: Seen) {
    const width = this.layer.clientWidth || innerWidth, height = this.layer.clientHeight || innerHeight
    for (const guard of guards) {
      const gone = guard.state === 'dead' || guard.state === 'reserve'
      const blind = gone ? 0 : guard.blind
      const mode: Mode = gone ? null : blind > 0 ? 'blind' : guard.state === 'combat' && guard.canSee ? 'alert'
        : guard.state !== 'combat' && guard.notice > 0 ? 'notice' : null
      const sniperWatching = !gone && blind <= 0 && guard.spec.role === 'sniper' && guard.canSee
      if (!mode && !sniperWatching && !this.tags.has(guard)) continue
      const tag = this.tag(guard)
      // A fresh flash (or a second one on top) restarts the blind ring from full.
      if (blind > tag.last + 0.05) tag.total = blind
      tag.last = blind
      const head = guard.actor.rig?.bones.head
      const anchor = head ? head.getWorldPosition(new THREE.Vector3()) : guard.position.clone().setY(guard.position.y + 1.7)
      const muzzle = sniperWatching ? guard.actor.muzzle?.() ?? null : null
      if ((tag.check -= dt) <= 0) {
        tag.check = SIGHT_EVERY
        tag.seen = !!mode && seen(anchor, guard.actor.root)
        tag.gunSeen = !!muzzle && seen(muzzle, guard.actor.root)
      }
      const near = camera.position.distanceTo(anchor) < SHOW_WITHIN
      anchor.y += 0.5 * (guard.actor.root.scale.y || 1)
      const show = visible && near && !!mode && tag.seen && this.place(tag.root, camera, anchor, width, height)
      tag.root.hidden = !show
      if (show) {
        if (tag.mode !== mode) { tag.root.dataset.mode = mode!; tag.root.classList.remove('is-new'); void tag.root.offsetWidth; tag.root.classList.add('is-new') }
        if (mode === 'notice') {
          const fill = Math.min(1, guard.notice / DETECTION.notice)
          tag.level.setAttribute('y', (34 - 68 * fill).toFixed(1))
          tag.root.classList.toggle('is-urgent', fill > 0.66)
        }
        if (mode === 'blind') {
          tag.ring.style.strokeDasharray = `${(100 * Math.min(1, blind / Math.max(tag.total, 0.01))).toFixed(1)} 100`
          tag.root.classList.toggle('is-fading', blind < 1)
        }
      }
      tag.mode = show ? mode : null
      // The sniper's glint: on his rifle, while he has you in his sights.
      tag.glint.hidden = !(visible && muzzle && tag.gunSeen && this.place(tag.glint, camera, muzzle.add(new THREE.Vector3(0, 0.25, 0)), width, height))
    }
  }

  dispose() { this.layer.remove(); this.tags.clear() }
}
