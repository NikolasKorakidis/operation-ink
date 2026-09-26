import assert from 'node:assert/strict'
import * as THREE from 'three'
import { MissionRuntime } from '../src/game/runtime'
import { advanceMission, damageMission, initialMission } from '../src/game/mission'
import { PLAYER_BULLET_DAMAGE, PLAYER_HEALTH } from '../src/game/balance'
import { PlayerDeathSequence } from '../src/game/player-death'
import { EscapeCinematic } from '../src/game/escape-cinematic'
import type { PlayerBulletHit } from '../src/game/player-hit-reactions'

const step = (state: ReturnType<typeof initialMission>, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) advanceMission(state, 1 / 60)
}

{
  const state = initialMission()
  damageMission(state, 50)
  step(state, PLAYER_HEALTH.regenDelay - 0.1)
  assert.equal(state.health, 50, 'Health does not refill before the delay')
  step(state, 0.2)
  assert(state.health > 50, 'Health starts refilling once the delay passes')
  damageMission(state, 10); const hurt = state.health
  step(state, PLAYER_HEALTH.regenDelay - 0.1)
  assert.equal(state.health, hurt, 'A new hit restarts the refill delay')
  step(state, 0.1 + PLAYER_HEALTH.max / PLAYER_HEALTH.regenPerSecond + 0.1)
  assert.equal(state.health, PLAYER_HEALTH.max, 'Health refills to exactly full')
  const saved = structuredClone(state); damageMission(state, 25)
  assert.deepEqual(structuredClone(saved), saved, 'Checkpoints clone the refill timer with the rest of mission state')
}
console.log('PASS Health waits for the delay, then refills to full; a new hit restarts the delay')

// Real runtime damage path with small collaborators, as in player-death-runtime-checks.
const noop = () => {}
Object.assign(globalThis, { document: { hidden: false, querySelector: () => ({ classList: { toggle: noop } }) } })
const m = Object.create(MissionRuntime.prototype) as any
const camera = new THREE.PerspectiveCamera(75)
camera.position.set(0, 1.68, 0)
let deaths = 0
const player = { enabled: true, immersive: false, playing: true, body: { position: new THREE.Vector3(), velocity: new THREE.Vector3(), grounded: true },
  actions: { traversing: false, reset: noop }, pause() { this.playing = false } }
Object.assign(m, {
  state: initialMission(), ready: true, deaths: 0, camera: { perspective: camera }, player,
  death: Object.assign(new PlayerDeathSequence(), { begin: () => deaths++ }), escape: new EscapeCinematic(),
  playerHits: { hit: noop, clear: noop }, weapons: { cancel: noop, beginDeath: noop },
  audio: { play: noop, beginDeath: noop }, hud: { reducedMotion: false, hurt: noop, hitFrom: noop, notify: noop, clearThreat: noop, setScoped: noop, setDeath: noop },
  invalidate: noop,
})
const source = new THREE.Vector3(0, 1, -10)
const bullet = (): PlayerBulletHit => ({ region: 'torso', side: 0, point: new THREE.Vector3(0, 1.2, 0), direction: new THREE.Vector3(0, 0, 1) })
for (const weaponDamage of [7, 32, 9]) m.damage(weaponDamage, source, bullet())
assert.equal(m.state.health, PLAYER_HEALTH.max - 3 * PLAYER_BULLET_DAMAGE, 'Every bullet removes a quarter, whatever the enemy weapon')
assert.equal(m.state.phase, 'active', 'Three hits leave the player alive')
m.damage(7, source, bullet())
assert.equal(m.state.phase, 'dead'); assert.equal(deaths, 1, 'The fourth bullet is lethal')

m.state = initialMission(); player.playing = true
m.damage(12)
assert.equal(m.state.health, 88, 'Landings keep their energy-based damage')
console.log('PASS Four enemy bullets kill regardless of weapon; landings keep scaled damage')
