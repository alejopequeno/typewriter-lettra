/**
 * A damped spring around zero, for anything that gets hit and settles.
 *
 * Kick it with a velocity and step it each frame; the value overshoots and
 * rings down by itself. Framerate-independent through the step size.
 */

export interface Spring {
  readonly value: number;
  /** Adds velocity, as a blow does. */
  readonly kick: (velocity: number) => void;
  /** Advances by `dt` seconds and returns the new value. */
  readonly update: (dt: number) => number;
}

export interface SpringOptions {
  /** Pull back towards rest. Higher is snappier. */
  readonly stiffness: number;
  /** Resistance to motion. Below 2·√stiffness it rings; above, it creeps. */
  readonly damping: number;
}

/** Sub-steps keep a stiff spring stable on a long frame. */
const MAX_STEP = 1 / 240;

export const createSpring = ({ stiffness, damping }: SpringOptions): Spring => {
  let value = 0;
  let velocity = 0;

  return {
    get value() {
      return value;
    },
    kick: (added) => {
      velocity += added;
    },
    update: (dt) => {
      let remaining = dt;
      while (remaining > 0) {
        const step = Math.min(remaining, MAX_STEP);
        velocity += (-stiffness * value - damping * velocity) * step;
        value += velocity * step;
        remaining -= step;
      }
      return value;
    },
  };
};
