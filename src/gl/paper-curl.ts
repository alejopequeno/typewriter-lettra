/**
 * The deformation that wraps the sheet over the roller.
 *
 * Both the paper and the ink printed on it run this same function, which is
 * the whole reason the letters stay glued to the page when it bends. Keep it
 * here, import it twice, never copy it.
 */

import { Fn, cos, float, max, min, sin, vec3 } from "three/tsl";

import { CURL_TANGENT_Y, ROLLER_RADIUS } from "./sheet-metrics";
import type { Vec3Node } from "./tsl-types";

/** Flat distance from the tangent line, as an angle around the platen. */
const wrapAngle = (position: Vec3Node) =>
  max(position.y.sub(float(CURL_TANGENT_Y)), 0).div(float(ROLLER_RADIUS));

/**
 * Below the tangent line the sheet is flat. Above it, it rolls backwards
 * around a cylinder of `ROLLER_RADIUS`, treating the flat distance as arc
 * length so the paper neither stretches nor bunches.
 */
export const curlPaper = /*#__PURE__*/ Fn(([position]: [Vec3Node]) => {
  const angle = wrapAngle(position);
  // Whatever of the sheet is still below the tangent stays exactly where it
  // is; only the part past it gets wrapped.
  const flat = min(position.y.sub(float(CURL_TANGENT_Y)), 0);

  return vec3(
    position.x,
    float(CURL_TANGENT_Y).add(flat).add(sin(angle).mul(float(ROLLER_RADIUS))),
    position.z.add(cos(angle).sub(1).mul(float(ROLLER_RADIUS))),
  );
});

/** The normal of that same surface: straight at the viewer while flat, then
 * tipping back as the sheet rolls away. */
export const curlNormal = /*#__PURE__*/ Fn(([position]: [Vec3Node]) => {
  const angle = wrapAngle(position);

  return vec3(0, sin(angle), cos(angle));
});
