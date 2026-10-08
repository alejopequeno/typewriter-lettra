/**
 * The shape of the sheet: wrapped over the roller at the top, bowed across its
 * width lower down.
 *
 * Both the paper and the ink printed on it run these same functions, which is
 * the whole reason the letters stay glued to the page when it bends. Keep them
 * here, import them twice, never copy them.
 */

import { Fn, PI, cos, float, max, min, normalize, sin, smoothstep, vec3 } from "three/tsl";

import { CURL_TANGENT_Y, INCH, ROLLER_RADIUS, SHEET_WIDTH } from "./sheet-metrics";
import type { FloatNode, Vec3Node } from "./tsl-types";

/** How far the middle of the page stands proud of its edges once it is clear
 * of the bail. A sheet gripped along one edge never hangs flat. */
const BOW_DEPTH = 0.8 * INCH * 0.045;
/** How far down the page the bow takes to reach full depth. */
const BOW_ONSET = 2.6 * INCH;

/** Flat distance from the tangent line, as an angle around the platen. 0 on
 * the flat part of the page; grows as the sheet goes over the roller. */
export const wrapAngle = (position: Vec3Node): FloatNode =>
  max(position.y.sub(float(CURL_TANGENT_Y)), 0).div(float(ROLLER_RADIUS));

/** 0 where the bail still holds the page flat, 1 where it hangs free. */
const bowAmount = (position: Vec3Node): FloatNode =>
  smoothstep(
    float(CURL_TANGENT_Y),
    float(CURL_TANGENT_Y - BOW_ONSET),
    position.y,
  );

/** Rate of change of the bow's phase with x. A plain number: `PI` from TSL is
 * a node, and dividing a node by a number here yields NaN in the shader. */
const BOW_PHASE_RATE = Math.PI / SHEET_WIDTH;

/** Phase across the width: 0 at the left edge, PI at the right. */
const bowPhase = (position: Vec3Node): FloatNode =>
  position.x.div(SHEET_WIDTH).add(0.5).mul(PI);

/**
 * Below the tangent line the sheet is flat but bowed; above it, it rolls
 * backwards around a cylinder of `ROLLER_RADIUS`, treating the flat distance
 * as arc length so the paper neither stretches nor bunches.
 */
export const curlPaper = /*#__PURE__*/ Fn(([position]: [Vec3Node]) => {
  const angle = wrapAngle(position);
  // Whatever of the sheet is still below the tangent stays exactly where it
  // is; only the part past it gets wrapped.
  const flat = min(position.y.sub(float(CURL_TANGENT_Y)), 0);
  const bow = sin(bowPhase(position)).mul(BOW_DEPTH).mul(bowAmount(position));

  return vec3(
    position.x,
    float(CURL_TANGENT_Y).add(flat).add(sin(angle).mul(float(ROLLER_RADIUS))),
    position.z.add(cos(angle).sub(1).mul(float(ROLLER_RADIUS))).add(bow),
  );
});

/**
 * The normal of that same surface: straight at the viewer while flat, tipping
 * back as the sheet rolls away, and leaning with the bow in between. Without
 * the bow term the page keeps a dead-flat highlight and the displacement might
 * as well not be there.
 */
export const curlNormal = /*#__PURE__*/ Fn(([position]: [Vec3Node]) => {
  const angle = wrapAngle(position);

  // d(bow)/dx — the slope the bow adds across the width.
  const slope = cos(bowPhase(position))
    .mul(BOW_PHASE_RATE)
    .mul(BOW_DEPTH)
    .mul(bowAmount(position));

  return normalize(vec3(slope.negate(), sin(angle), cos(angle)));
});
