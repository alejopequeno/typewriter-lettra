/**
 * The sheet itself: a page that has sat in a drawer for a few decades, lit by
 * the studio environment, bending over the roller and travelling upwards as
 * the typist fills it.
 */

import {
  abs,
  color,
  mix,
  mx_fractal_noise_float,
  mx_worley_noise_float,
  positionLocal,
  smoothstep,
  transformNormalToView,
  vec2,
  vec3,
} from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";

import { curlNormal, curlPaper } from "../paper-curl";
import {
  BLOTCH_STRENGTH,
  FIBRE_STRENGTH,
  paperBlotch,
  paperFibre,
} from "../paper-fiber";
import { CURL_TANGENT_Y, INCH, SHEET_WIDTH } from "../sheet-metrics";
import type { FloatNode } from "../tsl-types";

export interface PaperMaterialOptions {
  /** How far the sheet has travelled up through the roller, in world units. */
  readonly scrollY: FloatNode;
}

/** Cream that has gone the colour of weak tea. */
const PAPER_BASE = "#e9dcbf";
const PAPER_SHADOW = "#b7a582";
/** What the edges have oxidised to. */
const PAPER_EDGE = "#c8ad7c";
/** The brown of a foxing spot. */
const FOXING = "#8c6a3c";

/** How far in from the edges the browning reaches. */
const EDGE_REACH = 0.55 * INCH;
/** Foxing spots: how many per inch, how large, how many survive. */
const FOXING_SCALE = 1 / (0.42 * INCH);
const FOXING_RADIUS = 0.11;
const FOXING_SPARSITY = 0.62;
const FOXING_STRENGTH = 0.55;
/** A slow stain across the page, the kind a damp shelf leaves. */
const STAIN_SCALE = 1 / (2.8 * INCH);
const STAIN_STRENGTH = 0.07;

export const createPaperMaterial = ({
  scrollY,
}: PaperMaterialOptions): MeshStandardNodeMaterial => {
  const material = new MeshStandardNodeMaterial();

  // The sheet is a fixed plane on screen; what moves is the paper running
  // through it, so everything printed on the paper is sampled in the
  // travelling frame.
  const travelling = vec2(positionLocal.x, positionLocal.y.add(scrollY));

  const fibre = paperFibre(travelling).mul(FIBRE_STRENGTH);
  const blotch = paperBlotch(travelling).mul(BLOTCH_STRENGTH);

  // Where the sheet disappears under the roller it falls into its own shadow.
  const contact = smoothstep(
    CURL_TANGENT_Y - INCH * 0.5,
    CURL_TANGENT_Y + INCH * 0.1,
    positionLocal.y,
  );

  // Browning creeps in from the edges, unevenly.
  const edgeNoise = mx_fractal_noise_float(
    vec3(travelling.x.mul(14), travelling.y.mul(14), 0),
    2,
    2,
    0.5,
    1,
  ).mul(0.3);
  const inFromEdge = abs(positionLocal.x).sub(SHEET_WIDTH / 2).negate();
  const browning = smoothstep(EDGE_REACH, 0, inFromEdge.add(edgeNoise.mul(EDGE_REACH)));

  // Foxing: small rust-brown spots, scattered where a second noise lets them.
  const cells = mx_worley_noise_float(
    vec3(travelling.x.mul(FOXING_SCALE), travelling.y.mul(FOXING_SCALE), 0),
    1,
    0,
  );
  const spotShape = smoothstep(FOXING_RADIUS, FOXING_RADIUS * 0.35, cells);
  const spotAllowed = smoothstep(
    FOXING_SPARSITY,
    FOXING_SPARSITY + 0.2,
    mx_fractal_noise_float(vec3(travelling.x.mul(3), travelling.y.mul(3), 0), 2, 2, 0.5, 1)
      .mul(0.5)
      .add(0.5),
  );
  const foxing = spotShape.mul(spotAllowed).mul(FOXING_STRENGTH);

  const stain = mx_fractal_noise_float(
    vec3(travelling.x.mul(STAIN_SCALE), travelling.y.mul(STAIN_SCALE), 0),
    3,
    2,
    0.5,
    1,
  ).mul(STAIN_STRENGTH);

  const aged = mix(color(PAPER_BASE), color(PAPER_EDGE), browning);
  const stained = aged.sub(vec3(stain));
  const spotted = mix(stained, color(FOXING), foxing);
  const tone = mix(spotted, color(PAPER_SHADOW), contact.mul(0.35));

  material.colorNode = tone.add(vec3(fibre.add(blotch)));
  material.roughnessNode = fibre.mul(1.6).add(0.88).add(foxing.mul(0.1)).clamp(0.6, 1);
  material.metalness = 0;
  material.positionNode = curlPaper(positionLocal);
  material.normalNode = transformNormalToView(curlNormal(positionLocal));

  return material;
};
