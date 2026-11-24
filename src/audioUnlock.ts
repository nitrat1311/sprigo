// iOS Safari only starts audio inside a user activation. Per the HTML spec touchstart and a touch pointerdown do not
// grant one; touchend and a non-mouse pointerup do, so those are the events to warm audio from.
type TapTarget = {
  addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions): void;
  removeEventListener(type: string, listener: () => void): void;
};

/**
 * Calls `unlock` on every pointerup / touchend until it returns true (or resolves true), then stops listening.
 * A rejected `unlock` also stops it: that unlock can never succeed. Returns a function that stops listening early.
 */
export function unlockOnGesture(unlock: () => boolean | Promise<boolean>, doc: TapTarget = document): () => void {
  const taps = ["pointerup", "touchend"];
  const stop = () => taps.forEach((k) => doc.removeEventListener(k, run));
  const run = () => {
    let done: boolean | Promise<boolean>;
    try { done = unlock(); }
    catch { done = true; } // nothing else to try: an unlock that throws is not retried
    if (typeof done === "boolean") { if (done) stop(); }
    else void done.then((ok) => { if (ok) stop(); }, stop);
  };
  // Passive: the unlock never calls preventDefault, so it leaves scrolling and taps untouched.
  taps.forEach((k) => doc.addEventListener(k, run, { passive: true }));
  return stop;
}
