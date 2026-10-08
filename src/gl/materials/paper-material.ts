/**
 * The sheet itself: a page that has sat in a drawer for a few decades, lit by
 * the studio environment, bending over the roller and travelling upwards as
 * the typist fills it.
 */

import { positionLocal, transformNormalToView, vec2 } from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";

import { curlNormal, curlPaper } from "../paper-curl";
import { paperFibre } from "../paper-fiber";
import { paperTone } from "../paper-tone";
import type { FloatNode } from "../tsl-types";

export interface PaperMaterialOptions {
  /** How far the sheet has travelled up through the roller, in world units. */
  readonly scrollY: FloatNode;
}

export const createPaperMaterial = ({
  scrollY,
}: PaperMaterialOptions): MeshStandardNodeMaterial => {
  const material = new MeshStandardNodeMaterial();

  // The sheet is a fixed plane on screen; what moves is the paper running
  // up through it. A mark at paper coordinate P shows at plane-y = P + scroll,
  // so the paper frame is plane-y − scroll — the same direction the ink goes.
  const travelling = vec2(positionLocal.x, positionLocal.y.sub(scrollY));
  const tone = paperTone(travelling, positionLocal.y);

  material.colorNode = tone.colour;
  material.roughnessNode = paperFibre(travelling)
    .mul(0.09)
    .add(0.88)
    .add(tone.foxing.mul(0.1))
    .clamp(0.6, 1);
  material.metalness = 0;
  material.positionNode = curlPaper(positionLocal);
  material.normalNode = transformNormalToView(curlNormal(positionLocal));

  return material;
};
