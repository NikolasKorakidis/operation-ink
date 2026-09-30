import { loadedCount, radioOut, type MissionState } from './mission'
import { CAMERA_TERMINALS } from './rescue-layout'

export type Objective = { id: string; label: string; detail: string; done: boolean; main: boolean; progress?: [number, number] }
/** How many of each side objective the level holds. */
export type ObjectiveTotals = { crates: number; radios: string[] }

/** The main mission, then the optional side missions, as the mission state stands. */
export function missionObjectives(state: MissionState, totals: ObjectiveTotals): Objective[] {
  const saved = state.phase === 'complete' || state.jeep === 'escaped'
  const hostage = state.hostages[0]
  const detail = saved ? 'Hostage rescued'
    : state.jeep === 'escaping' ? 'Drive out through the gate'
    : hostage?.status === 'loaded' || loadedCount(state) === state.hostages.length ? 'Drive him out in the jeep'
    : hostage?.status === 'following' ? 'Lead him to the jeep'
    : state.cellsReached ? 'Unlock his cell' : 'Find him in the detention cells'
  const radios = totals.radios.filter(id => radioOut(state, id)).length
  const terminals = Object.values(CAMERA_TERMINALS), camerasOff = terminals.filter(id => state.camerasOff.includes(id)).length
  const crates = Math.min(totals.crates, state.brokenCrates.length)
  return [
    { id: 'hostage', label: 'Save the hostage', detail, done: saved, main: true },
    { id: 'crates', label: 'Destroy the crates', detail: 'Shoot them apart', done: totals.crates > 0 && crates >= totals.crates, main: false, progress: [crates, totals.crates] },
    { id: 'radios', label: 'Destroy the radios', detail: 'Shoot them, or switch them off (F)', done: totals.radios.length > 0 && radios >= totals.radios.length, main: false, progress: [radios, totals.radios.length] },
    { id: 'cameras', label: 'Disable the cameras', detail: 'Use both camera terminals (F)', done: camerasOff >= terminals.length, main: false, progress: [camerasOff, terminals.length] },
  ]
}

const check = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/** How the mission list opens a run: held in the middle, then it moves top right, stays open briefly, and folds away. */
export const OBJECTIVES_INTRO = { hold: 3.2, move: 0.7, open: 1 } as const
/** After progress, the list stays open this long (s) before folding back, if it opened for it. */
export const OBJECTIVES_PROGRESS_OPEN = 3.2

/**
 * Which objectives moved forward between two readings: `advanced` gained a count or finished, `completed` is the
 * subset that just finished. Going back (a checkpoint retry, a restart) is not progress.
 */
export function objectiveChanges(before: Objective[], after: Objective[]) {
  const advanced: string[] = [], completed: string[] = []
  for (const objective of after) {
    const previous = before.find(candidate => candidate.id === objective.id)
    if (!previous) continue
    const gained = (objective.progress?.[0] ?? 0) > (previous.progress?.[0] ?? 0)
    const finished = objective.done && !previous.done
    if (gained || finished) advanced.push(objective.id)
    if (finished) completed.push(objective.id)
  }
  return { advanced, completed }
}

/**
 * The mission list: the main mission, then the side missions with their counts. When a run starts it is shown
 * once in the middle of the screen, moves to the top right, and folds down to a small "Missions · I" tab after a
 * second. I opens and closes it from then on. Progress opens it by itself: the count that changed blinks, a
 * finished mission is scratched out with a pen line, and it folds away again a few seconds later.
 */
export class ObjectivesPanel {
  readonly root = document.createElement('section')
  private readonly body = document.createElement('div')
  private shown: Objective[] | null = null
  private shownKey = ''
  private mode: 'intro' | 'moving' | 'open' | 'collapsed' = 'collapsed'
  private timer = 0
  /** Fold away when `timer` reaches this; null keeps it open (the player opened it). */
  private closeAt: number | null = null

  constructor() {
    this.root.className = 'mission-objectives is-collapsed'
    this.root.setAttribute('aria-label', 'Mission objectives')
    this.root.innerHTML = '<div class="objectives-tab"><span>Missions</span><kbd>I</kbd></div>'
    this.body.className = 'objectives-body'
    this.root.append(this.body)
  }

  get open() { return this.mode !== 'collapsed' }

  /** Show the list in the middle of the screen, as a run begins. */
  brief() { this.timer = 0; this.closeAt = null; this.setMode('intro') }

  /** I: open or fold the list (it also ends the opening briefing). An opened list stays open. */
  toggle() { this.timer = 0; this.closeAt = null; this.setMode(this.mode === 'collapsed' ? 'open' : 'collapsed') }

  update(state: MissionState, totals: ObjectiveTotals, dt = 0) {
    this.timer += Math.max(0, dt)
    if (this.mode === 'intro' && this.timer >= OBJECTIVES_INTRO.hold) { this.timer = 0; this.setMode('moving') }
    else if (this.mode === 'moving' && this.timer >= OBJECTIVES_INTRO.move) { this.timer = 0; this.closeAt = OBJECTIVES_INTRO.open; this.mode = 'open' }
    else if (this.mode === 'open' && this.closeAt !== null && this.timer >= this.closeAt) { this.closeAt = null; this.setMode('collapsed') }
    const objectives = missionObjectives(state, totals)
    const key = JSON.stringify(objectives)
    if (key === this.shownKey) return
    const { advanced, completed } = this.shown ? objectiveChanges(this.shown, objectives) : { advanced: [], completed: [] }
    this.shown = objectives
    this.shownKey = key
    if (advanced.length && this.mode === 'collapsed') {
      // Pop open to show the progress, then fold away again.
      this.timer = 0
      this.closeAt = OBJECTIVES_PROGRESS_OPEN
      this.setMode('open')
    } else if (advanced.length && this.mode === 'open' && this.closeAt !== null) {
      this.timer = 0
      this.closeAt = Math.max(this.closeAt, OBJECTIVES_PROGRESS_OPEN)
    }
    const row = (objective: Objective) => {
      const classes = [objective.done && 'done', advanced.includes(objective.id) && 'advanced', completed.includes(objective.id) && 'just-done'].filter(Boolean).join(' ')
      return `<li class="${classes}" data-objective="${objective.id}">
      <span class="objective-mark">${objective.done ? check : ''}</span>
      <span class="objective-text"><b>${objective.label}</b>${objective.progress ? `<em>${objective.progress[0]}/${objective.progress[1]}</em>` : ''}
        ${objective.done ? '' : `<small>${objective.detail}</small>`}</span></li>`
    }
    const [main, ...side] = objectives
    this.body.innerHTML = `<h2>Mission</h2><ol class="objective-main">${row(main)}</ol>
      <h3>Side missions</h3><ol class="objective-side">${side.map(row).join('')}</ol>
      <p class="objectives-hint">Press <kbd>I</kbd> to see your missions</p>`
  }

  private setMode(mode: typeof this.mode) {
    this.mode = mode
    this.root.classList.toggle('is-intro', mode === 'intro')
    this.root.classList.toggle('is-collapsed', mode === 'collapsed')
    this.root.setAttribute('aria-expanded', String(mode !== 'collapsed'))
  }
}
