import assert from 'node:assert/strict'
import * as THREE from 'three'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { BOSS_RULES, HAMMER_RULES, PLAYER_HEALTH, CRITICAL_HITS, ENEMY_HEALTH, criticalChance } from '../src/game/balance'
import type { HitReaction, HitZone } from '../src/game/hit-reactions'
import { createTutorialWorld, TUTORIAL_ENEMIES } from '../src/game/tutorial-world'
import { FlyingHammer, type HammerSense } from '../src/game/flying-hammer'
import type { EnemySpec, WeaponName } from '../src/game/types'
import { CollisionWorld } from '../src/player/collision'
import { PlayerBody, type Stance } from '../src/player/body'
import { createTrainingGround, TRAINING } from '../src/world/training-ground'

// The training ground: one fenced field the player can stand on from the start pad to the boss field.
{
  const scene = new THREE.Scene()
  scene.add(createTrainingGround())
  const world = new CollisionWorld(scene)
  for (const z of [5, -20, -45, -120, -200]) assert(Number.isFinite(world.floor(new THREE.Vector3(0, 1, z), 2, 2)), `Solid ground at z ${z}`)
  const spots: string[] = []
  scene.traverse(object => { if (object.userData.weaponSpot) spots.push(object.userData.weaponSpot.name) })
  assert.deepEqual(spots.sort(), ['ak', 'shotgun', 'smg', 'sniper'], 'The armory table offers an AK, a shotgun, a sniper rifle and an SMG')
  world.dispose()
  const tutorial = createTutorialWorld()
  assert(tutorial.tutorial && tutorial.stations.length === 0, 'The tutorial has no mission stations')
  const ids = tutorial.enemies.map(spec => spec.id)
  for (const id of [...TUTORIAL_ENEMIES.dummies, TUTORIAL_ENEMIES.knife, ...TUTORIAL_ENEMIES.soldiers, TUTORIAL_ENEMIES.boss]) assert(ids.includes(id), `${id} is placed`)
  const knife = tutorial.enemies.find(spec => spec.id === TUTORIAL_ENEMIES.knife)!
  assert.equal(knife.facing, Math.PI, 'The knife target stands with his back to the range')
  for (const spec of tutorial.enemies) {
    assert(spec.position[2] < TRAINING.spawn[2], `${spec.id} is ahead of the start`)
    if (spec.dummy) assert(spec.respawn && !spec.reserve, `${spec.id} is a target that gets back up`)
    else assert(spec.reserve && spec.held, `${spec.id} waits until its lesson`)
  }
}
console.log('PASS The training ground is solid end to end, the armory has four rifles, and every target, soldier and the boss is placed')

{
  // The armory is reached by crawling: the wall across the field is too high to jump, and its tunnel only fits a
  // player lying prone. Standing up inside it doesn't work until they are out the other side.
  const scene = new THREE.Scene()
  scene.add(createTrainingGround())
  scene.updateMatrixWorld(true)
  const world = new CollisionWorld(scene)
  const wall = (TRAINING.crawl.z0 + TRAINING.crawl.z1) / 2
  const walk = (stance: Stance, seconds: number, from = new THREE.Vector3(0, 0, -28)) => {
    const body = new PlayerBody(world)
    body.teleport(from)
    for (let i = 0; i < 60; i++) body.update(1 / 60, new THREE.Vector3(), false, stance)
    for (let t = 0; t < seconds; t += 1 / 60) body.update(1 / 60, new THREE.Vector3(0, 0, -1), false, stance)
    return body
  }
  for (const stance of ['stand', 'crouch'] as const) assert(walk(stance, 6).position.z > wall, `${stance === 'stand' ? 'Standing' : 'Crouched'}, the wall stops you`)
  for (let x = -28; x <= 28; x += 4) assert(walk('stand', 4, new THREE.Vector3(x, 0, -28)).position.z > wall, `There is no way round the wall at x ${x}`)
  // Jumping at it, nothing gets over.
  const jumper = new PlayerBody(world)
  jumper.teleport(new THREE.Vector3(0, 0, -29.5))
  for (let t = 0; t < 3; t += 1 / 60) { if (jumper.grounded) jumper.jump(); jumper.update(1 / 60, new THREE.Vector3(0, 0, -1), false, 'stand') }
  assert(jumper.position.z > wall, 'Jumping does not clear the wall')
  const crawler = walk('prone', 12)
  assert(crawler.position.z < TRAINING.crawl.z1 - 0.5, `Prone, you crawl through to the armory: z ${crawler.position.z.toFixed(2)}`)
  // Halfway through the tunnel, asking to stand keeps you down.
  const stuck = walk('prone', (29.6 - 0.4 - 32) / -0.75 + 1)
  assert(stuck.position.z < TRAINING.crawl.z0 && stuck.position.z > TRAINING.crawl.z1, `In the tunnel: z ${stuck.position.z.toFixed(2)}`)
  stuck.update(1 / 60, new THREE.Vector3(), false, 'stand')
  assert.equal(stuck.stance, 'prone', 'Under the slab you cannot stand or crouch')
  for (let t = 0; t < 8 && stuck.stance !== 'stand'; t += 1 / 60) stuck.update(1 / 60, new THREE.Vector3(0, 0, -1), false, 'stand')
  assert(stuck.stance === 'stand' && stuck.position.z < TRAINING.crawl.z1, 'Once clear of it you get up')
  world.dispose()
}
console.log('PASS The armory is behind a wall you can only crawl under, prone; you stay down until you are through')

