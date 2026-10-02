import './mission-intro.css'

/** How long the opening reveal takes, in seconds (mission-intro.css times its keyframes to this). */
export const INTRO_SECONDS = 5

/**
 * The opening when a mission starts, restarts or is retried: black, then the world in black and red, then the red
 * drains to white paper and black ink (mission-intro.css). Reduced Motion gets a plain fade up from black. A screen
 * overlay only: it never blocks input or pauses the game.
 */
export class MissionIntro {
  private element: HTMLElement | null = null
  private timer = 0

  get active() { return !!this.element }

  play(reducedMotion: boolean) {
    this.clear()
    const intro = document.createElement('div')
    intro.className = 'mission-intro'
    intro.dataset.reducedMotion = String(reducedMotion)
    intro.setAttribute('aria-hidden', 'true')
    intro.innerHTML = '<i class="intro-red"></i><i class="intro-black"></i><i class="intro-shade"></i>'
    document.body.append(intro)
    this.element = intro
    this.timer = window.setTimeout(() => this.clear(), INTRO_SECONDS * 1000 + 150)
  }

  clear() {
    window.clearTimeout(this.timer)
    this.element?.remove()
    this.element = null
  }
}
