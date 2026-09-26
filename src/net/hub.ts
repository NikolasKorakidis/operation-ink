import type { EnemyPuppet, EnemyReaction, StationKind, Vec3, WeaponItem, WeaponName } from '../game/types'
import type { HitZone } from '../game/hit-reactions'
import type { PlayerHitRegion } from '../game/player-hit-reactions'
import type { SharedMission } from '../game/mission'

/** Player 0 hosts; guests take the lowest free id. The id also picks the teammate colour. */
export const MAX_PLAYERS = 4
export const TEAM_COLORS = [0x2f9e44, 0xf08c00, 0x7048e8, 0x8d5524] as const
export const TEAM_COLOR_NAMES = ['Green', 'Orange', 'Violet', 'Brown'] as const

/** `alive` is false once dead; `active` is false while paused, so guards only engage players who are playing. */
export type PlayerPose = { feet: Vec3; eye: Vec3; vel: Vec3; yaw: number; pitch: number; speed: number; weapon: WeaponName | null; aiming: boolean; alive: boolean; active: boolean }
export type NetSound = { kind: string; position?: Vec3; radius?: number; text?: string; voice?: string; speaker?: number; zone?: HitZone; weapon?: WeaponName; intensity?: number }
export type NetBulletHit = { region: PlayerHitRegion; side: -1 | 0 | 1; point: Vec3; direction: Vec3; weapon?: WeaponName }
export type NetEnemyHit = { i: number; zone: HitZone; point: Vec3; bone?: string; distance: number; direction: Vec3; origin: Vec3; weapon: WeaponName; damage: number }

export type CoopMessage =
  | { t: 'welcome'; id: number; players: number[] }
  | { t: 'join'; id: number }
  | { t: 'leave'; id: number }
  | { t: 'full' }
  // Every player, relayed by the host to the others.
  | { t: 'pose'; id: number; pose: PlayerPose }
  | { t: 'shot'; id: number; origin: Vec3; end: Vec3; weapon: WeaponName }
  // Guest to host: requests the host's compound applies.
  | { t: 'hit'; id: number; hit: NetEnemyHit }
  | { t: 'noise'; id: number; kind: string; position: Vec3; radius: number }
  | { t: 'door'; id: number; i: number; open: boolean }
  | { t: 'use'; id: number; kind: StationKind; station: string }
  // Host to guests: the shared compound and what happens in it.
  | { t: 'world'; mission: SharedMission; enemies: EnemyPuppet[]; doors: string; cower: boolean }
  | { t: 'efire'; i: number; end: Vec3 }
  | { t: 'ereact'; r: EnemyReaction }
  | { t: 'sound'; e: NetSound }
  | { t: 'drop'; item: WeaponItem }
  | { t: 'restart' }
  | { t: 'damage'; to: number; amount: number; source: Vec3; hit: NetBulletHit }
  | { t: 'notice'; to: number; text: string }

/** One open data channel. The host holds one per guest; a guest holds one to the host. */
export interface Link { send(message: CoopMessage): void; close(): void }

const WEAPONS = new Set<WeaponName>(['pistol', 'ak', 'smg', 'shotgun', 'sniper', 'silenced', 'knife'])
const ZONES = new Set<HitZone>(['head', 'torso', 'arm', 'leg'])
const STATIONS = new Set<StationKind>(['hostage', 'cameras', 'alarm', 'gate', 'jeep', 'rally', 'distraction'])
const vec = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
const finite = (...values: unknown[]) => values.every(value => typeof value === 'number' && Number.isFinite(value))
const text = (value: unknown, max = 64): value is string => typeof value === 'string' && value.length <= max
const index = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < 4096

/** Only pose and shots are relayed to other guests; requests are for the host alone. */
export const RELAYED = new Set<CoopMessage['t']>(['pose', 'shot'])

