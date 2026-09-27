import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCompound } from '../src/world/compound'
import { createMissionWorld, prepareCompound } from '../src/game/world'
import { BUILDING_NAMES } from '../src/world/labels'

// Map-view name tags look buildings up by scene name; a renamed building would silently lose its tag.
const scene = new THREE.Scene(), compound = createCompound(), mission = createMissionWorld(compound)
prepareCompound(compound); scene.add(compound, mission.root)
const names = new Set<string>()
scene.traverse(object => names.add(object.name))
const missing = Object.keys(BUILDING_NAMES).filter(name => !names.has(name))
assert.deepEqual(missing, [], `Labelled buildings missing from the scene: ${missing.join(', ')}`)
const labels = Object.values(BUILDING_NAMES).map(entry => entry.label)
assert.equal(new Set(labels).size, labels.length, 'Every tag names a different building')
for (const landmark of ['Mess hall', 'Detention block', 'Security cabin']) assert(labels.includes(landmark))
console.log(`PASS All ${labels.length} map-view building tags match a building in the scene, with unique names`)