async function director(specs: EnemySpec[], criticals = true) {
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.BoxGeometry(200, 1, 200), new THREE.MeshBasicMaterial())
  floor.position.y = -0.5; scene.add(floor)
  const world = new CollisionWorld(scene), hits: HitReaction[] = [], damage: number[] = []
  let bossBuilt = 0, broken = 0, shots = 0
  const armorLeft: number[] = []
  const ai = new EnemyDirector({ scene, world, doors: [], specs, emit() {}, damagePlayer: amount => { damage.push(amount) }, dropWeapon() {}, onHit: hit => hits.push(hit), criticals,
    onFire: () => { shots++ } }, async () => {
    const root = new THREE.Group()
    return { root, reactionRemaining: 0, animationTime: 0, deathClip: 'dieBody', update() {}, shoot() {}, react() {}, restore() {}, dispose() {},
      makeBoss() { bossBuilt++ }, breakArmor() { broken++ }, armorLeft(left: number) { armorLeft.push(left) }, burstHead() {}, muzzle: () => root.position.clone().add(new THREE.Vector3(0, 1.4, 0.3)) } as unknown as EnemyActor
  })
  await ai.init()
  const shoot = (index: number, weapon: WeaponName, zone: HitZone, damage = 30) => {
    const direction = new THREE.Vector3(0, 0, -1)
    ai.applyHit({ origin: new THREE.Vector3(0, 1.4, 6), direction, range: 60, damage, weapon }, { index, zone, point: new THREE.Vector3(0, 1.4, 0), bone: 'chest', distance: 6, direction })
  }
  const player = { feet: new THREE.Vector3(0, 0, 6), eye: new THREE.Vector3(0, 1.6, 6), velocity: new THREE.Vector3(), alive: true, radioEnabled: true }
  return { ai, hits, shoot, player, damage, shots: () => shots, bossBuilt: () => bossBuilt, broken: () => broken, armorLeft, dispose() { ai.dispose(); world.dispose() } }
}

{
  // A practice soldier stares straight at the player, never fights, falls, and stands up again.
  const f = await director([{ id: 'dummy', name: 'dummy', position: [0, 0, 0], patrol: [[0, 0, 0]], weapon: 'pistol', facing: 0, dummy: true, respawn: 2 }])
  for (let i = 0; i < 60; i++) f.ai.update(1 / 30, f.player)
  f.shoot(0, 'pistol', 'torso')
  f.ai.hear({ kind: 'shot-pistol', position: new THREE.Vector3(0, 1, 6), radius: 60 })
  for (let i = 0; i < 30; i++) f.ai.update(1 / 30, f.player)
  assert.equal(f.ai.enemies[0].state, 'guard', 'A practice soldier never notices, hunts or fights')
  for (let i = 0; i < 6 && f.ai.enemies[0].state !== 'dead'; i++) f.shoot(0, 'ak', 'torso', 40)
  assert.equal(f.ai.enemies[0].state, 'dead')
  for (let i = 0; i < 70; i++) f.ai.update(1 / 30, f.player)
  assert(f.ai.enemies[0].state === 'guard' && f.ai.enemies[0].health === ENEMY_HEALTH, 'It gets back up, whole, after its respawn time')
  f.dispose()
}
console.log('PASS Practice soldiers never fight back, and stand up again after falling')

