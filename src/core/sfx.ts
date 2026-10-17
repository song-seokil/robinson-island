/**
 * 무에셋 사운드 — WebAudio 로 그때그때 합성한다. (파일 없음)
 * 브라우저 정책상 첫 터치에서 init() 을 호출해야 소리가 난다.
 */
type SfxName =
  | 'hit' | 'crit' | 'chop' | 'mine' | 'pick' | 'shoot' | 'boom' | 'coin'
  | 'craft' | 'place' | 'hurt' | 'horn' | 'win' | 'lose' | 'ui' | 'eat' | 'level';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function ensure(): boolean {
  if (typeof window === 'undefined') return false;
  if (ctx) return true;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.42;
  master.connect(ctx.destination);
  return true;
}

export function initAudio() {
  if (!ensure()) return;
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}

export function setMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.42;
}

export function isMuted() { return muted; }

interface ToneOpts {
  freq: number;
  to?: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

function tone(o: ToneOpts) {
  if (!ensure() || !ctx || !master || muted) return;
  const t0 = ctx.currentTime + (o.delay ?? 0);
  const dur = o.dur ?? 0.12;
  const osc = ctx.createOscillator();
  const gn = ctx.createGain();
  osc.type = o.type ?? 'square';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.to && o.to !== o.freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
  const peak = o.gain ?? 0.3;
  gn.gain.setValueAtTime(0.0001, t0);
  gn.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gn).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur = 0.2, gain = 0.3, freq = 900, q = 1, delay = 0) {
  if (!ensure() || !ctx || !master || muted) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const flt = ctx.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.value = freq;
  flt.Q.value = q;
  const gn = ctx.createGain();
  gn.gain.value = gain;
  src.connect(flt).connect(gn).connect(master);
  src.start(t0);
}

export function play(name: SfxName) {
  switch (name) {
    case 'hit':
      noise(0.09, 0.5, 1600, 1);
      tone({ freq: 220, to: 90, dur: 0.09, type: 'square', gain: 0.18 });
      break;
    case 'crit':
      noise(0.14, 0.6, 2600, 2);
      tone({ freq: 660, to: 120, dur: 0.18, type: 'sawtooth', gain: 0.22 });
      break;
    case 'chop':
      noise(0.13, 0.55, 700, 1);
      tone({ freq: 160, to: 70, dur: 0.1, type: 'triangle', gain: 0.2 });
      break;
    case 'mine':
      noise(0.1, 0.5, 2400, 3);
      tone({ freq: 300, to: 130, dur: 0.08, type: 'square', gain: 0.16 });
      break;
    case 'pick':
      tone({ freq: 880, to: 1320, dur: 0.09, type: 'sine', gain: 0.2 });
      break;
    case 'shoot':
      noise(0.07, 0.3, 3200, 2);
      tone({ freq: 900, to: 1600, dur: 0.07, type: 'sine', gain: 0.14 });
      break;
    case 'boom':
      noise(0.5, 0.85, 380, 1);
      tone({ freq: 90, to: 40, dur: 0.5, type: 'sawtooth', gain: 0.3 });
      break;
    case 'coin':
      tone({ freq: 1180, dur: 0.08, type: 'sine', gain: 0.22 });
      tone({ freq: 1560, dur: 0.12, type: 'sine', gain: 0.18, delay: 0.07 });
      break;
    case 'craft':
      tone({ freq: 520, dur: 0.08, type: 'triangle', gain: 0.22 });
      tone({ freq: 780, dur: 0.1, type: 'triangle', gain: 0.2, delay: 0.08 });
      tone({ freq: 1040, dur: 0.14, type: 'triangle', gain: 0.18, delay: 0.17 });
      break;
    case 'place':
      noise(0.12, 0.4, 900, 1);
      tone({ freq: 200, to: 300, dur: 0.1, type: 'triangle', gain: 0.2 });
      break;
    case 'hurt':
      tone({ freq: 300, to: 110, dur: 0.2, type: 'sawtooth', gain: 0.25 });
      break;
    case 'horn':
      tone({ freq: 180, to: 150, dur: 0.7, type: 'sawtooth', gain: 0.26 });
      tone({ freq: 240, to: 200, dur: 0.7, type: 'square', gain: 0.14, delay: 0.03 });
      break;
    case 'win':
      [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.22, delay: i * 0.11 }));
      break;
    case 'lose':
      [440, 370, 294, 220].forEach((f, i) => tone({ freq: f, dur: 0.26, type: 'sawtooth', gain: 0.2, delay: i * 0.13 }));
      break;
    case 'level':
      [659, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'sine', gain: 0.2, delay: i * 0.08 }));
      break;
    case 'eat':
      tone({ freq: 260, to: 380, dur: 0.12, type: 'triangle', gain: 0.2 });
      break;
    case 'ui':
    default:
      tone({ freq: 620, dur: 0.05, type: 'sine', gain: 0.14 });
      break;
  }
}
