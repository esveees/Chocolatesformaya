// Tiny, dependency-free tween engine driven by the main render loop.
// Each tween is a plain object pushed into an active list and stepped every frame.

const activeTweens = new Set();

export const Easing = {
  linear: t => t,
  quadOut: t => 1 - (1 - t) * (1 - t),
  quadInOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  cubicOut: t => 1 - Math.pow(1 - t, 3),
  cubicInOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  backOut: t => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  backIn: t => {
    const c1 = 1.70158, c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  elasticOut: t => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  sineInOut: t => -(Math.cos(Math.PI * t) - 1) / 2,
};

/**
 * Animate a set of numeric properties on `target` from their current values to `to`.
 * Returns a controller with .stop() and .promise.
 */
export function tween(target, to, { duration = 600, easing = Easing.quadInOut, delay = 0, onUpdate, onComplete } = {}) {
  const from = {};
  for (const key in to) from[key] = target[key];

  const entry = {
    target, from, to, duration, easing, onUpdate, onComplete,
    startTime: null,
    delay,
    done: false,
  };

  let resolvePromise;
  const promise = new Promise(res => { resolvePromise = res; });
  entry._resolve = resolvePromise;

  activeTweens.add(entry);
  return {
    stop() { activeTweens.delete(entry); },
    promise,
  };
}

export function stepTweens(nowMs) {
  for (const entry of activeTweens) {
    if (entry.startTime === null) entry.startTime = nowMs + entry.delay * 1000;
    const elapsedMs = nowMs - entry.startTime;
    if (elapsedMs < 0) continue;
    let t = entry.duration <= 0 ? 1 : Math.min(1, elapsedMs / entry.duration);
    const eased = entry.easing(t);
    for (const key in entry.to) {
      entry.target[key] = entry.from[key] + (entry.to[key] - entry.from[key]) * eased;
    }
    if (entry.onUpdate) entry.onUpdate(eased, t);
    if (t >= 1 && !entry.done) {
      entry.done = true;
      activeTweens.delete(entry);
      if (entry.onComplete) entry.onComplete();
      entry._resolve();
    }
  }
}

export function delay(seconds) {
  return new Promise(res => setTimeout(res, seconds * 1000));
}