{
  // Critical hits: only where they are switched on, at the weapon's rate, doubled on the head, and harder.
  const f = await director([{ id: 'target', name: 'target', position: [0, 0, 0], patrol: [[0, 0, 0]], weapon: 'pistol', dummy: true, respawn: 0.01, health: 1e9 }])
  let crits = 0
  for (let i = 0; i < 3000; i++) { f.shoot(0, 'ak', 'torso'); if (f.hits.at(-1)!.critical) crits++ }
  assert(Math.abs(crits / 3000 - CRITICAL_HITS.chance.ak) < 0.025, `AK body shots are critical ${(crits / 30).toFixed(1)}% of the time`)
  assert.equal(criticalChance('ak', 'head'), CRITICAL_HITS.chance.ak * CRITICAL_HITS.headBonus, 'Aimed at the head the chance doubles')
  const normal = f.hits.find(hit => !hit.critical)!.damage!, critical = f.hits.find(hit => hit.critical)!.damage!
  assert(Math.abs(critical / normal - CRITICAL_HITS.multiplier) < 1e-6, 'A critical hit lands harder by the multiplier')
  f.dispose()
  const off = await director([{ id: 'target', name: 'target', position: [0, 0, 0], patrol: [[0, 0, 0]], weapon: 'pistol', dummy: true, health: 1e9 }], false)
  for (let i = 0; i < 400; i++) off.shoot(0, 'ak', 'torso')
  assert(off.hits.every(hit => !hit.critical), 'The mission has no critical hits')
  off.dispose()
}
console.log('PASS Critical hits: only in the tutorial, at each weapon\'s rate, doubled on the head, landing harder')

{
  // The Sledge: armour soaks body hits until it breaks, head shots go through, no instant kills.
  const f = await director([{ id: 'sledge', name: 'sledge', position: [0, 0, 0], patrol: [[0, 0, 0]], weapon: 'ak', boss: true, health: BOSS_RULES.health, armor: BOSS_RULES.armor }], false)
  const boss = f.ai.enemies[0]
  assert.equal(f.bossBuilt(), 1, 'He is built as the boss')
  f.shoot(0, 'ak', 'torso', 40)
  assert.equal(f.hits.at(-1)!.armorDamage, 40, 'A body hit goes into his armour')
  assert(Math.abs(BOSS_RULES.health - boss.health - 40 * BOSS_RULES.bleed) < 1e-6, 'Only a little gets through')
  const before = boss.health
  f.shoot(0, 'ak', 'head', 40)
  assert(boss.armor === BOSS_RULES.armor - 40 && before - boss.health > 40, 'A head shot goes straight through the armour')
  f.shoot(0, 'sniper', 'torso', 65)
  assert(boss.state !== 'dead', 'A sniper round does not kill him outright')
  f.shoot(0, 'knife', 'torso', 90)
  assert(boss.state !== 'dead' && !f.hits.at(-1)!.headBurst, 'Nor does a knife in the back')
  for (let i = 0; i < 40 && boss.armor > 0; i++) f.shoot(0, 'ak', 'torso', 40)
  assert(boss.armor === 0 && f.broken() === 1 && f.hits.some(hit => hit.armorBroken), 'Worn down, his armour breaks and the plates come off')
  for (let i = 0; i < 6; i++) f.shoot(0, 'pistol', 'head', 30)
  assert(f.hits.every(hit => !hit.headBurst), 'His head never bursts')
  for (let i = 0; i < 200 && boss.state !== 'dead'; i++) f.shoot(0, 'ak', 'torso', 40)
  assert.equal(boss.state, 'dead', 'Without armour he goes down')
  f.dispose()
  const held = await director([{ id: 'sledge', name: 'sledge', position: [0, 0, -20], patrol: [[0, 0, -20]], weapon: 'ak', boss: true, held: true, reserve: true }])
  held.ai.activateReserves(true, new THREE.Vector3())
  held.ai.respondToAlarm(new THREE.Vector3(), 5)
  assert.equal(held.ai.enemies[0].state, 'reserve', 'The alarm never wakes him')
  held.ai.wake(['sledge'], new THREE.Vector3(0, 0, 6))
  assert.notEqual(held.ai.enemies[0].state, 'reserve', 'His lesson does')
  held.dispose()
}
console.log('PASS The Sledge: armour soaks body hits until it breaks, head shots go through, nothing kills him outright, only his lesson wakes him')

