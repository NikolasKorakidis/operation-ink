import * as THREE from 'three'
import type { Stance } from '../player/body'
import { BOSS_RULES, CRITICAL_HITS, HAMMER_RULES, HEAD_BURST_CHANCE, WEAPON_RULES } from './balance'
import type { HitReaction } from './hit-reactions'
import type { HammerState } from './flying-hammer'
import { TUTORIAL_ENEMIES } from './tutorial-world'
import type { EnemySpec, EnemyState, WeaponItem, WeaponName } from './types'
import { TRAINING } from '../world/training-ground'
import './tutorial.css'

/** What the tutorial reads from the player each frame. */
export type TutorialProbe = {
  position: THREE.Vector3; speed: number; grounded: boolean; traversing: boolean; stance: Stance; lean: number; aiming: boolean
  weapon: WeaponName | null; slot: number; slots: readonly (WeaponItem | null)[]; reloading: boolean
}
type Guard = { spec: EnemySpec; state: EnemyState; health: number; armor: number }
export type TutorialHooks = {
  camera: THREE.PerspectiveCamera
  enemies: () => readonly Guard[]
  /** Wake held guards; with `toward` they come hunting for that point. */
  wake: (ids: string[], toward?: THREE.Vector3) => void
  /** Make the current state the one a death returns to. */
  checkpoint: () => void
  restart: () => void
  reducedMotion: () => boolean
  /** The Sledge's flying hammer, if the level has one: its health and what it is doing. */
  hammer?: () => { health: number; state: HammerState } | null
}

type Progress = {
  walked: number; sprint: number; airborne: number; crouch: number; crawl: number; leanLeft: boolean; leanRight: boolean
  slots: Set<number>; aim: number; rangeHits: number; heads: number; reloaded: boolean; knifed: boolean; toggled: boolean; bossAwake: boolean
}
type Lesson = { id: string; title: string; keys: string[]; text: string; where?: readonly number[]; extra?: () => string; done: (p: Progress, probe: TutorialProbe, guards: readonly Guard[]) => boolean; enter?: () => void }
/** A damage number flies out of the hit on an arc: `drift` px/s sideways, `lift` px/s up, then gravity takes it. */
type Popup = { element: HTMLElement; point: THREE.Vector3; age: number; life: number; drift: number; lift: number }
/** Damage numbers are grey below this, yellow from it, and red on a critical hit (or a head burst). */
export const HEAVY_HIT = 35
/**
 * Paused for now: floating damage numbers and critical hits. Both are built (hit() and the AI's criticals) and come
 * back by switching these on; while off, the lessons and the finish card don't mention them.
 */
export const TUTORIAL_FEEDBACK = { damageNumbers: false, criticals: false } as const

const kbd = (keys: string[]) => keys.map(key => `<kbd>${key}</kbd>`).join('')
const percent = (value: number) => `${Math.round(value * 100)}%`
const CHANCE_ROWS: [string, WeaponName][] = [['Pistol', 'silenced'], ['SMG', 'smg'], ['AK rifle', 'ak'], ['Shotgun', 'shotgun'], ['Sniper', 'sniper'], ['Knife', 'knife']]

/**
 * The tutorial level: a coach that teaches every move one lesson at a time and waits until the player has actually
 * done it, a marker pointing to where the next lesson happens, floating damage numbers on every hit (critical hits
 * and head shots stand out), the live-fire squad, and the boss fight against the Sledge with his health and
 * armour bar. Only the tutorial has any of this; the mission is untouched.
 */
export class TutorialMode {
  private readonly root = document.createElement('div')
  private readonly card = document.createElement('section')
  private readonly list = document.createElement('section')
  private readonly marker = document.createElement('div')
  private readonly numbers = document.createElement('div')
  private readonly bossBar = document.createElement('section')
  private readonly banner = document.createElement('div')
  private readonly finish = document.createElement('section')
  private readonly lessons: Lesson[]
  private index = 0
  private progress!: Progress
  private popups: Popup[] = []
  private celebrate = 0
  private last = new THREE.Vector3()
  private trail = 1
  private trailHold = 0
  private lastHealth = 1
  private bannerTimer = 0
  private bossDownFor = -1
  private hammerDown = false
  private finished = false
  private elapsed = 0
  private stats = { hits: 0, criticals: 0, heads: 0, bursts: 0, damage: 0, best: 0 }
  private readonly scratch = new THREE.Vector3()
  private abort = new AbortController()

