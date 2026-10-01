import type { MissionState } from './mission'
import type { Objective } from './objectives'
import type { EnemyState, Vec3 } from './types'

/**
 * A mission's goals, declared by its level (MissionWorld.goals) instead of written into the runtime. The runtime
 * checks them every frame (updateGoals), the objectives panel lists them (goalObjectives), and the mission is won
 * when every main goal is done. Progress lives in the mission state (goalsDone, usedStations), so it saves, restores
 * on a checkpoint and is shared in co-op like the rest of it; counts are read live from the world.
 *
 * Kinds:
 * - reach: get to an area.
 * - eliminate: kill the named enemies (spec ids), or every enemy on the level ('all').
 * - destroy: break the level's quest crates or put its radios out of action (all of them, or `count`).
 * - interact: use the station with this id (a Station of kind 'objective'; its label is the prompt).
 * - extract: get to an area once every other main goal is done. Usually the last goal.
 *
 * `after` lists goals that must be done first; until then this one is shown as locked and does not count.
 */
export type GoalArea = { center: Vec3; radius: number; height?: number }
type GoalBase = { id: string; label: string; detail?: string; main?: boolean; after?: string[]; done?: string }
export type GoalSpec = GoalBase & (
  | { kind: 'reach'; area: GoalArea }
  | { kind: 'eliminate'; enemies: string[] | 'all' }
  | { kind: 'destroy'; items: 'crates' | 'radios'; count?: number }
  | { kind: 'interact'; station: string }
  | { kind: 'extract'; area: GoalArea })

/** What the goals read from the world each frame. */
export type GoalSense = {
  /** Where the players are (the host's own player, plus guests in co-op). */
  players: readonly { x: number; y: number; z: number }[]
  enemies: readonly { spec: { id: string; dummy?: boolean }; state: EnemyState }[]
  /** How many quest crates and radios the level holds. */
  totals: { crates: number; radios: number }
  /** How many radios are out of action now. */
  radiosOut: number
}

const inside = (area: GoalArea, point: { x: number; y: number; z: number }) =>
  Math.hypot(point.x - area.center[0], point.z - area.center[2]) <= area.radius && Math.abs(point.y - area.center[1]) <= (area.height ?? 3)

/** Whether a goal can count yet: everything it comes after is done. Extraction also waits for every other main goal. */
export function goalUnlocked(state: MissionState, goals: readonly GoalSpec[], goal: GoalSpec) {
  if (goal.after?.some(id => !state.goalsDone.includes(id))) return false
  if (goal.kind === 'extract') return goals.every(other => other === goal || other.main === false || state.goalsDone.includes(other.id))
  return true
}

/** How far along a counted goal is: [done, needed]. Other kinds are 0 or 1 of 1. */
export function goalCount(state: MissionState, goal: GoalSpec, sense: Pick<GoalSense, 'enemies' | 'totals' | 'radiosOut'>): [number, number] {
  switch (goal.kind) {
    case 'eliminate': {
      const targets = goal.enemies === 'all' ? sense.enemies.filter(enemy => !enemy.spec.dummy) : sense.enemies.filter(enemy => (goal.enemies as string[]).includes(enemy.spec.id))
      const needed = goal.enemies === 'all' ? targets.length : goal.enemies.length
      return [targets.filter(enemy => enemy.state === 'dead').length, needed]
    }
    case 'destroy': {
      const total = goal.items === 'crates' ? sense.totals.crates : sense.totals.radios
      const needed = Math.min(goal.count ?? total, total)
      return [Math.min(needed, goal.items === 'crates' ? state.brokenCrates.length : sense.radiosOut), needed]
    }
    default: return [state.goalsDone.includes(goal.id) ? 1 : 0, 1]
  }
}

/**
 * Mark goals done as the world now stands (host and solo only; guests take the host's state). Returns the ids that
 * finished this frame, in order. A finished goal stays finished.
 */
export function updateGoals(state: MissionState, goals: readonly GoalSpec[], sense: GoalSense): string[] {
  const finished: string[] = []
  // Several can finish in one frame, a later one unlocked by an earlier: settle them in passes.
  for (let pass = 0; pass < goals.length; pass++) {
    let changed = false
    for (const goal of goals) {
      if (state.goalsDone.includes(goal.id) || !goalUnlocked(state, goals, goal)) continue
      let done = false
      if (goal.kind === 'reach' || goal.kind === 'extract') done = sense.players.some(player => inside(goal.area, player))
      else if (goal.kind === 'interact') done = state.usedStations.includes(goal.station)
      else {
        const [count, needed] = goalCount(state, goal, sense)
        done = needed > 0 && count >= needed
      }
      if (!done) continue
      state.goalsDone.push(goal.id)
      finished.push(goal.id)
      changed = true
    }
    if (!changed) break
  }
  return finished
}

/** The mission is won once every main goal is done. A level with no goals is never won this way. */
export const goalsComplete = (state: MissionState, goals: readonly GoalSpec[]) =>
  goals.length > 0 && goals.every(goal => goal.main === false || state.goalsDone.includes(goal.id))

/** The goals as the objectives panel lists them: main goals first, then side goals, each with its count. */
export function goalObjectives(state: MissionState, goals: readonly GoalSpec[], sense: Pick<GoalSense, 'enemies' | 'totals' | 'radiosOut'>): Objective[] {
  const listed = [...goals.filter(goal => goal.main !== false), ...goals.filter(goal => goal.main === false)]
  return listed.map(goal => {
    const done = state.goalsDone.includes(goal.id)
    const counted = goal.kind === 'eliminate' || goal.kind === 'destroy'
    const [count, needed] = counted ? goalCount(state, goal, sense) : [0, 0]
    const locked = !done && !goalUnlocked(state, goals, goal)
    return { id: goal.id, label: goal.label, detail: locked ? 'Not yet' : goal.detail ?? '', done, main: goal.main !== false,
      ...(counted && needed > 1 ? { progress: [Math.min(count, needed), needed] as [number, number] } : {}) }
  })
}

/** One line for the pause page and the save list: the first main goal still to do. */
export function goalHint(state: MissionState, goals: readonly GoalSpec[]) {
  if (state.phase === 'dead') return 'Mission failed. Retry from the checkpoint.'
  if (state.phase === 'complete') return 'Mission complete.'
  const next = goals.find(goal => goal.main !== false && !state.goalsDone.includes(goal.id) && goalUnlocked(state, goals, goal))
    ?? goals.find(goal => goal.main !== false && !state.goalsDone.includes(goal.id))
  return next ? next.label : 'Mission complete.'
}
