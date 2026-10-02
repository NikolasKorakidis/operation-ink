import assert from 'node:assert/strict'
import * as THREE from 'three'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { BOSS_RULES, ENEMY_HEALTH, GRENADE_RULES, flashStrength, fragDamage, type GrenadeKind } from '../src/game/balance'
import type { HitReaction } from '../src/game/hit-reactions'
import type { EnemySpec } from '../src/game/types'
import { CollisionWorld } from '../src/player/collision'

// A minimal DOM for the grenade HUD: elements that remember what is set on them.
const element = (): Record<string, unknown> => {
  const node: Record<string, unknown> = { hidden: false, style: {}, dataset: {}, className: '', innerHTML: '' }
  Object.assign(node, { setAttribute() {}, append() {}, after() {}, remove() {} })
  return node
}
;(globalThis as Record<string, unknown>).document ??= { createElement: element, querySelector: () => null, body: element() }
const { Grenades, smokeHides } = await import('../src/game/grenades')

{
  // Frag: full damage close in, nothing past its radius; a close one kills, a far one only hurts.
  const { radius, full, damage } = GRENADE_RULES.frag
  assert.equal(fragDamage(0), damage)
  assert.equal(fragDamage(full), damage)
  assert(fragDamage(3) >= ENEMY_HEALTH, `Within 3 m it kills: ${fragDamage(3).toFixed(0)}`)
  assert(fragDamage(6) > 10 && fragDamage(6) < ENEMY_HEALTH, `At 6 m it hurts but does not kill: ${fragDamage(6).toFixed(0)}`)
  assert.equal(fragDamage(radius), 0)
  for (let d = 0; d < radius; d += 0.25) assert(fragDamage(d) >= fragDamage(d + 0.25), 'Damage only ever falls with distance')
  // Flash: facing it close is a full blind; turned away, or far off, much less; out of range, nothing.
  assert.equal(flashStrength(0, 3), 1)
  assert(flashStrength(Math.PI, 3) < 0.15, 'Back turned, a flash barely blinds')
  assert(flashStrength(Math.PI / 2, 3) > 0.3 && flashStrength(Math.PI / 2, 3) < 0.8, 'From the side it half-blinds')
  assert(flashStrength(0, 25) < flashStrength(0, 10), 'Further off it blinds less')
  assert.equal(flashStrength(0, GRENADE_RULES.flash.range + 1), 0)
  // Smoke: a dome that hides what is behind it, not what passes over it.
  const centre = new THREE.Vector3(0, GRENADE_RULES.smoke.rise, 0), r = GRENADE_RULES.smoke.radius
  assert(smokeHides(centre, r, new THREE.Vector3(-15, 1.6, 0), new THREE.Vector3(15, 1.6, 0)), 'A sight line through the middle is hidden')
  assert(!smokeHides(centre, r, new THREE.Vector3(-15, 1.6, 8), new THREE.Vector3(15, 1.6, 8)), 'One that passes well to the side is not')
  assert(!smokeHides(centre, r, new THREE.Vector3(-15, 9, 0), new THREE.Vector3(15, 9, 0)), 'Nor one well over the top')
  assert(smokeHides(centre, r, new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(15, 1.6, 0)), 'From inside, you see nothing out')
  assert(!smokeHides(centre, 0, new THREE.Vector3(-15, 1.6, 0), new THREE.Vector3(15, 1.6, 0)), 'A cloud that has thinned away hides nothing')
}
console.log('PASS Frag damage falls off with distance, flashes blind by facing and distance, smoke hides what is behind it')

/** Guards on open ground, with optional walls, recording hits and reactions. */
async function field(specs: EnemySpec[], walls: [number, number, number, number, number, number][] = []) {
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.BoxGeometry(200, 1, 200), new THREE.MeshBasicMaterial())
  floor.position.y = -0.5; scene.add(floor)
  for (const [w, h, d, x, y, z] of walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial())
    wall.position.set(x, y, z); scene.add(wall)
  }
  const world = new CollisionWorld(scene), hits: HitReaction[] = [], reactions: string[] = []
  const ai = new EnemyDirector({ scene, world, doors: [], specs, emit() {}, damagePlayer() {}, dropWeapon() {}, onHit: hit => hits.push(hit) }, async () => {
    const root = new THREE.Group()
    return { root, reactionRemaining: 0, animationTime: 0, deathClip: 'dieShotgun', update() {}, shoot() {}, react(clip: string) { reactions.push(clip) }, restore() {}, dispose() {},
      makeBoss() { root.scale.setScalar(BOSS_RULES.scale) }, breakArmor() {}, armorLeft() {}, burstHead() {}, muzzle: () => root.position.clone().add(new THREE.Vector3(0, 1.4, 0.3)) } as unknown as EnemyActor
  })
  await ai.init()
  const player = { feet: new THREE.Vector3(0, 0, 30), eye: new THREE.Vector3(0, 1.6, 30), velocity: new THREE.Vector3(), alive: true, radioEnabled: true }
  return { scene, world, ai, hits, reactions, player, dispose() { ai.dispose(); world.dispose() } }
}
const guard = (id: string, x: number, z: number, facing = 0, extra: Partial<EnemySpec> = {}): EnemySpec =>
  ({ id, name: id, position: [x, 0, z], patrol: [[x, 0, z]], weapon: 'ak', facing, ...extra })

