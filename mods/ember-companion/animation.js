export const ANIMATION_TICK_MS = 100;

const SEQUENCES = {
  idle: [[0, 3400], [2, 200], [0, 400]],
  working: [[0, 1100], [1, 1100], [2, 200], [0, 600]],
  blocked: [[0, 3400], [2, 200], [0, 400]],
  done: [[0, 300], [1, 300], [2, 300], [1, 300]],
  sleeping: [[0, 800], [1, 800], [2, 800], [1, 800]],
};

export function animationFrame(state, now, motion = true) {
  const key = Object.prototype.hasOwnProperty.call(SEQUENCES, state) ? state : "idle";
  const sequence = SEQUENCES[key];
  let frame = 0;
  if (motion) {
    const duration = sequence.reduce((sum, step) => sum + step[1], 0);
    let elapsed = Math.max(0, Number.isFinite(now) ? now : 0) % duration;
    for (const [index, milliseconds] of sequence) {
      frame = index;
      if (elapsed < milliseconds) break;
      elapsed -= milliseconds;
    }
  }
  return `mods/ember-companion/animation/${key}-${frame}.svg`;
}
