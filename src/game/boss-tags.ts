import * as THREE from 'three'
import type { EnemyState } from './types'
import './boss-tags.css'

type Boss = { spec: { id: string; name: string; boss?: boolean; health?: number; armor?: number }; state: EnemyState; health: number; armor: number
  position: THREE.Vector3; actor: { rig?: { bones: { head?: THREE.Object3D } } } }

/** Within this distance (m), or while he is fighting you, a boss's tag shows over his head. */
const SHOW_WITHIN = 32

/**
 * A boss's name, armour and health over his head, in the mission (the tutorial has its own big bar). It appears
 * once you are close or he is in the fight, follows his head on screen, and drains with a pale trail after each
 * hit; when he falls it reads DOWN and fades.
 */
export class BossTags {
  private layer = document.createElement('div')
  private tags = new Map<Boss, { root: HTMLElement; fill: HTMLElement; trail: HTMLElement; armor: HTMLElement; text: HTMLElement; trailValue: number; downFor: number }>()
  private point = new THREE.Vector3()

  constructor(parent: HTMLElement = document.body) {
    this.layer.className = 'boss-tag-layer'
    parent.append(this.layer)
  }

  private tag(boss: Boss) {
    let tag = this.tags.get(boss)
    if (tag) return tag
    const root = document.createElement('div')
    root.className = 'boss-tag'
    root.innerHTML = `<b>${boss.spec.name}</b><div class="boss-tag-armor"><i></i></div><div class="boss-tag-health"><i class="trail"></i><i class="fill"></i><span></span></div>`
    this.layer.append(root)
    tag = { root, fill: root.querySelector('.fill')!, trail: root.querySelector('.trail')!, armor: root.querySelector('.boss-tag-armor i')!,
      text: root.querySelector('span')!, trailValue: 1, downFor: 0 }
    this.tags.set(boss, tag)
    return tag
  }

  update(dt: number, camera: THREE.PerspectiveCamera, enemies: readonly Boss[], visible: boolean) {
    const width = this.layer.clientWidth || innerWidth, height = this.layer.clientHeight || innerHeight
    for (const boss of enemies) {
      if (!boss.spec.boss) continue
      const tag = this.tag(boss)
      const dead = boss.state === 'dead'
      tag.downFor = dead ? tag.downFor + dt : 0
      const head = boss.actor.rig?.bones.head
      if (head) head.getWorldPosition(this.point); else this.point.copy(boss.position).setY(boss.position.y + 3.2)
      this.point.y += 0.9
      const distance = camera.position.distanceTo(this.point)
      const near = distance < SHOW_WITHIN || boss.state === 'combat'
      this.point.project(camera)
      const onScreen = this.point.z < 1 && Math.abs(this.point.x) < 1.1 && Math.abs(this.point.y) < 1.1
      const show = visible && boss.state !== 'reserve' && near && onScreen && tag.downFor < 2.5
      tag.root.hidden = !show
      if (!show) continue
      tag.root.style.transform = `translate(${((this.point.x + 1) / 2 * width).toFixed(1)}px, ${((1 - this.point.y) / 2 * height).toFixed(1)}px) translate(-50%, -100%)`
      const health = Math.max(0, boss.health / (boss.spec.health ?? 1)), armor = boss.spec.armor ? Math.max(0, boss.armor / boss.spec.armor) : 0
      tag.trailValue = health >= tag.trailValue ? health : Math.max(health, tag.trailValue - dt * 0.35)
      tag.fill.style.width = `${(health * 100).toFixed(1)}%`
      tag.trail.style.width = `${(tag.trailValue * 100).toFixed(1)}%`
      tag.armor.style.width = `${(armor * 100).toFixed(1)}%`
      tag.root.classList.toggle('no-armor', armor <= 0)
      tag.root.classList.toggle('is-down', dead)
      tag.text.textContent = dead ? 'DOWN' : `${Math.ceil(boss.health)}`
    }
  }

  dispose() { this.layer.remove(); this.tags.clear() }
}