{
  // The Sledge's plate covers him all round and comes off in stages; he fights with his AK, like his guards, but
  // his rounds hit harder.
  const f = await director([{ id: 'sledge', name: 'sledge', position: [0, 0, 0], patrol: [[0, 0, 0]], weapon: 'ak', boss: true, health: BOSS_RULES.health, armor: BOSS_RULES.armor }], false)
  const boss = f.ai.enemies[0]
  const direction = new THREE.Vector3(0, 0, 1)
  f.ai.applyHit({ origin: new THREE.Vector3(0, 1.4, -6), direction, range: 60, damage: 40, weapon: 'ak' },
    { index: 0, zone: 'torso', point: new THREE.Vector3(0, 1.4, 0), bone: 'chest', distance: 6, direction })
  assert(boss.armor === BOSS_RULES.armor - 40 && Math.abs(BOSS_RULES.health - boss.health - 40 * BOSS_RULES.bleed) < 1e-6, 'His plate covers his back too')
  assert(Math.abs(f.armorLeft.at(-1)! - (BOSS_RULES.armor - 40) / BOSS_RULES.armor) < 1e-9, 'Each hit tells his armour how much is left, so plates come off as it wears down')
  const player = { ...f.player, feet: new THREE.Vector3(0, 0, 14), eye: new THREE.Vector3(0, 1.6, 14) }
  f.ai.wake(['sledge'], player.feet.clone())
  let firstShot = Infinity
  for (let i = 0; i < 30 * 10 && f.shots() < 12; i++) { f.ai.update(1 / 30, player); if (f.shots() && firstShot === Infinity) firstShot = i / 30 }
  assert(f.shots() >= 12, `He shoots his AK at the player: ${f.shots()} rounds`)
  assert(firstShot < 3, `He opens fire soon after he wakes: ${firstShot.toFixed(1)} s`)
  assert(f.damage.length >= 3, `His rounds hit: ${f.damage.length} of ${f.shots()}`)
  assert.equal(boss.state, 'combat', 'He fights like a guard')
  f.dispose()
}
console.log('PASS The Sledge: his plate covers him all round and sheds as it wears; he fights with his AK')

/** A flying hammer beside a boss at the origin, over flat ground, with a player 15 m in front of him. */
function hammerField() {
  const scene = new THREE.Scene()
  const hammer = new FlyingHammer(scene)
  const hits: number[] = []
  hammer.onHitPlayer = amount => { hits.push(amount) }
  let wallAt = Infinity
  const sense: HammerSense = {
    owner: { position: new THREE.Vector3(), awake: false, alive: true },
    target: { feet: new THREE.Vector3(0, 0, 15), eye: new THREE.Vector3(0, 1.6, 15), alive: true },
    // Flat ground at y 0, and optionally a wall across the field at z = wallAt.
    rayDistance: (origin, direction, max) => Math.min(max,
      direction.y < -1e-6 ? origin.y / -direction.y : Infinity,
      direction.z > 1e-6 && origin.z < wallAt ? (wallAt - origin.z) / direction.z : Infinity),
    visible: () => true,
    reducedMotion: false,
  }
  const run = (seconds: number, until?: () => boolean, fps = 60) => {
    for (let t = 0; t < seconds; t += 1 / fps) { hammer.update(1 / fps, sense); if (until?.()) return true }
    return false
  }
  return { hammer, hits, sense, run, wall: (z: number) => { wallAt = z } }
}

{
  // The hammer waits with its master, then circles at his side, and comes for the player: one hit is half their health.
  for (const fps of [30, 60, 144]) {
    const f = hammerField()
    f.run(3)
    assert.equal(f.hammer.state, 'idle', 'It waits until he wakes')
    assert(!f.hammer.root.visible, 'It is not shown before the fight')
    f.sense.owner.awake = true
    f.run(0.5, undefined, fps)
    assert.equal(f.hammer.state, 'orbit', 'It wakes with him')
    const offset = f.hammer.root.position.clone().sub(f.sense.owner.position)
    assert(Math.hypot(offset.x, offset.z) < HAMMER_RULES.orbit.radius + 0.5 && offset.y > 2.5, `It hovers at his side, above his shoulders: ${offset.toArray().map(v => v.toFixed(1))}`)
    assert(f.run(HAMMER_RULES.firstAttack + 1, () => f.hammer.state === 'windup', fps), 'It winds up to attack')
    assert(f.run(HAMMER_RULES.windUp + 0.2, () => f.hammer.state === 'flying', fps), 'It flies at the player')
    assert(f.run(2, () => f.hits.length > 0, fps), `At ${fps} fps it strikes a player who stays put`)
    assert.deepEqual(f.hits, [PLAYER_HEALTH.max / 2], 'One hit takes half the player\'s health')
    assert.equal(f.hammer.state, 'return', 'It flies back after a hit')
    assert(f.run(6, () => f.hammer.state === 'orbit', fps), 'It returns to his side')
    f.hammer.dispose()
  }
}
console.log('PASS The flying hammer waits for the Sledge, circles at his side, and flies at the player for half their health (30, 60, 144 fps)')

