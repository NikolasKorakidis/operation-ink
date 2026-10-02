import logoUrl from './logo.jpg'
import antonUrl from './fonts/anton.woff2'
import brushUrl from './fonts/yuji-boku.woff2'

/**
 * The Sleeping Giant Studios ident as a 9-second film, painted on a canvas: a samurai duel under a blood-red sun on
 * a battlefield of the dead, staged like Kill Bill's silhouette fights and cut like Japanese splatter cinema.
 *
 *   0.0  An epigraph, brushed white on black: 「眠れる巨人は、目を覚ます。」 THE SLEEPING GIANT AWAKENS.
 *   1.1  Smash cut to a blood-red sunset over a field of swords stuck in the ground, crows wheeling. A samurai kneels,
 *        hand on his hilt; three swordsmen charge him, black against the sun, kicking up lit dust.
 *   1.9  Iaido: he is gone in a streak and stands behind them, blade out, the sun running down its steel.
 *   2.15 They come apart one by one, two cut through and the last beheaded, in arterial geysers. Each cut slams a
 *        giant letter painted in blood onto the screen: S, G, S.
 *   2.95 Chiburi: he raises the blade and snaps it down, throwing the blood off it in a line across the ground. He holds.
 *   3.55 Noto, slow, as the camera closes in on his hands: he turns the blade round, lays its back across his left
 *        hand at the mouth of the saya, draws it out until the point finds the mouth, and slides it home. Click.
 *   5.7  Black, smoke and embers. The blood letters fly into place and SLEEPING GIANT STUDIOS slams in after them.
 *   6.3  The blood ring, the studio's oni kabuto rising in it; its eyes catch fire.
 *   7.1  A sword cuts through the name; it slides apart along the cut and bleeds. 内なる武士を呼び覚ませ (AWAKEN THE
 *        WARRIOR WITHIN); the seal.
 *   8.4  Fade to the game.
 *
 * The duel is lit from behind by the low sun: the figures are silhouettes with a hot rim on their sun side, throwing
 * long shadows at the camera; steel catches the sun; dust and blood glow against it. The sky, hills and ground are
 * painted once (per resolution) and reused.
 *
 * Everything is drawn on a 1600 × 900 stage fitted inside the screen (the backgrounds fill it), letterboxed to
 * 2.39:1. The blood is simulated: drops that fly, streak, fall and pool, and splats that hit the lens and run.
 * It is deterministic (a seeded random), so any moment can be drawn again exactly (`draw(t)` replays to `t`).
 */
export const DURATION = 8.9
/** The film's moments. The sheathing: `chiburi` raises the blade, `flick` snaps it down, `turn` brings it round to the
 * saya, `draw` slides it out along the hand until its point is at the mouth, `sheathe` slides it home, `click`. */
export const BEATS = { smash: 1.1, dash: 1.9, dashEnd: 1.98, kills: [2.15, 2.37, 2.59], chiburi: 2.95, flick: 3.07, turn: 3.55, draw: 4.05,
  sheathe: 4.55, click: 5.45, black: 5.7, write: 5.8, emblem: 6.3, ignite: 6.85, slash: 7.1, seal: 7.3, fade: 8.4 } as const

type Vec = [number, number]
const W = 1600, H = 900, GROUND = 700
const INK = '#050202', BLOOD = '#6a0402', BLOOD_BRIGHT = '#b30e07', BONE = '#ece5d6', RIM = '#ff7a48'
/** The low blood-red sun the duel is fought against, sinking behind the far hills. */
const SUN: Vec = [1010, 650], SUN_RADIUS = 240
/** What the duel's painted backdrop covers: wider and taller than the stage, for other screen shapes and the shake. */
const BACK = { x: -520, y: -160, w: 2640, h: 1220 }
/**
 * The lettering, bundled (fonts/, cut down to the characters used; SIL Open Font License): Anton, a heavy condensed
 * face, for the name; Yuji Boku, a brush, for the Japanese. System faces stand in until they load.
 */
const HEAVY = '"SG Anton", Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif'
const BRUSH = '"SG Yuji Boku", "Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif JP", serif'
const FONTS: [string, string][] = [['SG Anton', antonUrl], ['SG Yuji Boku', brushUrl]]
/** Where the eyes are in the studio's logo, as fractions of its width and height (for the glow when they ignite). */
const LOGO_EYES: Vec[] = [[0.415, 0.52], [0.585, 0.52]]

const JOINTS = ['hip', 'neck', 'head', 'lElbow', 'lHand', 'rElbow', 'rHand', 'lKnee', 'lFoot', 'rKnee', 'rFoot'] as const
type Joint = typeof JOINTS[number]
/** A figure's pose, facing right, feet at the origin, y up being negative. `sword` is the blade's angle (NaN: sheathed). */
type Pose = Record<Joint, Vec> & { sword: number }

const pose = (joints: Record<Joint, Vec>, sword = NaN): Pose => ({ ...joints, sword })
const SAM_KNEEL = pose({ hip: [0, -100], neck: [18, -178], head: [26, -210], lKnee: [60, -58], lFoot: [80, 0], rKnee: [-30, -8], rFoot: [-92, -4],
  rElbow: [40, -140], rHand: [14, -116], lElbow: [6, -140], lHand: [-6, -108] })
const SAM_FINISH = pose({ hip: [0, -118], neck: [-4, -198], head: [-6, -230], lKnee: [58, -62], lFoot: [118, 0], rKnee: [-52, -58], rFoot: [-120, 0],
  rElbow: [52, -176], rHand: [104, -206], lElbow: [-34, -158], lHand: [-56, -128] }, -0.42)
/** The chiburi: the blade raised high, then snapped down and out, its point near the ground. */
const SAM_RAISE = pose({ ...SAM_FINISH, rElbow: [50, -198], rHand: [72, -240] }, -1.45)
const SAM_FLICK = pose({ ...SAM_FINISH, rElbow: [60, -150], rHand: [86, -112] }, 0.62)
/** The stance he sheathes in (the arms are placed by reach). */
const SAM_NOTO = pose({ ...SAM_FLICK, hip: [0, -112], neck: [12, -192], head: [18, -224], lKnee: [44, -58], lFoot: [84, 0], rKnee: [-34, -56], rFoot: [-88, 0] }, 0.62)
/** The saya, from its mouth back along his hip (a unit direction); the blade's angle that, turned round, lies along
 * it; his blade's length; his arm's two lengths. */
const SAYA: Vec = [-0.983, 0.183], SHEATHED = Math.atan2(-SAYA[1], -SAYA[0]), SAM_BLADE = 160, UPPER_ARM = 50, FOREARM = 48
/** An enemy mid-stride (facing right; he is mirrored to charge left), sword up. */
function runPose(phase: number): Pose {
  const s = Math.sin(phase), c = Math.cos(phase)
  return pose({ hip: [0, -112 + 5 * Math.abs(s)], neck: [18, -186], head: [24, -214],
    lKnee: [22 + 26 * s, -60], lFoot: [52 * s, -2 - 20 * Math.max(0, c)], rKnee: [22 - 26 * s, -60], rFoot: [-52 * s, -2 - 20 * Math.max(0, -c)],
    rElbow: [34, -150], rHand: [54, -184], lElbow: [-18 - 18 * s, -150], lHand: [-26 - 30 * s, -126] }, -1.05)
}
const lerp = (a: number, b: number, u: number) => a + (b - a) * u
const lerpV = (a: Vec, b: Vec, u: number): Vec => [lerp(a[0], b[0], u), lerp(a[1], b[1], u)]
/** Where an arm from `shoulder` puts its elbow to reach `target` (as near as it can), the elbow bent down and back. */
function reachArm(shoulder: Vec, target: Vec): { elbow: Vec; hand: Vec } {
  const dx = target[0] - shoulder[0], dy = target[1] - shoulder[1], d = Math.min(Math.hypot(dx, dy), UPPER_ARM + FOREARM - 0.01)
  const a = Math.atan2(dy, dx), bend = Math.acos(Math.max(-1, Math.min(1, (UPPER_ARM ** 2 + d * d - FOREARM ** 2) / (2 * UPPER_ARM * d))))
  return { elbow: [shoulder[0] + Math.cos(a + bend) * UPPER_ARM, shoulder[1] + Math.sin(a + bend) * UPPER_ARM], hand: [shoulder[0] + Math.cos(a) * d, shoulder[1] + Math.sin(a) * d] }
}
const clamp01 = (u: number) => Math.max(0, Math.min(1, u))
const ease = (u: number) => { const v = clamp01(u); return v * v * (3 - 2 * v) }
const easeOut = (u: number) => 1 - Math.pow(1 - clamp01(u), 3)
function lerpPose(a: Pose, b: Pose, u: number): Pose {
  const out = { sword: Number.isNaN(b.sword) ? (u < 0.5 ? a.sword : NaN) : Number.isNaN(a.sword) ? b.sword : lerp(a.sword, b.sword, u) } as Pose
  for (const joint of JOINTS) out[joint] = lerpV(a[joint], b[joint], u)
  return out
}

/** A seeded random (mulberry32), so the film plays the same every time. */
function random(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}

type Drop = { x: number; y: number; vx: number; vy: number; r: number; mist: boolean; life: number; dark: boolean }
type Pool = { x: number; w: number; h: number }
/** Blood on the lens: a body of overlapping blobs, streaks flung one way that end in beads, dots, and drips. */
type Splat = { x: number; y: number; r: number; at: number; blobs: [number, number, number][]; streaks: [number, number, number][]; drips: [number, number, number][]; dots: [number, number, number][] }
type Gear = 'kabuto' | 'topknot' | 'jingasa'
/** Who charges: from where to where, his stride, when he dies, his letter and where it lands, where he is cut (a
 * fraction from hip to neck; 1 takes the head) and what he wears on his head. */
type Enemy = { start: number; stop: number; phase: number; kill: number; letter: string; slot: Vec; cut: number; gear: Gear }
/** How a figure is dressed. */
type Look = { hat: 'kasa' | Gear; hakama?: boolean; scarf?: boolean; scabbard?: boolean; armour?: boolean }
/** A drawn blade's state: blood on it (0–1), the sun's reflection running along it (0–1 from guard to tip, outside
 * that none) and how bright, a star of light at its tip (0–1); `turn` is how it is turned about the upright (1 as
 * drawn, -1 turned right round, between: foreshortened); `reach` how much of it is out of the saya (from the hand);
 * `pull` how far the left hand has drawn the saya back. */
type Blade = { blood: number; glint: number; shine: number; star: number; turn: number; reach: number; pull: number }
/** A letter painted in the heavy face, as a cached sprite: its size, and where its baseline centre is. */
type Sprite = { canvas: HTMLCanvasElement; shade: HTMLCanvasElement | null; w: number; h: number; ascent: number; pad: number; size: number }
type Glyph = { char: string; x: number; size: number; width: number; initial: number }

const ENEMIES: Enemy[] = [
  { start: 1400, stop: 820, phase: 0, kill: BEATS.kills[0], letter: 'S', slot: [450, 420], cut: 0.55, gear: 'kabuto' },
  { start: 1560, stop: 960, phase: 1.9, kill: BEATS.kills[1], letter: 'G', slot: [800, 420], cut: 0.4, gear: 'topknot' },
  { start: 1730, stop: 1100, phase: 3.4, kill: BEATS.kills[2], letter: 'S', slot: [1150, 420], cut: 1, gear: 'jingasa' },
]
const SAMURAI: Look = { hat: 'kasa', hakama: true, scarf: true, scabbard: true }
const SAM_FROM = 470, SAM_TO = 1270
const STILL: Blade = { blood: 0, glint: -1, shine: 0.95, star: 0, turn: 1, reach: Infinity, pull: 0 }
const TITLE = ['SLEEPING', 'GIANT', 'STUDIOS']
/** The title card: the ring (and logo) centred here, kept below the cinemascope bars; the name under it, set on
 * NAME_BASE; the motto under that, "awaken the warrior within", and in English under it. */
const SUN_Y = 318, SUN_R = 184, TITLE_SIZE = 96, NAME_BASE = 632, NAME_WIDTH = 1120
const MOTTO = '内なる武士を呼び覚ませ', MOTTO_EN = 'AWAKEN THE WARRIOR WITHIN', MOTTO_Y = 694
/** The initials stand this much bigger than the rest of the name. */
const INITIAL_SCALE = 1.5
/** The blood letters are painted once at this size and scaled. */
const LETTER_SIZE = 300

