/**
 * The grain of the sheet, as a scalar field over paper space.
 *
 * The paper shades itself with it and the ink reads it back, so the fibre you
 * see under a letter is the same fibre the page is made of.
 */

import { Fn, mx_fractal_noise_float, vec3 } from "three/tsl";

import { INCH } from "./sheet-metrics";
import type { Vec2Node } from "./tsl-types";

/** Fibres run along the grain, so the noise is stretched across it. */
const GRAIN_STRETCH = 3.5;
const FIBRE_SCALE = 1 / (0.012 * INCH);
const BLOTCH_SCALE = 1 / (0.9 * INCH);

/** Fine directional fibre, centred on 0. */
export const paperFibre = /*#__PURE__*/ Fn(([paperXy]: [Vec2Node]) =>
  mx_fractal_noise_float(
    vec3(
      paperXy.x.mul(FIBRE_SCALE),
      paperXy.y.mul(FIBRE_SCALE / GRAIN_STRETCH),
      0,
    ),
    3,
    2,
    0.5,
    1,
  ),
);

/** Slow variation in the pulp — the cloudiness you see holding a sheet up to
 * the light. Centred on 0. */
export const paperBlotch = /*#__PURE__*/ Fn(([paperXy]: [Vec2Node]) =>
  mx_fractal_noise_float(
    vec3(paperXy.x.mul(BLOTCH_SCALE), paperXy.y.mul(BLOTCH_SCALE), 0),
    4,
    2,
    0.5,
    1,
  ),
);

export const FIBRE_STRENGTH = 0.085;
export const BLOTCH_STRENGTH = 0.06;