{
  // A step aside once it is in flight dodges it; a wall behind the player catches it, and it sticks there.
  const f = hammerField()
  f.sense.owner.awake = true
  f.wall(19)
  f.run(10, () => f.hammer.state === 'flying')
  f.sense.target = { feet: new THREE.Vector3(4, 0, 15), eye: new THREE.Vector3(4, 1.6, 15), alive: true }
  assert(f.run(2, () => f.hammer.state === 'stuck'), 'It flies on into the wall behind and sticks there')
  assert.equal(f.hits.length, 0, 'Stepping aside dodges it')
  assert(f.hammer.root.position.z < 19, 'It stops at the wall, not through it')
  const stuck = f.hammer.root.position.clone()
  f.run(HAMMER_RULES.stuck - 0.2)
  assert(f.hammer.state === 'stuck' && f.hammer.root.position.equals(stuck), 'It stays stuck a moment: a chance to shoot it')
  assert(f.run(6, () => f.hammer.state === 'orbit'), 'Then it flies home')
  f.hammer.dispose()
}
console.log('PASS The flying hammer can be dodged, and a miss sticks it in the wall for a moment')

{
  // It has its own health: bullets wear it down, and with none left it drops out of the air for good.
  const f = hammerField()
  f.sense.owner.awake = true
  f.run(0.8)
  f.hammer.root.updateMatrixWorld(true)
  const centre = f.hammer.root.position.clone(), eye = new THREE.Vector3(0, 1.6, 15)
  const toward = centre.clone().sub(eye).normalize()
  const distance = f.hammer.raycast(eye, toward, 60)
  assert(Number.isFinite(distance) && distance < centre.distanceTo(eye), `A bullet aimed at it hits it: ${distance.toFixed(2)} m`)
  assert.equal(f.hammer.raycast(eye, new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5), 60), Infinity, 'A shot well wide misses it')
  assert(!f.hammer.damage(HAMMER_RULES.health - 1) && f.hammer.state !== 'broken', 'It holds until its health is gone')
  assert(f.hammer.damage(1), 'The last point breaks it')
  assert.equal(f.hammer.state, 'broken', 'Shot down')
  f.run(4)
  assert(f.hammer.root.position.y < 0.5, `It falls to the ground: ${f.hammer.root.position.y.toFixed(2)} m`)
  const fell = f.hammer.root.position.clone()
  f.run(6)
  assert(f.hammer.root.position.equals(fell) && f.hits.length === 0, 'And lies there, out of the fight')
  assert(!f.hammer.damage(50), 'Shooting the wreck does nothing')
  f.hammer.dispose()
}
console.log('PASS The flying hammer has its own health; shot down, it falls and stays down')

{
  // When the Sledge dies, his hammer falls with him. A checkpoint brings it back as it was.
  const f = hammerField()
  f.sense.owner.awake = true
  f.run(1)
  f.hammer.damage(100)
  const saved = f.hammer.snapshot()
  assert.deepEqual(saved, { health: HAMMER_RULES.health - 100, state: 'orbit' }, 'The checkpoint keeps its health')
  f.sense.owner.alive = false
  f.run(0.1)
  assert.equal(f.hammer.state, 'broken', 'It falls when he dies')
  f.hammer.restore(saved, f.sense.owner.position)
  assert(f.hammer.state === 'orbit' && f.hammer.health === HAMMER_RULES.health - 100 && f.hammer.root.visible, 'Restored, it is back at his side, as hurt as it was')
  f.hammer.restore(undefined, f.sense.owner.position)
  assert(f.hammer.state === 'idle' && f.hammer.health === HAMMER_RULES.health && !f.hammer.root.visible, 'A restart puts it back to waiting, mended')
  f.hammer.dispose()
}
console.log('PASS The flying hammer falls when the Sledge dies, and checkpoints restore it')