export class IdentFilm {
  private ctx: CanvasRenderingContext2D
  private logo: HTMLImageElement | null = null
  private drops: Drop[] = []
  private pools: Pool[] = []
  private splats: Splat[] = []
  private simTime = 0
  private rng = random(7)
  private spawned = new Set<string>()
  private glyphs: Glyph[] = []
  private sprites = new Map<string, Sprite>()
  private backdrop: { canvas: HTMLCanvasElement; res: number } | null = null
  private grain: CanvasPattern | null = null
  private scratch: HTMLCanvasElement | null = null
  /** Device pixels per stage unit this frame (what cached paintings are made at). */
  private res = 1
  /** Which pass a figure is being drawn in: its shadow, its sunlit rim, or itself. */
  private pass: 'shadow' | 'rim' | 'ink' = 'ink'

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    const logo = new Image()
    logo.src = logoUrl
    void logo.decode().then(() => { this.logo = logo }, () => {})
    // Once each font is in, the name is laid out and its letters painted again in it.
    for (const [family, url] of FONTS) {
      if ([...document.fonts].some(face => face.family === family)) continue
      const face = new FontFace(family, `url(${url})`)
      document.fonts.add(face)
      void face.load().then(() => { this.glyphs = []; this.sprites.clear() }, () => {})
    }
  }

  /** The logo decoded (the logo phase waits for nothing, but a test can). */
  get ready() { return !!this.logo }

  private reset() {
    this.drops = []; this.pools = []; this.splats = []; this.simTime = 0; this.rng = random(7); this.spawned.clear()
  }

  // ------------------------------------------------------------------ the fight

  /** Where an enemy is and how he stands at time t. */
  private enemyAt(enemy: Enemy, t: number) {
    const run = clamp01((t - BEATS.smash) / (BEATS.dash - BEATS.smash))
    // They charge, slowing as they come; once the samurai draws, time nearly stops for them.
    const slow = t > BEATS.dash ? (t - BEATS.dash) * 0.08 : 0
    const x = lerp(enemy.start, enemy.stop, easeOut(run)) - slow * 60
    const phase = enemy.phase + Math.min(t, BEATS.dash) * 13 + slow * 13
    return { x, pose: runPose(phase) }
  }

  /** Where the sword went through him, in his own frame. */
  private cutAt(enemy: Enemy, pose: Pose): Vec {
    return enemy.cut >= 1 ? lerpV(pose.neck, pose.head, 0.35) : lerpV(pose.hip, pose.neck, enemy.cut)
  }

  /** The part cut off (the upper body, or the head), u seconds after the cut: its drift, fall and spin about the cut. */
  private severed(enemy: Enemy, cut: Vec, u: number) {
    const f = Math.min(u, 0.9)
    if (enemy.cut >= 1) return { dx: -150 * f, dy: Math.min(-430 * f + 1500 * f * f, -cut[1] - 16), spin: -10 * Math.min(f, 0.5) }
    return { dx: -70 * f, dy: Math.min(-160 * f + 1500 * f * f, -cut[1] - 40), spin: -2.2 * Math.min(f, 0.45) }
  }

  /** What is left standing, u seconds after the cut: it stands a moment, then buckles (or, headless, topples). */
  private slump(enemy: Enemy, u: number) {
    if (enemy.cut >= 1) { const fold = u > 0.7 ? ease((u - 0.7) / 0.45) : 0; return { tx: fold * 8, ty: fold * 6, angle: fold * 1.3 } }
    const fold = u > 0.35 ? ease((u - 0.35) / 0.4) : 0
    return { tx: 0, ty: fold * 40, angle: fold * 0.5 }
  }

  /** The stump left standing, in stage coordinates, and which way it points (where the geyser goes). */
  private stump(enemy: Enemy, x: number, pose: Pose, cut: Vec, u: number): { at: Vec; angle: number } {
    const { tx, ty, angle } = this.slump(enemy, u)
    const c = Math.cos(angle), s = Math.sin(angle)
    const q: Vec = [tx + c * cut[0] - s * cut[1], ty + s * cut[0] + c * cut[1]]
    const [from, to] = enemy.cut >= 1 ? [pose.neck, pose.head] : [pose.hip, pose.neck]
    const ax = to[0] - from[0], ay = to[1] - from[1]
    // He faces left, so his frame is mirrored.
    return { at: [x - q[0], GROUND + q[1]], angle: Math.atan2(s * ax + c * ay, -(c * ax - s * ay)) }
  }

  private spawnDrop(x: number, y: number, angle: number, speed: number, r: number, mist = false) {
    this.drops.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, mist, life: mist ? 0.45 : 3, dark: this.rng() < 0.5 })
  }

  /** Blood thrown at the lens from `direction` (radians): it lands heavy and flings streaks on the way it was going. */
  private splat(x: number, y: number, r: number, at: number, direction: number) {
    const rng = this.rng
    const blobs = Array.from({ length: 6 + Math.floor(rng() * 4) }, (): [number, number, number] => {
      const a = rng() * Math.PI * 2, d = r * rng() * 0.45
      return [Math.cos(a) * d, Math.sin(a) * d, r * (0.32 + rng() * 0.36)]
    })
    const streaks = Array.from({ length: 7 + Math.floor(rng() * 6) }, (): [number, number, number] => [direction + (rng() - 0.5) * 1.3, r * (1.3 + rng() * 2.4), r * (0.06 + rng() * 0.1)])
    const drips = Array.from({ length: 1 + Math.floor(rng() * 2) }, (): [number, number, number] => [(rng() - 0.5) * r * 0.9, r * (0.12 + rng() * 0.1), 50 + rng() * 120])
    const dots = Array.from({ length: 10 + Math.floor(rng() * 10) }, (): [number, number, number] => {
      const a = direction + (rng() - 0.5) * 2.2, d = r * (1.2 + rng() * 2.6)
      return [Math.cos(a) * d, Math.sin(a) * d, r * (0.025 + rng() * 0.07)]
    })
    this.splats.push({ x, y, r, at, blobs, streaks, drips, dots })
  }

  /** One fixed step of the blood: emitters for this moment, then every drop flies, falls and lands. */
  private step(t: number, dt: number) {
    const rng = this.rng
    for (const [index, enemy] of ENEMIES.entries()) {
      const u = t - enemy.kill
      if (u < 0 || u > 1.4) continue
      const { x, pose } = this.enemyAt(enemy, enemy.kill)
      const cut = this.cutAt(enemy, pose)
      const { at: [sx, sy], angle } = this.stump(enemy, x, pose, cut, u)
      if (!this.spawned.has(`burst${index}`)) {
        this.spawned.add(`burst${index}`)
        // The instant of the cut: a burst every way, a red mist, and blood thrown at the lens.
        for (let i = 0; i < 130; i++) this.spawnDrop(sx, sy, rng() * Math.PI * 2, 300 + rng() * 900, 1.5 + rng() * 2.8)
        for (let i = 0; i < 10; i++) this.spawnDrop(sx, sy, -Math.PI / 2 + (rng() - 0.5) * 2.4, 120 + rng() * 260, 16 + rng() * 22, true)
        // One splat on the lens per cut, kept clear of the letters: top left, top right, then top middle.
        const [lx, ly, direction] = ([[180 + rng() * 140, 150 + rng() * 80, 0.5], [1330 + rng() * 120, 140 + rng() * 80, 2.6], [990 + rng() * 80, 120 + rng() * 50, 1.2]] as [number, number, number][])[index]
        this.splat(lx, ly, 34 + rng() * 18, t, direction)
      }
      // The geyser from the stump: arterial spurts in pulses, dying away; the beheaded one's is the worst.
      const pulse = 0.5 + 0.5 * Math.max(0, Math.sin(u * 20))
      const rate = 650 * (enemy.cut >= 1 ? 1.3 : 1) * Math.pow(Math.max(0, 1 - u / 1.4), 1.5) * pulse
      for (let i = 0, n = Math.floor(rate * dt + rng()); i < n; i++) {
        this.spawnDrop(sx, sy, angle + (rng() - 0.5) * 0.45, (700 + rng() * 900) * (1 - u * 0.5), 1.5 + rng() * 3.2)
      }
      // The severed part bleeds as it flies.
      if (u < 0.6) {
        const piece = this.severed(enemy, cut, u)
        const px = x - (cut[0] + piece.dx), py = GROUND + cut[1] + piece.dy
        for (let i = 0, n = Math.floor(260 * dt + rng()); i < n; i++) this.spawnDrop(px, py, rng() * Math.PI * 2, 80 + rng() * 260, 1.2 + rng() * 2.4)
      }
    }
    // Chiburi: the blood snapped off the whole length of the blade, thrown down in a line across the ground.
    if (t >= BEATS.flick + 0.04 && !this.spawned.has('chiburi')) {
      this.spawned.add('chiburi')
      const [hx, hy] = SAM_FLICK.rHand, a = SAM_FLICK.sword
      for (let i = 0; i < 70; i++) {
        const d = 20 + rng() * (SAM_BLADE - 20)
        this.spawnDrop(SAM_TO + hx + Math.cos(a) * d, GROUND + hy + Math.sin(a) * d, 0.75 + rng() * 0.5, 400 + rng() * 800 * (d / SAM_BLADE), 1.6 + rng() * 2.6)
      }
    }
    const drag = Math.max(0, 1 - dt * 0.35)
    this.drops = this.drops.filter(drop => {
      drop.life -= dt
      if (drop.life <= 0) return false
      drop.vy += (drop.mist ? 300 : 2500) * dt
      drop.vx *= drop.mist ? Math.max(0, 1 - dt * 3) : drag
      drop.x += drop.vx * dt; drop.y += drop.vy * dt
      if (drop.mist) { drop.r += 40 * dt; return true }
      if (drop.y >= GROUND) {
        // Landed: it pools on the ground, spread along it.
        if (this.pools.length < 900) this.pools.push({ x: drop.x, w: drop.r * (2.5 + Math.min(4, Math.abs(drop.vx) / 260)), h: drop.r * 0.55 })
        return false
      }
      return drop.x > -200 && drop.x < W + 200
    })
  }

  private simulate(t: number) {
    if (t < this.simTime) this.reset()
    const dt = 1 / 120
    while (this.simTime + dt <= t) { this.simTime += dt; this.step(this.simTime, dt) }
  }

  // ------------------------------------------------------------------ the frame

  /** Draw the film at time t (seconds). The canvas is resized to the screen first. */
  draw(t: number) {
    const canvas = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1)
    const vw = canvas.clientWidth || innerWidth, vh = canvas.clientHeight || innerHeight
    if (canvas.width !== Math.round(vw * dpr) || canvas.height !== Math.round(vh * dpr)) { canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr) }
    this.simulate(Math.min(t, BEATS.black + 0.5))
    const ctx = this.ctx
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
    // The stage is fitted inside the screen; the backgrounds fill all of it.
    const s = Math.min(vw / W, vh / H), ox = (vw - W * s) / 2, oy = (vh - H * s) / 2
    this.res = Math.min(2.5, Math.max(0.5, Math.round(s * dpr * 1.05 * 4) / 4))
    const duel = t >= BEATS.smash && t < BEATS.black
    // The duel's world is painted ahead of the cut to it (during the epigraph), so the cut never stutters.
    if (t < BEATS.black && this.backdrop?.res !== this.res) this.paintBackdrop(this.res)
    ctx.fillStyle = duel ? '#140303' : '#050303'
    ctx.fillRect(0, 0, vw, vh)
    // The camera: hits shake it; it pushes slowly in on each scene.
    const [shakeX, shakeY] = this.shake(t)
    // During the sheathing it closes in, slowly, on his hands.
    const close = duel ? ease((t - BEATS.turn) / (BEATS.click - BEATS.turn)) : 0
    const push = duel ? (1 + 0.035 * ease((t - BEATS.smash) / 1.8)) * (1 + 0.6 * close) : t >= BEATS.black ? 1 + 0.04 * ease((t - BEATS.black) / 3) : 1
    const focus: Vec = [lerp(W / 2, SAM_TO + 40, close), lerp(H / 2, GROUND - 160, close)]
    ctx.save()
    ctx.translate(ox + W * s / 2 + shakeX * s, oy + H * s / 2 + shakeY * s)
    ctx.scale(s * push, s * push)
    ctx.translate(-focus[0], -focus[1])
    if (t < BEATS.smash) this.drawEpigraph(t)
    else if (duel) this.drawDuel(t)
    else this.drawTitle(t)
    ctx.restore()
    if (duel) {
      // What is on the lens, not in the world: the camera's push does not touch it.
      ctx.save()
      ctx.translate(ox + shakeX * s, oy + shakeY * s); ctx.scale(s, s)
      this.drawLens(t)
      ctx.restore()
    }
    this.drawFlashes(t, vw, vh)
    this.grade(t, vw, vh)
    // Cinemascope bars.
    const bar = Math.max(0, (vh - vw / 2.39) / 2)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, vw, bar); ctx.fillRect(0, vh - bar, vw, bar)
    // The fade into the game.
    if (t > BEATS.fade) { ctx.fillStyle = `rgba(0,0,0,${ease((t - BEATS.fade) / (DURATION - BEATS.fade))})`; ctx.fillRect(0, 0, vw, vh) }
  }

  private shake(t: number): Vec {
    const hits: [number, number][] = [[BEATS.smash, 10], [BEATS.dash, 8], ...BEATS.kills.map((kill, i): [number, number] => [kill, 16 + i * 5]),
      [BEATS.flick, 6], [BEATS.click, 4], [BEATS.write + 0.35, 9], [BEATS.emblem + 0.05, 12], [BEATS.slash + 0.06, 15], [BEATS.seal, 8]]
    let x = 0, y = 0
    for (const [at, strength] of hits) {
      const u = t - at
      if (u < 0 || u > 0.45) continue
      const fall = Math.pow(1 - u / 0.45, 2) * strength
      x += Math.sin(u * 97 + at * 13) * fall; y += Math.cos(u * 83 + at * 7) * fall
    }
    return [x, y]
  }

  /** The grade over everything: a heavy vignette and fine film grain. */
  private grade(t: number, vw: number, vh: number) {
    const ctx = this.ctx
    const vignette = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.62)
    vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,0.8)')
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, vw, vh)
    if (!this.grain) {
      const tile = document.createElement('canvas')
      tile.width = tile.height = 256
      const g = tile.getContext('2d')!, image = g.createImageData(256, 256)
      for (let i = 0; i < image.data.length; i += 4) { const v = Math.random() * 255; image.data[i] = image.data[i + 1] = image.data[i + 2] = v; image.data[i + 3] = 255 }
      g.putImageData(image, 0, 0)
      this.grain = ctx.createPattern(tile, 'repeat')
    }
    if (!this.grain) return
    // The grain moves on 24 times a second, like film.
    const frame = Math.floor(t * 24), dx = (frame * 97) % 256, dy = (frame * 61) % 256
    ctx.save()
    ctx.globalAlpha = 0.07; ctx.globalCompositeOperation = 'overlay'
    ctx.translate(-dx, -dy); ctx.fillStyle = this.grain; ctx.fillRect(0, 0, vw + 256, vh + 256)
    ctx.restore()
  }

  /** Paint something through a scratch layer at full strength, then lay the layer down at `alpha` (so overlapping
   * shapes in it do not darken where they overlap). */
  private faded(alpha: number, paint: () => void) {
    const main = this.ctx
    const scratch = this.scratch ??= document.createElement('canvas')
    if (scratch.width !== this.canvas.width || scratch.height !== this.canvas.height) { scratch.width = this.canvas.width; scratch.height = this.canvas.height }
    const g = scratch.getContext('2d')!
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, scratch.width, scratch.height)
    g.setTransform(main.getTransform())
    this.ctx = g
    try { paint() } finally { this.ctx = main }
    main.save()
    main.setTransform(1, 0, 0, 1, 0, 0); main.globalAlpha = alpha
    main.drawImage(scratch, 0, 0)
    main.restore()
  }

  private drawEpigraph(t: number) {
    const ctx = this.ctx
    const alpha = ease((t - 0.12) / 0.22) * (1 - ease((t - 0.86) / 0.2))
    if (alpha <= 0) return
    ctx.globalAlpha = alpha
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = BONE
    ctx.font = `400 64px ${BRUSH}`
    ctx.fillText('「眠れる巨人は、目を覚ます。」', W / 2, 405)
    ctx.fillStyle = '#8f877b'
    ctx.font = `400 24px ${HEAVY}`
    this.tracked('THE SLEEPING GIANT AWAKENS', W / 2, 486, 9)
    ctx.globalAlpha = 1
  }

  /** Text with letter spacing, centred on x. Returns its width. */
  private tracked(text: string, x: number, y: number, spacing: number) {
    const ctx = this.ctx
    const widths = [...text].map(char => ctx.measureText(char).width)
    const width = widths.reduce((a, b) => a + b, 0) + spacing * (widths.length - 1)
    let cursor = x - width / 2
    ctx.textAlign = 'left'
    for (const [i, char] of [...text].entries()) { ctx.fillText(char, cursor, y); cursor += widths[i] + spacing }
    ctx.textAlign = 'center'
    return width
  }

  // ------------------------------------------------------------------ the duel's world

  /** The duel's world, painted once per resolution: a black-red sky, the blood-red sun and its rays, clouds, three
   * ranges of hills going into the haze, a torii and grave posts, a dead tree and a pine, the war banners and the swords
   * of the dead stuck in the ground, and the ground with the sun's glare on it. */
  private paintBackdrop(res: number) {
    const canvas = this.backdrop?.canvas ?? document.createElement('canvas')
    canvas.width = Math.ceil(BACK.w * res); canvas.height = Math.ceil(BACK.h * res)
    const g = canvas.getContext('2d')!
    g.setTransform(res, 0, 0, res, -BACK.x * res, -BACK.y * res)
    const left = BACK.x, right = BACK.x + BACK.w, top = BACK.y, bottom = BACK.y + BACK.h
    const rng = random(5)
    // The sky: black overhead, through dried blood, to a smouldering red at the horizon.
    const sky = g.createLinearGradient(0, top, 0, GROUND)
    sky.addColorStop(0, '#030000'); sky.addColorStop(0.32, '#120202'); sky.addColorStop(0.56, '#360604'); sky.addColorStop(0.76, '#701007')
    sky.addColorStop(0.9, '#a8260c'); sky.addColorStop(1, '#d24a1c')
    g.fillStyle = sky; g.fillRect(left, top, BACK.w, GROUND - top)
    const glow = g.createRadialGradient(SUN[0], SUN[1], SUN_RADIUS * 0.8, SUN[0], SUN[1], 1100)
    glow.addColorStop(0, 'rgba(230,70,30,0.5)'); glow.addColorStop(0.3, 'rgba(160,24,10,0.2)'); glow.addColorStop(1, 'rgba(120,10,4,0)')
    g.fillStyle = glow; g.fillRect(left, top, BACK.w, GROUND - top)
    // Rays fanning up from the sun.
    g.save()
    g.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 24; i++) {
      const a = Math.PI + 0.1 + rng() * (Math.PI - 0.2), spread = 0.01 + rng() * 0.035, reach = 900 + rng() * 800
      const ray = g.createRadialGradient(SUN[0], SUN[1], SUN_RADIUS * 0.9, SUN[0], SUN[1], reach)
      ray.addColorStop(0, `rgba(255,90,50,${0.04 + rng() * 0.06})`); ray.addColorStop(1, 'rgba(200,40,20,0)')
      g.fillStyle = ray
      g.beginPath(); g.moveTo(SUN[0], SUN[1]); g.arc(SUN[0], SUN[1], reach, a - spread, a + spread); g.closePath(); g.fill()
    }
    g.restore()
    // The sun.
    const disc = g.createRadialGradient(SUN[0], SUN[1] - 30, 0, SUN[0], SUN[1], SUN_RADIUS)
    disc.addColorStop(0, '#ffc89a'); disc.addColorStop(0.4, '#ff7e48'); disc.addColorStop(0.85, '#d2300e'); disc.addColorStop(1, '#a4170a')
    g.fillStyle = disc; g.beginPath(); g.arc(SUN[0], SUN[1], SUN_RADIUS, 0, Math.PI * 2); g.fill()
    // Long thin clouds, dark against the light, their undersides lit by the sun.
    for (let i = 0; i < 18; i++) {
      const cy = 170 + Math.pow(rng(), 0.7) * 440, cx = left + rng() * BACK.w, length = 260 + rng() * 820, thick = 3 + rng() * 10
      const near = 1 - Math.min(1, Math.hypot(cx - SUN[0], (cy - SUN[1]) * 2) / 1000)
      for (let k = 0; k < 6; k++) {
        g.fillStyle = `rgba(10,1,1,${0.14 + rng() * 0.16})`
        g.beginPath(); g.ellipse(cx + (rng() - 0.5) * length * 0.5, cy + (rng() - 0.5) * thick, length * (0.25 + rng() * 0.35), thick * (0.5 + rng() * 0.7), 0, 0, Math.PI * 2); g.fill()
      }
      g.fillStyle = `rgba(255,90,50,${0.05 + near * 0.28})`
      g.beginPath(); g.ellipse(cx, cy + thick * 0.8, length * 0.33, Math.max(1, thick * 0.22), 0, 0, Math.PI * 2); g.fill()
    }
    // The hills: each range nearer, darker and sharper, with the haze between them.
    const height = (seed: number, x: number) => {
      const r = random(seed), phases = Array.from({ length: 5 }, () => r() * 100)
      let n = 0, amp = 1, freq = 1 / 420
      for (const phase of phases) { n += Math.sin(x * freq + phase) * amp; amp *= 0.5; freq *= 2.13 }
      return 0.5 + n / 3.8
    }
    const range = (seed: number, base: number, rise: number, color: string) => {
      g.fillStyle = color
      g.beginPath(); g.moveTo(left, GROUND + 2)
      for (let x = left; x <= right; x += 5) g.lineTo(x, GROUND - base - rise * height(seed, x))
      g.lineTo(right, GROUND + 2); g.closePath(); g.fill()
    }
    const haze = (from: number, color: string) => {
      const band = g.createLinearGradient(0, from, 0, GROUND)
      band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(1, color)
      g.fillStyle = band; g.fillRect(left, from, BACK.w, GROUND - from)
    }
    range(11, 50, 130, '#4c120a')
    haze(GROUND - 230, 'rgba(210,60,28,0.3)')
    range(12, 14, 80, '#220605')
    const mid = (x: number) => GROUND - 14 - 80 * height(12, x) + 4
    this.torii(g, 236, mid(236), 0.95, '#1c0504')
    // Grave posts on the ridge by the torii.
    g.fillStyle = '#1c0504'
    for (const [gx, gh] of [[96, 46], [118, 38], [352, 52], [374, 34], [398, 44], [-40, 40]] as Vec[]) {
      const base = mid(gx) + 4
      g.beginPath(); g.moveTo(gx - 4, base); g.lineTo(gx - 4, base - gh); g.lineTo(gx, base - gh - 6); g.lineTo(gx + 4, base - gh); g.lineTo(gx + 4, base); g.closePath(); g.fill()
    }
    haze(GROUND - 120, 'rgba(190,40,18,0.16)')
    range(13, 0, 26, '#090202')
    this.pine(g, 1560, GROUND + 4, 310, 0.14, random(21))
    this.deadTree(g, -40, GROUND + 4, 320, random(23))
    // The ground: lit where it meets the light, falling away into the dark at our feet.
    const ground = g.createLinearGradient(0, GROUND, 0, bottom)
    ground.addColorStop(0, '#2e0c07'); ground.addColorStop(0.035, '#140504'); ground.addColorStop(0.22, '#070202'); ground.addColorStop(1, '#020101')
    g.fillStyle = ground; g.fillRect(left, GROUND, BACK.w, bottom - GROUND)
    g.save()
    g.translate(SUN[0], GROUND + 4); g.scale(1, 0.07)
    const glare = g.createRadialGradient(0, 0, 0, 0, 0, 560)
    glare.addColorStop(0, 'rgba(255,90,50,0.4)'); glare.addColorStop(1, 'rgba(200,40,20,0)')
    g.fillStyle = glare; g.beginPath(); g.arc(0, 0, 560, 0, Math.PI * 2); g.fill()
    g.restore()
    // Stones and tufts, smaller towards the horizon, their tops catching the light.
    for (let i = 0; i < 320; i++) {
      const depth = Math.pow(rng(), 1.8), y = GROUND + 3 + depth * 200, size = 1 + depth * 7, x = left + rng() * BACK.w
      g.fillStyle = 'rgba(0,0,0,0.55)'
      g.beginPath(); g.ellipse(x, y, size * 2.2, size * 0.55, 0, 0, Math.PI * 2); g.fill()
      g.fillStyle = `rgba(255,80,40,${0.04 + (1 - depth) * 0.1})`
      g.beginPath(); g.ellipse(x, y - size * 0.4, size * 1.5, size * 0.2, 0, 0, Math.PI * 2); g.fill()
    }
    // The battlefield's dead: their swords stuck in the earth, and their tattered banners.
    this.banner(g, 360, GROUND + 6, 250, random(31))
    this.banner(g, 1450, GROUND + 4, 220, random(32))
    for (const [sx, sy, lean, length] of [[40, 712, -0.25, 96], [110, 726, 0.18, 84], [190, 708, -0.08, 104], [262, 734, 0.3, 76], [1420, 716, 0.22, 92], [1525, 730, -0.2, 88], [1585, 712, 0.1, 100]] as [number, number, number, number][]) {
      this.grave(g, sx, sy, lean, length)
    }
    this.backdrop = { canvas, res }
  }

  /** A dead tree: a gnarled trunk splitting into bare, crooked branches. */
  private deadTree(g: CanvasRenderingContext2D, x: number, y: number, h: number, rng: () => number) {
    g.strokeStyle = '#070101'; g.lineCap = 'round'
    const branch = (bx: number, by: number, angle: number, length: number, width: number, depth: number) => {
      const ex = bx + Math.cos(angle) * length, ey = by + Math.sin(angle) * length
      g.lineWidth = width
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo((bx + ex) / 2 + (rng() - 0.5) * length * 0.4, (by + ey) / 2 + (rng() - 0.5) * length * 0.3, ex, ey); g.stroke()
      if (depth === 0) return
      for (let i = 0, n = rng() < 0.35 ? 3 : 2; i < n; i++) branch(ex, ey, angle + (rng() - 0.5) * 1.4, length * (0.58 + rng() * 0.2), width * 0.62, depth - 1)
    }
    branch(x, y, -Math.PI / 2 + 0.22, h * 0.4, h * 0.07, 6)
  }

  /** A nobori war banner on its pole, torn and holed, hanging still. */
  private banner(g: CanvasRenderingContext2D, x: number, y: number, h: number, rng: () => number) {
    g.fillStyle = '#080101'
    g.fillRect(x - 2.5, y - h, 5, h)
    g.fillRect(x - 2, y - h + 4, 46, 4)
    const top = y - h + 6, width = 40, length = h * 0.62
    g.beginPath(); g.moveTo(x + 2, top); g.lineTo(x + 2 + width, top)
    // The ragged edge and torn foot.
    for (let k = 1; k <= 8; k++) g.lineTo(x + 2 + width - rng() * 6, top + length * k / 8)
    for (let k = 1; k <= 6; k++) g.lineTo(x + 2 + width - width * k / 6, top + length + (rng() - 0.3) * 22)
    g.closePath(); g.fill()
    g.save(); g.globalCompositeOperation = 'destination-out'
    for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(x + 10 + rng() * 26, top + 20 + rng() * length * 0.8, 2 + rng() * 5, 3 + rng() * 7, rng(), 0, Math.PI * 2); g.fill() }
    g.restore()
    // Its crest, a dull red disc.
    g.fillStyle = 'rgba(120,14,8,0.6)'
    g.beginPath(); g.arc(x + 2 + width / 2, top + length * 0.28, width * 0.26, 0, Math.PI * 2); g.fill()
  }

  /** A dead man's katana stuck in the ground. */
  private grave(g: CanvasRenderingContext2D, x: number, y: number, lean: number, length: number) {
    g.save()
    g.translate(x, y); g.rotate(lean)
    g.fillStyle = '#060101'
    g.beginPath(); g.moveTo(-2, 0); g.lineTo(-2.4, -length); g.lineTo(2.4, -length); g.lineTo(2, 0); g.closePath(); g.fill()
    g.beginPath(); g.ellipse(0, -length, 9, 2.6, 0, 0, Math.PI * 2); g.fill()
    g.fillRect(-2.8, -length - 34, 5.6, 34)
    g.fillStyle = 'rgba(255,90,50,0.35)'
    g.fillRect(1.2, -length + 6, 0.9, length - 10)
    g.restore()
  }

  private torii(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
    g.save()
    g.translate(x, y); g.scale(s, s)
    g.fillStyle = color
    g.fillRect(-42, -112, 9, 112); g.fillRect(33, -112, 9, 112)
    // The kasagi, its ends swept up; the shimaki under it; the nuki through the pillars; the plaque between.
    g.beginPath(); g.moveTo(-70, -128); g.quadraticCurveTo(0, -112, 70, -128); g.lineTo(66, -117); g.quadraticCurveTo(0, -104, -66, -117); g.closePath(); g.fill()
    g.fillRect(-58, -110, 116, 7)
    g.fillRect(-54, -84, 108, 7)
    g.fillRect(-4, -104, 8, 22)
    g.restore()
  }

  /** A Japanese pine: a leaning trunk and flat pads of needles on its branches. */
  private pine(g: CanvasRenderingContext2D, x: number, y: number, h: number, lean: number, rng: () => number) {
    g.fillStyle = '#100403'
    const top: Vec = [x + lean * h, y - h]
    g.beginPath()
    g.moveTo(x - h * 0.05, y); g.quadraticCurveTo(x + lean * h * 0.2 - h * 0.04, y - h * 0.5, top[0] - h * 0.012, top[1])
    g.lineTo(top[0] + h * 0.012, top[1]); g.quadraticCurveTo(x + lean * h * 0.2 + h * 0.04, y - h * 0.5, x + h * 0.05, y)
    g.closePath(); g.fill()
    for (let k = 0; k < 7; k++) {
      const along = 0.42 + k * 0.09, at: Vec = [lerp(x, top[0], along), lerp(y, top[1], along)]
      const side = k % 2 ? 1 : -1, reach = h * (0.14 + rng() * 0.2) * (1 - along * 0.5)
      const pad: Vec = [at[0] + side * reach, at[1] - h * 0.04]
      g.strokeStyle = '#100403'; g.lineWidth = h * 0.014; g.lineCap = 'round'
      g.beginPath(); g.moveTo(...at); g.quadraticCurveTo(at[0] + side * reach * 0.5, at[1] + h * 0.02, ...pad); g.stroke()
      for (let j = 0; j < 4; j++) {
        g.beginPath(); g.ellipse(pad[0] + (rng() - 0.5) * reach * 0.8, pad[1] - rng() * h * 0.02, reach * (0.4 + rng() * 0.3), h * (0.025 + rng() * 0.02), 0, 0, Math.PI * 2); g.fill()
      }
    }
  }

  private drawDuel(t: number) {
    const ctx = this.ctx
    if (this.backdrop) ctx.drawImage(this.backdrop.canvas, BACK.x, BACK.y, BACK.w, BACK.h)
    this.crows(t)
    this.embers(t, 36, 3, -200, 140, 2000, 520, 0.7)
    this.dust(t)
    // Everyone's long shadow, thrown at us by the sun behind them.
    this.faded(0.55, () => { for (const enemy of ENEMIES) this.drawEnemy(enemy, t, 'shadow'); this.drawSamurai(t, 'shadow') })
    // Blood on the ground: what fell, and what spreads from the bodies.
    for (const enemy of ENEMIES) {
      const u = t - enemy.kill - 0.3
      if (u <= 0) continue
      const { x } = this.enemyAt(enemy, enemy.kill), rx = 120 * easeOut(u / 1.6)
      ctx.fillStyle = '#2a0100'
      ctx.beginPath(); ctx.ellipse(x + 10, GROUND + 4, rx, rx * 0.09, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255,150,90,0.22)'
      ctx.beginPath(); ctx.ellipse(x + 10, GROUND + 2, rx * 0.8, 1.2, 0, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = '#3a0201'
    for (const pool of this.pools) { ctx.beginPath(); ctx.ellipse(pool.x, GROUND + 3, pool.w, pool.h, 0, 0, Math.PI * 2); ctx.fill() }
    // The swordsmen, charging, then cut apart; the samurai.
    for (const enemy of ENEMIES) this.drawEnemy(enemy, t, 'lit')
    this.drawSamurai(t, 'lit')
    this.cutLight(t)
    // The blood in the air: dark against the sun, the bigger drops wet and catching it.
    for (const drop of this.drops) {
      if (drop.mist) {
        ctx.fillStyle = `rgba(100,5,2,${0.2 * Math.max(0, drop.life / 0.45)})`
        ctx.beginPath(); ctx.arc(drop.x, drop.y, drop.r, 0, Math.PI * 2); ctx.fill()
        continue
      }
      const speed = Math.hypot(drop.vx, drop.vy)
      ctx.fillStyle = drop.dark ? '#4e0301' : '#8c0905'
      ctx.beginPath(); ctx.ellipse(drop.x, drop.y, drop.r * (1 + Math.min(4, speed / 380)), drop.r, Math.atan2(drop.vy, drop.vx), 0, Math.PI * 2); ctx.fill()
      if (drop.r > 2.8) {
        ctx.fillStyle = 'rgba(255,160,120,0.4)'
        ctx.beginPath(); ctx.arc(drop.x - drop.r * 0.3, drop.y - drop.r * 0.3, drop.r * 0.3, 0, Math.PI * 2); ctx.fill()
      }
    }
    // A low mist along the ground, lit by the sun; the grass at our feet; embers drifting past the lens.
    const fog = ctx.createLinearGradient(0, GROUND - 60, 0, GROUND + 50)
    fog.addColorStop(0, 'rgba(200,60,40,0)'); fog.addColorStop(0.55, 'rgba(200,60,40,0.14)'); fog.addColorStop(1, 'rgba(200,60,40,0)')
    ctx.fillStyle = fog; ctx.fillRect(BACK.x, GROUND - 60, BACK.w, 110)
    this.grass(t)
    this.embers(t, 26, 4, -200, 120, 2000, 700, 1.6)
  }

  /** Over the duel, on the lens: the giant blood letters, one per cut (they fade as the camera closes in on the
   * sheathing), and the blood that hit the lens. */
  private drawLens(t: number) {
    const ctx = this.ctx
    ctx.globalAlpha = 1 - ease((t - BEATS.turn) / 0.45)
    if (ctx.globalAlpha > 0) for (const enemy of ENEMIES) if (t >= enemy.kill) this.drawBloodLetter(enemy.letter, enemy.slot[0], enemy.slot[1], LETTER_SIZE, t - enemy.kill)
    ctx.globalAlpha = 1
    for (const splat of this.splats) this.drawSplat(splat, t)
  }

  /** Crows crossing the red sky, wings beating. */
  private crows(t: number) {
    const ctx = this.ctx
    const rng = random(55)
    ctx.fillStyle = '#060101'
    for (let i = 0; i < 8; i++) {
      const x0 = rng() * 2300 - 200, y0 = 150 + rng() * 210, speed = 35 + rng() * 45, size = 6 + rng() * 6, phase = rng() * 7
      const x = x0 - t * speed, y = y0 + Math.sin(t * 1.3 + phase) * 8, flap = Math.sin(t * 8 + phase)
      ctx.beginPath(); ctx.ellipse(x, y, size * 1.15, size * 0.33, 0.05, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(x - size * 1.1, y - size * 0.12, size * 0.32, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.moveTo(x + size * 1.1, y); ctx.lineTo(x + size * 1.9, y - size * 0.25); ctx.lineTo(x + size * 1.9, y + size * 0.25); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(x - size * 0.4, y); ctx.quadraticCurveTo(x - size * 0.2, y - size * 1.6 * flap, x + size * 0.6, y - size * 2 * flap); ctx.lineTo(x + size * 0.5, y); ctx.closePath(); ctx.fill()
    }
  }

  /** Embers riding the wind, flickering: `count` of them in the box, at `scale`. */
  private embers(t: number, count: number, seed: number, x: number, y: number, w: number, h: number, scale: number) {
    const ctx = this.ctx
    const rng = random(seed)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < count; i++) {
      const x0 = rng() * w, y0 = rng() * h, speed = (25 + rng() * 60) * scale, size = (0.7 + rng() * 1.8) * scale, phase = rng() * 10, green = 110 + Math.floor(rng() * 90)
      const ey = y + ((y0 - t * speed) % h + h) % h
      const ex = x + ((x0 - t * speed * 0.7 + Math.sin(t * 1.4 + phase) * 16) % w + w) % w
      const flicker = 0.5 + 0.5 * Math.sin(t * 11 + phase * 3)
      ctx.fillStyle = `rgba(255,${green},50,${0.3 + 0.55 * flicker})`
      ctx.beginPath(); ctx.arc(ex, ey, size, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }

  /** Dust kicked up and lit from behind: trailing the charging men, and hanging where the samurai crossed. */
  private dust(t: number) {
    const ctx = this.ctx
    ctx.save()
    for (const enemy of ENEMIES) {
      if (t > enemy.kill + 0.3) continue
      for (let k = 1; k <= 8; k++) {
        const past = Math.min(t, enemy.kill) - k * 0.05
        if (past < BEATS.smash) continue
        const { x } = this.enemyAt(enemy, past), age = Math.min(t, enemy.kill) - past
        this.puff(x + 18 + age * 40, GROUND - 6 - age * 30, 10 + age * 110, 0.16 * (1 - k / 9))
      }
    }
    if (t > BEATS.dash) {
      for (let i = 0; i < 14; i++) {
        const age = t - BEATS.dash - (i / 14) * 0.08
        if (age < 0 || age > 1.3) continue
        const x = lerp(SAM_FROM, SAM_TO, i / 14)
        this.puff(x + age * 30, GROUND - 8 - age * 36, 16 + Math.min(age, 0.8) * 140, 0.24 * (1 - age / 1.3))
      }
    }
    ctx.restore()
  }

  /** A soft puff of sunlit dust. */
  private puff(x: number, y: number, r: number, alpha: number) {
    const ctx = this.ctx
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, r)
    cloud.addColorStop(0, `rgba(240,110,70,${alpha})`); cloud.addColorStop(0.5, `rgba(220,90,60,${alpha * 0.55})`); cloud.addColorStop(1, 'rgba(200,80,50,0)')
    ctx.fillStyle = cloud; ctx.fillRect(x - r, y - r, 2 * r, 2 * r)
  }

  /** Tall grass in the foreground corners, swaying, black against everything. */
  private grass(t: number) {
    const ctx = this.ctx
    const rng = random(77)
    ctx.fillStyle = '#030101'
    for (const [from, to, count] of [[-300, 330, 64], [1500, 1900, 48]] as [number, number, number][]) {
      for (let i = 0; i < count; i++) {
        const x = from + rng() * (to - from), h = 50 + rng() * 130, w = 2.5 + rng() * 3, phase = rng() * 6, lean = (rng() - 0.5) * 0.6
        const bend = Math.sin(t * 2.2 + phase + x * 0.01) * 12 + lean * h
        ctx.beginPath(); ctx.moveTo(x - w, 810)
        ctx.quadraticCurveTo(x + bend * 0.3, 810 - h * 0.6, x + bend, 810 - h)
        ctx.quadraticCurveTo(x + bend * 0.3 + w * 0.4, 810 - h * 0.6, x + w, 810)
        ctx.fill()
      }
    }
  }

  /** The instant each cut lands: a hairline of light through him along the sword's path. */
  private cutLight(t: number) {
    const ctx = this.ctx
    for (const [i, enemy] of ENEMIES.entries()) {
      const u = t - enemy.kill
      if (u < -0.02 || u > 0.1) continue
      const { x, pose } = this.enemyAt(enemy, enemy.kill), cut = this.cutAt(enemy, pose)
      const k = 1 - clamp01(u / 0.1)
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.translate(x - cut[0], GROUND + cut[1]); ctx.rotate(-0.32 + i * 0.22)
      const beam = ctx.createLinearGradient(-230, 0, 230, 0)
      beam.addColorStop(0, 'rgba(255,240,220,0)'); beam.addColorStop(0.5, `rgba(255,248,235,${k})`); beam.addColorStop(1, 'rgba(255,240,220,0)')
      ctx.fillStyle = beam; ctx.fillRect(-230, -2, 460, 4)
      ctx.fillStyle = `rgba(255,70,30,${0.3 * k})`; ctx.fillRect(-170, -9, 340, 18)
      ctx.restore()
    }
  }

  // ------------------------------------------------------------------ the figures

  /** The samurai at time t: where he is, how he stands, and his blade (and saya) as he draws, cuts, cleans it and
   * sheathes it. */
  private samuraiAt(t: number): { x: number; pose: Pose; blade: Blade } {
    const blade: Blade = { ...STILL, blood: t < BEATS.kills[0] ? 0 : t < BEATS.flick + 0.05 ? clamp01(0.45 + (t - BEATS.kills[0]) * 1.4) : 0.1 }
    if (t < BEATS.dash) {
      // Kneeling: a slow breath.
      return { x: SAM_FROM, pose: lerpPose(SAM_KNEEL, { ...SAM_KNEEL, neck: [18, -181], head: [26, -213] }, 0.5 + 0.5 * Math.sin(t * 5)), blade }
    }
    if (t < BEATS.dashEnd) {
      const u = easeOut((t - BEATS.dash) / (BEATS.dashEnd - BEATS.dash))
      return { x: lerp(SAM_FROM, SAM_TO, u), pose: lerpPose(SAM_KNEEL, SAM_FINISH, u), blade }
    }
    if (t < BEATS.chiburi) {
      // He holds, blade out: it flares at the point as he stops, and the sun runs down it.
      blade.star = 1 - clamp01(Math.abs(t - 2.04) / 0.1)
      if (t >= 2.6) blade.glint = (t - 2.6) / 0.3
      return { x: SAM_TO, pose: SAM_FINISH, blade }
    }
    if (t < BEATS.flick) return { x: SAM_TO, pose: lerpPose(SAM_FINISH, SAM_RAISE, ease((t - BEATS.chiburi) / (BEATS.flick - BEATS.chiburi))), blade }
    if (t < BEATS.turn) return { x: SAM_TO, pose: lerpPose(SAM_RAISE, SAM_FLICK, easeOut((t - BEATS.flick) / 0.08)), blade }
    // The noto. The left hand takes the saya's mouth and draws it back a little; the blade swings round past us until
    // its back lies across that hand; the right hand draws it out along the hand until the point finds the mouth;
    // then slides it home, slowly, the saya brought forward to meet it.
    const body = lerpPose(SAM_FLICK, SAM_NOTO, ease((t - BEATS.turn) / 0.5))
    blade.pull = t < BEATS.draw ? 0 : 44 * (t < BEATS.sheathe ? ease((t - BEATS.draw) / (BEATS.sheathe - BEATS.draw)) : 1 - ease((t - BEATS.sheathe) / (BEATS.click - BEATS.sheathe)))
    const mouth: Vec = [body.hip[0] + 4 + SAYA[0] * blade.pull, body.hip[1] - 14 + SAYA[1] * blade.pull]
    let hand: Vec, out = 34
    if (t < BEATS.draw) {
      const u = ease((t - BEATS.turn) / (BEATS.draw - BEATS.turn))
      hand = lerpV(SAM_FLICK.rHand, [mouth[0] - SAYA[0] * out, mouth[1] - SAYA[1] * out], u)
      body.sword = lerp(SAM_FLICK.sword, SHEATHED, u); blade.turn = lerp(1, -1, u)
    } else {
      out = t < BEATS.sheathe ? lerp(34, SAM_BLADE, ease((t - BEATS.draw) / (BEATS.sheathe - BEATS.draw))) : lerp(SAM_BLADE, 12, ease((t - BEATS.sheathe) / (BEATS.click - BEATS.sheathe)))
      hand = [mouth[0] - SAYA[0] * out, mouth[1] - SAYA[1] * out]
      body.sword = SHEATHED; blade.turn = -1
      if (t >= BEATS.sheathe) blade.reach = out
      // The sun stays where it is as the steel slides under it.
      blade.glint = (out - 74) / (SAM_BLADE - 14); blade.shine = 0.85
      blade.star = 0.7 * (1 - clamp01(Math.abs(t - BEATS.sheathe) / 0.1))
    }
    // He leans into the reach as the blade comes out, and straightens as it goes home.
    const lean = t < BEATS.draw ? 0 : 16 * Math.sin(Math.PI * clamp01((t - BEATS.draw) / (BEATS.click - BEATS.draw)))
    body.neck = [body.neck[0] + lean, body.neck[1]]; body.head = [body.head[0] + lean, body.head[1] + lean * 0.2]
    const shoulder: Vec = [body.neck[0] - 2, body.neck[1] + 12]
    const right = reachArm(shoulder, hand), left = reachArm(shoulder, [mouth[0] + 2, mouth[1] + 3])
    return { x: SAM_TO, pose: { ...body, rElbow: right.elbow, rHand: right.hand, lElbow: left.elbow, lHand: left.hand }, blade }
  }

  private drawSamurai(t: number, mode: 'shadow' | 'lit') {
    const { x, pose: current, blade } = this.samuraiAt(t)
    const ctx = this.ctx
    if (mode === 'lit' && t >= BEATS.dash && t < BEATS.dashEnd + 0.2) {
      // The streak: a hairline of light along his path at the height of the draw, and afterimages left behind.
      const fade = 1 - clamp01((t - BEATS.dashEnd) / 0.2)
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const streak = ctx.createLinearGradient(SAM_FROM, 0, x, 0)
      streak.addColorStop(0, 'rgba(255,200,180,0)'); streak.addColorStop(1, `rgba(255,245,235,${0.95 * fade})`)
      ctx.fillStyle = streak
      ctx.beginPath(); ctx.moveTo(SAM_FROM, GROUND - 118); ctx.lineTo(x, GROUND - 168); ctx.lineTo(x, GROUND - 164); ctx.lineTo(SAM_FROM, GROUND - 116); ctx.fill()
      ctx.restore()
      for (let i = 1; i <= 4; i++) {
        const ghost = lerpPose(SAM_KNEEL, SAM_FINISH, i / 6), gx = lerp(SAM_FROM, x, i / 6)
        this.faded(0.16 * fade * (i / 4), () => this.body(gx, 1, 'flat', () => this.silhouette(ghost, SAMURAI, 'all', null, t, blade)))
      }
    }
    this.body(x, 1, mode, () => this.silhouette(current, SAMURAI, 'all', null, t, blade))
  }

  private drawEnemy(enemy: Enemy, t: number, mode: 'shadow' | 'lit') {
    const look: Look = { hat: enemy.gear, armour: enemy.gear === 'kabuto' }
    const blade: Blade = { ...STILL, glint: 0.6, shine: 0.35 }
    if (t < enemy.kill) {
      const { x, pose } = this.enemyAt(enemy, t)
      this.body(x, -1, mode, () => this.silhouette(pose, look, 'all', null, t, blade))
      return
    }
    const { x, pose } = this.enemyAt(enemy, enemy.kill)
    const u = t - enemy.kill, cut = this.cutAt(enemy, pose)
    const piece = this.severed(enemy, cut, u), lower = this.slump(enemy, u)
    this.body(x, -1, mode, () => {
      const ctx = this.ctx
      ctx.save()
      ctx.translate(lower.tx, lower.ty); ctx.rotate(lower.angle)
      this.silhouette(pose, look, 'lower', cut, t, blade, enemy.cut >= 1)
      ctx.restore()
      ctx.save()
      ctx.translate(cut[0] + piece.dx, cut[1] + piece.dy); ctx.rotate(piece.spin); ctx.translate(-cut[0], -cut[1])
      this.silhouette(pose, look, 'upper', cut, t, blade, enemy.cut >= 1)
      ctx.restore()
    })
  }

  /**
   * A figure at x on the ground, facing 1 right or -1 left, in passes: its shadow (thrown towards us, away from the
   * sun), or lit: first its rim (the whole shape in sunlight, nudged towards the sun), then itself in black over it, so
   * only the edge facing the sun burns. 'flat' is the black alone.
   */
  private body(x: number, facing: 1 | -1, mode: 'shadow' | 'lit' | 'flat', paint: () => void) {
    const ctx = this.ctx
    const passes: ('shadow' | 'rim' | 'ink')[] = mode === 'shadow' ? ['shadow'] : mode === 'lit' ? ['rim', 'ink'] : ['ink']
    const toward = Math.atan2(SUN[1] - (GROUND - 130), SUN[0] - x)
    for (const pass of passes) {
      this.pass = pass
      ctx.save()
      if (pass === 'shadow') {
        ctx.translate(x, GROUND)
        ctx.transform(1, 0, (SUN[0] - x) / 700, -0.3, 0, 0)
        ctx.fillStyle = '#000'
      } else {
        const nudge = pass === 'rim' ? 1.7 : 0
        ctx.translate(x + Math.cos(toward) * nudge, GROUND + Math.sin(toward) * nudge)
        ctx.fillStyle = pass === 'rim' ? RIM : INK
      }
      ctx.scale(facing, 1)
      paint()
      ctx.restore()
    }
    this.pass = 'ink'
  }

  /** A limb: a capsule from a to b, tapering from width wa to wb, in the current fill. */
  private limb(a: Vec, b: Vec, wa: number, wb: number) {
    const ctx = this.ctx
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1, nx = -dy / length, ny = dx / length
    ctx.beginPath()
    ctx.moveTo(a[0] + nx * wa / 2, a[1] + ny * wa / 2); ctx.lineTo(b[0] + nx * wb / 2, b[1] + ny * wb / 2)
    ctx.lineTo(b[0] - nx * wb / 2, b[1] - ny * wb / 2); ctx.lineTo(a[0] - nx * wa / 2, a[1] - ny * wa / 2)
    ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.arc(a[0], a[1], wa / 2, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(b[0], b[1], wb / 2, 0, Math.PI * 2); ctx.fill()
  }

  /**
   * A figure's body as filled shapes in his own frame (facing right, feet at the origin), in the current fill, with
   * the steel and blood in colour on the black pass. Of a cut figure, `part` picks the side of the cut: 'upper' is
   * everything above it (just the head, if he lost it).
   */
  private silhouette(p: Pose, look: Look, part: 'all' | 'upper' | 'lower', cut: Vec | null, t: number, blade: Blade, beheaded = false) {
    const ctx = this.ctx
    const above = part !== 'lower', below = part !== 'upper'
    // What goes with the trunk (arms, sword, chest), and with the head.
    const trunk = cut && !beheaded ? above : below
    const head = beheaded ? above : trunk
    const flutter = Math.sin(t * 8 + p.hip[0])
    const shoulder: Vec = [p.neck[0] - 2, p.neck[1] + 12]
    if (look.scarf && trunk) this.scarf(p, t)
    if (below) {
      for (const [knee, foot] of [[p.rKnee, p.rFoot], [p.lKnee, p.lFoot]] as [Vec, Vec][]) {
        this.limb(p.hip, knee, 25, 17); this.limb(knee, foot, 17, 10)
        ctx.beginPath(); ctx.moveTo(foot[0] - 8, foot[1] - 9); ctx.lineTo(foot[0] + 19, foot[1] - 3); ctx.lineTo(foot[0] + 20, foot[1]); ctx.lineTo(foot[0] - 9, foot[1]); ctx.closePath(); ctx.fill()
        if (look.hakama) this.limb(p.hip, lerpV(knee, foot, 0.55), 36, 31)
      }
      if (look.hakama) {
        // The cloth between the legs, its hem flapping.
        const r = lerpV(p.rKnee, p.rFoot, 0.55), l = lerpV(p.lKnee, p.lFoot, 0.55)
        ctx.beginPath(); ctx.moveTo(p.hip[0] - 16, p.hip[1]); ctx.lineTo(...r)
        ctx.quadraticCurveTo((r[0] + l[0]) / 2, (r[1] + l[1]) / 2 - 16 + flutter * 5, ...l)
        ctx.lineTo(p.hip[0] + 16, p.hip[1]); ctx.closePath(); ctx.fill()
      }
      if (look.scabbard) {
        // The saya at his left hip; the hilt forward of it while the sword is home.
        const pull: Vec = [SAYA[0] * blade.pull, SAYA[1] * blade.pull], mouth: Vec = [p.hip[0] + 4 + pull[0], p.hip[1] - 14 + pull[1]]
        this.limb(mouth, [mouth[0] + SAYA[0] * 142, mouth[1] + SAYA[1] * 142], 9, 8)
        if (Number.isNaN(p.sword)) {
          this.limb(mouth, [mouth[0] + 44, mouth[1] - 8], 8, 8)
          ctx.beginPath(); ctx.ellipse(mouth[0] + 4, mouth[1] - 1, 3, 10, -0.18, 0, Math.PI * 2); ctx.fill()
        }
      }
    }
    if (cut && !beheaded) {
      if (below) this.limb(p.hip, cut, 30, 33)
      if (above) this.limb(cut, p.neck, 33, 36)
    } else if (trunk) this.limb(p.hip, p.neck, 30, 36)
    if (beheaded && cut) { if (below) this.limb(p.neck, cut, 13, 12); if (above) this.limb(cut, p.head, 12, 12) }
    else if (head) this.limb(p.neck, p.head, 13, 12)
    if (trunk) {
      for (const [elbow, hand] of [[p.lElbow, p.lHand], [p.rElbow, p.rHand]] as [Vec, Vec][]) {
        // The kimono's sleeve hangs from the upper arm.
        ctx.beginPath(); ctx.moveTo(...shoulder); ctx.lineTo(...elbow); ctx.lineTo(elbow[0] - 6 + flutter * 3, elbow[1] + 24); ctx.lineTo(shoulder[0] - 12, shoulder[1] + 30); ctx.closePath(); ctx.fill()
        this.limb(shoulder, elbow, 16, 12); this.limb(elbow, hand, 12, 9)
        ctx.beginPath(); ctx.arc(hand[0], hand[1], 7, 0, Math.PI * 2); ctx.fill()
      }
      if (look.armour) {
        // Sode: lacquered plates hanging over the shoulder.
        ctx.beginPath(); ctx.moveTo(shoulder[0] - 16, shoulder[1] - 6); ctx.lineTo(shoulder[0] + 14, shoulder[1] - 8); ctx.lineTo(shoulder[0] + 18, shoulder[1] + 32); ctx.lineTo(shoulder[0] - 14, shoulder[1] + 36); ctx.closePath(); ctx.fill()
      }
      if (!Number.isNaN(p.sword)) this.katana(p.rHand, p.sword, look.scabbard ? SAM_BLADE : 150, blade)
    }
    if (head) this.headgear(p.head, look.hat)
    // The wound, on both sides of the cut.
    if (cut && this.pass === 'ink') {
      const [from, to] = beheaded ? [p.neck, p.head] : [p.hip, p.neck]
      this.wound(cut, Math.atan2(to[1] - from[1], to[0] - from[0]), beheaded ? 13 : 33)
    }
  }

  private headgear([hx, hy]: Vec, hat: Look['hat']) {
    const ctx = this.ctx
    ctx.beginPath(); ctx.arc(hx, hy, 18, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath()
    if (hat === 'kasa') {
      // A wide straw kasa, low over the eyes.
      ctx.moveTo(hx - 64, hy - 1); ctx.quadraticCurveTo(hx - 22, hy - 20, hx + 2, hy - 38); ctx.quadraticCurveTo(hx + 26, hy - 20, hx + 66, hy - 1)
      ctx.quadraticCurveTo(hx, hy - 8, hx - 64, hy - 1)
    } else if (hat === 'kabuto') {
      // A helmet: the bowl, the flared neck guard behind, and the great crescent horns.
      ctx.arc(hx, hy - 4, 23, Math.PI, 0); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(hx - 20, hy - 8); ctx.lineTo(hx - 40, hy + 20); ctx.lineTo(hx - 6, hy + 12); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(hx + 4, hy - 20); ctx.quadraticCurveTo(hx - 30, hy - 38, hx - 28, hy - 72); ctx.quadraticCurveTo(hx - 20, hy - 42, hx + 10, hy - 25); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(hx + 4, hy - 20); ctx.quadraticCurveTo(hx + 36, hy - 34, hx + 42, hy - 68); ctx.quadraticCurveTo(hx + 30, hy - 36, hx + 10, hy - 15)
    } else if (hat === 'topknot') {
      ctx.ellipse(hx - 5, hy - 21, 10, 5, -0.4, 0, Math.PI * 2)
    } else {
      // A jingasa: the flat war hat.
      ctx.moveTo(hx - 38, hy - 6); ctx.lineTo(hx + 38, hy - 6); ctx.lineTo(hx + 4, hy - 27)
    }
    ctx.closePath(); ctx.fill()
  }

  /** The samurai's scarf streaming back from his neck: black in the light, dark red on the black pass. */
  private scarf(p: Pose, t: number) {
    const ctx = this.ctx
    const top: Vec[] = [], bottom: Vec[] = []
    for (let i = 0; i <= 12; i++) {
      const wave = Math.sin(t * 10 - i * 0.65) * i * 1.5, w = lerp(11, 2, i / 12)
      const cx = p.neck[0] - 4 - i * 15, cy = p.neck[1] + 6 + wave + i * 1.2
      top.push([cx, cy - w / 2]); bottom.push([cx, cy + w / 2])
    }
    const fill = ctx.fillStyle
    if (this.pass === 'ink') ctx.fillStyle = '#4a0504'
    ctx.beginPath(); ctx.moveTo(...top[0])
    for (const point of top) ctx.lineTo(...point)
    for (const point of bottom.reverse()) ctx.lineTo(...point)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = fill
  }

  /** A cut through flesh: the dark edge, the red meat, the white of the spine. */
  private wound(at: Vec, axis: number, width: number) {
    const ctx = this.ctx
    const fill = ctx.fillStyle
    ctx.save()
    ctx.translate(...at); ctx.rotate(axis + Math.PI / 2)
    ctx.fillStyle = '#240100'
    ctx.beginPath(); ctx.ellipse(0, 0, width / 2 + 1.5, width * 0.22 + 1.5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#a30b06'
    ctx.beginPath(); ctx.ellipse(0, 0, width / 2 - 1.5, width * 0.18, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#ddd2c2'
    ctx.beginPath(); ctx.arc(width * 0.22, 0, Math.max(1.6, width * 0.1), 0, Math.PI * 2); ctx.fill()
    ctx.restore()
    ctx.fillStyle = fill
  }

  /**
   * A katana in the hand at `angle`: the wrapped tsuka, the tsuba, the gold habaki, and the curved blade, its steel
   * dark at the spine and bright at the edge with the temper line between, the sun running along it, blood on it.
   */
  private katana(hand: Vec, angle: number, length: number, state: Blade) {
    const ctx = this.ctx
    if (this.pass !== 'ink') {
      // In shadow it is just a line; the rim pass leaves the steel to its own light.
      if (this.pass === 'shadow') { ctx.save(); ctx.translate(...hand); ctx.rotate(angle); ctx.scale(state.turn, 1); ctx.fillRect(-44, -3.5, Math.min(length, state.reach) + 48, 7); ctx.restore() }
      return
    }
    const L = length
    const curve = (x: number) => -L * 0.035 * (x / L) ** 2, half = (x: number) => lerp(3.7, 2.6, Math.min(1, x / L))
    ctx.save()
    ctx.translate(...hand); ctx.rotate(angle)
    // Turned about the upright, it foreshortens (and past side-on, points the other way).
    ctx.scale(Math.sign(state.turn || 1) * Math.max(0.03, Math.abs(state.turn)), 1)
    // What has gone into the saya is not seen.
    ctx.save()
    if (state.reach < L + 10) { ctx.beginPath(); ctx.rect(-80, -40, state.reach + 80, 80); ctx.clip() }
    // The tsuka: a dark grip under its diamond wrapping, capped by the kashira.
    ctx.fillStyle = '#0c0807'; ctx.fillRect(-42, -4.2, 46, 8.4)
    ctx.fillStyle = 'rgba(176,146,110,0.42)'
    for (let x = -38; x < 0; x += 7) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 3.5, -3.2); ctx.lineTo(x + 7, 0); ctx.lineTo(x + 3.5, 3.2); ctx.closePath(); ctx.fill() }
    ctx.fillStyle = '#3a2e24'; ctx.fillRect(-46, -4.6, 4.5, 9.2)
    // The tsuba, its rim catching the light; the habaki.
    ctx.fillStyle = '#16110e'; ctx.beginPath(); ctx.ellipse(5.5, 0, 3, 11, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(255,190,120,0.6)'; ctx.lineWidth = 0.8; ctx.stroke()
    ctx.fillStyle = '#c99040'; ctx.fillRect(8.5, -3.9, 6, 7.8)
    ctx.fillStyle = 'rgba(255,232,170,0.85)'; ctx.fillRect(8.5, -3.9, 6, 1.3)
    const outline = () => {
      ctx.beginPath()
      ctx.moveTo(14, curve(14) - half(14))
      for (let x = 22; x < L - 14; x += 8) ctx.lineTo(x, curve(x) - half(x))
      ctx.lineTo(L - 14, curve(L - 14) - half(L - 14))
      ctx.lineTo(L + 4, curve(L) - half(L) * 0.4)
      ctx.quadraticCurveTo(L - 1, curve(L) + half(L) * 1.1, L - 14, curve(L - 14) + half(L - 14))
      for (let x = L - 22; x > 14; x -= 8) ctx.lineTo(x, curve(x) + half(x))
      ctx.lineTo(14, curve(14) + half(14))
      ctx.closePath()
    }
    ctx.save()
    outline(); ctx.clip()
    // The steel, in short lengths so its shading follows the curve.
    const steps = 12
    for (let i = 0; i < steps; i++) {
      const x0 = 12 + (L + 6 - 12) * i / steps, x1 = 12 + (L + 6 - 12) * (i + 1) / steps, xm = (x0 + x1) / 2, cy = curve(xm), h = half(xm)
      const steel = ctx.createLinearGradient(0, cy - h, 0, cy + h)
      steel.addColorStop(0, '#202429'); steel.addColorStop(0.32, '#68717a'); steel.addColorStop(0.55, '#b7bfc7'); steel.addColorStop(0.64, '#e8edf1'); steel.addColorStop(1, '#ffffff')
      ctx.fillStyle = steel; ctx.fillRect(x0 - 0.6, cy - h - 4, x1 - x0 + 1.2, 2 * h + 8)
    }
    // The hamon (the temper line), and the shinogi ridge.
    ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    for (let x = 14; x <= L - 6; x += 3) { const y = curve(x) + half(x) * 0.25 + Math.sin(x * 0.45) * 0.6; if (x === 14) ctx.moveTo(x, y); else ctx.lineTo(x, y) }
    ctx.stroke()
    ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(15,18,22,0.55)'
    ctx.beginPath(); ctx.moveTo(14, curve(14) - half(14) * 0.35)
    for (let x = 20; x <= L - 12; x += 6) ctx.lineTo(x, curve(x) - half(x) * 0.35)
    ctx.stroke()
    // The sun running along the steel.
    if (state.glint >= 0 && state.glint <= 1.15) {
      const gx = 14 + state.glint * (L - 14)
      const shine = ctx.createLinearGradient(gx - 28, 0, gx + 28, 0)
      shine.addColorStop(0, 'rgba(255,220,170,0)'); shine.addColorStop(0.5, `rgba(255,244,222,${state.shine})`); shine.addColorStop(1, 'rgba(255,220,170,0)')
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = shine; ctx.fillRect(gx - 28, -20, 56, 40); ctx.globalCompositeOperation = 'source-over'
    }
    // Blood, thickest towards the point, with a wet light along it.
    if (state.blood > 0) {
      const from = L * (1 - state.blood * 0.85)
      const wet = ctx.createLinearGradient(from, 0, L, 0)
      wet.addColorStop(0, 'rgba(110,5,3,0)'); wet.addColorStop(0.15, 'rgba(110,5,3,0.9)'); wet.addColorStop(1, 'rgba(66,2,1,0.97)')
      ctx.fillStyle = wet; ctx.fillRect(from, -20, L - from + 8, 40)
      ctx.strokeStyle = 'rgba(255,130,110,0.4)'; ctx.lineWidth = 0.7
      ctx.beginPath(); ctx.moveTo(from + 10, curve(from + 10) - half(from) * 0.4); ctx.lineTo(L - 6, curve(L - 6) - half(L) * 0.4); ctx.stroke()
    }
    ctx.restore()
    // Drops of it hanging off the edge, pulled straight down.
    if (state.blood > 0.3) {
      const down: Vec = [Math.sin(angle), Math.cos(angle)]
      ctx.fillStyle = '#560302'
      for (const [f, run] of [[0.6, 7], [0.76, 12], [0.9, 6]] as [number, number][]) {
        const x = L * f, y = curve(x) + half(x) * 0.8, d = run * state.blood
        ctx.beginPath(); ctx.moveTo(x - 1.5, y); ctx.lineTo(x + 1.5, y); ctx.lineTo(x + down[0] * d + 0.9, y + down[1] * d); ctx.lineTo(x + down[0] * d - 0.9, y + down[1] * d); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.arc(x + down[0] * d, y + down[1] * d, 1.8, 0, Math.PI * 2); ctx.fill()
      }
    }
    ctx.restore()
    // A star of sunlight at the point (or at the saya's mouth, as the point goes in).
    if (state.star > 0) {
      const tx = Math.min(L + 2, state.reach), ty = curve(tx), k = state.star
      ctx.globalCompositeOperation = 'lighter'
      const glow = ctx.createRadialGradient(tx, ty, 0, tx, ty, 46 * k)
      glow.addColorStop(0, 'rgba(255,244,220,0.9)'); glow.addColorStop(1, 'rgba(255,170,90,0)')
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(tx, ty, 46 * k, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255,252,240,0.95)'
      ctx.beginPath()
      ctx.moveTo(tx + 80 * k, ty); ctx.lineTo(tx + 2, ty + 2); ctx.lineTo(tx, ty + 50 * k); ctx.lineTo(tx - 2, ty + 2)
      ctx.lineTo(tx - 80 * k, ty); ctx.lineTo(tx - 2, ty - 2); ctx.lineTo(tx, ty - 50 * k); ctx.lineTo(tx + 2, ty - 2)
      ctx.closePath(); ctx.fill()
    }
    ctx.restore()
  }

  // ------------------------------------------------------------------ the lettering

  /**
   * A letter in the heavy face painted with a loaded brush, as a cached sprite: leaning forward, shaded, eaten into
   * by dry-brush streaks; in blood it is also splattered round and wet across the top. Painted at the frame's
   * resolution, at `size`, and scaled from there.
   */
  private sprite(char: string, kind: 'blood' | 'bone', size: number): Sprite {
    const res = this.res, key = `${kind}${char}${size}@${res}`
    const cached = this.sprites.get(key)
    if (cached) return cached
    const canvas = document.createElement('canvas'), g = canvas.getContext('2d')!
    g.font = `400 ${size}px ${HEAVY}`
    const metrics = g.measureText(char)
    const ascent = metrics.actualBoundingBoxAscent || size * 0.74, pad = size * 0.32
    const w = metrics.width + pad * 2 + size * 0.12, h = ascent + pad * 2
    canvas.width = Math.ceil(w * res); canvas.height = Math.ceil(h * res)
    g.scale(res, res)
    g.font = `400 ${size}px ${HEAVY}`
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'
    g.save()
    g.translate(w / 2, pad + ascent); g.transform(1, 0, -0.1, 1, 0, 0)
    const fill = g.createLinearGradient(0, -ascent, 0, 0)
    if (kind === 'blood') { fill.addColorStop(0, '#d0170c'); fill.addColorStop(0.55, '#940a05'); fill.addColorStop(1, '#4a0201') }
    else { fill.addColorStop(0, '#f3ede1'); fill.addColorStop(0.6, '#d8cfbe'); fill.addColorStop(1, '#a1978a') }
    g.fillStyle = fill; g.fillText(char, 0, 0)
    g.restore()
    // The dry brush: streaks dragged through it where the bristles ran out, and specks.
    const rng = random(char.charCodeAt(0) * 131 + (kind === 'blood' ? 7 : 3) + Math.round(size))
    g.globalCompositeOperation = 'destination-out'
    for (let i = 0, n = Math.round(10 + size * 0.07); i < n; i++) {
      const sy = pad + rng() * ascent, sx = pad * 0.5 + rng() * (w - pad), length = size * (0.04 + rng() * 0.24), thick = size * (0.002 + rng() * 0.007)
      g.globalAlpha = 0.35 + rng() * 0.65
      g.beginPath(); g.ellipse(sx, sy, length / 2, thick, -0.06, 0, Math.PI * 2); g.fill()
    }
    for (let i = 0, n = Math.round(size * 0.3); i < n; i++) {
      g.globalAlpha = 0.5 + rng() * 0.5
      g.beginPath(); g.arc(rng() * w, pad + rng() * ascent, size * (0.002 + rng() * 0.006), 0, Math.PI * 2); g.fill()
    }
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
    if (kind === 'blood') {
      // Thrown off round it, and wet across the top.
      g.fillStyle = '#6e0503'
      for (let i = 0; i < 30; i++) {
        const a = rng() * Math.PI * 2, d = (0.45 + rng() * 0.4) * Math.max(metrics.width, ascent) * 0.75
        g.beginPath(); g.arc(w / 2 + Math.cos(a) * d * 0.8, pad + ascent / 2 + Math.sin(a) * d, size * (0.004 + rng() * 0.022), 0, Math.PI * 2); g.fill()
      }
      g.globalCompositeOperation = 'source-atop'
      const sheen = g.createLinearGradient(0, pad, 0, pad + ascent * 0.4)
      sheen.addColorStop(0, 'rgba(255,170,150,0.3)'); sheen.addColorStop(1, 'rgba(255,170,150,0)')
      g.fillStyle = sheen; g.fillRect(0, 0, w, h)
      g.globalCompositeOperation = 'source-over'
    }
    // Its shadow: the same shape in black (for the bright sky).
    let shade: HTMLCanvasElement | null = null
    if (kind === 'blood') {
      shade = document.createElement('canvas')
      shade.width = canvas.width; shade.height = canvas.height
      const s = shade.getContext('2d')!
      s.drawImage(canvas, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = '#000'; s.fillRect(0, 0, shade.width, shade.height)
    }
    const sprite: Sprite = { canvas, shade, w, h, ascent, pad, size }
    this.sprites.set(key, sprite)
    return sprite
  }

  /** Lay a sprite down with its baseline centre at (x, base), at `size`. */
  private stamp(sprite: Sprite, x: number, base: number, size: number, shadow = 0) {
    const k = size / sprite.size, left = x - sprite.w / 2 * k, top = base - (sprite.pad + sprite.ascent) * k
    if (shadow > 0 && sprite.shade) {
      const alpha = this.ctx.globalAlpha
      this.ctx.globalAlpha = alpha * shadow
      this.ctx.drawImage(sprite.shade, left + size * 0.035, top + size * 0.045, sprite.w * k, sprite.h * k)
      this.ctx.globalAlpha = alpha
    }
    this.ctx.drawImage(sprite.canvas, left, top, sprite.w * k, sprite.h * k)
  }

  /** A giant letter in blood, centred on (x, y): slammed in, its drips running down from its foot. */
  private drawBloodLetter(char: string, x: number, y: number, size: number, age: number) {
    const ctx = this.ctx
    const sprite = this.sprite(char, 'blood', LETTER_SIZE)
    const slam = age < 0.1 ? lerp(1.7, 1, easeOut(age / 0.1)) : age < 0.2 ? lerp(0.94, 1, (age - 0.1) / 0.1) : 1
    const scaled = size * slam, base = y + sprite.ascent / 2 * (scaled / LETTER_SIZE)
    this.stamp(sprite, x, base, scaled, 0.5)
    const rng = random(char.charCodeAt(0) * 31 + Math.round(x))
    const k = scaled / LETTER_SIZE
    ctx.fillStyle = '#5a0302'
    for (let i = 0; i < 6; i++) {
      const dx = (rng() - 0.5) * LETTER_SIZE * 0.42 * k, run = Math.min(1, age / 2.4) * LETTER_SIZE * (0.08 + rng() * 0.45) * k, width = LETTER_SIZE * (0.012 + rng() * 0.018) * k
      const from = base - LETTER_SIZE * 0.06 * k
      ctx.beginPath(); ctx.moveTo(x + dx - width / 2, from); ctx.lineTo(x + dx + width / 2, from); ctx.lineTo(x + dx + width * 0.3, from + run); ctx.lineTo(x + dx - width * 0.3, from + run); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.arc(x + dx, from + run, width * 0.62, 0, Math.PI * 2); ctx.fill()
    }
  }

  /** Blood that hit the lens: a heavy uneven body, streaks flung the way it was going, beads, spatter, and drips. */
  private drawSplat(splat: Splat, t: number) {
    const age = t - splat.at
    if (age < 0) return
    const ctx = this.ctx
    const grow = easeOut(age / 0.07)
    ctx.save()
    ctx.translate(splat.x, splat.y)
    ctx.fillStyle = BLOOD
    // The streaks reach out first, then the body fills.
    for (const [a, length, width] of splat.streaks) {
      const reach = length * grow, cos = Math.cos(a), sin = Math.sin(a)
      ctx.beginPath()
      ctx.moveTo(-sin * width * 1.6, cos * width * 1.6)
      ctx.quadraticCurveTo(cos * reach * 0.6, sin * reach * 0.6, cos * reach, sin * reach)
      ctx.quadraticCurveTo(cos * reach * 0.6, sin * reach * 0.6, sin * width * 1.6, -cos * width * 1.6)
      ctx.fill()
      ctx.beginPath(); ctx.arc(cos * reach, sin * reach, width * 1.25, 0, Math.PI * 2); ctx.fill()
    }
    ctx.scale(grow, grow)
    for (const [dx, dy, r] of splat.blobs) { ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.fill() }
    for (const [dx, dy, r] of splat.dots) { ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.fill() }
    for (const [dx, width, length] of splat.drips) {
      const run = Math.min(1, age / 1.8) * length
      ctx.fillRect(dx - width / 2, 0, width, splat.r * 0.5 + run)
      ctx.beginPath(); ctx.arc(dx, splat.r * 0.5 + run, width * 0.8, 0, Math.PI * 2); ctx.fill()
    }
    // A darker core where it is thickest, and a wet highlight.
    ctx.fillStyle = 'rgba(30,0,0,0.4)'
    ctx.beginPath(); ctx.arc(splat.blobs[0][0] * 0.4, splat.blobs[0][1] * 0.4, splat.r * 0.42, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,200,180,0.2)'
    ctx.beginPath(); ctx.ellipse(-splat.r * 0.28, -splat.r * 0.3, splat.r * 0.22, splat.r * 0.09, -0.6, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  // ------------------------------------------------------------------ the title

  /** The title card: smoke and embers, the blood ring and the logo, the name slammed in and then cut, the motto and
   * the seal. */
  private drawTitle(t: number) {
    const ctx = this.ctx
    // Smoke rolling through the dark, some of it red with the light of the ring.
    const rng = random(41)
    for (let i = 0; i < 11; i++) {
      const bx = rng() * 1900 - 150 + Math.sin(t * 0.4 + i) * 40 + (t - BEATS.black) * (rng() - 0.5) * 60, by = 120 + rng() * 680, r = 260 + rng() * 380
      const red = rng() < 0.55
      const smoke = ctx.createRadialGradient(bx, by, 0, bx, by, r)
      smoke.addColorStop(0, red ? 'rgba(90,6,3,0.16)' : 'rgba(60,52,48,0.07)'); smoke.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = smoke; ctx.fillRect(bx - r, by - r, 2 * r, 2 * r)
    }
    // Ash falling slowly through it.
    ctx.fillStyle = 'rgba(150,140,132,0.35)'
    for (let i = 0; i < 70; i++) {
      const ax = rng() * 1800 - 100, ay = rng() * 900, fall = 18 + rng() * 30, size = 0.8 + rng() * 1.8, phase = rng() * 6
      const y = ((ay + (t - BEATS.black) * fall) % 900 + 900) % 900, x = ax + Math.sin(t * 0.9 + phase) * 18
      ctx.beginPath(); ctx.ellipse(x, y, size * 1.6, size * 0.7, phase, 0, Math.PI * 2); ctx.fill()
    }
    this.embers(t, 50, 9, -100, 100, 1800, 760, 1)
    // The ring: a brush circle in blood, swept round, glowing; black inside for the logo (whose own ground is black).
    const sunIn = ease((t - BEATS.emblem) / 0.35)
    if (sunIn > 0) {
      ctx.save()
      ctx.globalAlpha = ease((t - BEATS.emblem - 0.15) / 0.3)
      const halo = ctx.createRadialGradient(800, SUN_Y, SUN_R * 0.8, 800, SUN_Y, SUN_R * 1.9)
      halo.addColorStop(0, 'rgba(170,14,6,0.35)'); halo.addColorStop(1, 'rgba(120,8,4,0)')
      ctx.fillStyle = halo; ctx.fillRect(800 - SUN_R * 2, SUN_Y - SUN_R * 2, SUN_R * 4, SUN_R * 4)
      const inside = ctx.createRadialGradient(800, SUN_Y, 0, 800, SUN_Y, SUN_R - 12)
      inside.addColorStop(0, '#000'); inside.addColorStop(0.8, '#000'); inside.addColorStop(1, '#250302')
      ctx.fillStyle = inside
      ctx.beginPath(); ctx.arc(800, SUN_Y, SUN_R - 12, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 1
      ctx.lineCap = 'round'
      const brush = random(91)
      for (let pass = 0; pass < 5; pass++) {
        ctx.strokeStyle = pass < 2 ? '#7a0804' : BLOOD_BRIGHT
        ctx.lineWidth = 26 - pass * 5
        ctx.beginPath()
        const end = -Math.PI / 2 + sunIn * Math.PI * 2 * (1 - pass * 0.035)
        for (let a = -Math.PI / 2; a <= end; a += 0.04) {
          const r = SUN_R + Math.sin(a * 7 + pass) * 5 + (brush() - 0.5) * 7
          if (a === -Math.PI / 2) ctx.moveTo(800 + Math.cos(a) * r, SUN_Y + Math.sin(a) * r); else ctx.lineTo(800 + Math.cos(a) * r, SUN_Y + Math.sin(a) * r)
        }
        ctx.stroke()
      }
      ctx.restore()
    }
    // The studio's logo rising in the ring, dim until the ignition lights it up and its eyes burn. Drawn with
    // "lighten", so its black ground vanishes into the black of the ring and the night around it.
    const rise = easeOut((t - BEATS.emblem - 0.05) / 0.6)
    if (rise > 0 && this.logo) {
      const size = SUN_R * 1.77 * lerp(1.12, 1, rise)
      const x = 800 - size / 2, y = SUN_Y - size / 2 + (1 - rise) * 40
      const lit = ease((t - BEATS.ignite) / 0.12)
      ctx.save()
      ctx.globalCompositeOperation = 'lighten'
      ctx.globalAlpha = rise * lerp(0.5, 1, lit)
      ctx.drawImage(this.logo, x, y, size, size)
      if (lit > 0) {
        // Fire in the eyes: a flickering glow over each.
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = lit
        const flicker = 0.75 + 0.25 * Math.sin(t * 41) * Math.sin(t * 17)
        for (const [ex, ey] of LOGO_EYES) {
          const gx = x + ex * size, gy = y + ey * size, r = 34 * flicker
          const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, r)
          glow.addColorStop(0, 'rgba(255,220,120,0.7)'); glow.addColorStop(0.4, 'rgba(255,120,20,0.3)'); glow.addColorStop(1, 'rgba(255,40,0,0)')
          ctx.fillStyle = glow
          ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI * 2); ctx.fill()
        }
      }
      ctx.restore()
    }
    this.drawName(t)
    // The motto under the name, brushed, between two red rules, and in English under it: "awaken the warrior within".
    const sub = ease((t - BEATS.slash - 0.15) / 0.35)
    if (sub > 0) {
      ctx.save()
      ctx.globalAlpha = sub
      ctx.fillStyle = BONE; ctx.textBaseline = 'middle'
      ctx.font = `400 42px ${BRUSH}`
      const width = this.tracked(MOTTO, 800, MOTTO_Y, 8)
      ctx.fillStyle = BLOOD_BRIGHT
      const rule = 110 * easeOut(sub)
      ctx.fillRect(800 - width / 2 - 28 - rule, MOTTO_Y - 1, rule, 3); ctx.fillRect(800 + width / 2 + 28, MOTTO_Y - 1, rule, 3)
      ctx.globalAlpha = ease((t - BEATS.slash - 0.35) / 0.35)
      ctx.fillStyle = '#8f877b'; ctx.font = `400 20px ${HEAVY}`
      this.tracked(MOTTO_EN, 800, MOTTO_Y + 44, 9)
      ctx.restore()
    }
  }

  /** Lay out the name once (per font): each letter's centre and size, the initials big, all fitted to the width. */
  private layout() {
    if (this.glyphs.length) return this.glyphs
    const ctx = this.ctx
    const glyphs: Glyph[] = []
    let x = 0
    for (const [w, word] of TITLE.entries()) {
      for (const [i, char] of [...word].entries()) {
        const initial = i === 0 ? w : -1
        const size = TITLE_SIZE * (initial >= 0 ? INITIAL_SCALE : 1)
        ctx.font = `400 ${size}px ${HEAVY}`
        const width = ctx.measureText(char).width
        glyphs.push({ char, x: x + width / 2, size, width, initial })
        x += width + size * 0.035
      }
      x += TITLE_SIZE * 0.3
    }
    const total = x - TITLE_SIZE * 0.3
    const fit = Math.min(1, NAME_WIDTH / total)
    for (const glyph of glyphs) { glyph.x = 800 + (glyph.x - total / 2) * fit; glyph.size *= fit; glyph.width *= fit }
    this.glyphs = glyphs
    return glyphs
  }

  /** The cut through the name: a line rising slightly to the right through the middle of the letters. */
  private cutLine(x: number) {
    return NAME_BASE - TITLE_SIZE * 0.38 + (800 - x) * 0.045
  }

  private drawName(t: number) {
    const ctx = this.ctx
    const glyphs = this.layout()
    const letters = () => {
      let order = 0
      for (const glyph of glyphs) {
        if (glyph.initial >= 0) continue
        // Each slammed down hard after the initials land, left to right.
        const at = BEATS.write + 0.3 + order++ * 0.03
        const u = clamp01((t - at) / 0.07)
        if (u <= 0) continue
        ctx.globalAlpha = u
        this.stamp(this.sprite(glyph.char, 'bone', Math.round(glyph.size)), glyph.x, NAME_BASE, glyph.size * lerp(1.6, 1, easeOut(u)))
        ctx.globalAlpha = 1
      }
      // The initials: each giant blood letter flying down into its place in the name, still dripping.
      for (const glyph of glyphs) {
        if (glyph.initial < 0) continue
        const enemy = ENEMIES[glyph.initial], sprite = this.sprite(glyph.char, 'blood', LETTER_SIZE)
        const u = easeOut((t - BEATS.write) / 0.35)
        const size = lerp(LETTER_SIZE, glyph.size, u), base = lerp(enemy.slot[1] + sprite.ascent / 2, NAME_BASE, u)
        this.stamp(sprite, lerp(enemy.slot[0], glyph.x, u), base, size)
      }
    }
    const cut = t - BEATS.slash
    if (cut < 0.06) letters()
    else {
      // Cut through: the top half slides off along the cut, and the wound in the letters bleeds.
      const slide = easeOut((cut - 0.06) / 0.3) * 12, along = Math.atan2(-0.045, 1)
      const above = (sign: 1 | -1) => {
        ctx.beginPath()
        ctx.moveTo(-600, this.cutLine(-600)); ctx.lineTo(2200, this.cutLine(2200))
        ctx.lineTo(2200, sign < 0 ? -1000 : 2000); ctx.lineTo(-600, sign < 0 ? -1000 : 2000); ctx.closePath()
      }
      ctx.save(); above(1); ctx.clip(); letters(); ctx.restore()
      ctx.save(); above(-1); ctx.clip(); ctx.translate(Math.cos(along) * slide, Math.sin(along) * slide - slide * 0.25); letters(); ctx.restore()
      // The wound across each letter, and blood running from it down the letters below.
      ctx.fillStyle = '#8c0905'
      const bleed = easeOut((cut - 0.06) / 0.25)
      for (const glyph of glyphs) {
        const y = this.cutLine(glyph.x), half = glyph.width * 0.46
        ctx.beginPath(); ctx.moveTo(glyph.x - half, this.cutLine(glyph.x - half) - 1); ctx.lineTo(glyph.x + half, this.cutLine(glyph.x + half) - 1)
        ctx.lineTo(glyph.x + half, this.cutLine(glyph.x + half) + 2.5 * bleed); ctx.lineTo(glyph.x - half, this.cutLine(glyph.x - half) + 2.5 * bleed); ctx.closePath(); ctx.fill()
        const rng = random(glyph.x * 7)
        for (let i = 0; i < 2; i++) {
          const dx = (rng() - 0.5) * glyph.width * 0.7, run = Math.min(1, (cut - 0.1) / 1.6) * glyph.size * (0.1 + rng() * 0.4), w = 1.8 + rng() * 2.4
          if (run <= 0) continue
          ctx.beginPath(); ctx.moveTo(glyph.x + dx - w / 2, y); ctx.lineTo(glyph.x + dx + w / 2, y); ctx.lineTo(glyph.x + dx + w * 0.3, y + run); ctx.lineTo(glyph.x + dx - w * 0.3, y + run); ctx.closePath(); ctx.fill()
          ctx.beginPath(); ctx.arc(glyph.x + dx, y + run, w * 0.7, 0, Math.PI * 2); ctx.fill()
        }
      }
    }
    // The blade's light sweeping through the name as it cuts.
    if (cut > -0.02 && cut < 0.3) {
      const head = easeOut(clamp01(cut / 0.08)), fade = 1 - clamp01((cut - 0.08) / 0.22)
      const x0 = 800 - NAME_WIDTH / 2 - 80, x1 = lerp(x0, 800 + NAME_WIDTH / 2 + 80, head)
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const beam = ctx.createLinearGradient(x0, 0, x1, 0)
      beam.addColorStop(0, 'rgba(255,240,225,0)'); beam.addColorStop(1, `rgba(255,250,240,${fade})`)
      ctx.fillStyle = beam
      ctx.beginPath(); ctx.moveTo(x0, this.cutLine(x0) - 1.2); ctx.lineTo(x1, this.cutLine(x1) - 2.2); ctx.lineTo(x1, this.cutLine(x1) + 2.2); ctx.lineTo(x0, this.cutLine(x0) + 1.2); ctx.fill()
      ctx.fillStyle = `rgba(255,60,30,${0.25 * fade})`
      ctx.beginPath(); ctx.moveTo(x0, this.cutLine(x0) - 8); ctx.lineTo(x1, this.cutLine(x1) - 8); ctx.lineTo(x1, this.cutLine(x1) + 8); ctx.lineTo(x0, this.cutLine(x0) + 8); ctx.fill()
      ctx.restore()
    }
    // The seal, stamped just after the name.
    const stamp = clamp01((t - BEATS.seal) / 0.12)
    if (stamp > 0) {
      const last = glyphs[glyphs.length - 1]
      const sx = last.x + last.width / 2 + 66, sy = NAME_BASE - TITLE_SIZE * 0.42, scale = lerp(2.3, 1, easeOut(stamp))
      ctx.save()
      ctx.globalAlpha = stamp
      ctx.translate(sx, sy); ctx.rotate(-0.16); ctx.scale(scale, scale)
      ctx.fillStyle = '#a3130c'
      ctx.fillRect(-38, -38, 76, 76)
      ctx.strokeStyle = BONE; ctx.globalAlpha = stamp * 0.7; ctx.lineWidth = 2
      ctx.strokeRect(-31, -31, 62, 62)
      ctx.globalAlpha = stamp
      ctx.fillStyle = BONE; ctx.font = `400 30px ${BRUSH}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('眠', 0, -14); ctx.fillText('巨', 0, 16)
      ctx.restore()
    }
  }

  /** The cuts' flashes: white for the draw, white-then-red strobes for the kills and the cut through the name. */
  private drawFlashes(t: number, vw: number, vh: number) {
    const ctx = this.ctx
    const flash = (at: number, length: number, color: string, peak: number) => {
      const u = (t - at) / length
      if (u < 0 || u > 1) return
      ctx.fillStyle = color; ctx.globalAlpha = peak * (1 - u)
      ctx.fillRect(0, 0, vw, vh); ctx.globalAlpha = 1
    }
    flash(BEATS.dash, 0.08, '#ffffff', 0.95)
    for (const kill of BEATS.kills) { flash(kill, 0.035, '#ffffff', 0.9); flash(kill + 0.035, 0.14, '#5a0302', 0.5) }
    flash(BEATS.emblem, 0.18, '#ff3a1a', 0.22)
    flash(BEATS.ignite, 0.2, '#ffb030', 0.16)
    flash(BEATS.slash + 0.04, 0.05, '#ffffff', 0.5); flash(BEATS.slash + 0.09, 0.16, '#5a0302', 0.45)
  }
}