/** Guests may only report their own actions; anything malformed is dropped before it reaches the game. */
export function guestMessage(id: number, data: unknown): CoopMessage | null {
  const message = data as Record<string, any> | null
  if (!message || typeof message !== 'object' || message.id !== id) return null
  switch (message.t) {
    case 'pose': {
      const pose = message.pose as Partial<PlayerPose> | undefined
      if (!pose || !vec(pose.feet) || !vec(pose.eye) || !vec(pose.vel) || !finite(pose.yaw, pose.pitch, pose.speed) ||
        !(pose.weapon === null || WEAPONS.has(pose.weapon!)) || typeof pose.aiming !== 'boolean' ||
        typeof pose.alive !== 'boolean' || typeof pose.active !== 'boolean') return null
      return { t: 'pose', id, pose: pose as PlayerPose }
    }
    case 'shot':
      if (!vec(message.origin) || !vec(message.end) || !WEAPONS.has(message.weapon)) return null
      return { t: 'shot', id, origin: message.origin, end: message.end, weapon: message.weapon }
    case 'hit': {
      const hit = message.hit as Partial<NetEnemyHit> | undefined
      if (!hit || !index(hit.i) || !ZONES.has(hit.zone!) || !vec(hit.point) || !vec(hit.direction) || !vec(hit.origin) ||
        !finite(hit.distance, hit.damage) || hit.damage! < 0 || hit.damage! > 1000 || !WEAPONS.has(hit.weapon!) ||
        !(hit.bone === undefined || text(hit.bone, 32))) return null
      return { t: 'hit', id, hit: hit as NetEnemyHit }
    }
    case 'noise':
      if (!text(message.kind, 32) || !vec(message.position) || !finite(message.radius) || message.radius < 0 || message.radius > 200) return null
      return { t: 'noise', id, kind: message.kind, position: message.position, radius: message.radius }
    case 'door':
      if (!index(message.i) || typeof message.open !== 'boolean') return null
      return { t: 'door', id, i: message.i, open: message.open }
    case 'use':
      if (!STATIONS.has(message.kind) || !text(message.station)) return null
      return { t: 'use', id, kind: message.kind, station: message.station }
  }
  return null
}

/**
 * Transport-free session logic: id assignment, relaying and membership.
 * The host relays every guest message to the other guests (a star), so guests never connect to each other.
 */
export class CoopHub {
  role: 'solo' | 'host' | 'guest' = 'solo'
  selfId = 0
  readonly players = new Set<number>()
  private links = new Map<number, Link>()

  constructor(private deliver: (message: CoopMessage) => void, private changed: () => void = () => {}) {}

  startHost() { this.reset(); this.role = 'host'; this.selfId = 0; this.changed() }

  /** Host: admit a new guest link, or refuse it when the room is full. */
  accept(link: Link): number | null {
    if (this.role !== 'host') { link.close(); return null }
    let id = 1
    while (id < MAX_PLAYERS && this.links.has(id)) id++
    if (id >= MAX_PLAYERS) { link.send({ t: 'full' }); link.close(); return null }
    this.links.set(id, link)
    link.send({ t: 'welcome', id, players: [this.selfId, ...this.players] })
    this.broadcast({ t: 'join', id }, id)
    this.players.add(id)
    this.changed()
    return id
  }

  /** Host: a message arrived on a guest's link. */
  fromGuest(id: number, data: unknown) {
    if (this.role !== 'host' || !this.links.has(id)) return
    const message = guestMessage(id, data)
    if (!message) return
    if (RELAYED.has(message.t)) this.broadcast(message, id)
    this.deliver(message)
  }

  /** Host: a guest's link closed. */
  dropGuest(id: number) {
    if (!this.links.delete(id)) return
    this.players.delete(id)
    this.broadcast({ t: 'leave', id })
    this.deliver({ t: 'leave', id })
    this.changed()
  }

  /** Guest: the link to the host is open; wait for the welcome to learn our id. */
  startGuest(link: Link) { this.reset(); this.role = 'guest'; this.links.set(0, link) }

  /** Guest: a message arrived from the host. Returns false when the host refused us. */
  fromHost(data: unknown) {
    if (this.role !== 'guest') return true
    const message = data as CoopMessage
    switch (message?.t) {
      case 'full': return false
      case 'welcome':
        this.selfId = message.id
        this.players.clear()
        for (const id of message.players) if (id !== message.id) this.players.add(id)
        this.changed(); return true
      case 'join': this.players.add(message.id); this.changed(); break
      case 'leave': this.players.delete(message.id); this.changed(); break
    }
    if (message) this.deliver(message)
    return true
  }

  /** Send our own pose or shot: the host broadcasts, a guest sends to the host. */
  send(message: CoopMessage) {
    if (this.role === 'host') this.broadcast(message)
    else if (this.role === 'guest') this.links.get(0)?.send(message)
  }

  /** Host: one guest only, such as the player a guard just shot. */
  sendTo(id: number, message: CoopMessage) {
    if (this.role === 'host') this.links.get(id)?.send(message)
  }

  reset() {
    for (const link of this.links.values()) link.close()
    this.links.clear(); this.players.clear()
    const wasActive = this.role !== 'solo'
    this.role = 'solo'; this.selfId = 0
    if (wasActive) this.changed()
  }

  private broadcast(message: CoopMessage, except?: number) {
    for (const [id, link] of this.links) if (id !== except) link.send(message)
  }
}
