/**
 * The ink.
 *
 * lettra hands us the MSDF graph as loose TSL stages, so instead of taking its
 * default flat material we build our own and get the two things that make
 * typed ink look typed: every letter lands a hair off its neighbours, and the
 * paper's own fibre shows through the stroke.
 */

import {
  Fn,
  attribute,
  color,
  fract,
  mix,
  positionLocal,
  sin,
  transformNormalToView,
  vec2,
  vec3,
} from "three/tsl";
import { MeshStandardNodeMaterial, type Texture } from "three/webgpu";
import { buildTextGraph } from "lettra/three";

import { curlNormal, curlPaper } from "../paper-curl";
import { paperFibre } from "../paper-fiber";
import type { FloatNode } from "../tsl-types";
import { CHAR_WIDTH } from "../sheet-metrics";

export interface InkMaterialOptions {
  /** The MSDF atlas, already configured by lettra. */
  readonly map: Texture;
  /** How far the sheet has travelled up through the roller, in world units. */
  readonly scrollY: FloatNode;
}

/** A typebar never lands twice in the same place. */
const MISALIGN_X = CHAR_WIDTH * 0.05;
const MISALIGN_Y = CHAR_WIDTH * 0.09;
/** Nor perfectly square to the platen. */
const TILT = CHAR_WIDTH * 0.07;

/** How hard the weakest strike hits, relative to the hardest. */
const WEAKEST_STRIKE = 0.74;
/** How much the paper's grain eats into the ink. */
const FIBRE_BITE = 0.26;
/** Even a feeble strike puts most of its ink down; what a weak one loses is
 * blackness, not presence. */
const FAINTEST_COVERAGE = 0.82;

const INK_STRONG = "#0b0906";
const INK_WEAK = "#39332a";

/** Stable pseudo-random in [0, 1) from a glyph's seed. */
const hash = /*#__PURE__*/ Fn(([n]: [FloatNode]) =>
  fract(sin(n.mul(12.9898)).mul(43758.5453)),
);

export const createInkMaterial = ({
  map,
  scrollY,
}: InkMaterialOptions): MeshStandardNodeMaterial => {
  const graph = buildTextGraph({ map });
  const material = new MeshStandardNodeMaterial();

  const seed = attribute("glyphIndex", "float");
  const cellUv = attribute("cellUv", "vec2");

  const offsetX = hash(seed).sub(0.5).mul(MISALIGN_X);
  const offsetY = hash(seed.add(17.31)).sub(0.5).mul(MISALIGN_Y);
  const force = hash(seed.add(53.77));
  const tilt = hash(seed.add(91.17))
    .sub(0.5)
    .mul(TILT)
    .mul(cellUv.x.sub(0.5));

  // Geometry arrives in document space; scrolling it here keeps the ink on
  // exactly the same curl as the page underneath.
  const onPaper = vec3(
    positionLocal.x.add(offsetX),
    positionLocal.y.add(scrollY).add(offsetY).add(tilt),
    positionLocal.z,
  );

  const strike = force.mul(1 - WEAKEST_STRIKE).add(WEAKEST_STRIKE);
  const grain = paperFibre(vec2(onPaper.x, onPaper.y)).mul(FIBRE_BITE).add(1);
  const density = strike.mul(grain).clamp(0, 1);

  material.transparent = true;
  material.depthWrite = false;
  material.metalness = 0;
  material.roughness = 0.96;

  material.colorNode = mix(color(INK_WEAK), color(INK_STRONG), density);
  material.opacityNode = graph.coverage.mul(
    density.mul(1 - FAINTEST_COVERAGE).add(FAINTEST_COVERAGE),
  );
  material.positionNode = curlPaper(onPaper);
  material.normalNode = transformNormalToView(curlNormal(onPaper));

  return material;
};
