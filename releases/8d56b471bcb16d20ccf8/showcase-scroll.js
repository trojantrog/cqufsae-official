const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

// The page owns the destination. A system animation may temporarily own the
// displayed pose, but never writes back into the page's scroll position.
export function storyPosition(scrollTop, sectionTop, sectionHeight, stageHeight) {
  const travel = Math.max(0, sectionHeight - stageHeight);
  const phase = travel > 0 ? clamp((scrollTop - sectionTop) / travel) : 0;
  return {
    phase,
    explosion: clamp((phase - .10) / .78),
    heroOpacity: 1 - smooth(phase / .16)
  };
}

export function createScrollScrub() {
  let ready = false, display = 0, previousPhase = 'overview', handoff = null;
  return {
    step({target, actual, phase, dt, reduced = false}) {
      target = clamp(target);
      if (!ready) { display = phase === 'overview' ? target : actual; ready = true; }
      if (phase !== 'overview') {
        display = actual; previousPhase = phase; handoff = null;
        return actual;
      }
      if (previousPhase !== 'overview') handoff = {from: actual, age: 0};
      previousPhase = phase;
      if (reduced) { display = target; handoff = null; }
      else if (handoff) {
        const t = smooth(handoff.age / .9);
        display = handoff.from + (target - handoff.from) * t;
        handoff.age += Math.max(0, dt);
        if (t === 1) handoff = null;
      } else {
        display += (target - display) * (1 - Math.exp(-Math.max(0, dt) * 9));
        if (Math.abs(display - target) < .00002) display = target;
      }
      return clamp(display);
    }
  };
}