{
  // A frag kills the guard on top of it, wounds the one further off, spares the one out of range and the one behind a wall.
  const f = await field([guard('close', 1.5, 0), guard('mid', 6, 0), guard('far', 15, 0), guard('sheltered', -3, 0)], [[0.4, 3, 6, -1.5, 1.5, 0]])
  const hit = f.ai.blast(new THREE.Vector3(0, 0.05, 0))
  const by = (id: string) => f.ai.enemies.find(enemy => enemy.spec.id === id)!
  assert.equal(by('close').state, 'dead', 'The close guard is killed')
  assert(by('mid').health < ENEMY_HEALTH && by('mid').health > 0, `The guard 6 m off is wounded: ${by('mid').health.toFixed(0)}`)
  assert.equal(by('far').health, ENEMY_HEALTH, 'The far guard is untouched')
  assert.equal(by('sheltered').health, ENEMY_HEALTH, 'A wall shelters the guard behind it')
  assert.deepEqual(hit.map(entry => entry.id).sort(), ['close', 'mid'])
  assert(f.reactions.includes('dieShotgun') && f.reactions.includes('flinchBody'), `The dead are thrown back, the wounded flinch: ${f.reactions}`)
  assert(f.hits.every(entry => !entry.critical), 'A blast is never critical')
  assert.notEqual(by('mid').state, 'guard', 'The wounded guard comes looking')
  f.dispose()
  // Bulky Boy's armour soaks a frag like any body hit.
  const b = await field([guard('bulky', 2, 0, 0, { boss: true, health: BOSS_RULES.health, armor: BOSS_RULES.armor })])
  b.ai.blast(new THREE.Vector3(0, 0.05, 0))
  const boss = b.ai.enemies[0]
  assert(boss.armor < BOSS_RULES.armor && boss.health > BOSS_RULES.health * 0.9, `His armour soaks it: armour ${boss.armor.toFixed(0)}, health ${boss.health.toFixed(0)}`)
  b.dispose()
}
console.log('PASS A frag kills up close, wounds further off, spares the far and the sheltered, and hits armour first')

{
  // A flash blinds the guard facing it fully, the one turned away barely, the one behind a wall not at all.
  // The flash is 5 m north (−Z) of three guards; facing 0 looks +Z (south), facing π looks north.
  const f = await field([guard('facing', 0, 0, Math.PI), guard('away', 3, 0, 0), guard('walled', -6, 0, Math.PI)], [[3, 3, 0.4, -5, 1.5, -1]])
  const blinded = f.ai.flash(new THREE.Vector3(0, 1, -5))
  const seconds = (id: string) => blinded.find(entry => entry.id === id)?.seconds ?? 0
  assert(seconds('facing') > GRENADE_RULES.flash.blind * 0.9, `Facing it: ${seconds('facing').toFixed(1)} s`)
  assert(seconds('away') > 0 && seconds('away') < seconds('facing') * 0.3, `Turned away: ${seconds('away').toFixed(1)} s`)
  assert.equal(seconds('walled'), 0, 'Behind a wall: not blinded')
  const facing = f.ai.enemies[0]
  assert(facing.blind > 0 && f.reactions.includes('blinded'), 'He covers his eyes')
  // While blind he cannot see the player standing right in front of him.
  const player = { ...f.player, feet: new THREE.Vector3(0, 0, -8), eye: new THREE.Vector3(0, 1.6, -8) }
  for (let i = 0; i < 30; i++) f.ai.update(1 / 30, player)
  assert(!facing.canSee, 'Blinded, he cannot see the player in front of him')
  for (let i = 0; i < 30 * 8; i++) f.ai.update(1 / 30, player)
  assert.equal(facing.blind, 0, 'The blindness wears off')
  assert(facing.canSee, 'Then he sees the player again')
  f.dispose()
}
console.log('PASS Flashbangs blind by facing and walls, blinded guards see nothing, and it wears off')

