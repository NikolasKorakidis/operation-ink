import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { CoopHub, MAX_PLAYERS, TEAM_COLORS, type CoopMessage, type Link, type PlayerPose } from '../src/net/hub'
import { normalizeRoomCode, newRoomCode } from '../src/net/session'
import { Teammates } from '../src/game/teammates'
import type { SoundEvent } from '../src/game/types'

const bytes = readFileSync('public/models/stickman.glb')
GLTFLoader.prototype.loadAsync = async function () {
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}

type FakeLink = Link & { sent: CoopMessage[]; closed: boolean }
const fakeLink = (): FakeLink => {
  const link: FakeLink = { sent: [], closed: false, send: message => link.sent.push(structuredClone(message)), close: () => { link.closed = true } }
  return link
}
const pose = (x = 0, extra: Partial<PlayerPose> = {}): PlayerPose => ({ feet: [x, 0, 0], yaw: 0, pitch: 0, speed: 0, weapon: 'ak', aiming: false, alive: true, ...extra })

{
  const delivered: CoopMessage[] = []
  const host = new CoopHub(message => delivered.push(message))
  host.startHost()
  const links = Array.from({ length: MAX_PLAYERS }, fakeLink)
  const ids = links.map(link => host.accept(link))
  assert.deepEqual(ids, [1, 2, 3, null], 'Guests take ids 1-3; a fifth player is refused')
  assert.deepEqual(links[3].sent, [{ t: 'full' }]); assert(links[3].closed)
  assert.deepEqual(links[0].sent[0], { t: 'welcome', id: 1, players: [0] })
  assert.deepEqual(links[2].sent[0], { t: 'welcome', id: 3, players: [0, 1, 2] })
  assert(links[0].sent.some(m => m.t === 'join' && m.id === 3), 'Existing guests hear about newcomers')

  for (const link of links) link.sent.length = 0
  host.fromGuest(2, { t: 'pose', id: 2, pose: pose(4) })
  assert.equal(delivered.at(-1)?.t, 'pose', 'The host sees guest poses')
  assert.equal(links[0].sent.length, 1); assert.equal(links[2].sent.length, 1)
  assert.equal(links[1].sent.length, 0, 'A guest is not echoed its own pose')

  const before = delivered.length
  host.fromGuest(2, { t: 'pose', id: 1, pose: pose() })
  host.fromGuest(2, { t: 'pose', id: 2, pose: { ...pose(), feet: [0, NaN, 0] } })
  host.fromGuest(2, { t: 'shot', id: 2, origin: [0, 0, 0], end: [0, 0, 1], weapon: 'rocket' })
  host.fromGuest(2, { t: 'welcome', id: 2, players: [] })
  assert.equal(delivered.length, before, 'Spoofed ids, broken numbers, unknown weapons and host-only messages are dropped')

  host.dropGuest(2)
  assert(links[0].sent.some(m => m.t === 'leave' && m.id === 2)); assert.equal(delivered.at(-1)?.t, 'leave')
  assert.equal(host.accept(fakeLink()), 2, 'A freed id is reused')
  host.send({ t: 'pose', id: 0, pose: pose() })
  assert(links[0].sent.at(-1)?.t === 'pose' && links[2].sent.at(-1)?.t === 'pose', 'The host broadcasts its own pose')
  host.reset(); assert(links[0].closed && host.role === 'solo' && host.players.size === 0)
}
console.log('PASS The host assigns ids, refuses a full room, relays guest traffic and drops spoofed or broken messages')

{
  const delivered: CoopMessage[] = []
  const toHost = fakeLink(), guest = new CoopHub(message => delivered.push(message))
  guest.startGuest(toHost)
  assert(guest.fromHost({ t: 'welcome', id: 2, players: [0, 1] }))
  assert.equal(guest.selfId, 2); assert.deepEqual([...guest.players].sort(), [0, 1])
  guest.fromHost({ t: 'join', id: 3 }); guest.fromHost({ t: 'leave', id: 1 })
  assert.deepEqual([...guest.players].sort(), [0, 3])
  guest.send({ t: 'shot', id: 2, origin: [0, 1, 0], end: [0, 1, -5], weapon: 'pistol' })
  assert.equal(toHost.sent.at(-1)?.t, 'shot')
  const refused = new CoopHub(() => {}); refused.startGuest(fakeLink())
  assert.equal(refused.fromHost({ t: 'full' }), false, 'A full room is reported to the guest')
}
console.log('PASS A guest learns its id and the roster from the host')

assert.equal(normalizeRoomCode(' ab-c2d '), 'ABC2D', 'Spaces and dashes in a pasted code are ignored')
assert.equal(normalizeRoomCode('abc'), null, 'Short codes are rejected')
assert.equal(normalizeRoomCode('abc2d'), 'ABC2D')
assert.equal(normalizeRoomCode('abc0d'), null, 'Ambiguous 0/O and 1/I are never issued')
for (let i = 0; i < 50; i++) { const code = newRoomCode(); assert.equal(normalizeRoomCode(code), code) }
console.log('PASS Room codes are five unambiguous characters and invite codes are normalized')

{
  const scene = new THREE.Scene(), sounds: SoundEvent[] = []
  let invalidated = 0
  const mates = new Teammates(scene, event => sounds.push(event), () => invalidated++)
  const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(resolve => setTimeout(resolve, 5)) }
  mates.pose(1, pose(2))
  await settle()
  const body = scene.getObjectByName('Teammate Orange')!
  assert(body, 'A teammate appears with the shared rig, named by colour')
  let colour = 0
  body.traverse(object => { if (object instanceof THREE.SkinnedMesh && object.visible) colour = (object.material as THREE.MeshBasicMaterial).color.getHex() })
  assert.equal(colour, TEAM_COLORS[1], 'Teammates are drawn in their team colour, not guard black')
  for (let i = 0; i < 30; i++) mates.update(1 / 60)
  assert(body.position.distanceTo(new THREE.Vector3(2, 0, 0)) < 1e-6)

  mates.pose(1, pose(3, { yaw: Math.PI / 2, speed: 3 }))
  mates.update(1 / 60)
  assert(body.position.x > 2 && body.position.x < 3, 'Small moves are smoothed between network updates')
  mates.pose(1, pose(40))
  mates.update(1 / 60)
  assert.equal(body.position.x, 40, 'Teleports snap instead of sliding across the map')

  mates.shot(1, [40, 1.6, 0], [40, 1.6, -20], 'ak')
  assert.equal(sounds.at(-1)?.kind, 'enemy-shot-ak'); assert(sounds.at(-1)?.position)

  mates.pose(1, pose(40, { weapon: 'sniper' }))
  assert(scene.getObjectByName('Teammate Orange'), 'The old body stays visible while the new weapon loads')
  await settle()
  const bodies: THREE.Object3D[] = []
  scene.traverse(object => { if (object.name === 'Teammate Orange') bodies.push(object) })
  assert.equal(bodies.length, 1, 'A weapon switch replaces the body instead of adding one')

  mates.pose(1, pose(40, { alive: false }))
  for (let i = 0; i < 60; i++) mates.update(1 / 60)
  mates.remove(1)
  assert(!scene.getObjectByName('Teammate Orange') && mates.count === 0 && invalidated > 0)
  mates.pose(2, pose()); mates.dispose(); await settle()
  assert(!scene.getObjectByName('Teammate Violet'), 'A body that finishes loading after dispose is discarded')
}
console.log('PASS Teammates render in colour, smooth and snap, fire, switch weapons, die and leave cleanly')
