import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCompound } from '../src/world/compound'
import { createMissionWorld } from '../src/game/world'
import { initialMission, SHARED_MISSION_KEYS, stationLabel, useStation } from '../src/game/mission'
import { missionObjectives, objectiveChanges } from '../src/game/objectives'
import { QuestRadios } from '../src/game/radios'
import { CAMERA_TERMINALS } from '../src/game/rescue-layout'
import { guestMessage } from '../src/net/hub'

const compound = createCompound()
const world = createMissionWorld(compound)
const scene = new THREE.Scene()
scene.add(compound, world.root)
scene.updateMatrixWorld(true)
const sounds: string[] = []
const radios = new QuestRadios(scene, event => sounds.push(event.kind))
const ids = [...radios.radios.keys()]
assert.equal(ids.length, 8, 'Eight enemy radios')
const stations = world.stations.filter(station => station.kind === 'radio')
assert.deepEqual(stations.map(station => station.id).sort(), [...ids].sort(), 'Each radio can be switched off where it stands')
for (const station of stations) assert(station.object.userData.dynamicCollision, `${station.id} can leave the collision world once wrecked`)
console.log('PASS Every radio is a switch-off station and a shootable target')

const totals = { crates: 8, radios: ids }
{
  const state = initialMission()
  const list = missionObjectives(state, totals)
  assert.deepEqual(list.map(objective => objective.id), ['hostage', 'crates', 'radios', 'cameras'], 'The main mission first, then the side missions')
  assert(list[0].main && list.slice(1).every(objective => !objective.main))
  assert.deepEqual(list.slice(1).map(objective => objective.progress), [[0, 8], [0, 8], [0, 2]], 'Every count starts at zero')
  assert(list.every(objective => !objective.done))

  assert.equal(stationLabel(state, 'radio', ids[0]), 'Switch off radio')
  assert(useStation(state, 'radio', ids[0]).changed)
  assert.equal(stationLabel(state, 'radio', ids[0]), null, 'A switched-off radio has nothing left to use')
  state.destroyedRadios.push(ids[1])
  assert.equal(stationLabel(state, 'radio', ids[1]), null, 'Nor does a wrecked one')
  assert.deepEqual(missionObjectives(state, totals)[2].progress, [2, 8], 'Switching off and shooting both count')
  state.destroyedRadios.push(ids[0])
  assert.deepEqual(missionObjectives(state, totals)[2].progress, [2, 8], 'Shooting a switched-off radio does not count it twice')
  state.disabledRadios.push(...ids.slice(2))
  assert(missionObjectives(state, totals)[2].done, 'Every radio out: the side mission is done')

  state.brokenCrates.push('a', 'b', 'c')
  assert.deepEqual(missionObjectives(state, totals)[1].progress, [3, 8])
  state.camerasOff.push(CAMERA_TERMINALS.office)
  assert.deepEqual(missionObjectives(state, totals)[3].progress, [1, 2])
  assert(!missionObjectives(state, totals)[3].done, 'One terminal leaves the other camera group watching')
  state.camerasOff.push(CAMERA_TERMINALS.security)
  assert(missionObjectives(state, totals)[3].done)

  assert.match(missionObjectives(state, totals)[0].detail, /detention/i)
  state.hostages[0].status = 'following'
  assert.match(missionObjectives(state, totals)[0].detail, /jeep/i)
  state.phase = 'complete'
  assert(missionObjectives(state, totals)[0].done, 'Escaping with him completes the main mission')
}
console.log('PASS The mission list: save the hostage, then crates, radios (switched off or shot, counted once) and both camera terminals')

{
  assert(SHARED_MISSION_KEYS.includes('disabledRadios') && SHARED_MISSION_KEYS.includes('destroyedRadios'), 'Co-op shares which radios are out')
  assert.deepEqual(guestMessage(3, { t: 'radio', id: 3, radio: ids[0] }), { t: 'radio', id: 3, radio: ids[0] }, 'A guest can report shooting a radio')
  assert.equal(guestMessage(3, { t: 'radio', id: 3, radio: 42 }), null, 'Malformed radio reports are dropped')
}
console.log('PASS Co-op carries radio shots and shares their state')

{
  const state = initialMission()
  const target = radios.radios.get(ids[0])!, mesh = target.object.children.find(child => (child as THREE.Mesh).isMesh)!
  assert.equal(radios.at(mesh), ids[0], 'A bullet on the casing finds its radio')
  const live = target.led.material
  state.disabledRadios.push(ids[0])
  radios.sync(state)
  assert.notEqual(target.led.material, live, 'Its status light goes out')
  assert(sounds.includes('switch'), 'It clicks off')
  assert.equal(radios.at(mesh), ids[0], 'A switched-off radio can still be shot')
  state.destroyedRadios.push(ids[0])
  radios.sync(state)
  assert(!target.object.visible && target.remains.visible, 'A shot radio is replaced by its wreck')
  assert(target.object.getWorldPosition(new THREE.Vector3()).y < -500, 'and its collider leaves the level')
  assert.equal(radios.at(mesh), null, 'A wreck cannot be shot again')
  assert(radios.update(0.016), 'Sparks and fragments fly')
  radios.reset(initialMission())
  assert(target.object.visible && !target.remains.visible && target.object.getWorldPosition(new THREE.Vector3()).y > 0, 'A checkpoint or restart puts it back whole')
}
console.log('PASS Radios switch off, blow apart when shot, and come back on a restart')
radios.dispose()

{
  const state = initialMission()
  const before = missionObjectives(state, totals)
  state.camerasOff.push(CAMERA_TERMINALS.office)
  const one = missionObjectives(state, totals)
  assert.deepEqual(objectiveChanges(before, one), { advanced: ['cameras'], completed: [] }, '1/2: the camera count moves on (it blinks), nothing is finished yet')
  state.camerasOff.push(CAMERA_TERMINALS.security)
  const two = missionObjectives(state, totals)
  assert.deepEqual(objectiveChanges(one, two), { advanced: ['cameras'], completed: ['cameras'] }, '2/2: the side mission is finished (it is scratched out)')
  assert.deepEqual(objectiveChanges(two, two), { advanced: [], completed: [] }, 'Nothing new, nothing to show')
  assert.deepEqual(objectiveChanges(two, before), { advanced: [], completed: [] }, 'A retry or restart winding counts back is not progress')
  state.phase = 'complete'
  assert.deepEqual(objectiveChanges(two, missionObjectives(state, totals)).completed, ['hostage'], 'Saving the hostage finishes the main mission')
}
console.log('PASS Progress is noticed: a count that goes up blinks, a finished mission is scratched out, going back is ignored')

