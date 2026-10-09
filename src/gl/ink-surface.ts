/**
 * What any ink on this page shares, typed or pre-printed: it sits on the
 * curled sheet without sinking into it, and it leaves a dent whose wall
 * catches the light.
 */

import {
  Fn,
  abs,
  cross,
  dFdx,
  dFdy,
  dot,
  normalize,
  positionView,
  sign,
  smoothstep,
} from "three/tsl";

import { curlNormal, curlPaper, wrapAngle } from "./paper-curl";
import type { FloatNode, Vec3Node } from "./tsl-types";

/**
 * Ink quads are coarser than the finely tessellated page. Bent over the
 * roller their middle sags under it and the depth test eats the stroke, so
 * ink is lifted along the curled normal by about that sag, and only where
 * there is any curve to sag under.
 */
const CURL_LIFT = 0.0016;

/** Where ink at `onPaper` (document space, already scrolled) draws. */
export const inkOnCurl = (onPaper: Vec3Node): Vec3Node => {
  const lift = smoothstep(0, 0.35, wrapAngle(onPaper)).mul(CURL_LIFT);
  return curlPaper(onPaper).add(curlNormal(onPaper).mul(lift));
};

/**
 * Tilts a surface normal by the screen-space slope of a height field — the
 * same construction as three's bump map, but taking the base normal as an
 * input so the dent can sit on the curled page rather than on the flat quad.
 */
export const dented = /*#__PURE__*/ Fn(
  ([surfaceNormal, height, depth]: [Vec3Node, FloatNode, FloatNode]) => {
    const sigmaX = dFdx(positionView);
    const sigmaY = dFdy(positionView);
    const r1 = cross(sigmaY, surfaceNormal);
    const r2 = cross(surfaceNormal, sigmaX);
    const determinant = dot(sigmaX, r1);
    const gradient = r1
      .mul(dFdx(height).mul(depth))
      .add(r2.mul(dFdy(height).mul(depth)))
      .mul(sign(determinant));

    return normalize(surfaceNormal.mul(abs(determinant)).sub(gradient));
  },
);
