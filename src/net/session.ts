import type { DataConnection, Peer } from 'peerjs'
import { CoopHub, MAX_PLAYERS, type CoopMessage, type Link } from './hub'

export type SessionStatus = 'solo' | 'connecting' | 'hosting' | 'joined'
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ROOM_LENGTH = 5
const peerId = (room: string) => `operation-ink-${room}`

export function newRoomCode() {
  return Array.from({ length: ROOM_LENGTH }, () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]).join('')
}
export function normalizeRoomCode(value: string) {
  const code = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return code.length === ROOM_LENGTH && [...code].every(c => ROOM_ALPHABET.includes(c)) ? code : null
}

const linkFor = (connection: DataConnection): Link => ({
  send: message => { if (connection.open) void connection.send(message) },
  close: () => connection.close(),
})

/**
 * Browser-to-browser co-op over WebRTC. PeerJS's free public broker only introduces the browsers;
 * game traffic then flows directly between them. The host's browser is the hub of the room.
 */
export class CoopSession {
  status: SessionStatus = 'solo'
  room = ''
  /** The last problem to show the player, cleared when a new attempt starts. */
  message = ''
  readonly hub: CoopHub
  private peer: Peer | null = null
  private listeners = new Set<() => void>()

  constructor(onMessage: (message: CoopMessage) => void) {
    this.hub = new CoopHub(onMessage, () => this.notify())
  }

  get active() { return this.status === 'hosting' || this.status === 'joined' }
  get playerCount() { return this.active ? this.hub.players.size + 1 : 1 }

  onChange(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener) }

  inviteLink() {
    const url = new URL(location.href)
    url.search = ''; url.hash = ''
    url.searchParams.set('join', this.room)
    return url.toString()
  }

  async host() {
    this.leave()
    this.status = 'connecting'; this.message = ''; this.notify()
    const { Peer } = await import('peerjs')
    for (let attempt = 0; attempt < 4 && this.status === 'connecting'; attempt++) {
      const room = newRoomCode()
      const peer = new Peer(peerId(room))
      this.peer = peer
      const result = await new Promise<'open' | 'taken' | Error>(resolve => {
        peer.once('open', () => resolve('open'))
        peer.once('error', error => resolve(error.type === 'unavailable-id' ? 'taken' : error))
      })
      if (this.peer !== peer) return
      if (result === 'taken') { peer.destroy(); continue }
      if (result instanceof Error) return this.fail(peer, `Could not reach the matchmaking service (${result.message}).`)
      this.room = room
      this.status = 'hosting'
      this.hub.startHost()
      peer.on('connection', connection => {
        connection.on('open', () => {
          const id = this.hub.accept(linkFor(connection))
          if (id === null) return
          connection.on('data', data => this.hub.fromGuest(id, data))
          connection.on('close', () => this.hub.dropGuest(id))
          connection.on('error', () => this.hub.dropGuest(id))
        })
      })
      peer.on('error', error => { if (error.type !== 'peer-unavailable') this.message = `Connection problem: ${error.message}`; this.notify() })
      this.notify()
      return
    }
    if (this.status === 'connecting') this.fail(this.peer, 'Could not create a room. Try again.')
  }

  async join(code: string) {
    const room = normalizeRoomCode(code)
    if (!room) { this.message = 'Room codes are 5 letters or digits.'; this.notify(); return }
    this.leave()
    this.status = 'connecting'; this.room = room; this.message = ''; this.notify()
    const { Peer } = await import('peerjs')
    const peer = new Peer()
    this.peer = peer
    peer.on('error', error => {
      if (this.peer !== peer) return
      if (error.type === 'peer-unavailable') this.fail(peer, `Room ${room} was not found. Check the code, or ask the host to host again.`)
      else if (this.status === 'connecting') this.fail(peer, `Could not connect (${error.message}).`)
    })
    peer.once('open', () => {
      const connection = peer.connect(peerId(room), { reliable: true, serialization: 'json' })
      // Some networks block direct browser connections. Give up rather than spin forever.
      const timeout = setTimeout(() => { if (this.peer === peer && this.status === 'connecting') this.fail(peer, 'The host did not answer. One of your networks may block direct connections.') }, 15000)
      connection.on('open', () => {
        this.hub.startGuest(linkFor(connection))
      })
      connection.on('data', data => {
        if (this.peer !== peer) return
        if (!this.hub.fromHost(data)) { clearTimeout(timeout); this.fail(peer, `Room ${room} is full (${MAX_PLAYERS} players).`); return }
        if (this.status === 'connecting' && this.hub.role === 'guest' && (data as CoopMessage).t === 'welcome') {
          clearTimeout(timeout); this.status = 'joined'; this.notify()
        }
      })
      connection.on('close', () => {
        clearTimeout(timeout)
        if (this.peer === peer && this.status === 'joined') this.fail(peer, 'The host left the game.')
      })
    })
  }

  send(message: CoopMessage) { if (this.active) this.hub.send(message) }

  leave() {
    const peer = this.peer
    this.peer = null
    this.hub.reset()
    peer?.destroy()
    if (this.status !== 'solo') { this.status = 'solo'; this.room = ''; this.notify() }
  }

  dispose() { this.leave(); this.listeners.clear() }

  private fail(peer: Peer | null, message: string) {
    if (peer && this.peer !== peer) return
    this.leave()
    this.message = message
    this.notify()
  }

  private notify() { for (const listener of this.listeners) listener() }
}
