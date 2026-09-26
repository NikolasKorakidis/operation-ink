import { MAX_PLAYERS, TEAM_COLORS, TEAM_COLOR_NAMES } from '../net/hub'
import type { CoopSession } from '../net/session'

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`
const colorOf = (id: number) => hex(TEAM_COLORS[id % TEAM_COLORS.length])
const nameOf = (id: number) => TEAM_COLOR_NAMES[id % TEAM_COLOR_NAMES.length]

/** The menu's Co-op page and the one-line room summary on the home page. */
export class CoopPanel {
  private abort = new AbortController()
  private root: HTMLElement
  private status: HTMLElement
  private stopListening: () => void

  constructor(slot: HTMLElement, status: HTMLElement, private session: CoopSession) {
    this.status = status
    this.root = slot
    this.root.innerHTML = `
      <p class="coop-lead">Up to ${MAX_PLAYERS} players. Host a room and send your friends the link.</p>
      <div class="coop-solo">
        <div class="mission-actions">
          <button class="menu-primary" data-coop-host>Host a game</button>
        </div>
        <form class="coop-join" data-coop-join>
          <label for="coop-code">Or join with a room code</label>
          <div><input id="coop-code" autocomplete="off" spellcheck="false" maxlength="5" placeholder="ABCDE" /><button class="menu-secondary">Join</button></div>
        </form>
      </div>
      <div class="coop-session" hidden>
        <p class="coop-room">Room <strong data-coop-room></strong></p>
        <div class="coop-invite">
          <input readonly data-coop-link aria-label="Invite link" />
          <button class="menu-secondary" data-coop-copy>Copy link</button>
        </div>
        <ul class="coop-players" aria-label="Players"></ul>
        <button class="menu-quiet" data-coop-leave>Leave room</button>
      </div>
      <p class="coop-message" role="status"></p>
      <p class="coop-note">Early co-op: you see each other move and shoot, but each player still fights their own guards.</p>`
    const $ = <T extends HTMLElement>(selector: string) => this.root.querySelector<T>(selector)!
    const options = { signal: this.abort.signal }
    $('[data-coop-host]').addEventListener('click', () => void session.host(), options)
    $('[data-coop-join]').addEventListener('submit', event => {
      event.preventDefault()
      void session.join($<HTMLInputElement>('#coop-code').value)
    }, options)
    $('[data-coop-leave]').addEventListener('click', () => session.leave(), options)
    $('[data-coop-copy]').addEventListener('click', () => {
      const input = $<HTMLInputElement>('[data-coop-link]')
      input.select()
      void navigator.clipboard?.writeText(input.value).then(() => this.flash('Invite link copied.'), () => this.flash('Select the link and copy it.'))
    }, options)
    this.stopListening = session.onChange(() => this.render())
    this.render()
  }

  render() {
    const s = this.session, $ = <T extends HTMLElement>(selector: string) => this.root.querySelector<T>(selector)!
    const connecting = s.status === 'connecting'
    $('.coop-solo').hidden = s.active
    $('.coop-session').hidden = !s.active
    $<HTMLButtonElement>('[data-coop-host]').disabled = connecting
    $<HTMLButtonElement>('[data-coop-host]').textContent = connecting && !s.room ? 'Creating room…' : 'Host a game'
    $<HTMLButtonElement>('[data-coop-join] button').disabled = connecting
    $<HTMLButtonElement>('[data-coop-join] button').textContent = connecting && s.room ? 'Joining…' : 'Join'
    $('.coop-message').textContent = s.message
    if (s.active) {
      $('[data-coop-room]').textContent = s.room
      const link = $<HTMLInputElement>('[data-coop-link]')
      if (link.value !== s.inviteLink()) link.value = s.inviteLink()
      const ids = [s.hub.selfId, ...[...s.hub.players].filter(id => id !== s.hub.selfId)].sort((a, b) => a - b)
      $('.coop-players').innerHTML = ids.map(id => `<li><i style="background:${colorOf(id)}"></i>${nameOf(id)}${id === s.hub.selfId ? ' (you)' : ''}${id === 0 ? ' · host' : ''}</li>`).join('')
    }
    this.status.hidden = !s.active && !connecting
    this.status.textContent = connecting ? `Connecting to room ${s.room || '…'}` :
      s.active ? `Co-op room ${s.room} · ${s.playerCount} ${s.playerCount === 1 ? 'player' : 'players'} · you are ${nameOf(s.hub.selfId).toLowerCase()}` : ''
  }

  dispose() { this.abort.abort(); this.stopListening() }

  private flash(text: string) {
    this.session.message = text
    this.render()
  }
}
