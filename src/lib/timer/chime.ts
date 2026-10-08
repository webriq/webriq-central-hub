// Break chimes, synthesized with the Web Audio API so no audio asset ships with the app. Browsers
// only let an AudioContext produce sound after a user gesture: unlockChime() is called from the
// "start break" click and from the first pointer/key event after a reload.

const MUTE_KEY = "timer-chime-muted";
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

export function unlockChime(): void {
  const c = getContext();
  if (c?.state === "suspended") void c.resume().catch(() => {});
}

export function isChimeMuted(): boolean {
  try { return window.localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}

export function setChimeMuted(muted: boolean): void {
  try { window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* storage unavailable */ }
}

function bell(c: AudioContext, freq: number, at: number, length: number, volume: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

// "warning": one soft two-note ping. "end": a longer ascending ring, repeated, so it is noticed.
export function playChime(kind: "warning" | "end"): void {
  if (isChimeMuted()) return;
  const c = getContext();
  if (!c) return;
  if (c.state === "suspended") void c.resume().catch(() => {});
  const t = c.currentTime + 0.05;
  if (kind === "warning") {
    bell(c, 660, t, 0.7, 0.25);
    bell(c, 880, t + 0.25, 0.9, 0.25);
    return;
  }
  [0, 1.4].forEach((offset) => {
    bell(c, 659, t + offset, 0.8, 0.35);
    bell(c, 784, t + offset + 0.3, 0.8, 0.35);
    bell(c, 1047, t + offset + 0.6, 1.1, 0.35);
  });
}
