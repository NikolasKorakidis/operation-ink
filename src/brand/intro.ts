import './intro.css'
import { DURATION, IdentFilm } from './cinematic'
import { createMixer, scoreIdent } from './score'

const PLAYED = 'sleeping-giant.intro-played'

/**
 * The Sleeping Giant Studios ident (cinematic.ts, scored by score.ts), played over the loading game once per
 * browser session. Browsers hold sound back until you press something, so if they do it first asks you to press any
 * key; any key or click during it skips to the game. `?intro=1` plays it again. Reduced Motion gets a late frame,
 * held still. Resolves when it is gone.
 */
export function playBrandIntro(): Promise<void> {
  const params = new URLSearchParams(location.search)
  const forced = params.get('intro') === '1'
  if (forced) {
    params.delete('intro')
    const search = params.toString()
    history.replaceState(history.state, '', `${location.pathname}${search ? `?${search}` : ''}${location.hash}`)
  }
  let played = false
  try { played = sessionStorage.getItem(PLAYED) === '1' } catch { /* no storage: play it */ }
  // Only the game itself opens with it: not a developer bookmark, and not under automation.
  const bookmark = ['tutorial', 'explore', 'view', 'load', 'level'].some(name => params.has(name))
  if (!forced && (played || bookmark || navigator.webdriver)) return Promise.resolve()
  try { sessionStorage.setItem(PLAYED, '1') } catch { /* fine */ }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const root = document.createElement('div')
  root.id = 'brand-intro'
  root.setAttribute('role', 'img')
  root.setAttribute('aria-label', 'Sleeping Giant Studios')
  root.style.visibility = 'visible'
  root.innerHTML = `<canvas class="brand-film"></canvas>
    <div class="brand-gate"><b>眠</b><span>Press any key</span></div>
    <div class="brand-skip" aria-hidden="true">Any key to skip</div>`
  document.body.append(root)
  const film = new IdentFilm(root.querySelector('canvas')!)

  return new Promise(resolve => {
    const mixer = createMixer()
    let started = false, finished = false, frame = 0, timer = 0, startedAt = 0, scored = false
    const finish = () => {
      if (finished) return
      finished = true
      cancelAnimationFrame(frame); window.clearTimeout(timer)
      removeEventListener('keydown', onInput, true); removeEventListener('pointerdown', onInput, true)
      root.classList.add('is-done')
      window.setTimeout(() => { root.remove(); void mixer?.context.close(); resolve() }, 420)
    }
    const playScore = () => {
      // The sound joins only if it can still land on the picture (never later than a moment).
      if (!mixer || scored || mixer.context.state !== 'running' || performance.now() - startedAt > 400) return
      scored = true
      scoreIdent(mixer, mixer.context.currentTime + 0.02 - (performance.now() - startedAt) / 1000)
    }
    const tick = () => {
      const t = (performance.now() - startedAt) / 1000
      film.draw(Math.min(t, DURATION))
      if (t < DURATION) frame = requestAnimationFrame(tick)
      else finish()
    }
    const start = () => {
      if (started) return
      started = true
      startedAt = performance.now()
      root.classList.add('is-playing')
      if (reduced) { film.draw(DURATION - 1.2); timer = window.setTimeout(finish, 2200); return }
      playScore()
      frame = requestAnimationFrame(tick)
    }
    mixer?.context.addEventListener('statechange', () => { if (started) playScore() })
    // The first key or click starts it, letting the sound play if the browser was holding it back; after that it skips.
    const onInput = (event: Event) => {
      event.preventDefault(); event.stopPropagation()
      if (!started) { void mixer?.context.resume().catch(() => {}); start(); return }
      finish()
    }
    addEventListener('keydown', onInput, true)
    addEventListener('pointerdown', onInput, true)
    // For checking frames by hand in development: stop the clock and show one moment.
    Object.assign(root, { hold: (t: number) => { cancelAnimationFrame(frame); window.clearTimeout(timer); root.classList.add('is-playing'); started = true; film.draw(t) } })
    if (!mixer) { start(); return }
    void mixer.context.resume().catch(() => {})
    // Give the browser a moment to say whether sound may play; if not, wait at the gate for a key.
    window.setTimeout(() => { if (mixer.context.state === 'running') start() }, 120)
  })
}
