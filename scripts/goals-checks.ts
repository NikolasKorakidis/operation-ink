import assert from 'node:assert/strict'
import * as THREE from 'three'
import { goalHint, goalObjectives, goalsComplete, goalUnlocked, updateGoals, type GoalSense, type GoalSpec } from '../src/game/goals'
import { initialMission, stationLabel, useStation, sharedMission, SHARED_MISSION_KEYS } from '../src/game/mission'
import type { EnemyState } from '../src/game/types'

const goals: GoalSpec[] = [
  { id: 'intel', kind: 'interact', station: 'laptop', label: 'Take the intel' },
  { id: 'targets', kind: 'eliminate', enemies: ['a', 'b'], label: 'Eliminate the officers', after: ['intel'] },
  { id: 'radios', kind: 'destroy', items: 'radios', label: 'Destroy the radios', main: false },
  { id: 'out', kind: 'extract', area: { center: [10, 0, 10], radius: 3 }, label: 'Extract' },
]
const enemies: { spec: { id: string }; state: EnemyState }[] = [{ spec: { id: 'a' }, state: 'patrol' }, { spec: { id: 'b' }, state: 'patrol' }, { spec: { id: 'c' }, state: 'patrol' }]
const sense = (at: [number, number, number] = [0, 0, 0], radiosOut = 0): GoalSense =>
  ({ players: [new THREE.Vector3(...at)], enemies, totals: { crates: 0, radios: 2 }, radiosOut })
const state = initialMission([])
assert.equal(state.hostages.length, 0, 'A level without a rescue has no hostages')

// Order: the eliminate goal waits for the intel, extraction waits for every main goal.
enemies[0].state = enemies[1].state = 'dead'
assert.deepEqual(updateGoals(state, goals, sense([10, 0, 10])), [], 'Nothing counts before the intel, and extraction is locked')
assert(!goalUnlocked(state, goals, goals[1]) && !goalUnlocked(state, goals, goals[3]))
assert.match(goalObjectives(state, goals, sense())[1].detail, /not yet/i, 'A locked goal says so')
assert.equal(goalHint(state, goals), 'Take the intel', 'The hint is the first main goal still to do')

// The intel station: labelled until used, then gone; using it is shared state.
assert.equal(stationLabel(state, 'objective', 'laptop'), 'Use')
assert(useStation(state, 'objective', 'laptop').changed)
assert.equal(stationLabel(state, 'objective', 'laptop'), null, 'A used station offers nothing more')
assert(SHARED_MISSION_KEYS.includes('goalsDone') && SHARED_MISSION_KEYS.includes('usedStations'), 'Co-op shares goal progress')
assert.deepEqual(sharedMission(state).usedStations, ['laptop'])

// Several goals settle in one frame, in order.
assert.deepEqual(updateGoals(state, goals, sense([0, 0, 0])), ['intel', 'targets'], 'The intel unlocks the officers, already down')
assert.deepEqual(goalObjectives(state, goals, sense()).find(goal => goal.id === 'targets')?.progress, [2, 2])
// Side goals never hold up the win, but they count.
assert.deepEqual(goalObjectives(state, goals, sense([0, 0, 0], 1)).find(goal => goal.id === 'radios')?.progress, [1, 2])
assert(!goalsComplete(state, goals), 'Not won before extracting')
assert.deepEqual(updateGoals(state, goals, sense([10.5, 0, 9])), ['out'], 'Extraction counts once the main goals are done')
assert(goalsComplete(state, goals), 'Every main goal done: the mission is won, side goals or not')
// Finished goals stay finished; a level with no goals is never won by them.
enemies[0].state = 'patrol'
updateGoals(state, goals, sense())
assert(state.goalsDone.includes('targets'))
assert(!goalsComplete(initialMission([]), []), 'No goals, no goal win')
// 'all' counts every real enemy, not training dummies.
const all: GoalSpec[] = [{ id: 'clear', kind: 'eliminate', enemies: 'all', label: 'Clear the area' }]
const crowd = [{ spec: { id: 'x' }, state: 'dead' as EnemyState }, { spec: { id: 'dummy', dummy: true }, state: 'patrol' as EnemyState }]
assert.deepEqual(updateGoals(initialMission([]), all, { players: [], enemies: crowd, totals: { crates: 0, radios: 0 }, radiosOut: 0 }), ['clear'])
console.log('PASS Goals: order, locking, shared stations, side goals, counts and winning')
