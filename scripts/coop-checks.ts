import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { CoopHub, MAX_PLAYERS, TEAM_COLORS, guestMessage, type CoopMessage, type Link, type PlayerPose } from '../src/net/hub'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { CollisionWorld } from '../src/player/collision'
import { applySharedMission, initialMission, sharedMission } from '../src/game/mission'
import { normalizeRoomCode, newRoomCode } from '../src/net/session'
import { Teammates } from '../src/game/teammates'
import type { EnemyReaction, PlayerSense, SoundEvent } from '../src/game/types'

const bytes = readFileSync('public/models/stickman.glb')
GLTFLoader.prototype.loadAsync = async function () {
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}

type FakeLink = Link & { sent: CoopMessage[]; closed: boolean }
const fakeLink = (): FakeLink => {
  const link: FakeLink = { sent: [], closed: false, send: message => link.sent.push(structuredClone(message)), close: () => { link.closed = true } }
  return link
}
const pose = (x = 0, extra: Partial<PlayerPose> = {}): PlayerPose => ({ feet: [x, 0, 0], eye: [x, 1.65, 0], vel: [0, 0, 0], yaw: 0, pitch: 0, speed: 0, weapon: 'ak', aiming: false, alive: true, active: true, ...extra })

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

  for (const link of links) link.sent.length = 0
  const hit = { i: 3, zone: 'head', point: [0, 1.6, 5], distance: 5, direction: [0, 0, 1], origin: [0, 1.6, 0], weapon: 'sniper', damage: 65 }
  host.fromGuest(2, { t: 'hit', id: 2, hit })
  assert.equal(delivered.at(-1)?.t, 'hit', 'The host receives a guest hit')
  assert(links.every(link => link.sent.length === 0), 'Requests for the host are not relayed to other guests')
  assert.equal(guestMessage(2, { t: 'hit', id: 2, hit: { ...hit, damage: 1e9 } }), null, 'Absurd damage is refused')
  assert.equal(guestMessage(2, { t: 'use', id: 2, kind: 'supply', station: 'x' }), null, 'Supplies are never requested from the host')
  assert(guestMessage(2, { t: 'use', id: 2, kind: 'gate', station: 'gate' }))
  assert.equal(guestMessage(2, { t: 'door', id: 2, i: -1, open: true }), null)
  assert.equal(guestMessage(2, { t: 'world', id: 2 }), null, 'Guests cannot send host-only messages')
  host.sendTo(3, { t: 'notice', to: 3, text: 'hi' })
  assert(links[2].sent.length === 1 && links[0].sent.length === 0, 'sendTo reaches only the named guest')

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

// Host-side guards engage whichever player they can see, and tell the runtime whom they shot.
{
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  floor.rotation.x = -Math.PI / 2; scene.add(floor)
  const world = new CollisionWorld(scene), shotAt: (number | undefined)[] = []
  const fake = async () => {
    const root = new THREE.Group()
    return { root, reactionRemaining: 0, animationTime: 0, update() {}, shoot() {}, react() {}, restore() {}, dispose() {}, muzzle: () => root.position.clone().add(new THREE.Vector3(0, 1.4, 0.3)) } as unknown as EnemyActor
  }
  const ai = new EnemyDirector({ scene, world, doors: [], specs: [{ id: 'g', name: 'Guard', position: [0, 0, 0], patrol: [], weapon: 'ak' }],
    emit() {}, damagePlayer: (_amount, _source, _hit, id) => { shotAt.push(id) }, dropWeapon() {} }, fake)
  await ai.init()
  const v = (x: number, z: number) => new THREE.Vector3(x, 0, z)
  const player = (id: number, z: number, alive = true): PlayerSense => ({ id, feet: v(0, z), eye: v(0, z).setY(1.65), velocity: new THREE.Vector3(), alive, radioEnabled: true })
  const behind = player(0, -12), ahead = player(2, 12)
  for (let t = 0; t < 8 && !shotAt.length; t += 1 / 60) ai.update(1 / 60, [behind, ahead])
  assert.equal(ai.enemies[0].state, 'combat', 'The guard engages the guest in front of it')
  assert(shotAt.length && shotAt.every(id => id === 2), 'Rounds are credited to the guest the guard can see, not the host behind it')

  const quiet = new EnemyDirector({ scene, world, doors: [], specs: [{ id: 'q', name: 'Quiet', position: [40, 0, 0], patrol: [], weapon: 'ak' }],
    emit() {}, damagePlayer: () => { throw new Error('A paused player was shot') }, dropWeapon() {} }, fake)
  await quiet.init()
  for (let t = 0; t < 4; t += 1 / 60) quiet.update(1 / 60, [player(0, -60), { ...player(1, 12), feet: v(40, 12), eye: v(40, 12).setY(1.65), alive: false }])
  assert.notEqual(quiet.enemies[0].state, 'combat', 'Paused or fallen players are not engaged')
  ai.dispose(); quiet.dispose(); world.dispose()
}
console.log('PASS Guards engage the nearest visible player and credit each round to that player; paused players are left alone')

