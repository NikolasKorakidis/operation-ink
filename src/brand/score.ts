import { BEATS } from './cinematic'

/**
 * The ident's sound, synthesized (no recordings): a shamisen, taiko, the sword, the blood, a brush, fire and a gong,
 * all through one reverberant room and a master compressor. `scoreIdent` lays every sound on the same clock as the
 * picture (cinematic.ts BEATS), from `at` (the context's time the picture started).
 */
export type Mixer = { context: AudioContext; dry: GainNode; wet: GainNode; noise: AudioBuffer }

export function createMixer(): Mixer | null {
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Context) return null
  const context = new Context()
  const master = context.createGain()
  master.gain.value = 0.7
  const compressor = context.createDynamicsCompressor()
  compressor.threshold.value = -16; compressor.ratio.value = 4; compressor.attack.value = 0.003; compressor.release.value = 0.25
  master.connect(compressor).connect(context.destination)
  // A large dark hall: an impulse of decaying noise, two and a half seconds long.
  const length = context.sampleRate * 2.6
  const impulse = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.2)
  }
  const reverb = context.createConvolver()
  reverb.buffer = impulse
  const wet = context.createGain(), dry = context.createGain()
  wet.gain.value = 0.32; dry.gain.value = 1
  wet.connect(reverb).connect(master)
  dry.connect(master)
  const noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return { context, dry, wet, noise }
}

/** Send a node to the room: mostly dry, `space` of it into the reverb. */
function send(m: Mixer, node: AudioNode, space = 0.5) {
  node.connect(m.dry)
  const amount = m.context.createGain()
  amount.gain.value = space
  node.connect(amount).connect(m.wet)
}