{
  // Smoke between a guard and the player hides the player; with the smoke gone he is seen.
  const f = await field([guard('watcher', 0, 0, 0)])
  const player = { ...f.player, feet: new THREE.Vector3(0, 0, 20), eye: new THREE.Vector3(0, 1.6, 20) }
  let smoke = true
  f.ai.obscured = (a, b) => smoke && smokeHides(new THREE.Vector3(0, GRENADE_RULES.smoke.rise, 10), GRENADE_RULES.smoke.radius, a, b)
  for (let i = 0; i < 30; i++) f.ai.update(1 / 30, player)
  assert(!f.ai.enemies[0].canSee, 'Through the smoke he sees nothing')
  smoke = false
  for (let i = 0; i < 30; i++) f.ai.update(1 / 30, player)
  assert(f.ai.enemies[0].canSee, 'Once it clears he sees the player')
  f.dispose()
}
console.log('PASS Smoke hides the player from guards until it clears')

/** A thrower on flat ground, optionally facing a wall, with every grenade event recorded. */
async function thrower(walls: [number, number, number, number, number, number][] = []) {
  const f = await field([], walls)
  const camera = new THREE.PerspectiveCamera()
  f.scene.add(camera)
  const events: { kind: GrenadeKind; origin: THREE.Vector3 }[] = [], sounds: string[] = [], damage: number[] = []
  let empty = 0
  const grenades = new Grenades({ scene: f.scene, camera, world: f.world, emit: event => sounds.push(event.kind),
    onDetonate: (kind, origin) => events.push({ kind, origin }), damagePlayer: amount => damage.push(amount), onEmpty: () => { empty++ } })
  const frame = { active: true, eye: new THREE.Vector3(0, 1.6, 0), forward: new THREE.Vector3(0, 0, -1), velocity: new THREE.Vector3(), reducedMotion: false }
  const run = (seconds: number, fps = 60) => { for (let t = 0; t < seconds; t += 1 / fps) grenades.update(1 / fps, frame) }
  const toss = (button: number, seconds = 0.6) => { grenades.press(button); run(seconds); grenades.release(button) }
  return { grenades, frame, run, toss, events, sounds, damage, empty: () => empty, dispose() { grenades.dispose(); f.dispose() } }
}

{
  // Carrying: one frag, two flashes, one smoke; 4 takes one out and cycles; nothing to cycle with an empty belt.
  const t = await thrower()
  assert(!t.grenades.equip(), 'Nothing to take out with an empty belt')
  t.grenades.give()
  assert.deepEqual(t.grenades.counts, GRENADE_RULES.carry)
  t.grenades.give({ flash: 5 })
  assert.equal(t.grenades.counts.flash, 2, 'Never more than two flashbangs')
  assert(t.grenades.equip() && t.grenades.selected === 'frag', '4 takes out the frag first')
  t.grenades.equip(); assert.equal(t.grenades.selected, 'flash', '4 again: the flashbang')
  t.grenades.equip(); assert.equal(t.grenades.selected, 'smoke', 'and then the smoke')
  t.grenades.equip(); assert.equal(t.grenades.selected, 'frag', 'and round to the frag')
  t.dispose()
}
console.log('PASS The belt holds one frag, two flashbangs and one smoke; 4 takes one out and cycles through them')

for (const fps of [30, 60, 144]) {
  // A full throw flies far and the frag goes off on its fuse; a lob lands short; neither cooks while held.
  const t = await thrower()
  t.grenades.give(); t.grenades.equip(); t.run(GRENADE_RULES.timing.draw + 0.05, fps)
  t.grenades.press(0); t.run(2.5, fps)
  assert.equal(t.events.length, 0, 'Holding the pin out never sets it off (no cooking)')
  t.grenades.release(0)
  t.run(GRENADE_RULES.timing.release + GRENADE_RULES.fuse.frag + 0.1, fps)
  const frag = t.events.find(event => event.kind === 'frag')
  assert(frag, `The frag goes off on its fuse (${fps} fps)`)
  const far = -frag!.origin.z
  assert(far > 10, `A full throw carries well downrange: ${far.toFixed(1)} m (${fps} fps)`)
  assert(t.grenades.selected === 'flash' && t.grenades.equipped, 'With the frag gone, the flashbang comes up next')
  t.run(0.6, fps)
  t.toss(2)
  t.run(GRENADE_RULES.timing.release + GRENADE_RULES.fuse.flash + 0.1, fps)
  const lob = t.events.find(event => event.kind === 'flash')
  assert(lob && -lob.origin.z < far * 0.6, `A lob lands short: ${(-lob!.origin.z).toFixed(1)} m (${fps} fps)`)
  assert(Math.abs(lob!.origin.y) < 0.3, 'It ends up on the floor')
  t.dispose()
}
console.log('PASS Full throws carry far, lobs land short, and the fuse only starts when it leaves the hand (30, 60, 144 fps)')