// Guests draw the host's guards from compact snapshots and replay shots and reactions.
{
  const scene = new THREE.Scene(), world = new CollisionWorld(scene)
  const actors: { shots: number; reacted: string[] }[] = []
  const fake = async () => {
    const root = new THREE.Group(), log = { shots: 0, reacted: [] as string[] }
    actors.push(log)
    return { root, reactionRemaining: 0, animationTime: 0, deathClip: 'dieBody', update() {}, restore() {}, dispose() {},
      shoot() { log.shots++ }, react(clip: string) { log.reacted.push(clip) }, muzzle: () => root.position.clone().add(new THREE.Vector3(0, 1.4, 0.3)) } as unknown as EnemyActor
  }
  const specs = [{ id: 'a', name: 'A', position: [0, 0, 0] as [number, number, number], patrol: [], weapon: 'ak' as const },
    { id: 'b', name: 'B', position: [5, 0, 0] as [number, number, number], patrol: [], weapon: 'pistol' as const, reserve: true }]
  const context = { scene, world, doors: [], specs, emit() {}, damagePlayer() {}, dropWeapon() {} }
  const host = new EnemyDirector(context, fake), guest = new EnemyDirector(context, fake)
  await host.init(); await guest.init()
  host.enemies[0].position.set(3, 0, 7); host.enemies[0].yaw = 1.2
  const puppets = JSON.parse(JSON.stringify(host.puppets()))
  for (let i = 0; i < 90; i++) guest.follow(1 / 60, puppets)
  assert(guest.enemies[0].position.distanceTo(new THREE.Vector3(3, 0, 7)) < 0.01, 'Guest guards ease to the host position')
  assert(Math.abs(guest.enemies[0].yaw - 1.2) < 0.01)
  assert(!guest.enemies[1].actor.root.visible, 'Reserve guards stay hidden on guests too')

  const reaction: EnemyReaction = { index: 0, clip: 'dieBody', lethal: true, direction: [0, 0, 1], travel: 1, deathClip: 'dieBody', hit: { zone: 'torso', point: [3, 1.2, 7], weapon: 'ak', by: 1 } }
  const replayed = guest.replayReaction(reaction)
  assert(replayed && replayed.lethal && replayed.by === 1 && replayed.targetId === 'a')
  assert.deepEqual(actors[2].reacted, ['dieBody']); assert.equal(guest.enemies[0].state, 'dead')
  assert.equal(guest.findHit({ origin: new THREE.Vector3(3, 1.2, 0), direction: new THREE.Vector3(0, 0, 1), range: 50, damage: 30 }, 50), null, 'A dead guard cannot be hit again')
  assert.equal(guest.replayFire(0, new THREE.Vector3(0, 1, 20)), null, 'Dead guards do not fire')
  host.dispose(); guest.dispose(); world.dispose()
}
console.log('PASS Guests mirror guard position, facing, reserve visibility, deaths and reactions from host snapshots')

{
  const host = initialMission(), guest = initialMission()
  host.gateOpen = true; host.alarm = 'active'; host.hostages[0].status = 'following'; host.kills = 3; host.health = 10
  guest.health = 40; guest.phase = 'dead'; guest.detentionFound = true; guest.shots = 9
  applySharedMission(guest, JSON.parse(JSON.stringify(sharedMission(host))))
  assert(guest.gateOpen && guest.alarm === 'active' && guest.hostages[0].status === 'following' && guest.kills === 3, 'The compound comes from the host')
  assert(guest.health === 40 && guest.phase === 'dead' && guest.shots === 9, 'Health, death and shots stay with each player')
  assert(guest.detentionFound, 'A place the guest found stays found')
  sharedMission(host).hostages[0].position[0] = 999
  assert.notEqual(host.hostages[0].position[0], 999, 'Snapshots never alias live mission state')
}
console.log('PASS Shared mission state comes from the host while each player keeps their own health and death')
