import type { MissionState } from './mission'
import { LEVELS, listSaves, type SaveInfo } from './saves'
import { goTo } from '../modes'
import type { ViewName } from '../camera'
import type { Briefing } from './types'
import { campaignLevels } from '../levels/catalog'

/** Every other way into the game. Links are relative, so they work on GitHub Pages' /<repository>/ path too. */
export const MAP_VIEWS: { id: ViewName; label: string; note: string }[] = [
  { id: 'overview', label: 'Whole compound', note: 'High orbit over the camp' },
  { id: 'plan', label: 'Top-down plan', note: 'The map from directly above' },
  { id: 'yard', label: 'Compound yard', note: 'Ground level, looking north' },
  { id: 'roof', label: 'Mess hall roof', note: 'Where the mission starts' },
  { id: 'mess', label: 'Mess hall', note: 'Inside the dining hall' },
  { id: 'office', label: 'Signals office', note: 'The camera terminal' },
  { id: 'water', label: 'Water tower', note: 'The marksman\'s catwalk' },
  { id: 'watch', label: 'Watchtower', note: 'The observation post' },
  { id: 'rail', label: 'Rail siding', note: 'Down the tracks to the water tower' },
  { id: 'tanks', label: 'Fuel tanks', note: 'The west tank farm' },
]
export type Destination = 'explore' | 'lab' | 'tutorial' | 'mission' | 'load' | `view:${ViewName}` | `level:${string}`
/** Leave for another mode on this same address (see modes.ts); only the animation lab is a page of its own. */
export function goToDestination(destination: Destination) {
  if (destination === 'lab') location.assign(new URL('lab.html', location.href).toString())
  else goTo(destination)
}

const BRAND = 'Stickman: Ghost Ink'

type MenuPage = 'home' | 'campaign' | 'pause' | 'load' | 'levels' | 'gallery' | 'options' | 'mission' | 'controls' | 'settings' | 'restart' | 'coop' | 'views' | 'leave'
/**
 * Where each page lives. The main menu holds Campaign, Multiplayer, Gallery and Options; the pause page holds what a
 * run in progress needs. Back normally returns along the way you came (`trail`); this is the fallback when you
 * arrived some other way.
 */
const PARENT: Record<MenuPage, MenuPage> = {
  home: 'home', campaign: 'home', coop: 'home', gallery: 'home', options: 'home', pause: 'home', leave: 'home',
  load: 'campaign', levels: 'campaign', views: 'gallery', settings: 'options', controls: 'options', mission: 'pause', restart: 'pause',
}
const back = '<button class="menu-back" data-menu-back><span aria-hidden="true">←</span> Back <kbd>Esc</kbd></button>'
/** `leaveWarning` names what leaving to another mode would lose, or null when nothing is at stake. */
type MenuCallbacks = { retry: () => void; restart: () => void; load?: (level: string) => void; leaveWarning?: () => string | null }

/**
 * Two kinds of page. The main menu picks what to do: Campaign (new game, load game, training), Multiplayer, Gallery
 * (map views, free roam, the lab) and Options (settings, controls). Once a run has started, pausing, dying or
 * finishing lands on the pause page instead: resume, try again or play again, the briefing, options, a restart,
 * and the way out to the main menu. Each option appears in one place only.
 */
export class MissionMenu {
  private card = document.querySelector<HTMLElement>('.walk-card')!
  private pause = document.querySelector<HTMLElement>('#walk-pause')!
  private abort = new AbortController()
  private page: MenuPage = 'home'
  private phase: MissionState['phase'] = 'active'
  private hasPlayed = false
  /** The tutorial level: the pause page runs training, and the Campaign page leads back to the mission. */
  private tutorial = false
  /** A level played on its own (any but the campaign's first, and not training): its pause page starts it. */
  private standalone = false
  private wasPlaying = false
  private loaded = false
  private loadError = ''
  /** The pages behind the current one, each with the button that led on from it, so Back retraces your steps. */
  private trail: { page: MenuPage; focus: HTMLElement | null }[] = []
  private leaving: Destination | null = null
  private campaignEntry: HTMLButtonElement
  private coopEntry: HTMLButtonElement
  private title: HTMLElement
  private premise: HTMLElement
  private retry: HTMLButtonElement
  private restart: HTMLButtonElement
  private briefing: HTMLButtonElement
  private play: HTMLButtonElement
  private loadEntry: HTMLButtonElement
  private training: HTMLButtonElement
  /** The level this page is running (levels/catalog.ts), so the level select can mark it. */
  private level = ''
  private coopPlay: HTMLButtonElement
  private saves: SaveInfo[] = []
  /** The run's current objective, kept from the last update for the Campaign page's Resume entry. */
  private objective = ''