  constructor(private hooks: TutorialHooks) {
    this.lessons = [
      { id: 'walk', title: 'Move', keys: ['W', 'A', 'S', 'D'], where: TRAINING.marks.yard, text: 'Walk up the yard. The mouse looks around.', done: p => p.walked > 4 },
      { id: 'sprint', title: 'Sprint', keys: ['Shift'], text: 'Hold Shift while you move to run. Guards hear running feet up close; walking is silent to them.', done: p => p.sprint > 0.7 },
      { id: 'jump', title: 'Jump', keys: ['Space'], text: 'Jump. You can only jump standing up.', done: p => p.airborne > 0.12 },
      { id: 'crouch', title: 'Crouch', keys: ['C'], where: TRAINING.marks.sandbags, text: 'Crouch behind the sandbags. Crouched you are slower, quieter, and your aim drifts less.', done: p => p.crouch > 0.6 },
      { id: 'lean', title: 'Lean', keys: ['Q', 'E'], where: TRAINING.marks.corner, text: 'At the corner wall, hold Q to lean left and E to lean right: peek out without stepping into the open.', done: p => p.leanLeft && p.leanRight },
      { id: 'prone', title: 'Crawl under', keys: ['Z', 'W'], where: TRAINING.marks.crawl, text: 'The armory is behind the wall, and the only way through is the low tunnel. Press Z to lie down and crawl through it. Prone is silent and the steadiest way to shoot.',
        done: (p, probe) => p.crawl > 1.2 && probe.position.z < TRAINING.crawl.z1 - 0.3 },
      { id: 'stand', title: 'Stand up', keys: ['Space'], text: 'Stand up again with Space (or press Z or C again). Under something low you stay down until you are clear of it.', done: (_, probe) => probe.stance === 'stand' },
      { id: 'pickup', title: 'Pick up a rifle', keys: ['F'], where: TRAINING.marks.armory, text: 'Walk to the armory table, look at a rifle and press F. You carry three weapons: knife, sidearm and one rifle.', done: (_, probe) => !!probe.slots[2] },
      { id: 'switch', title: 'Switch weapons', keys: ['1', '2', '3', 'Wheel'], text: '1 is the knife, 2 the sidearm, 3 the rifle. The mouse wheel cycles them too. Try all three.', done: p => p.slots.size >= 3 },
      { id: 'aim', title: 'Aim', keys: ['Right mouse'], where: TRAINING.marks.range, text: 'Step up to the firing line. Hold the right mouse button to aim down the sights; let go to stop.', done: p => p.aim > 0.6 },
      { id: 'shoot', title: 'Shoot', keys: ['Left mouse'], text: TUTORIAL_FEEDBACK.damageNumbers
        ? 'Shoot the practice soldiers. Every hit shows its damage: <b class="tip-hit">grey</b> is a light hit, <b class="tip-heavy">yellow</b> a heavy one, <b class="tip-crit">red</b> a critical hit. They get back up.'
        : 'Shoot the practice soldiers on the range. They get back up.', done: p => p.rangeHits >= 6 },
      { id: 'reload', title: 'Reload', keys: ['R'], text: 'Reload. The rounds left in the old magazine are thrown away with it, so reload when it is nearly empty.', done: p => p.reloaded },
      { id: 'heads', title: 'Head shots', keys: [], text: `Land three head shots. A head shot can blow the head apart${TUTORIAL_FEEDBACK.criticals ? ', and any hit can be critical' : ''}:`, extra: () => this.chanceTable(), done: p => p.heads >= 3 },
      { id: 'knife', title: 'Knife', keys: ['1', 'Left mouse'], where: TRAINING.marks.knife, text: 'Take out the knife, sneak into the booth behind the soldier with his back to you and strike. A blade in the back always kills.', done: p => p.knifed },
      { id: 'missions', title: 'Your list', keys: ['I'], text: 'Press I to fold and open this lesson list. In the mission it shows your objectives.', done: p => p.toggled },
      { id: 'live', title: 'Live fire', keys: [], where: TRAINING.marks.liveGate, text: 'Three soldiers hold the yard, and these ones shoot back. Use cover, crouch, lean out, and clear the yard.',
        enter: () => { this.hooks.wake([...TUTORIAL_ENEMIES.soldiers]); this.hooks.checkpoint() },
        done: (_, __, guards) => guards.filter(guard => (TUTORIAL_ENEMIES.soldiers as readonly string[]).includes(guard.spec.id)).every(guard => guard.state === 'dead') },
      { id: 'boss', title: 'Boss: the Sledge', keys: [], where: TRAINING.marks.bossGate, text: 'Go through the gate into the field. He fights with an AK. His helmet, vest and pouches soak body hits and get shot off piece by piece; head shots go straight through. His sledgehammer flies on its own: when it rises, step out of its line. One hit takes half your health. Shoot it down, or drop him and it falls too.',
        done: (_, __, guards) => guards.some(guard => guard.spec.id === TUTORIAL_ENEMIES.boss && guard.state === 'dead') },
    ]
    this.root.className = 'tutorial-hud'
    this.card.className = 'tutorial-card'
    this.list.className = 'tutorial-list is-collapsed'
    this.marker.className = 'tutorial-marker'
    this.marker.innerHTML = '<i></i><span></span>'
    this.numbers.className = 'damage-layer'
    this.bossBar.className = 'boss-bar'
    this.bossBar.hidden = true
    this.bossBar.innerHTML = `<header><b>The Sledge</b><span class="boss-note">Armoured · head shots go through</span></header>
      <div class="boss-armor" aria-label="Armour"><i></i><span>ARMOUR</span></div>
      <div class="boss-health" aria-label="Health"><i class="boss-trail"></i><i class="boss-fill"></i><span></span></div>
      <div class="hammer-bar" aria-label="His hammer"><header><b>The Sledgehammer</b><span class="hammer-note"></span></header>
        <div class="hammer-health"><i></i><span></span></div></div>`
    this.banner.className = 'tutorial-banner'
    this.banner.hidden = true
    this.finish.className = 'tutorial-finish'
    this.finish.hidden = true
    this.root.append(this.numbers, this.marker, this.card, this.list, this.bossBar, this.banner, this.finish)
    document.body.append(this.root)
    window.addEventListener('keydown', event => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || this.root.hidden) return
      if (event.code === 'KeyI') { event.preventDefault(); this.list.classList.toggle('is-collapsed'); this.progress.toggled = true }
      if (event.code === 'KeyN' && !this.finished && this.index < this.lessons.length) { event.preventDefault(); this.advance() }
    }, { signal: this.abort.signal })
    this.reset()
  }

  /** Back to the first lesson, with no numbers or bars on screen (a full restart). */
  reset() {
    this.index = 0
    this.progress = { walked: 0, sprint: 0, airborne: 0, crouch: 0, crawl: 0, leanLeft: false, leanRight: false, slots: new Set(), aim: 0, rangeHits: 0, heads: 0, reloaded: false, knifed: false, toggled: false, bossAwake: false }
    this.stats = { hits: 0, criticals: 0, heads: 0, bursts: 0, damage: 0, best: 0 }
    for (const popup of this.popups) popup.element.remove()
    this.popups = []
    this.trail = 1; this.lastHealth = 1; this.bossDownFor = -1; this.hammerDown = false; this.finished = false; this.elapsed = 0; this.celebrate = 0
    this.finish.hidden = true; this.banner.hidden = true; this.bossBar.hidden = true
    this.last.set(NaN, 0, 0)
    this.drawLesson(); this.drawList()
  }

  /** Every hit the player lands: floating damage, and lesson progress. */
  hit(hit: HitReaction) {
    const id = hit.targetId ?? ''
    const amount = Math.round((hit.damage ?? 0) + (hit.armorDamage ?? 0))
    const head = hit.zone === 'head'
    this.stats.hits++
    this.stats.damage += amount
    this.stats.best = Math.max(this.stats.best, amount)
    if (hit.critical) this.stats.criticals++
    if (head) { this.stats.heads++; this.progress.heads++ }
    if (hit.headBurst) this.stats.bursts++
    if ((TUTORIAL_ENEMIES.dummies as readonly string[]).includes(id)) this.progress.rangeHits++
    if (id === TUTORIAL_ENEMIES.knife && hit.weapon === 'knife' && hit.lethal) this.progress.knifed = true
    if (hit.armorBroken) this.flash('ARMOUR BROKEN')
    if (!TUTORIAL_FEEDBACK.damageNumbers) return
    // Borderlands-style: the colour says how good the hit was. Grey is light, yellow heavy, red critical.
    const critical = !!hit.critical || !!hit.headBurst
    const tier = critical ? 'critical' : amount >= HEAVY_HIT ? 'heavy' : 'light'
    const tag = hit.headBurst ? 'HEAD BURST!' : critical ? (head ? 'CRITICAL HEADSHOT!' : 'CRITICAL!') : head ? 'HEADSHOT' : (hit.armorDamage ?? 0) > 0 ? 'ARMOUR' : ''
    const element = document.createElement('div')
    element.className = `damage-number is-${tier}${hit.lethal ? ' is-lethal' : ''}`
    // Bigger hits print bigger; the tilt is a little random, more on a critical.
    const size = Math.min(58, 24 + amount * 0.16) * (critical ? 1.25 : 1)
    const tilt = (Math.random() - 0.5) * (critical ? 18 : 10)
    element.style.setProperty('--size', `${size.toFixed(1)}px`)
    element.style.setProperty('--tilt', `${tilt.toFixed(1)}deg`)
    element.innerHTML = `${tag ? `<small>${tag}</small>` : ''}<b>${amount}</b>`
    this.numbers.append(element)
    const side = Math.random() < 0.5 ? -1 : 1
    this.popups.push({ element, point: hit.point.clone(), age: 0, life: critical ? 1.5 : 1.15,
      drift: side * (50 + Math.random() * 70), lift: 300 + Math.random() * 80 + (critical ? 60 : 0) })
    if (this.popups.length > 40) this.popups.shift()!.element.remove()
  }

  /** Lesson logic, while the player is in control. */
  update(dt: number, probe: TutorialProbe) {
    this.elapsed += dt
    const p = this.progress
    if (Number.isFinite(this.last.x)) p.walked += Math.min(0.5, Math.hypot(probe.position.x - this.last.x, probe.position.z - this.last.z))
    if (probe.stance === 'prone' && Number.isFinite(this.last.x)) p.crawl += Math.min(0.5, Math.hypot(probe.position.x - this.last.x, probe.position.z - this.last.z))
    this.last.copy(probe.position)
    if (probe.speed > 5) p.sprint += dt
    p.airborne = !probe.grounded && !probe.traversing ? p.airborne + dt : this.lessons[this.index]?.id === 'jump' ? p.airborne : 0
    if (probe.stance === 'crouch') p.crouch += dt
    if (probe.lean < -0.7) p.leanLeft = true
    if (probe.lean > 0.7) p.leanRight = true
    if (this.lessons[this.index]?.id === 'switch') p.slots.add(probe.slot)
    if (probe.aiming) p.aim += dt
    if (probe.reloading && this.lessons[this.index]?.id === 'reload') p.reloaded = true
    // Ammunition never runs out on the training ground.
    for (const item of probe.slots) if (item && item.name !== 'knife') item.reserve = Math.max(item.reserve, WEAPON_RULES[item.name].capacity * 3)
    // The Sledge wakes as the player crosses into his field.
    const guards = this.hooks.enemies()
    if (this.lessons[this.index]?.id === 'boss' && !p.bossAwake && probe.position.z < TRAINING.bossLine) {
      p.bossAwake = true
      this.hooks.wake([TUTORIAL_ENEMIES.boss], probe.position)
      this.hooks.checkpoint()
      this.flash('BOSS FIGHT · THE SLEDGE')
    }
    const lesson = this.lessons[this.index]
    if (lesson && this.celebrate <= 0 && lesson.done(p, probe, guards)) {
      this.celebrate = 0.9
      this.card.classList.add('is-done')
    }
  }

  /** Every frame: move the numbers, the marker and the boss bar, and finish the lesson being celebrated. */
  frame(dt: number, visible: boolean) {
    this.root.hidden = !visible
    if (this.celebrate > 0 && (this.celebrate -= dt) <= 0) this.advance()
    const camera = this.hooks.camera, width = innerWidth, height = innerHeight
    this.popups = this.popups.filter(popup => {
      popup.age += dt
      if (popup.age >= popup.life) { popup.element.remove(); return false }
      const t = popup.age / popup.life
      this.scratch.copy(popup.point).project(camera)
      if (this.scratch.z > 1) { popup.element.style.opacity = '0'; return true }
      // Thrown up and out of the hit, then falling under gravity (Reduced Motion: it stays put).
      const still = this.hooks.reducedMotion(), age = popup.age
      const dx = still ? 0 : popup.drift * age, rise = still ? 0 : popup.lift * age - 520 * age * age
      popup.element.style.translate = `${((this.scratch.x + 1) / 2 * width + dx).toFixed(1)}px ${((1 - this.scratch.y) / 2 * height - rise).toFixed(1)}px`
      popup.element.style.opacity = String(t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28)
      return true
    })
    // Where the current lesson happens.
    const where = this.lessons[this.index]?.where
    // Once the Sledge is up, he is the target: no marker needed.
    const show = where && !this.finished && !(this.lessons[this.index]?.id === 'boss' && this.progress.bossAwake) && camera.position.distanceTo(this.scratch.set(where[0], camera.position.y, where[2])) > 3.5
    this.marker.hidden = !show
    if (show) {
      const distance = Math.round(camera.position.distanceTo(this.scratch.set(where[0], 1, where[2])))
      this.scratch.set(where[0], 1.6, where[2]).project(camera)
      const behind = this.scratch.z > 1
      const x = THREE.MathUtils.clamp((behind ? -this.scratch.x : this.scratch.x + 1) / 2 * width, 30, width - 30)
      const y = behind ? height - 60 : THREE.MathUtils.clamp((1 - this.scratch.y) / 2 * height, 40, height - 60)
      this.marker.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`
      this.marker.querySelector('span')!.textContent = `${distance} m`
    }
    this.drawBoss(dt)
    if (this.bannerTimer > 0 && (this.bannerTimer -= dt) <= 0) this.banner.hidden = true
  }

  private advance() {
    this.celebrate = 0
    this.card.classList.remove('is-done')
    this.index++
    if (this.index >= this.lessons.length) this.index = this.lessons.length
    this.lessons[this.index]?.enter?.()
    this.drawLesson(); this.drawList()
  }

  private drawLesson() {
    const lesson = this.lessons[this.index]
    if (!lesson) { this.card.hidden = true; return }
    this.card.hidden = false
    this.card.innerHTML = `<header><span>Lesson ${this.index + 1} of ${this.lessons.length}</span><span class="tutorial-skip"><kbd>N</kbd> skip</span></header>
      <h2>${lesson.title}</h2>${lesson.keys.length ? `<p class="tutorial-keys">${kbd(lesson.keys)}</p>` : ''}
      <p>${lesson.text}</p>${lesson.extra?.() ?? ''}<div class="tutorial-tick" aria-hidden="true">✓</div>`
  }

  private drawList() {
    this.list.innerHTML = `<div class="tutorial-tab"><span>Training</span><kbd>I</kbd></div><ol>${this.lessons.map((lesson, i) =>
      `<li class="${i < this.index ? 'done' : i === this.index ? 'current' : ''}">${lesson.title}</li>`).join('')}</ol>`
  }

  private chanceTable() {
    if (!TUTORIAL_FEEDBACK.criticals) return `<table class="tutorial-chances"><thead><tr><th>Weapon</th><th>Head burst</th></tr></thead><tbody>${CHANCE_ROWS
      .filter(([, weapon]) => weapon !== 'knife').map(([label, weapon]) => `<tr><td>${label}</td><td>${percent(HEAD_BURST_CHANCE[weapon] ?? 0)}</td></tr>`).join('')}</tbody></table>`
    return `<table class="tutorial-chances"><thead><tr><th>Weapon</th><th>Head burst</th><th>Critical</th></tr></thead><tbody>${CHANCE_ROWS.map(([label, weapon]) =>
      `<tr><td>${label}</td><td>${percent(HEAD_BURST_CHANCE[weapon] ?? 0)}</td><td>${percent(CRITICAL_HITS.chance[weapon])}</td></tr>`).join('')}</tbody></table>
      <p class="tutorial-note">A critical hit lands ×${CRITICAL_HITS.multiplier}; aimed at the head its chance is doubled.</p>`
  }

  private flash(text: string) {
    this.banner.textContent = text
    this.banner.hidden = false
    this.banner.classList.remove('is-shown'); void this.banner.offsetWidth; this.banner.classList.add('is-shown')
    this.bannerTimer = 2.6
  }

  private drawBoss(dt: number) {
    const boss = this.hooks.enemies().find(guard => guard.spec.id === TUTORIAL_ENEMIES.boss)
    if (!boss || boss.state === 'reserve') { this.bossBar.hidden = true; return }
    const health = boss.health / (boss.spec.health ?? BOSS_RULES.health), armor = boss.armor / (boss.spec.armor ?? BOSS_RULES.armor)
    // The pale trail holds a moment after each hit, then drains down to the health that is left.
    if (health < this.lastHealth) this.trailHold = 0.5
    this.lastHealth = health
    if (health >= this.trail) this.trail = health
    else if ((this.trailHold -= dt) <= 0) this.trail = Math.max(health, this.trail - dt * 0.45)
    this.bossBar.hidden = false
    this.bossBar.querySelector<HTMLElement>('.boss-fill')!.style.width = `${(health * 100).toFixed(2)}%`
    this.bossBar.querySelector<HTMLElement>('.boss-trail')!.style.width = `${(this.trail * 100).toFixed(2)}%`
    this.bossBar.querySelector<HTMLElement>('.boss-armor i')!.style.width = `${(armor * 100).toFixed(2)}%`
    this.bossBar.querySelector<HTMLElement>('.boss-armor span')!.textContent = armor > 0 ? `ARMOUR ${Math.ceil(boss.armor)}` : 'ARMOUR BROKEN'
    this.bossBar.querySelector<HTMLElement>('.boss-health span')!.textContent = `${Math.ceil(boss.health)} / ${boss.spec.health ?? BOSS_RULES.health}`
    this.bossBar.classList.toggle('is-broken', armor <= 0)
    this.bossBar.classList.toggle('is-low', health < 0.3)
    if (boss.state === 'dead') {
      if (this.bossDownFor < 0) { this.bossDownFor = 0; this.flash('THE SLEDGE IS DOWN') }
      this.bossDownFor += dt
      this.bossBar.classList.add('is-defeated')
      if (this.bossDownFor > 3 && !this.finished) this.complete()
    } else { this.bossDownFor = -1; this.bossBar.classList.remove('is-defeated') }
    this.drawHammer()
  }

  /** The hammer's own bar under his: its health, and a warning when it comes for you. */
  private drawHammer() {
    const hammer = this.hooks.hammer?.(), bar = this.bossBar.querySelector<HTMLElement>('.hammer-bar')!
    bar.hidden = !hammer || hammer.state === 'idle'
    if (!hammer || bar.hidden) return
    const notes: Record<HammerState, string> = { idle: '', orbit: 'Flies on its own · shoot it down', windup: 'Rising · get out of its line!',
      flying: 'Incoming!', stuck: 'Stuck · shoot it now', return: 'Flying back to him', broken: 'Shot down' }
    bar.querySelector<HTMLElement>('.hammer-note')!.textContent = notes[hammer.state]
    bar.querySelector<HTMLElement>('.hammer-health i')!.style.width = `${(hammer.health / HAMMER_RULES.health * 100).toFixed(2)}%`
    bar.querySelector<HTMLElement>('.hammer-health span')!.textContent = hammer.state === 'broken' ? 'DOWN' : `${Math.ceil(hammer.health)} / ${HAMMER_RULES.health}`
    bar.classList.toggle('is-warning', hammer.state === 'windup' || hammer.state === 'flying')
    bar.classList.toggle('is-broken', hammer.state === 'broken')
    if (hammer.state === 'broken' && !this.hammerDown) this.flash('HAMMER DOWN')
    this.hammerDown = hammer.state === 'broken'
  }

  /** The end of training: a summary of how it went, and the way back. */
  private complete() {
    this.finished = true
    this.index = this.lessons.length
    this.drawLesson(); this.drawList()
    const minutes = Math.floor(this.elapsed / 60), seconds = Math.floor(this.elapsed % 60)
    const { hits, criticals, heads, bursts, damage, best } = this.stats
    this.finish.innerHTML = `<h2>Training complete</h2><p>The Sledge is down. You know every move; the compound is waiting.</p>
      <dl><div><dt>Time</dt><dd>${minutes}:${String(seconds).padStart(2, '0')}</dd></div><div><dt>Hits</dt><dd>${hits}</dd></div>
      ${TUTORIAL_FEEDBACK.criticals ? `<div><dt>Critical hits</dt><dd>${criticals}</dd></div>` : ''}<div><dt>Head shots</dt><dd>${heads}</dd></div><div><dt>Heads burst</dt><dd>${bursts}</dd></div>
      <div><dt>Damage dealt</dt><dd>${damage}</dd></div><div><dt>Biggest hit</dt><dd>${best}</dd></div></dl>
      <div class="tutorial-actions"><button type="button" class="tutorial-again">Train again</button><a href="./">Main menu</a></div>`
    this.finish.hidden = false
    this.finish.querySelector('.tutorial-again')!.addEventListener('click', () => this.hooks.restart(), { signal: this.abort.signal })
    document.exitPointerLock?.()
  }

  dispose() { this.abort.abort(); this.root.remove() }
}
