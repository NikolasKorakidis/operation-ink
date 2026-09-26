import assert from 'node:assert/strict'
import * as THREE from 'three'
import { FirstPersonWeapons } from '../src/game/weapons'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { AIM_ZOOM, KNIFE, SHOTGUN_PELLETS, WEAPON_RULES, shotgunDamageMultiplier } from '../src/game/balance'
import { CollisionWorld } from '../src/player/collision'
import { createCompound } from '../src/world/compound'
import { createMissionWorld, prepareCompound } from '../src/game/world'
import type { MeleeAttack, Shot, SoundEvent, WeaponFrame, WeaponItem } from '../src/game/types'
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
function fixture(wall = false) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.06, 200)
  camera.position.set(0, 1.7, 0); scene.add(camera)
  if (wall) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 0.2), new THREE.MeshBasicMaterial()); mesh.position.set(0, 1.5, -0.6); scene.add(mesh) }
  const world = new CollisionWorld(scene), shots: Shot[] = [], sounds: SoundEvent[] = [], melee: MeleeAttack[] = []
  const weapons = new FirstPersonWeapons({ scene, camera, world, onShot: s => shots.push(s), emit: e => sounds.push(e), onMelee: a => melee.push(a) })
  const frame: WeaponFrame = { active: true, climbing: false, moving: 0, aiming: false, reducedMotion: false, feet: v() }
  const step = (seconds: number) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) weapons.update(1 / 60, frame) }
  step(1 / 60)
  // Put a gun in the primary slot and hold it.
  const equip = (item: WeaponItem) => { const saved = weapons.snapshot(); saved.slots[0] = item; saved.selected = 0; weapons.restore(saved); step(0.3) }
  return { scene, camera, world, weapons, shots, sounds, melee, frame, step, equip, dispose() { weapons.dispose(); world.dispose() } }
}
{
  const f = fixture()
  const fresh = f.weapons.snapshot()
  assert.deepEqual(fresh.slots.map(w => w?.name ?? null), [null, 'silenced', 'knife', null, null], 'Counter-Strike layout: primary empty, sidearm, knife')
  assert.equal(fresh.selected, 2)
  assert.equal(f.weapons.current?.name, 'knife', 'Fresh missions start with the knife out')
  assert.equal(f.weapons.ammo, '—')
  assert.equal(fresh.slots[1]?.magazine, 12); assert.equal(fresh.slots[1]?.reserve, 36)
  assert(!f.weapons.switchSlot(0), 'Empty slots cannot be selected'); assert(!f.weapons.switchSlot(3))
  assert(f.weapons.switchSlot(1)); f.step(0.3); assert.equal(f.weapons.current?.name, 'silenced')
  assert(!f.weapons.switchSlot(5)); assert(!f.weapons.switchSlot(-1)); assert(!f.weapons.switchSlot(1.5))
  const snapshot = f.weapons.snapshot(); f.weapons.restore(snapshot); assert.deepEqual(f.weapons.snapshot(), snapshot)
  assert.equal(f.weapons.selected, 1)
  const second = fixture(); f.weapons.current!.magazine = 1
  assert.equal(second.weapons.slots[1]?.magazine, 12, 'starting inventories cannot share mutable ammo')
  f.weapons.restore(fresh)
  assert.equal(f.weapons.current?.name, 'knife', 'Restoring the insertion checkpoint returns to the knife')
  assert(f.weapons.switchSlot(1)); f.step(0.3); assert(f.weapons.switchSlot(2)); f.step(0.3)
  assert(!f.weapons.drop(f.frame.feet), 'The knife cannot be dropped'); assert.equal(f.weapons.current?.name, 'knife')
  f.dispose(); second.dispose()
}
console.log('PASS The kit is a silenced pistol and a knife in Counter-Strike slots; empty slots are skipped and the knife stays')
{
  const f = fixture()
  f.weapons.trigger(true); f.weapons.trigger(false); f.step(1 / 60)
  assert.equal(f.weapons.knifeSwing?.kind, 'slash'); assert.equal(f.shots.length, 0, 'A knife fires nothing')
  assert.equal(f.melee.length, 0, 'The blade connects partway through the swing, not on the click')
  f.step(KNIFE.slash.hitAt + 0.02)
  assert.equal(f.melee.length, 1); assert.equal(f.melee[0].kind, 'slash'); assert.equal(f.melee[0].damage, KNIFE.slash.damage)
  const swish = f.sounds.find(e => e.kind === 'knife-slash')
  assert(swish && swish.radius! <= 1.5, 'The swing is too quiet for a guard at arm\'s length to hear')
  f.step(1)
  f.weapons.stab(); f.step(1 / 60)
  assert.equal(f.weapons.knifeSwing?.kind, 'stab')
  f.step(KNIFE.stab.hitAt + 0.02); assert.equal(f.melee.at(-1)?.kind, 'stab'); assert.equal(f.melee.at(-1)?.damage, KNIFE.stab.damage)
  f.step(0.1); f.weapons.stab(); f.step(0.1)
  assert.equal(f.melee.length, 2, 'A stab has a long recovery before the next attack')
  f.dispose()
  const wall = fixture(true)
  wall.weapons.trigger(true); wall.weapons.trigger(false); wall.step(0.3)
  assert.equal(wall.melee.length, 1, 'A knife is never lowered by a nearby wall')
  wall.dispose()
}
console.log('PASS Knife slashes on left click and stabs on right click, connecting mid-swing with a quiet swish')
{
  const f = fixture()
  const fov = f.camera.fov
  assert(f.weapons.switchSlot(1)); f.step(0.3)
  f.frame.aiming = true; f.step(1)
  assert(f.weapons.canAim && Math.abs(f.weapons.magnification - AIM_ZOOM.silenced!) < 0.01, 'The silenced pistol aims down its sights')
  f.frame.aiming = false; f.step(1)
  assert.equal(f.camera.fov, fov, 'Leaving aim restores the exact field of view')
  f.equip({ id: 'ak', name: 'ak', magazine: 30, reserve: 90 })
  f.frame.aiming = true; f.step(1)
  assert(Math.abs(f.weapons.magnification - 2) < 0.01, 'The AK zooms 2×')
  assert(Math.abs(f.weapons.lookSensitivity - 1 / f.weapons.magnification) < 1e-9, 'Mouse sensitivity follows the zoom')
  f.frame.aiming = false; f.step(1)
  f.weapons.current!.magazine = 5
  f.weapons.trigger(true); f.weapons.trigger(false); f.step(1 / 60)
  f.equip({ id: 'sd', name: 'silenced', magazine: 5, reserve: 0 })
  f.weapons.trigger(true); f.weapons.trigger(false); f.step(1 / 60)
  const reports = f.sounds.filter(e => e.kind.startsWith('shot-'))
  assert.equal(reports.at(-1)?.kind, 'shot-silenced')
  assert(reports.at(-1)!.radius! < 10 && reports.at(-2)!.radius! > 30, 'The suppressor keeps the report within a few metres')
  f.dispose()
}
console.log('PASS Pistols zoom 1.25×, SMG 1.5×, AK 2× when aimed; the suppressed pistol is quiet')
{
  const f = fixture(); f.equip({ id: 'sg', name: 'shotgun', magazine: 6, reserve: 24 })
  f.weapons.trigger(true); f.weapons.trigger(false); f.step(1 / 60)
  assert.equal(f.shots.length, SHOTGUN_PELLETS); assert.equal(f.weapons.current!.magazine, 5)
  assert.equal(f.sounds.filter(e => e.kind === 'shot-shotgun').length, 1)
  assert.equal(new Set(f.shots.map(s => s.direction.toArray().join(','))).size, SHOTGUN_PELLETS)
  assert(f.shots.every(s => Math.abs(s.direction.length() - 1) < 1e-8 && s.range === 32 && s.damage === WEAPON_RULES.shotgun.damage))
  assert.deepEqual(f.shots.map(s => s.pelletIndex), [0, 1, 2, 3, 4, 5, 6, 7])
  f.step(0.24)
  const model = f.scene.getObjectByName('Firing hand grip mount')!.children.find(o => o.userData.parts)!
  const pump = model.userData.parts.pump as THREE.Object3D
  assert(pump.position.z < 0.24, 'pump actually travels after firing')
  assert(f.sounds.some(e => e.kind === 'weapon-pump'))
  f.step(1)
  assert.equal(f.shots.length, 8, 'shotgun remains semi-automatic')
  assert(Math.abs(pump.position.z - 0.26) < 1e-8)
  f.dispose()
}
console.log('PASS Shotgun emits eight spread pellets per shell, one report and a visible pump cycle')
{
  const f = fixture(); f.equip({ id: 'sg', name: 'shotgun', magazine: 6, reserve: 24 })
  f.weapons.current!.magazine = 2; f.weapons.current!.reserve = 4
  assert(f.weapons.reload()); f.step(0.5); assert.equal(f.weapons.current!.magazine, 2)
  f.step(0.2); assert.equal(f.weapons.current!.magazine, 3); assert.equal(f.weapons.current!.reserve, 3)
  f.weapons.trigger(true); f.weapons.trigger(false); f.step(1 / 60)
  assert(!f.weapons.reloading); assert.equal(f.weapons.current!.magazine, 2); assert.equal(f.weapons.current!.reserve, 3)
  f.step(1); assert(f.weapons.reload()); f.step(3)
  assert.equal(f.weapons.ammo, '5 / 0'); assert(!f.weapons.reloading)
  const saved = f.weapons.snapshot(); f.weapons.restore(saved); assert.deepEqual(f.weapons.snapshot(), saved)
  f.dispose()
}
console.log('PASS Shell-by-shell reload conserves ammo and can be interrupted to fire')
{
  const f = fixture(true); f.equip({ id: 'sg', name: 'shotgun', magazine: 6, reserve: 24 })
  f.weapons.trigger(true); f.step(0.2)
  assert.equal(f.shots.length, 0); assert.equal(f.weapons.current!.magazine, 6); assert(f.weapons.blocked)
  f.dispose()
}
console.log('PASS Solid cover blocks the shotgun muzzle without spending a shell')
{
  const f = fixture()
  const take = (item: WeaponItem) => {
    f.weapons.addPickup({ ...item, position: [0, 0, -1] })
    f.camera.lookAt(f.weapons.pickupTargets().find(p => p.id === item.id)!.point)
    assert(f.weapons.pickup(item.id)); f.step(0.3)
  }
  take({ id: 'roof-ak', name: 'ak', magazine: 30, reserve: 30 })
  assert.equal(f.weapons.selected, 0, 'A found rifle fills the empty primary slot and comes up ready')
  take({ id: 'found-smg', name: 'smg', magazine: 24, reserve: 24 }); take({ id: 'found-shotgun', name: 'shotgun', magazine: 6, reserve: 6 })
  assert.deepEqual(f.weapons.slots.map(w => w?.name), ['ak', 'silenced', 'knife', 'smg', 'shotgun'])
  assert(f.weapons.switchSlot(2)); f.step(0.3)
  take({ id: 'found-sniper', name: 'sniper', magazine: 5, reserve: 10 })
  assert.deepEqual(f.weapons.slots.map(w => w?.name), ['sniper', 'silenced', 'knife', 'smg', 'shotgun'], 'Holding the knife with a full kit swaps the primary; the knife stays')
  assert(f.weapons.snapshot().pickups.some(w => w.id === 'roof-ak' && w.magazine === 30 && w.reserve === 30))
  f.frame.aiming = true; f.step(0.3)
  assert(f.weapons.scoped, 'A picked-up sniper can enter its scope')
  assert(f.weapons.adjustScopeZoom(1))
  assert.equal(f.weapons.scopeMagnification, 5)
  f.dispose()
}
console.log('PASS A picked-up sniper swaps only the selected gun, preserves ammunition and supports adjustable zoom')
for (const distance of [3, 28]) {
  const scene = new THREE.Scene(), world = new CollisionWorld(scene)
  const ai = new EnemyDirector({ scene, world, doors: [], specs: [{ id: 'target', name: 'Target', position: [0, 0, -distance], patrol: [], weapon: 'pistol' }], emit() {}, damagePlayer() {}, dropWeapon() {} }, async () => {
    const root = new THREE.Group()
    return { root, reactionRemaining: 0, animationTime: 0, update() {}, react() {}, restore() {}, dispose() {}, muzzle: () => root.position.clone() } as unknown as EnemyActor
  })
  await ai.init()
  assert(ai.hit({ origin: v(0, 1.1), direction: v(0, 0, -1), range: 32, damage: WEAPON_RULES.shotgun.damage, weapon: 'shotgun' }, 32))
  const damage = 100 - ai.enemies[0].health
  if (distance === 3) assert.equal(damage, WEAPON_RULES.shotgun.damage)
  else assert(damage < WEAPON_RULES.shotgun.damage * shotgunDamageMultiplier(26), 'individual shotgun pellets lose energy at long range')
  ai.dispose(); world.dispose()
}
console.log('PASS Shotgun damage falls off from close to long range')

const scene = new THREE.Scene(), compound = createCompound(), mission = createMissionWorld()
prepareCompound(compound); scene.add(compound, mission.root); scene.updateMatrixWorld(true)
const ladder = v(-48.665, 0, -51.35)
for (const enemy of mission.enemies) {
  const points = enemy.patrol.length ? enemy.patrol : [enemy.position]
  for (let i = 0; i < points.length; i++) {
    const a = new THREE.Vector3(...points[i]).setY(0), b = new THREE.Vector3(...points[(i + 1) % points.length]).setY(0)
    const closest = new THREE.Line3(a, b).closestPointToPoint(ladder, true, v())
    assert(closest.distanceTo(ladder) >= 12, `${enemy.id} route enters the clear ladder area`)
  }
}
assert(!mission.enemies.some(e => ['signals-operator', 'signals-records', 'mess-west-aisle'].includes(e.id)))
console.log('PASS No enemy spawn or authored patrol segment enters the 12m ladder approach')