  /** The mission's own page: title, premise, map and tips (MissionWorld.briefing). */
  private briefingText: Briefing

  constructor(private start: HTMLButtonElement, briefing: Briefing & { map: string }, reducedMotion: boolean, private callbacks: MenuCallbacks) {
    this.briefingText = briefing
    const escapeText = (text: string) => text.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]!)
    // Taken before the card is rewritten: on a mode switch in place it already lives inside the card.
    const vrPanel = document.querySelector<HTMLElement>('#vr-panel')!
    this.card.dataset.page = 'home'
    this.card.setAttribute('role', 'dialog')
    this.card.setAttribute('aria-modal', 'true')
    this.card.setAttribute('aria-labelledby', 'mission-menu-title')
    this.card.innerHTML = `
      <section data-menu-page="home">
        ${back.replace('data-menu-back', 'data-menu-back hidden')}
        <h1 id="mission-menu-title">${BRAND}</h1>
        <p class="menu-premise">Find the hostage. Get out together.</p>
        <nav class="main-menu" aria-label="Main menu">
          <button class="main-entry" data-menu-open="campaign"><strong>Campaign</strong><span>New game, saved games and training</span></button>
          <button class="main-entry" data-menu-open="coop"><strong>Multiplayer</strong><span>Co-op for up to 4 players</span></button>
          <button class="main-entry" data-menu-open="gallery"><strong>Gallery</strong><span>Map views, free roam and the animation lab</span></button>
          <button class="main-entry" data-menu-open="options"><strong>Options</strong><span>Settings and controls</span></button>
        </nav>
      </section>
      <section data-menu-page="campaign" hidden>
        ${back}
        <h2 id="campaign-page-title">Campaign</h2>
        <p>Find the hostage. Get out together.</p>
        <nav class="main-menu" aria-label="Campaign">
          <button id="campaign-play" class="main-entry"><strong>New game</strong><span>Start the mission</span></button>
          <button id="campaign-levels" class="main-entry" data-menu-open="levels"><strong>Select level</strong><span>Play any mission</span></button>
          <button id="campaign-load" class="main-entry"><strong>Load game</strong><span>Continue a saved mission</span></button>
          <button id="campaign-training" class="main-entry"><strong>Training</strong><span>Learn every move, then fight Bulky Boy</span></button>
        </nav>
      </section>
      <section data-menu-page="pause" hidden>
        <h2 id="pause-page-title">Paused.</h2>
        <p id="mission-premise">Find the hostage. Get out together.</p>
        <p id="coop-status" hidden></p>
        <div id="mission-debrief" role="status" hidden></div>
        <div class="mission-actions">
          <div class="mission-start-slot"></div>
          <button id="mission-retry" class="menu-primary" hidden>Try again</button>
          <button id="mission-restart" class="menu-quiet" hidden>Restart mission</button>
        </div>
        <nav class="main-menu" aria-label="Paused">
          <button id="mission-briefing" class="main-entry" data-menu-open="mission" hidden><strong>Briefing</strong><span>Map, objective and route tips</span></button>
          <button class="main-entry" data-menu-open="options"><strong>Options</strong><span>Settings and controls</span></button>
          <button id="pause-home" class="main-entry" data-menu-open="home"><strong>Main menu</strong><span>Campaign, multiplayer and the gallery</span></button>
        </nav>
      </section>
      <section data-menu-page="load" hidden>
        ${back}
        <h2 id="load-page-title">Load game</h2>
        <p>Pick up where you left off. A mission saves itself whenever you pause or leave it.</p>
        <nav class="main-menu save-list" aria-label="Saved missions"></nav>
      </section>
      <section data-menu-page="levels" hidden>
        ${back}
        <h2 id="levels-page-title">Select level</h2>
        <p>Play any mission, in any order.</p>
        <nav class="main-menu level-list" aria-label="Levels"></nav>
      </section>
      <section data-menu-page="gallery" hidden>
        ${back}
        <h2 id="gallery-page-title">Gallery</h2>
        <nav class="main-menu" aria-label="Gallery">
          <button class="main-entry" data-menu-open="views"><strong>Map views</strong><span>Fly-over cameras around the camp</span></button>
          <button class="main-entry" data-menu-go="explore"><strong>Free roam</strong><span>Walk the compound with no guards</span></button>
          <button class="main-entry" data-menu-go="lab"><strong>Animation lab</strong><span>Characters, moves and weapons</span></button>
        </nav>
      </section>
      <section data-menu-page="options" hidden>
        ${back}
        <h2 id="options-page-title">Options</h2>
        <nav class="main-menu" aria-label="Options">
          <button class="main-entry" data-menu-open="settings"><strong>Settings</strong><span>Volume, mute and reduced motion</span></button>
          <button class="main-entry" data-menu-open="controls"><strong>Controls</strong><span>Every key and mouse button</span></button>
        </nav>
      </section>
      <section data-menu-page="views" hidden>
        ${back}
        <h2 id="views-page-title">Map views</h2>
        <p>Inspection cameras. Drag to orbit, scroll to zoom, and press <kbd>V</kbd> to fly freely.</p>
        <div class="view-grid">${MAP_VIEWS.map(view => `<button class="main-entry" data-menu-go="view:${view.id}"><strong>${view.label}</strong><span>${view.note}</span></button>`).join('')}</div>
      </section>
      <section data-menu-page="leave" hidden>
        ${back}
        <h2 id="leave-page-title">Leave the mission?</h2>
        <p id="leave-warning"></p>
        <div class="mission-actions">
          <button id="mission-cancel-leave" class="menu-primary">Stay</button>
          <button id="mission-confirm-leave" class="menu-secondary">Leave</button>
        </div>
      </section>
      <section data-menu-page="mission" hidden>
        ${back}
        <h2 id="mission-page-title">${escapeText(briefing.title)}</h2>
        <p id="mission-current-objective"></p>
        <div class="field-map">${briefing.map}</div>
        <p class="map-legend">${(briefing.legend ?? ['▲ You']).map(entry => `<span>${escapeText(entry)}</span>`).join('')}</p>
        ${briefing.tips.length ? `<details class="mission-tips"><summary>Route tips</summary>${briefing.tips.map(tip => `<p>${escapeText(tip)}</p>`).join('')}</details>` : ''}
      </section>
      <section data-menu-page="controls" hidden>
        ${back}
        <h2 id="controls-page-title">Controls</h2>
        <dl class="mission-keys">
          <div><dt>Move</dt><dd><kbd>W A S D</kbd></dd></div>
          <div><dt>Look</dt><dd><kbd>Mouse</kbd></dd></div>
          <div><dt>Fire · knife slash</dt><dd><kbd>Left click</kbd></dd></div>
          <div><dt>Aim (hold) · knife stab</dt><dd><kbd>Right click</kbd></dd></div>
          <div><dt>Interact / pick up</dt><dd><kbd>F</kbd></dd></div>
          <div><dt>Reload</dt><dd><kbd>R</kbd></dd></div>
          <div><dt>Sprint</dt><dd><kbd>Shift</kbd></dd></div>
          <div><dt>Crouch (toggle)</dt><dd><kbd>C</kbd></dd></div>
          <div><dt>Prone (toggle)</dt><dd><kbd>Z</kbd></dd></div>
          <div><dt>Jump</dt><dd><kbd>Space</kbd></dd></div>
          <div><dt>Knife · sidearm · rifle</dt><dd><kbd>1 · 2 · 3 / Wheel</kbd></dd></div>
          <div><dt>Grenade · again for the next kind</dt><dd><kbd>4</kbd></dd></div>
          <div><dt>Throw · lob (grenade out)</dt><dd><kbd>Left · right click</kbd></dd></div>
          <div><dt>Drop weapon</dt><dd><kbd>G</kbd></dd></div>
          <div><dt>Scope zoom</dt><dd><kbd>Wheel</kbd></dd></div>
          <div><dt>Lean left · right (hold)</dt><dd><kbd>Q · E</kbd></dd></div>
          <div><dt>Missions list</dt><dd><kbd>I</kbd></dd></div>
          <div><dt>Mission map</dt><dd><kbd>M</kbd></dd></div>
          <div><dt>Pause</dt><dd><kbd>Esc</kbd></dd></div>
        </dl>
      </section>
      <section data-menu-page="settings" hidden>
        ${back}
        <h2 id="settings-page-title">Settings</h2>
        <div class="mission-settings">
          <label class="mission-volume-label" for="mission-volume">Volume <output id="mission-volume-value" for="mission-volume">55%</output></label>
          <input id="mission-volume" type="range" min="0" max="100" value="55" />
          <label for="mission-mute">Mute <input id="mission-mute" type="checkbox" /></label>
          <label for="mission-motion">Reduced motion <input id="mission-motion" type="checkbox" ${reducedMotion ? 'checked' : ''} /></label>
        </div>
      </section>
      <section data-menu-page="coop" hidden>
        ${back}
        <h2 id="coop-page-title">Multiplayer</h2>
        <div class="coop-slot"></div>
        <div class="mission-actions"><button id="coop-play" class="menu-primary" hidden>Start the mission</button></div>
      </section>
      <section data-menu-page="restart" hidden>
        ${back}
        <h2 id="restart-page-title">Start over?</h2>
        <p>Your current mission progress will be reset.</p>
        <div class="mission-actions">
          <button id="mission-cancel-restart" class="menu-primary">Cancel</button>
          <button id="mission-confirm-restart" class="menu-secondary">Restart mission</button>
        </div>
      </section>
      <div class="mission-vr-slot" hidden></div>`
    this.card.querySelector('.mission-start-slot')!.append(start)
    // The game has no VR entry; the panel is parked out of sight so it never shows over the mission (free roam keeps it).
    this.card.querySelector('.mission-vr-slot')!.append(vrPanel)
    this.campaignEntry = this.element('[data-menu-page="home"] [data-menu-open="campaign"]')
    this.coopEntry = this.element('[data-menu-page="home"] [data-menu-open="coop"]')
    this.title = this.element('#pause-page-title')
    this.premise = this.element('#mission-premise')
    this.retry = this.element('#mission-retry')
    this.restart = this.element('#mission-restart')
    this.briefing = this.element('#mission-briefing')
    this.play = this.element('#campaign-play')
    this.loadEntry = this.element('#campaign-load')
    this.training = this.element('#campaign-training')
    this.coopPlay = this.element('#coop-play')
    // One button per saved level; the list is drawn each time the page opens.
    this.element('.save-list').addEventListener('click', event => {
      const level = (event.target as HTMLElement).closest<HTMLElement>('[data-save-level]')?.dataset.saveLevel
      if (level) callbacks.load?.(level)
    }, { signal: this.abort.signal })
    // One button per campaign level; picking the one you're in plays it, any other switches to it.
    this.element('.level-list').addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-level]')
      if (!button) return
      if (button.dataset.level === this.level && !this.tutorial) this.playCampaign()
      else this.go(`level:${button.dataset.level}`, button)
    }, { signal: this.abort.signal })
    const options = { signal: this.abort.signal }
    this.card.querySelectorAll<HTMLElement>('[data-menu-open]').forEach(button => {
      button.addEventListener('click', () => this.open(button.dataset.menuOpen as MenuPage, button), options)
    })
    this.card.querySelectorAll('[data-menu-back]').forEach(button => {
      button.addEventListener('click', () => this.back(), options)
    })
    this.retry.addEventListener('click', callbacks.retry, options)
    this.restart.addEventListener('click', () => {
      if (this.phase === 'complete') callbacks.restart()
      else this.open('restart', this.restart)
    }, options)
    this.element('#mission-confirm-restart').addEventListener('click', callbacks.restart, options)
    this.card.querySelectorAll<HTMLElement>('[data-menu-go]').forEach(button => {
      button.addEventListener('click', () => this.go(button.dataset.menuGo as Destination, button), options)
    })
    this.play.addEventListener('click', () => this.playCampaign(), options)
    this.coopPlay.addEventListener('click', () => this.playCampaign(), options)
    this.loadEntry.addEventListener('click', () => this.tutorial ? this.go('load', this.loadEntry) : this.open('load', this.loadEntry), options)
    this.training.addEventListener('click', () => {
      if (!this.tutorial) this.go('tutorial', this.training)
      else if (this.phase === 'active') this.start.click()
      else this.open('pause', this.training)
    }, options)
    this.element('#mission-cancel-leave').addEventListener('click', () => this.back(), options)
    this.element('#mission-confirm-leave').addEventListener('click', () => { if (this.leaving) goToDestination(this.leaving) }, options)
    this.element('#mission-cancel-restart').addEventListener('click', () => this.back(), options)
    this.element('#mission-volume').addEventListener('input', event => {
      this.element('#mission-volume-value').textContent = `${(event.target as HTMLInputElement).value}%`
    }, options)
    window.addEventListener('keydown', this.keyDown, { ...options, capture: true })
  }

  private element<T extends HTMLElement = HTMLElement>(selector: string) { return this.card.querySelector<T>(selector)! }

  /** Switch to another mode. Ask first when leaving would end a mission or a co-op room. */
  private go(destination: Destination, source: HTMLElement) {
    const warning = this.callbacks.leaveWarning?.() ?? null
    if (!warning) { goToDestination(destination); return }
    this.leaving = destination
    this.element('#leave-warning').textContent = warning
    this.open('leave', source)
  }

  /** The campaign's first entry: in the tutorial it leaves for the mission; otherwise it starts, resumes or starts over. */
  private playCampaign() {
    if (this.tutorial || this.standalone) this.go('mission', this.play)
    else if (this.phase === 'active') this.start.click()
    else this.callbacks.restart()
  }

  /** Resuming makes sense: a run is under way and paused. */
  private get resumable() { return (this.hasPlayed || this.tutorial) && this.phase === 'active' }
  /** The page the menu settles on: the main menu until a run starts, the pause page from then on (and in training). */
  private get landing(): MenuPage { return this.tutorial || this.standalone || this.hasPlayed || this.phase !== 'active' ? 'pause' : 'home' }

  /** Go on to a page from this one; Back returns here, to `source`. */
  private open(page: MenuPage, source: HTMLElement | null = null) {
    if (page === this.page) return
    this.trail.push({ page: this.page, focus: source })
    this.show(page)
  }

  /** Settle on the landing page, with nothing behind it. */
  private land(focus = false) {
    this.trail = []
    this.show(this.landing, focus)
  }

  private show(page: MenuPage, focus = true) {
    if (page === 'load') this.drawSaves()
    if (page === 'campaign') this.drawCampaign()
    if (page === 'levels') this.drawLevels()
    this.page = page
    this.card.dataset.page = page
    this.card.querySelectorAll<HTMLElement>('[data-menu-page]').forEach(section => { section.hidden = section.dataset.menuPage !== page })
    // The main menu has a Back only when you came to it from somewhere, such as the pause page.
    this.element('[data-menu-page="home"] [data-menu-back]').hidden = !this.trail.length
    this.card.setAttribute('aria-labelledby', page === 'home' ? 'mission-menu-title' : `${page}-page-title`)
    this.pause.scrollTop = 0
    if (!focus) return
    if (page === 'home' || page === 'campaign' || page === 'pause') this.focusPrimary()
    else this.element<HTMLButtonElement>(`[data-menu-page="${page}"] ${page === 'restart' ? '#mission-cancel-restart' : page === 'leave' ? '#mission-cancel-leave' : '[data-menu-back]'}`).focus({ preventScroll: true })
  }

  private back() {
    const step = this.trail.pop() ?? { page: PARENT[this.page], focus: null }
    this.show(step.page, false)
    if (step.focus && step.focus.getClientRects().length) step.focus.focus({ preventScroll: true })
    else this.focusPrimary()
  }

  showMap() { this.open('mission') }
  showCoop() { this.trail = [{ page: 'home', focus: this.coopEntry }]; this.show('coop') }
  setPlaying(playing: boolean) {
    if (playing) {
      this.hasPlayed = true
      this.land()
    } else if (this.wasPlaying) {
      this.land()
      this.focusPrimary()
    }
    this.wasPlaying = playing
  }
  private drawSaves() {
    this.saves = listSaves()
    const minutes = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
    const when = (time: number) => new Date(time).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    this.element('.save-list').innerHTML = this.saves.map(save => `<button class="main-entry" data-save-level="${save.level}">
      <strong>${LEVELS[save.level].name}</strong><span>${save.objective} · ${minutes(save.elapsed)} played · saved ${when(save.savedAt)}</span></button>`).join('')
      || '<p>No saved games yet. A mission saves itself whenever you pause or leave it.</p>'
  }
  /** The level select: every campaign mission in order, the one you're in marked. */
  private drawLevels() {
    const here = (id: string) => id === this.level && !this.tutorial
    this.element('.level-list').innerHTML = campaignLevels().map((level, index) => `<button class="main-entry" data-level="${level.id}"${here(level.id) ? ' aria-current="true"' : ''}>
      <strong>Mission ${index + 1} · ${level.name}</strong><span>${here(level.id) ? `${this.hasPlayed && this.phase === 'active' ? 'Playing now · resume' : 'Playing now'} · ` : ''}${level.summary}</span></button>`).join('')
  }
  /** The Campaign page names what each entry will do right now. */
  private drawCampaign() {
    const away = this.tutorial || this.standalone
    const resume = !away && this.hasPlayed && this.phase === 'active'
    this.setEntry(this.play, resume ? 'Resume mission' : 'New game', this.tutorial ? 'Leave training and start the mission'
      : this.standalone ? 'Leave this level and start the campaign' : resume ? this.objective : 'Start the mission')
    // A run under way is already saved by pausing, so loading is offered only when none is.
    this.loadEntry.hidden = !away && (resume || !this.callbacks.load)
    const saves = listSaves().length
    this.setEntry(this.loadEntry, 'Load game', saves ? `${saves} saved ${saves === 1 ? 'mission' : 'missions'}` : 'No saved games yet')
    this.setEntry(this.training, this.tutorial && this.hasPlayed ? 'Resume training' : 'Training',
      this.tutorial ? 'Back to the training ground' : 'Learn every move, then fight Bulky Boy')
  }
  private setEntry(entry: HTMLElement, name: string, note: string) {
    entry.querySelector('strong')!.textContent = name
    entry.querySelector('span')!.textContent = note
  }

  /** The main menu leads with Campaign, the Campaign page with its first entry, the pause page with what the run needs next. */
  focusPrimary() {
    const primary = this.page === 'home' ? this.campaignEntry : this.page === 'campaign' ? this.play : this.page !== 'pause' ? null
      : this.phase === 'dead' ? this.retry : this.phase === 'complete' ? this.restart : this.start
    if (primary && !this.pause.hidden && !this.pause.inert && !primary.hidden && !primary.disabled) primary.focus({ preventScroll: true })
  }
  /** The tutorial level: the pause page runs training, and it has no briefing. */
  setTutorial() {
    this.tutorial = true
    this.land()
  }
  /** A level played on its own: the pause page starts it, under the level's own title. */
  /** Which level this is (its id in levels/catalog.ts). */
  setLevel(id: string) { this.level = id }
  setStandalone() {
    this.standalone = true
    this.land()
  }
  /** Open on the saved games (arriving from the tutorial's Load game). */
  showLoad() { this.trail = [{ page: 'home', focus: this.campaignEntry }, { page: 'campaign', focus: this.loadEntry }]; this.show('load') }
  ready() { this.loaded = true; this.start.disabled = false; this.start.textContent = this.tutorial ? 'Begin training' : this.standalone ? 'Begin mission' : 'New game'; if (this.page === this.landing) this.focusPrimary() }
  error(message: string) {
    this.loadError = message; this.start.textContent = 'Unable to load'; this.start.disabled = true
    this.trail = [{ page: 'home', focus: this.campaignEntry }]; this.show('pause'); this.showError()
  }
  private showError() { const debrief = this.element('#mission-debrief'); debrief.hidden = false; delete debrief.dataset.summary; debrief.textContent = this.loadError }
  reset() { this.phase = 'active'; this.loadError = ''; this.land() }

  update(state: MissionState, data: { playing: boolean; enabled: boolean; ready: boolean }, objective: string) {
    this.objective = objective
    if (data.playing) {
      this.hasPlayed = true
      if (!this.wasPlaying) this.land()
      this.wasPlaying = true
      return
    }
    const justPaused = this.wasPlaying
    this.wasPlaying = false
    if (this.phase !== state.phase) {
      this.phase = state.phase
      this.land()
    }
    const dead = state.phase === 'dead', complete = state.phase === 'complete'
    this.title.textContent = dead ? (state.failure ? 'Mission failed.' : this.tutorial ? 'Down, not out.' : 'No way through.') : complete ? this.briefingText.won : this.hasPlayed ? 'Paused.' : this.tutorial ? 'Training ground' : this.standalone ? this.briefingText.title : 'Campaign'
    this.premise.hidden = dead && !state.failure
    this.premise.textContent = dead && state.failure ? state.failure : this.tutorial ? 'Learn every move, one lesson at a time, then take down Bulky Boy.'
      : complete ? this.briefingText.outro : this.hasPlayed ? this.objective : this.briefingText.premise
    this.start.hidden = dead || complete
    this.start.disabled = !data.ready || !this.loaded
    if (!this.loadError && this.loaded) this.start.textContent = this.tutorial ? (this.hasPlayed ? 'Resume training' : 'Begin training') : this.hasPlayed ? 'Resume mission' : this.standalone ? 'Begin mission' : 'New game'
    this.retry.hidden = !dead
    this.retry.disabled = !data.ready
    this.briefing.hidden = this.tutorial || dead || complete
    this.restart.hidden = dead || (!complete && !this.hasPlayed)
    this.restart.disabled = !data.ready
    this.restart.className = complete ? 'menu-primary' : 'menu-quiet'
    this.restart.textContent = complete ? 'Play again' : this.tutorial ? 'Restart training' : 'Restart mission'
    this.play.disabled = this.training.disabled = this.coopPlay.disabled = !data.ready || !this.loaded
    // Once you are in a co-op room, its page leads straight into the mission.
    this.coopPlay.hidden = this.tutorial || (this.card.querySelector<HTMLElement>('.coop-session')?.hidden ?? true)
    this.coopPlay.textContent = this.resumable ? 'Resume mission' : 'Start the mission'
    const debrief = this.element('#mission-debrief')
    debrief.hidden = !complete
    if (complete) {
      const time = `${Math.floor(state.elapsed / 60)}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')}`
      const health = Math.ceil(Math.max(0, Math.min(100, state.health)))
      const summary = `${time}|${state.kills}|${health}`
      if (debrief.dataset.summary !== summary) {
        debrief.dataset.summary = summary
        debrief.innerHTML = `<dl class="mission-recap" aria-label="Mission recap">
          <div><dt>Time</dt><dd>${time}</dd></div>
          <div><dt>Kills</dt><dd>${state.kills}</dd></div>
          <div><dt>Health</dt><dd>${health}%</dd></div>
        </dl>`
      }
    }
    if (this.loadError) this.showError()
    this.element('#mission-current-objective').textContent = this.objective
    if (data.enabled && ((justPaused && !dead) || complete) && this.page === this.landing && !this.card.contains(document.activeElement)) this.focusPrimary()
  }

  private keyDown = (event: KeyboardEvent) => {
    if (this.pause.hidden || this.pause.inert || document.querySelector<HTMLElement>('#walk-hud')!.hidden || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation()
      if (event.repeat) return
      // On the pause page Esc resumes; with nothing to resume it goes to the main menu. Anywhere else it goes back.
      if (this.page === 'pause') { if (this.resumable && this.hasPlayed) this.start.click(); else this.open('home') }
      else if (this.page !== 'home' || this.trail.length) this.back()
      return
    }
    if (event.code === 'KeyM' && !this.tutorial && (this.page === 'home' || this.page === 'pause' || this.page === 'mission')) {
      event.preventDefault(); event.stopImmediatePropagation()
      if (event.repeat) return
      if (this.page !== 'mission') this.showMap()
      else if (this.resumable && this.hasPlayed) this.start.click()
      else this.back()
      return
    }
    const buttons = Array.from(this.card.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary')).filter(el => el.getClientRects().length > 0)
    const index = buttons.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'Tab') {
      if (index === -1 || (event.shiftKey ? index === 0 : index === buttons.length - 1)) {
        event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus()
      }
    } else if (['ArrowUp', 'ArrowDown'].includes(event.key) && !['mission', 'settings', 'controls'].includes(this.page)) {
      event.preventDefault()
      buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
    }
  }

  dispose() { this.abort.abort() }
}
