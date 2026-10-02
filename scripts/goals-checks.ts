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

// Collect: each station used counts, all of them finish it. Detonate: done when its charge has gone off; its line
// follows the charge from finding it to getting clear.
{
  const { chargeStage } = await import('../src/game/goals')
  const { beepInterval } = await import('../src/game/charges')
  const files: GoalSpec[] = [{ id: 'files', kind: 'collect', stations: ['a', 'b', 'c'], label: 'Collect the files' },
    { id: 'depot', kind: 'detonate', charge: 'c4', label: 'Destroy the depot', steps: { find: 'Find it', carry: 'Plant it', armed: 'Run' } }]
  const state = initialMission([])
  const sense: GoalSense = { players: [], enemies: [], totals: { crates: 0, radios: 0 }, radiosOut: 0, chargePickups: { c4: 'pickup' } }
  const charge = { id: 'c4', pickup: 'pickup' }
  state.usedStations.push('a', 'c')
  assert.deepEqual(goalObjectives(state, files, sense)[0].progress, [2, 3], 'Two files of three')
  assert.deepEqual(updateGoals(state, files, sense), [])
  state.usedStations.push('b')
  assert.deepEqual(updateGoals(state, files, sense), ['files'], 'The third file finishes it')
  assert.equal(goalObjectives(state, files, sense)[1].detail, 'Find it')
  assert.equal(chargeStage(state, charge), 'find')
  state.usedStations.push('pickup')
  assert.equal(chargeStage(state, charge), 'carried')
  assert.equal(goalObjectives(state, files, sense)[1].detail, 'Plant it', 'Carrying the charge, the line says to plant it')
  state.chargesPlanted.c4 = 12
  assert.equal(chargeStage(state, charge), 'armed')
  assert.equal(goalObjectives(state, files, sense)[1].detail, 'Run')
  assert.deepEqual(updateGoals(state, files, sense), [], 'A ticking charge has not done it yet')
  state.chargesExploded.push('c4')
  assert.deepEqual(updateGoals(state, files, sense), ['depot'], 'The blast does')
  assert(SHARED_MISSION_KEYS.includes('chargesPlanted') && SHARED_MISSION_KEYS.includes('chargesExploded'), 'Co-op shares the charges')
  // The beeps quicken as the fuse runs down: a second apart at first, a tenth at the end.
  assert(Math.abs(beepInterval(10, 10) - 1) < 1e-9 && beepInterval(0, 10) < 0.1 && beepInterval(3, 10) < beepInterval(7, 10))
}
console.log('PASS Collect goals count their stations; a charge goal follows its charge to the blast; the beeps quicken')

// An extraction with captives is theirs to reach: the players' position does not count, only every listed captive,
// freed (the sense lists freed ones only) and inside the area. The objectives line counts them in.
{
  const goals: GoalSpec[] = [{ id: 'out', kind: 'extract', area: { center: [0, 0, -20], radius: 6 }, captives: ['a', 'b'], label: 'Get them out' }]
  const state = initialMission([])
  const at = (x: number, z: number) => new THREE.Vector3(x, 0, z)
  const sense = (captives: Record<string, THREE.Vector3>, players = [at(0, -20)]): GoalSense =>
    ({ players, enemies: [], totals: { crates: 0, radios: 0 }, radiosOut: 0, captives })
  assert.deepEqual(updateGoals(state, goals, sense({})), [], 'The player alone at the gate does not end it')
  assert.deepEqual(updateGoals(state, goals, sense({ a: at(1, -19) })), [], 'One prisoner out of two does not either')
  assert.deepEqual(goalObjectives(state, goals, sense({ a: at(1, -19) }))[0].progress, [1, 2], 'The line counts the prisoners who are out')
  assert.deepEqual(updateGoals(state, goals, sense({ a: at(1, -19), b: at(-2, -22) }, [at(40, 40)])), ['out'], 'Both out wins it, wherever the player is')
  assert(goalsComplete(state, goals))
}
console.log('PASS An extraction for captives is done when every one of them is out, wherever the players are')
