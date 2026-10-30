// The browser has no system alert sound, so a short tone stands in for NSBeep.
let audio: AudioContext | null = null;

function wake(): AudioContext | null {
  try {
    audio ??= new AudioContext();
    if (audio.state !== "running") void audio.resume().catch(() => {});
  } catch {}
  return audio;
}

/** Safari starts audio only within a gesture, and bells come from the worker, outside one: call in one. */
export function wakeBeep() {
  wake();
  window.addEventListener("pointerdown", wake, { capture: true, once: true });
  window.addEventListener("keydown", wake, { capture: true, once: true });
}

export function beep() {
  const ctx = wake();
  // a suspended context would queue every beep to sound at once when it wakes
  if (ctx?.state !== "running") return;
  const t = ctx.currentTime;
  const tone = ctx.createOscillator();
  const gain = ctx.createGain();
  tone.frequency.value = 880;
  gain.gain.setValueAtTime(0.08, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  tone.connect(gain).connect(ctx.destination);
  tone.start(t);
  tone.stop(t + 0.12);
}
