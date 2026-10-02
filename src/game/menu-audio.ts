/**
 * The menus' own sound: the menu theme (OST/music/menu) looping under every menu page, fading out when play starts
 * and back in when the menu returns, and a typewriter key under the pointer (OST/ui): a light tap on hovering a
 * button (or moving to one with the keys), a heavier strike on choosing it. It has its own audio context, apart from
 * the mission's (which is suspended while paused), follows the Settings volume and mute, waits for the studio intro
 * to finish, and can only start after the player's first key or click, as browsers require.
 */
const FILES = { theme: 'music/menu/menu-theme.flac', tap: 'ui/key-tap.m4a', strike: 'ui/key-strike.m4a' } as const
type Clip = keyof typeof FILES
/** How loud each part sits under the master volume, and the music's fades in seconds. */
const MIX = { music: 0.42, tap: 0.38, strike: 0.5, fadeIn: 1.6, fadeOut: 0.9 }
/** What counts as something to hover in a menu. */
const CHOICES = 'button, summary, a[href], input[type="checkbox"], input[type="range"]'
/** Smooths the loop seam: the track's last samples are faded into its first over this long (seconds). */
const SEAM = 0.012

export class MenuAudio {
  private static instance: MenuAudio | null = null
  /** One for the whole page: menus come and go with mode switches, the music carries on. */
  static shared() { return MenuAudio.instance ??= new MenuAudio() }

  private context: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private music: AudioBufferSourceNode | null = null
  private buffers = new Map<Clip, AudioBuffer>()
  private volume = 0.55
  private muted = false
  private open = false
  private hovered: Element | null = null
  private lastTap = 0

  private constructor() {
    const unlock = () => void this.unlock()
    addEventListener('pointerdown', unlock, true)
    addEventListener('keydown', unlock, true)
    document.addEventListener('pointerover', event => this.pointerOver(event), true)
    document.addEventListener('focusin', event => {
      // Moving through the menu with the keys taps like the pointer does.
      if (document.documentElement.dataset.input === 'keys') this.hover((event.target as Element).closest?.(CHOICES) ?? null)
    }, true)
    document.addEventListener('click', event => {
      const choice = (event.target as Element).closest?.(CHOICES)
      if (choice && this.inMenu(choice) && !(choice as HTMLButtonElement).disabled) this.play('strike', MIX.strike)
    }, true)
    // The Settings page's volume and mute (MissionMenu) set the menu's sound too.
    document.addEventListener('input', event => this.readSettings(event.target as HTMLElement), true)
    document.addEventListener('change', event => this.readSettings(event.target as HTMLElement), true)
    setInterval(() => this.sync(), 200)
  }

  /** A menu is on screen: the pause card over the game, with no loading screen or studio intro over it. */
  private get menuOpen() {
    const pause = document.querySelector<HTMLElement>('#walk-pause'), hud = document.querySelector<HTMLElement>('#walk-hud')
    return !!pause && !pause.hidden && !!hud && !hud.hidden && !document.getElementById('brand-intro') &&
      !document.documentElement.hasAttribute('data-loading')
  }

  private inMenu(element: Element) { return !!element.closest('#walk-pause, .mode-button') }

  private async unlock() {
    if (this.context) { if (this.context.state === 'suspended') void this.context.resume().catch(() => {}); return }
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Context) return
    this.context = new Context()
    this.master = this.context.createGain()
    this.master.connect(this.context.destination)
    this.musicGain = this.context.createGain()
    this.musicGain.gain.value = 0
    this.musicGain.connect(this.master)
    this.readSettings(document.querySelector('#mission-volume'))
    this.readSettings(document.querySelector('#mission-mute'))
    this.applyVolume()
    const context = this.context
    await Promise.all((Object.keys(FILES) as Clip[]).map(async clip => {
      try {
        const response = await fetch(`${import.meta.env?.BASE_URL ?? '/'}OST/${FILES[clip]}`)
        if (!response.ok) return
        const buffer = await context.decodeAudioData(await response.arrayBuffer())
        if (clip === 'theme') smoothSeam(buffer)
        this.buffers.set(clip, buffer)
      } catch { /* a missing file only leaves that sound out */ }
    }))
    this.startMusic()
    // The theme starts silent: fade it in now if a menu is already open.
    this.open = false
    this.sync()
  }

  private startMusic() {
    const buffer = this.buffers.get('theme')
    if (!this.context || !this.musicGain || !buffer || this.music) return
    this.music = this.context.createBufferSource()
    this.music.buffer = buffer
    this.music.loop = true
    this.music.connect(this.musicGain)
    this.music.start()
  }

  /** Fades the theme in while a menu is open and out while playing. */
  private sync() {
    if (!this.context || !this.musicGain) return
    const open = this.menuOpen
    if (open === this.open) return
    this.open = open
    const gain = this.musicGain.gain, now = this.context.currentTime
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(open ? MIX.music : 0, now + (open ? MIX.fadeIn : MIX.fadeOut))
    if (!open) this.hovered = null
  }

  private pointerOver(event: Event) {
    const choice = (event.target as Element).closest?.(CHOICES) ?? null
    this.hover(choice)
  }

  /** A tap each time the pointer (or keyboard focus) arrives on a new choice; nothing while it moves within one. */
  private hover(choice: Element | null) {
    if (choice === this.hovered) return
    this.hovered = choice
    if (!choice || !this.inMenu(choice) || (choice as HTMLButtonElement).disabled || !this.menuOpen) return
    const now = performance.now()
    if (now - this.lastTap < 45) return
    this.lastTap = now
    this.play('tap', MIX.tap, 0.92 + Math.random() * 0.16)
  }

  private play(clip: Clip, level: number, rate = 1) {
    const buffer = this.buffers.get(clip)
    if (!this.context || !this.master || !buffer || this.context.state !== 'running') return
    const source = this.context.createBufferSource(), gain = this.context.createGain()
    source.buffer = buffer
    source.playbackRate.value = rate
    gain.gain.value = level
    source.connect(gain).connect(this.master)
    source.start()
  }

  private readSettings(target: HTMLElement | null) {
    if (target?.id === 'mission-volume') this.volume = Number((target as HTMLInputElement).value) / 100
    else if (target?.id === 'mission-mute') this.muted = (target as HTMLInputElement).checked
    else return
    this.applyVolume()
  }

  private applyVolume() {
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, 0.03)
  }
}

/** Fades the loop's last moment into its first, so the jump back to the start never clicks. */
function smoothSeam(buffer: AudioBuffer) {
  const length = Math.min(Math.floor(buffer.sampleRate * SEAM), Math.floor(buffer.length / 4))
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel), end = data.length - length
    for (let i = 0; i < length; i++) {
      const fade = i / length
      // The tail crossfades toward the opening samples it is about to jump back to.
      data[end + i] = data[end + i] * (1 - fade) + data[i] * fade
    }
  }
}
