/**
 * The sheet itself: an unprinted, slightly aged page lit by the studio
 * environment, bending over the roller and travelling upwards as the typist
 * fills it.
 */

import { color, mix, positionLocal, smoothstep, transformNormalToView, vec2, vec3 } from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";

import { curlNormal, curlPaper } from "../paper-curl";
import {
  BLOTCH_STRENGTH,
  FIBRE_STRENGTH,
  paperBlotch,
  paperFibre,
} from "../paper-fiber";
import { CURL_TANGENT_Y, INCH } from "../sheet-metrics";
import type { FloatNode } from "../tsl-types";

export interface PaperMaterialOptions {
  /** How far the sheet has travelled up through the roller, in world units. */
  readonly scrollY: FloatNode;
}

const PAPER_BASE = "#efe9db";
const PAPER_SHADOW = "#b4ac99";

export const createPaperMaterial = ({
  scrollY,
}: PaperMaterialOptions): MeshStandardNodeMaterial => {
  const material = new MeshStandardNodeMaterial();

  // The sheet is a fixed plane on screen; what moves is the paper running
  // through it, so the grain is sampled in the travelling frame.
  const travelling = vec2(positionLocal.x, positionLocal.y.add(scrollY));

  const fibre = paperFibre(travelling).mul(FIBRE_STRENGTH);
  const blotch = paperBlotch(travelling).mul(BLOTCH_STRENGTH);

  // Where the sheet disappears under the roller it falls into its own shadow.
  const contact = smoothstep(
    CURL_TANGENT_Y - INCH * 0.5,
    CURL_TANGENT_Y + INCH * 0.1,
    positionLocal.y,
  );

  const tone = mix(color(PAPER_BASE), color(PAPER_SHADOW), contact.mul(0.35));

  material.colorNode = tone.add(vec3(fibre.add(blotch)));
  material.roughnessNode = fibre.mul(1.6).add(0.88).clamp(0.6, 1);
  material.metalness = 0;
  material.positionNode = curlPaper(positionLocal);
  material.normalNode = transformNormalToView(curlNormal(positionLocal));

  return material;
};
