import assert from 'node:assert/strict'

// A stand-in for the browser's localStorage, installed before the save store first touches it.
const memory = new Map<string, string>()
let full = false
const session = new Map<string, string>()
Object.assign(globalThis, { window: { localStorage: {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { if (full) throw new Error('QuotaExceededError'); memory.set(key, value) },
  removeItem: (key: string) => { memory.delete(key) },
}, sessionStorage: {
  getItem: (key: string) => session.get(key) ?? null,
  setItem: (key: string, value: string) => { session.set(key, value) },
  removeItem: (key: string) => { session.delete(key) },
} } })
const { CURRENT_LEVEL, LEVELS, deleteSave, listSaves, readSave, writeSave } = await import('../src/game/saves')

assert(LEVELS[CURRENT_LEVEL], 'The current level is a known level')
assert.deepEqual(listSaves(), [], 'No saves to begin with')
assert.equal(readSave(CURRENT_LEVEL), null)

const checkpoint = { mission: { elapsed: 42.5, distractionUntil: -Infinity, never: Infinity }, position: [1, 2, 3] }
assert(writeSave({ level: CURRENT_LEVEL, elapsed: 42.5, objective: 'Find the detention building' }, checkpoint))
const [info] = listSaves()
assert.equal(info.level, CURRENT_LEVEL); assert.equal(info.elapsed, 42.5); assert(info.savedAt > 0)
assert.deepEqual(readSave(CURRENT_LEVEL), checkpoint, 'A checkpoint round-trips exactly, Infinity included')
console.log('PASS A saved mission lists in the index and loads back exactly, Infinity timers included')

writeSave({ level: CURRENT_LEVEL, elapsed: 60, objective: 'Escort the hostage' }, { mission: { elapsed: 60 } })
assert.equal(listSaves().length, 1, 'One slot per level: saving again overwrites it')
assert.equal((readSave(CURRENT_LEVEL) as { mission: { elapsed: number } }).mission.elapsed, 60)
deleteSave(CURRENT_LEVEL)
assert.deepEqual(listSaves(), []); assert.equal(readSave(CURRENT_LEVEL), null)
console.log('PASS Saving again overwrites the level\'s slot, and a deleted save is gone')

memory.set('stickman-ghost-ink.saves', JSON.stringify({ version: 0, saves: [{ level: CURRENT_LEVEL, savedAt: 1, elapsed: 1, objective: 'x' }] }))
assert.deepEqual(listSaves(), [], 'Saves from an older format are ignored')
memory.set('stickman-ghost-ink.saves', JSON.stringify({ version: 1, saves: [{ level: 'removed-level', savedAt: 1, elapsed: 1, objective: 'x' }] }))
assert.deepEqual(listSaves(), [], 'Saves for a level that no longer exists are ignored')
memory.set('stickman-ghost-ink.saves', '{not json')
assert.deepEqual(listSaves(), [], 'A damaged index reads as no saves')
memory.clear(); full = true
assert.equal(writeSave({ level: CURRENT_LEVEL, elapsed: 1, objective: 'x' }, {}), false, 'Full storage reports failure')
assert.deepEqual(listSaves(), [], 'and leaves no half-written save behind')
console.log('PASS Old-format, unknown-level, damaged and unstorable saves never break the menu')

// The campaign: started on mission 1, moved on by each win, finished after the last; Load continues it.
{
  full = false; memory.clear()
  const { readCampaign, startCampaign, finishCampaignMission, missionNumber, setNextRun, takeRun } = await import('../src/game/saves')
  assert.equal(readCampaign(), null, 'No campaign to begin with')
  writeSave({ level: CURRENT_LEVEL, elapsed: 5, objective: 'x' }, {})
  assert.equal(readCampaign()?.mission, CURRENT_LEVEL, 'A mission saved before campaigns existed is picked up as one')
  const campaign = startCampaign()
  assert.equal(campaign.mission, CURRENT_LEVEL); assert.deepEqual(campaign.completed, [])
  assert.deepEqual(listSaves(), [], 'A new campaign clears the missions\' checkpoints')
  assert.equal(missionNumber('compound'), 1); assert.equal(missionNumber('town'), 2); assert.equal(missionNumber('training'), 0)
  assert.equal(finishCampaignMission('compound'), 'town', 'Winning mission 1 leads to mission 2')
  assert.deepEqual([readCampaign()!.mission, readCampaign()!.completed], ['town', ['compound']])
  assert.equal(finishCampaignMission('town'), null, 'After the last mission there is no next one')
  assert.equal(readCampaign()!.mission, null, 'The campaign is complete')
  memory.set('stickman-ghost-ink.campaign', '{broken'); memory.delete('stickman-ghost-ink.saves')
  assert.equal(readCampaign(), null, 'A damaged campaign reads as none')
  // How a level is entered travels with the switch to it, once, and only to that level.
  setNextRun('free', 'town')
  assert.equal(takeRun('compound'), null, 'Another level does not take it')
  setNextRun('campaign', 'town')
  assert.equal(takeRun('town'), 'campaign'); assert.equal(takeRun('town'), null, 'It is read once')
}
console.log('PASS The campaign starts on mission 1, moves on with each win, ends after the last, and survives damage')
