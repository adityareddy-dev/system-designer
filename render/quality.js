// Automatic graphics quality. It steps down only on sustained slow frames, checks that the step really helped,
// and steps back up once frames are comfortable again. Loading, a hidden tab and a capped display rate never
// leave the canvas on a lower level.

export const LEVELS = ['low', 'medium', 'high'];

const WARMUP_MS = 3000;     // the first frames carry loading work, not a measure of the device
const GAP_MS = 250;         // a longer pause between frames is a hidden tab or a long task, not a slow renderer
const SLOW_MS = 24;         // sustained frames slower than this (about 42 a second) step the quality down
const FAST_MS = 18.5;       // sustained frames faster than this (a 60 Hz screen runs at 16.7) step it back up
const HELPED = 0.85;        // a lower level must make frames at least 15 percent faster to be kept

export function createQualityGovernor({ level = 'high', now = 0 } = {}) {
  let cur = LEVELS.includes(level) ? level : 'high';
  let samples = [];          // time, frame interval pairs
  let quietUntil = now + WARMUP_MS;
  let changedAt = now, checkAt = 0;
  let trial = null;          // the last step down, until it is shown to have helped
  let floor = 0;             // lowest level the governor may still choose
  let upWait = 6000, raisedAt = -Infinity;

  // Mean frame interval over the last `span` ms, or null unless frames were drawn through nearly all of it.
  function mean(now, span) {
    let sum = 0, n = 0;
    for (let i = 0; i < samples.length; i += 2) if (now - samples[i] <= span) { sum += samples[i + 1]; n++; }
    return n >= 12 && sum >= span * 0.8 ? sum / n : null;
  }
  function move(to, now) {
    cur = LEVELS[to]; changedAt = now; samples = [];
    return cur;
  }

  return {
    get level() { return cur; },
    // Call when frames are about to be slow for a reason that is not the device: a resize, a theme change, a tab coming back.
    settle(now, ms = 1500) { quietUntil = Math.max(quietUntil, now + ms); samples = []; },
    reset(level, now) { cur = LEVELS.includes(level) ? level : cur; samples = []; trial = null; floor = 0; changedAt = now; quietUntil = now + 1000; },
    // One drawn frame. Returns the new level when it changes, otherwise null.
    sample(now, dt) {
      if (!(dt > 0) || now < quietUntil) return null;
      if (dt > GAP_MS) { samples = []; quietUntil = now + 500; return null; }
      samples.push(now, dt);
      while (samples.length && now - samples[0] > 4000) samples.splice(0, 2);
      if (now < checkAt) return null;
      checkAt = now + 500;
      const i = LEVELS.indexOf(cur);
      const recent = mean(now, 2500);
      if (trial) {
        if (recent == null || now - changedAt < 2500) return null;
        const helped = recent <= trial.before * HELPED;
        const from = trial.from;
        trial = null;
        // Frames stayed as slow as before (a display capped at 30 a second, a busy machine): the sharper level comes back for good.
        if (!helped) { floor = from; return move(from, now); }
      }
      if (recent != null && recent > SLOW_MS && now - changedAt > 2500 && i > floor) {
        if (now - raisedAt < 10000) upWait = Math.min(upWait * 2, 120000);
        trial = { from: i, before: recent };
        return move(i - 1, now);
      }
      const calm = mean(now, 4000);
      if (calm != null && calm < FAST_MS && now - changedAt > upWait && i < LEVELS.length - 1) {
        raisedAt = now;
        return move(i + 1, now);
      }
      return null;
    },
  };
}
