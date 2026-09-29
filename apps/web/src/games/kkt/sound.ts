/**
 * 쿵쿵따 사운드 실험 (KKT 스펙 “사운드 실험”) — 음원 파일 없이 Web Audio로 합성한다 (저작권 문제 없음).
 * 다른 게임에는 쓰지 않는다.
 *
 * - 브라우저는 사용자가 화면을 한 번 눌러야 소리를 낼 수 있다 → 앱 어디든 첫 클릭·키 입력 때 오디오를 켠다
 *   (대기실의 준비/방 만들기 버튼이 보통 첫 클릭).
 * - 음소거 상태는 이 브라우저에만 저장한다.
 */

let ctx: AudioContext | null = null;
let muted = readMuted();
const listeners = new Set<(m: boolean) => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem('backstage.kkt.muted') === '1';
  } catch {
    return false;
  }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null; // 소리를 못 내도 게임은 그대로 진행
  }
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    audio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem('backstage.kkt.muted', m ? '1' : '0');
  } catch {
    /* 저장 못 해도 이번 화면에서는 적용 */
  }
  if (m) stopScheduled();
  listeners.forEach((fn) => fn(m));
}

export function onMutedChange(fn: (m: boolean) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// ───────── 합성 부품 ─────────

/** 예약된 비트 (차례가 바뀌면 멈춘다). 효과음은 끝까지 울린다. */
const beatNodes: AudioScheduledSourceNode[] = [];
let collecting: AudioScheduledSourceNode[] | null = null;

function track(node: AudioScheduledSourceNode) {
  if (!collecting) return;
  collecting.push(node);
  node.onended = () => {
    const i = beatNodes.indexOf(node);
    if (i >= 0) beatNodes.splice(i, 1);
  };
}

export function stopScheduled() {
  for (const n of beatNodes.splice(0)) {
    try {
      n.stop();
    } catch {
      /* 이미 끝남 */
    }
  }
}

function tone(ac: AudioContext, at: number, opts: { type: OscillatorType; from: number; to?: number; dur: number; gain: number }) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.from, at);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, at + opts.dur);
  g.gain.setValueAtTime(opts.gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + opts.dur);
  osc.connect(g).connect(ac.destination);
  osc.start(at);
  osc.stop(at + opts.dur + 0.02);
  track(osc);
}

function noise(ac: AudioContext, at: number, opts: { dur: number; gain: number; filter: number; filterTo?: number; type?: BiquadFilterType }) {
  const len = Math.ceil(ac.sampleRate * opts.dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.setValueAtTime(opts.filter, at);
  if (opts.filterTo) f.frequency.exponentialRampToValueAtTime(opts.filterTo, at + opts.dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(opts.gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + opts.dur);
  src.connect(f).connect(g).connect(ac.destination);
  src.start(at);
  src.stop(at + opts.dur + 0.02);
  track(src);
}

function kung(ac: AudioContext, at: number, gain = 0.9) {
  tone(ac, at, { type: 'sine', from: 140, to: 45, dur: 0.22, gain });
}

function tta(ac: AudioContext, at: number, gain = 0.5) {
  noise(ac, at, { dur: 0.12, gain, filter: 2200 });
  tone(ac, at, { type: 'triangle', from: 330, to: 180, dur: 0.1, gain: gain * 0.6 });
}

// ───────── 게임에서 쓰는 소리 ─────────

/** 차례 동안 “쿵·쿵·따” 3마디를 차례 타이머에 맞춰 예약한다. remainingMs = 남은 차례 시간 */
export const BARS_PER_TURN = 3;
export function playTurnBeat(turnMs: number, remainingMs: number) {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  stopScheduled();
  collecting = beatNodes;
  const bar = turnMs / 1000 / BARS_PER_TURN;
  const elapsed = (turnMs - remainingMs) / 1000;
  const now = ac.currentTime;
  for (let b = 0; b < BARS_PER_TURN; b++) {
    const beats: [number, 'kung' | 'tta'][] = [
      [0, 'kung'],
      [bar / 3, 'kung'],
      [(bar * 2) / 3, 'tta'],
    ];
    for (const [off, kind] of beats) {
      const t = b * bar + off - elapsed;
      if (t < -0.01) continue;
      const at = now + Math.max(0, t);
      const last = b === BARS_PER_TURN - 1;
      if (kind === 'kung') kung(ac, at, last ? 1 : 0.75);
      else tta(ac, at, last ? 0.7 : 0.45);
    }
  }
  collecting = null;
}

/** 단어 통과 “따!” */
export function playPass() {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const at = ac.currentTime;
  tone(ac, at, { type: 'square', from: 880, to: 1320, dur: 0.12, gain: 0.18 });
  tta(ac, at, 0.35);
}

/** 탈락 “땡” */
export function playFail() {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  stopScheduled();
  const at = ac.currentTime;
  tone(ac, at, { type: 'sine', from: 440, dur: 0.9, gain: 0.35 });
  tone(ac, at, { type: 'sine', from: 466, dur: 0.9, gain: 0.25 });
}

/** 한방단어 폭발 */
export function playBomb() {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const at = ac.currentTime + 0.05;
  noise(ac, at, { dur: 0.9, gain: 0.8, filter: 1800, filterTo: 80, type: 'lowpass' });
  tone(ac, at, { type: 'sine', from: 90, to: 30, dur: 0.7, gain: 0.9 });
}

/** 마지막 1명 팡파르 */
export function playFanfare() {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  stopScheduled();
  const at = ac.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => tone(ac, at + i * 0.12, { type: 'square', from: f, dur: i === 3 ? 0.5 : 0.14, gain: 0.14 }));
}