{
  // A grenade thrown at a wall bounces back off it; a smoke rolls to a stop and only then pours out.
  const t = await thrower([[20, 6, 0.5, 0, 3, -4]])
  t.grenades.give({ smoke: 1 }); t.grenades.equip(); t.run(GRENADE_RULES.timing.draw + 0.05)
  t.toss(0, 0.4)
  t.run(GRENADE_RULES.fuse.smoke + 1)
  const smoke = t.events.find(event => event.kind === 'smoke')
  assert(smoke && smoke.origin.z > -4, `It bounces back off the wall: lands at z ${smoke?.origin.z.toFixed(2)}`)
  assert(t.sounds.includes('grenade-bounce'), 'It clinks off the wall')
  assert.equal(t.empty(), 1, 'With the belt empty the hand goes back to a weapon')
  assert.equal(t.grenades.smokes, 1, 'The cloud is up')
  const behind = new THREE.Vector3(smoke!.origin.x, 1.6, smoke!.origin.z - 10), front = new THREE.Vector3(smoke!.origin.x, 1.6, smoke!.origin.z + 10)
  t.run(GRENADE_RULES.smoke.grow)
  assert(t.grenades.smokeBlocks(front, behind), 'Grown, it hides what is behind it')
  t.run(GRENADE_RULES.smoke.last + GRENADE_RULES.smoke.fade)
  assert(!t.grenades.smokeBlocks(front, behind) && t.grenades.smokes === 0, 'And then it clears')
  t.dispose()
}
console.log('PASS Grenades bounce off walls; a smoke settles, pours out, hides what is behind it, and clears')

{
  // Your own flash blinds you, your own frag hurts you; a restore clears it all and refills the belt as saved.
  const t = await thrower()
  t.grenades.give({ frag: 1, flash: 2 }); const saved = t.grenades.snapshot()
  t.grenades.equip(); t.run(GRENADE_RULES.timing.draw + 0.05)
  // Look straight down and lob it at your feet.
  t.frame.forward.set(0, -0.98, -0.2).normalize()
  t.toss(2)
  t.run(GRENADE_RULES.fuse.frag + 0.3)
  assert(t.damage.length === 1 && t.damage[0] > 60, `A frag at your feet hurts you: ${t.damage[0]?.toFixed(0)}`)
  t.frame.forward.set(0, 0, -1)
  t.run(0.5); t.toss(2, 0.4)
  t.run(GRENADE_RULES.fuse.flash + 0.3)
  assert(t.grenades.blinded.amount > 0.9 && t.grenades.blinded.seconds > 0, `Your own flash in front of you whites you out: ${t.grenades.blinded.amount.toFixed(2)}`)
  t.run(GRENADE_RULES.flash.blind + GRENADE_RULES.flash.fade + 0.5)
  assert.equal(t.grenades.blinded.amount, 0, 'The white wears off')
  // Turn your back on the next one: a pale flicker of white, no solid whiteout.
  t.run(0.5); t.toss(0, 0.4); t.run(0.2)
  t.frame.forward.set(0, 0, 1)
  t.run(GRENADE_RULES.fuse.flash)
  assert(t.grenades.blinded.seconds === 0 && t.grenades.blinded.amount > 0 && t.grenades.blinded.amount < 0.6, `Back turned, only a pale flicker: ${t.grenades.blinded.amount.toFixed(2)}`)
  t.frame.forward.set(0, 0, -1)
  t.grenades.restore(saved)
  assert(t.grenades.blinded.amount === 0 && t.grenades.airborne === 0 && !t.grenades.equipped, 'Restore clears the whiteout and everything thrown')
  assert.deepEqual(t.grenades.counts, { frag: 1, flash: 2, smoke: 0 }, 'and puts the belt back as it was saved')
  t.grenades.endless = true; t.grenades.equip(); t.run(0.5); t.toss(0); t.run(2)
  assert.equal(t.grenades.counts.frag, 1, 'In training the belt never empties')
  t.dispose()
}
console.log('PASS Your own frag hurts you and your own flash blinds you; restores clear it all; training never runs out')
