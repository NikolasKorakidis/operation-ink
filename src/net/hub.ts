import type { Vec3, WeaponName } from '../game/types'

/** Player 0 hosts; guests take the lowest free id. The id also picks the teammate colour. */
export const MAX_PLAYERS = 4
export const TEAM_COLORS = [0x2f9e44, 0xf08c00, 0x7048e8, 0x8d5524] as const
export const TEAM_COLOR_NAMES = ['Green', 'Orange', 'Violet', 'Brown'] as const

export type PlayerPose = { feet: Vec3; yaw: number; pitch: number; speed: number; weapon: WeaponName | null; aiming: boolean; alive: boolean }
export type CoopMessage =
  | { t: 'welcome'; id: number; players: number[] }
  | { t: 'join'; id: number }
  | { t: 'leave'; id: number }
  | { t: 'full' }
  | { t: 'pose'; id: number; pose: PlayerPose }
  | { t: 'shot'; id: number; origin: Vec3; end: Vec3; weapon: WeaponName }

/** One open data channel. The host holds one per guest; a guest holds one to the host. */
export interface Link { send(message: CoopMessage): void; close(): void }

const WEAPONS = new Set<WeaponName>(['pistol', 'ak', 'smg', 'shotgun', 'sniper'])
const vec = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
const finite = (...values: unknown[]) => values.every(value => typeof value === 'number' && Number.isFinite(value))

/** Guests may only report their own pose and shots; anything else is dropped before it reaches the game. */
export function guestMessage(id: number, data: unknown): CoopMessage | null {
  const message = data as { t?: unknown; id?: unknown; pose?: Partial<PlayerPose>; origin?: unknown; end?: unknown; weapon?: WeaponName } | null
  if (!message || typeof message !== 'object' || message.id !== id) return null
  if (message.t === 'pose') {
    const pose = message.pose
    if (!pose || !vec(pose.feet) || !finite(pose.yaw, pose.pitch, pose.speed) ||
      !(pose.weapon === null || WEAPONS.has(pose.weapon!)) || typeof pose.aiming !== 'boolean' || typeof pose.alive !== 'boolean') return null
    return { t: 'pose', id, pose: pose as PlayerPose }
  }
  if (message.t === 'shot') {
    const { origin, end, weapon } = message
    if (!vec(origin) || !vec(end) || !WEAPONS.has(weapon!)) return null
    return { t: 'shot', id, origin, end, weapon: weapon! }
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
    this.broadcast(message, id)
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