function envelope(m: Mixer, at: number, attack: number, peak: number, decay: number) {
  const gain = m.context.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(peak, at + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
  return gain
}

function noiseThrough(m: Mixer, at: number, length: number, filter: BiquadFilterNode, gain: GainNode, space = 0.5) {
  const source = m.context.createBufferSource()
  source.buffer = m.noise
  source.connect(filter).connect(gain)
  send(m, gain, space)
  source.start(at, Math.random() * 1.5); source.stop(at + length + 0.05)
}

/** A shamisen note: a plucked string (Karplus-Strong), bright and twangy, fading fast. */
function shamisen(m: Mixer, at: number, frequency: number, level = 0.5) {
  const rate = m.context.sampleRate, length = Math.floor(rate * 1.6), period = Math.round(rate / frequency)
  const buffer = m.context.createBuffer(1, length, rate), data = buffer.getChannelData(0)
  for (let i = 0; i < period; i++) data[i] = Math.random() * 2 - 1
  for (let i = period; i < length; i++) data[i] = (data[i - period] + data[i - period + 1]) * 0.4985
  const source = m.context.createBufferSource()
  source.buffer = buffer
  const bright = m.context.createBiquadFilter()
  bright.type = 'peaking'; bright.frequency.value = 2800; bright.gain.value = 9; bright.Q.value = 1.2
  const gain = envelope(m, at, 0.002, level, 1.4)
  source.connect(bright).connect(gain)
  send(m, gain, 0.6)
  source.start(at)
}

/** A taiko: a low skin dropping in pitch, a slap of noise on top. */
function taiko(m: Mixer, at: number, pitch = 60, level = 1) {
  const body = m.context.createOscillator()
  body.type = 'sine'
  body.frequency.setValueAtTime(pitch * 2.1, at)
  body.frequency.exponentialRampToValueAtTime(pitch, at + 0.11)
  const gain = envelope(m, at, 0.006, level, 0.95)
  body.connect(gain)
  send(m, gain, 0.45)
  body.start(at); body.stop(at + 1.1)
  const low = m.context.createBiquadFilter()
  low.type = 'lowpass'; low.frequency.value = 1100
  noiseThrough(m, at, 0.14, low, envelope(m, at, 0.002, level * 0.5, 0.12), 0.3)
}

/** Air: noise swept through a band. */
function whoosh(m: Mixer, at: number, length: number, level: number, from: number, to: number, space = 0.4) {
  const band = m.context.createBiquadFilter()
  band.type = 'bandpass'; band.Q.value = 1.3
  band.frequency.setValueAtTime(from, at)
  band.frequency.exponentialRampToValueAtTime(to, at + length)
  const gain = m.context.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(level, at + length * 0.75)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  noiseThrough(m, at, length, band, gain, space)
}

/** The blade: a bright metallic ring of inharmonic partials, struck hard and slow to fade. */
function blade(m: Mixer, at: number, level = 1, length = 2.2) {
  for (const [frequency, share] of [[2637, 0.18], [3951, 0.11], [5274, 0.08], [1318, 0.07], [7040, 0.04]] as [number, number][]) {
    const tone = m.context.createOscillator()
    tone.type = 'sine'
    tone.frequency.setValueAtTime(frequency * 1.015, at)
    tone.frequency.exponentialRampToValueAtTime(frequency, at + 0.25)
    const gain = envelope(m, at, 0.003, share * level, length)
    tone.connect(gain)
    send(m, gain, 0.7)
    tone.start(at); tone.stop(at + length + 0.1)
  }
}

/** Blood: a wet burst (a low squelch) and the hiss of the spray going on after it. */
function spray(m: Mixer, at: number, level = 1) {
  const squelch = m.context.createBiquadFilter()
  squelch.type = 'lowpass'; squelch.frequency.setValueAtTime(900, at); squelch.frequency.exponentialRampToValueAtTime(140, at + 0.18)
  noiseThrough(m, at, 0.22, squelch, envelope(m, at, 0.004, level * 0.9, 0.2), 0.2)
  const hiss = m.context.createBiquadFilter()
  hiss.type = 'bandpass'; hiss.Q.value = 0.8; hiss.frequency.setValueAtTime(3800, at); hiss.frequency.exponentialRampToValueAtTime(1600, at + 0.8)
  noiseThrough(m, at + 0.02, 0.85, hiss, envelope(m, at + 0.02, 0.03, level * 0.32, 0.8), 0.35)
}

/** The sheath: a short wooden knock and a high click. */
function click(m: Mixer, at: number, level = 1) {
  const knock = m.context.createOscillator()
  knock.type = 'triangle'; knock.frequency.setValueAtTime(820, at); knock.frequency.exponentialRampToValueAtTime(260, at + 0.05)
  const gain = envelope(m, at, 0.001, 0.5 * level, 0.07)
  knock.connect(gain); send(m, gain, 0.7)
  knock.start(at); knock.stop(at + 0.1)
  const tick = m.context.createBiquadFilter()
  tick.type = 'highpass'; tick.frequency.value = 5000
  noiseThrough(m, at + 0.004, 0.03, tick, envelope(m, at + 0.004, 0.001, 0.6 * level, 0.025), 0.8)
}

/** Steel sliding over the hand, or into the saya: a thin hiss of metal on wood, falling slowly in pitch. */
function slide(m: Mixer, at: number, length: number, level: number) {
  const band = m.context.createBiquadFilter()
  band.type = 'bandpass'; band.Q.value = 2.5
  band.frequency.setValueAtTime(5600, at); band.frequency.linearRampToValueAtTime(3400, at + length)
  const gain = m.context.createGain()
  gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(level, at + Math.min(0.2, length / 3))
  gain.gain.setValueAtTime(level, at + length - 0.1); gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  noiseThrough(m, at, length, band, gain, 0.5)
}

/** A low held breath under the sheathing: a deep drone and a breathy shakuhachi-like tone over it. */
function drone(m: Mixer, at: number, length: number) {
  for (const [frequency, level] of [[49, 0.16], [73.4, 0.08]] as [number, number][]) {
    const tone = m.context.createOscillator()
    tone.type = 'sine'; tone.frequency.value = frequency
    const gain = m.context.createGain()
    gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(level, at + 0.7)
    gain.gain.setValueAtTime(level, at + length - 0.3); gain.gain.exponentialRampToValueAtTime(0.0001, at + length + 0.4)
    tone.connect(gain); send(m, gain, 0.6)
    tone.start(at); tone.stop(at + length + 0.5)
  }
  const breath = m.context.createBiquadFilter()
  breath.type = 'bandpass'; breath.Q.value = 6; breath.frequency.value = 587
  const gain = m.context.createGain()
  gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(0.12, at + length * 0.5); gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  noiseThrough(m, at, Math.min(length, 2.8), breath, gain, 0.8)
}

/** A rising swell into the logo: noise and a low tone climbing together. */
function swell(m: Mixer, at: number, length: number) {
  whoosh(m, at, length, 0.35, 200, 5000, 0.8)
  const tone = m.context.createOscillator()
  tone.type = 'sawtooth'; tone.frequency.setValueAtTime(55, at); tone.frequency.exponentialRampToValueAtTime(110, at + length)
  const filter = m.context.createBiquadFilter()
  filter.type = 'lowpass'; filter.frequency.setValueAtTime(200, at); filter.frequency.exponentialRampToValueAtTime(1600, at + length)
  const gain = m.context.createGain()
  gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(0.22, at + length); gain.gain.exponentialRampToValueAtTime(0.0001, at + length + 0.05)
  tone.connect(filter).connect(gain); send(m, gain, 0.6)
  tone.start(at); tone.stop(at + length + 0.1)
}

/** A body hitting the ground: a dull low thump and a wet slap. */
function thud(m: Mixer, at: number, level = 0.7) {
  taiko(m, at, 34, level)
  const slap = m.context.createBiquadFilter()
  slap.type = 'lowpass'; slap.frequency.value = 700
  noiseThrough(m, at, 0.12, slap, envelope(m, at, 0.003, level * 0.6, 0.1), 0.15)
}

/** Fire catching in the eyes: a rush of filtered noise with a crackle. */
function ignite(m: Mixer, at: number) {
  whoosh(m, at, 0.5, 0.45, 400, 1800, 0.5)
  for (let i = 0; i < 8; i++) {
    const crack = m.context.createBiquadFilter()
    crack.type = 'highpass'; crack.frequency.value = 2500
    const t = at + 0.05 + Math.random() * 0.5
    noiseThrough(m, t, 0.02, crack, envelope(m, t, 0.001, 0.25, 0.02), 0.3)
  }
}

/** A deep temple gong with a long tail. */
function gong(m: Mixer, at: number) {
  for (const [frequency, share] of [[55, 0.5], [110.6, 0.25], [164.2, 0.16], [233, 0.08]] as [number, number][]) {
    const tone = m.context.createOscillator()
    tone.type = 'sine'; tone.frequency.value = frequency
    const gain = envelope(m, at, 0.02, share, 3.4)
    tone.connect(gain); send(m, gain, 0.8)
    tone.start(at); tone.stop(at + 3.6)
  }
  taiko(m, at, 38, 0.8)
}

/** Every sound of the ident, on the picture's clock (seconds from the start). */
export function scoreIdent(m: Mixer, at: number) {
  const t = (seconds: number) => at + seconds
  // The epigraph: a lone shamisen phrase in the miyako-bushi scale (D Eb G A Bb).
  for (const [time, note] of [[0.12, 293.7], [0.42, 311.1], [0.66, 392], [0.82, 293.7]] as [number, number][]) shamisen(m, t(time), note, 0.45)
  // The smash cut to the sunset, and the charge.
  taiko(m, t(BEATS.smash), 52, 1.1); shamisen(m, t(BEATS.smash), 146.8, 0.6)
  for (const time of [1.38, 1.58, 1.74, 1.84]) taiko(m, t(time), 88, 0.32)
  whoosh(m, t(1.45), 0.45, 0.2, 300, 900)
  // The draw: the dash, then the blade hanging in the silence.
  whoosh(m, t(BEATS.dash - 0.04), 0.14, 0.9, 1500, 9000, 0.3)
  blade(m, t(BEATS.dash + 0.07), 1, 2.4)
  // Three cuts (a tearing slice through flesh), three geysers, three letters; the bodies hitting the ground.
  for (const [i, pitch] of [66, 58, 48].entries()) {
    const time = BEATS.kills[i]
    whoosh(m, t(time - 0.01), 0.07, 0.7, 2500, 7000, 0.2); spray(m, t(time), 1.1); taiko(m, t(time), pitch, 1.15)
  }
  for (const time of [BEATS.kills[0] + 0.37, BEATS.kills[1] + 0.37, BEATS.kills[2] + 0.5]) thud(m, t(time), 0.6)
  // Chiburi: the blade raised, snapped down, and the blood spattering across the ground.
  whoosh(m, t(BEATS.chiburi), 0.12, 0.2, 600, 1500, 0.3)
  whoosh(m, t(BEATS.flick - 0.04), 0.12, 0.9, 1200, 6500, 0.3)
  spray(m, t(BEATS.flick + 0.12), 0.45)
  // The noto: a held breath under it; steel over the hand, then sliding home; the click, and the silence after.
  drone(m, t(BEATS.turn), BEATS.click - BEATS.turn)
  slide(m, t(BEATS.draw), BEATS.sheathe - BEATS.draw, 0.07)
  click(m, t(BEATS.sheathe), 0.25)
  slide(m, t(BEATS.sheathe + 0.03), BEATS.click - BEATS.sheathe - 0.03, 0.11)
  click(m, t(BEATS.click), 1.4)
  // The title slamming in, the swell into the logo, the eyes, the sword through the name, the seal, the gong.
  whoosh(m, t(BEATS.write + 0.05), 0.7, 0.22, 500, 2600, 0.5)
  swell(m, t(BEATS.emblem - 0.7), 0.75)
  taiko(m, t(BEATS.emblem + 0.05), 44, 1.2)
  ignite(m, t(BEATS.ignite))
  whoosh(m, t(BEATS.slash - 0.05), 0.1, 0.85, 1500, 9000, 0.3); blade(m, t(BEATS.slash + 0.04), 0.8, 1.8); spray(m, t(BEATS.slash + 0.05), 0.6)
  taiko(m, t(BEATS.seal), 92, 0.6)
  gong(m, t(BEATS.seal + 0.02))
}
