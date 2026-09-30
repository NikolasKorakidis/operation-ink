import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCompound } from '../src/world/compound'
import { militaryInterior } from '../src/world/interiors'
import { QUEST_COLORS } from '../src/render/ink'
import { CollisionWorld } from '../src/player/collision'
import { CRATE_RULES, QuestCrates } from '../src/game/crates'
import { SHARED_MISSION_KEYS, initialMission } from '../src/game/mission'
import { guestMessage } from '../src/net/hub'
import type { SoundEvent } from '../src/game/types'

const colors = (object: THREE.Object3D) => {
  const found = new Set<number>()
  object.traverse(child => { const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if ((child as THREE.Mesh).isMesh && material?.color) found.add(material.color.getHex()) })
  return found
}

{
  const compound = createCompound(), byBuilding = new Map<string, { radio: number; crate: number }>()
  compound.traverse(object => {
    const kind = object.userData.questItem as 'radio' | 'crate' | undefined
    if (!kind) return
    let building: THREE.Object3D | null = object
    while (building && !building.userData.enterable) building = building.parent
    assert(building, `${object.name} stands inside a building`)
    const row = byBuilding.get(building.name) ?? { radio: 0, crate: 0 }
    row[kind]++; byBuilding.set(building.name, row)
    const painted = colors(object)
    if (kind === 'radio') assert(painted.has(QUEST_COLORS.olive) && painted.has(QUEST_COLORS.umber), `${object.name} is painted olive and brown`)
    else assert(painted.has(QUEST_COLORS.wood) && object.userData.questCrate === object.name && object.userData.dynamicCollision, `${object.name} is a wooden, breakable crate`)
  })
  const total = (kind: 'radio' | 'crate') => [...byBuilding.values()].reduce((sum, row) => sum + row[kind], 0)
  assert.equal(total('radio'), 8, 'Eight radios')
  assert.equal(total('crate'), 8, 'Eight crates')
  assert([...byBuilding.values()].every(row => !(row.radio && row.crate)), 'Crates are only in buildings without a radio')
  // Nothing else in the world is painted.
  const outside = new Set<number>()
  compound.traverse(object => {
    for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) if (parent.userData.questItem) return
    const material = (object as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined
    if ((object as THREE.Mesh).isMesh && material?.color) outside.add(material.color.getHex())
  })
  assert(!Object.values(QUEST_COLORS).some(color => outside.has(color)), 'Only quest items use the quest colours')
}
console.log('PASS 8 painted radios and 8 wooden crates, never in the same building, and nothing else painted')

{
  const scene = new THREE.Scene(), room = militaryInterior('Test stores', 'warehouse', 25, 11, 0)
  scene.add(room); scene.updateMatrixWorld(true)
  const world = new CollisionWorld(scene), sounds: SoundEvent[] = []
  const crates = new QuestCrates(scene, event => sounds.push(event))
  assert.equal(crates.crates.size, 2)
  const [id] = crates.crates.keys()
  const center = crates.center(id)!
  const origin = center.clone().add(new THREE.Vector3(0, 0.2, 3)), direction = center.clone().sub(origin).normalize()
  const aim = () => world.raySurface(origin, direction, 10)
  assert.equal(crates.at(aim()?.mesh), id, 'A shot finds the crate')
  const state = initialMission()
  assert(!crates.damage(id, CRATE_RULES.health / 2 + 1), 'One pistol round does not break it')
  assert(crates.damage(id, 30), 'A second one does')
  state.brokenCrates.push(id)
  crates.sync(state)
  world.refresh()
  assert.notEqual(crates.at(aim()?.mesh), id, 'A broken crate no longer stops shots or blocks the way')
  assert(!crates.crates.get(id)!.object.visible)
  assert.equal(sounds.at(-1)?.kind, 'crate-explosion', 'It goes off with a bang')
  assert(crates.active > 0, 'Flash, smoke and planks fly')
  for (let i = 0; i < 60 * 8; i++) crates.update(1 / 60)
  assert.equal(crates.active, 0, 'The debris clears away')
  // Checkpoint restore: the crate is whole again, silently, at full health.
  crates.reset(initialMission()); world.refresh()
  assert.equal(crates.at(aim()?.mesh), id)
  assert.equal(crates.active, 0)
  assert(!crates.damage(id, 30), 'A restored crate is at full health')
  crates.dispose(); world.dispose()
}
console.log('PASS A crate breaks after two pistol rounds, explodes, leaves the collision world, and comes back whole on a checkpoint restore')

{
  assert.deepEqual(initialMission().brokenCrates, [])
  assert((SHARED_MISSION_KEYS as readonly string[]).includes('brokenCrates'), 'The host shares broken crates with guests')
  assert.deepEqual(guestMessage(2, { t: 'crate', id: 2, crate: 'Southwest stores · furnished interior · quest-crate 1', damage: 30 }),
    { t: 'crate', id: 2, crate: 'Southwest stores · furnished interior · quest-crate 1', damage: 30 })
  assert.equal(guestMessage(2, { t: 'crate', id: 2, crate: 'x', damage: 5000 }), null)
  assert.equal(guestMessage(2, { t: 'crate', id: 3, crate: 'x', damage: 30 }), null, 'A guest reports only its own shots')
}
console.log('PASS Broken crates are mission state shared in co-op; guests report crate hits to the host')
