// One shared <audio> element for the whole app, plus a lazily created Web Audio
// graph for the visuals and the karaoke vocal remover. Every direct source we
// use (iTunes, Audius) sends CORS headers, so routing through Web Audio works.

export const audio = new Audio()
audio.crossOrigin = 'anonymous'
audio.preload = 'auto'

let ctx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let bins: Uint8Array | null = null
let vocalGain: GainNode | null = null
let bassGain: GainNode | null = null
let airGain: GainNode | null = null
let pendingVocals = 1

/**
 * Mid/side vocal remover. Lead vocals usually sit dead centre (the "mid"
 * signal, L+R), while most instruments are spread to the sides (L−R).
 * Turning the mid down removes the voice; the mid's bass and top end are
 * added back so the kick, bass line and cymbals survive.
 *
 *   outL = side + mid·v + bass(mid)·(1−v) + air(mid)·(1−v)/2
 *   outR = −side + mid·v + …
 * At v = 1 this is exactly the original stereo signal.
 */
export function ensureAudioGraph() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return
  }
  try {
    ctx = new AudioContext()
    const src = ctx.createMediaElementSource(audio)
    const split = ctx.createChannelSplitter(2)
    const merge = ctx.createChannelMerger(2)
    const g = (v: number) => {
      const n = ctx!.createGain()
      n.gain.value = v
      return n
    }
    src.connect(split)

    const mid = g(1)
    const side = g(1)
    const lToMid = g(0.5)
    const rToMid = g(0.5)
    const lToSide = g(0.5)
    const rToSide = g(-0.5)
    split.connect(lToMid, 0)
    split.connect(rToMid, 1)
    split.connect(lToSide, 0)
    split.connect(rToSide, 1)
    lToMid.connect(mid)
    rToMid.connect(mid)
    lToSide.connect(side)
    rToSide.connect(side)

    vocalGain = g(pendingVocals)
    mid.connect(vocalGain)
    const low = ctx.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 140
    bassGain = g(1 - pendingVocals)
    mid.connect(low).connect(bassGain)
    const high = ctx.createBiquadFilter()
    high.type = 'highpass'
    high.frequency.value = 9000
    airGain = g((1 - pendingVocals) * 0.5)
    mid.connect(high).connect(airGain)

    for (const n of [vocalGain, bassGain, airGain]) {
      n.connect(merge, 0, 0)
      n.connect(merge, 0, 1)
    }
    const sideNeg = g(-1)
    side.connect(merge, 0, 0)
    side.connect(sideNeg)
    sideNeg.connect(merge, 0, 1)

    analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.8
    merge.connect(analyser)
    analyser.connect(ctx.destination)
    bins = new Uint8Array(analyser.frequencyBinCount)
  } catch {
    ctx = null
  }
}

/** 0 = vocals removed, 1 = untouched. Applies to direct audio only. */
export function setVocalLevel(v: number) {
  pendingVocals = v
  if (!ctx || !vocalGain || !bassGain || !airGain) return
  const t = ctx.currentTime
  vocalGain.gain.setTargetAtTime(v, t, 0.05)
  bassGain.gain.setTargetAtTime(1 - v, t, 0.05)
  airGain.gain.setTargetAtTime((1 - v) * 0.5, t, 0.05)
}

/** Frequency data (0–255 per bin), or null before the graph exists. */
export function readBins() {
  if (!analyser || !bins) return null
  analyser.getByteFrequencyData(bins)
  return bins
}

/** Rough 0–1 bass energy, used to pulse the visuals. */
export function bassLevel() {
  const b = readBins()
  if (!b) return 0
  let sum = 0
  for (let i = 1; i < 9; i++) sum += b[i]
  return sum / (8 * 255)
}
