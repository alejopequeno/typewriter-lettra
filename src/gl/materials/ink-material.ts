/**
 * The ink, and the dent it arrived in.
 *
 * A typebar does not paint a letter onto the page; it hammers a slug through
 * a ribbon into paper pressed against rubber. The ink is the smaller part of
 * what it leaves behind: around every stroke the fibres are crushed down, and
 * that pressed rim is what makes typed text read as struck rather than
 * printed.
 *
 * lettra hands us the MSDF graph as loose TSL stages, so instead of taking its
 * default flat material we build our own and get three things: every letter
 * lands a hair off its neighbours, the paper's own fibre shows through the
 * stroke, and the signed distance field doubles as the height map of the dent.
 */

import {
  Fn,
  abs,
  attribute,
  color,
  cross,
  dFdx,
  dFdy,
  dot,
  fract,
  max,
  mix,
  normalize,
  positionLocal,
  positionView,
  sign,
  sin,
  smoothstep,
  transformNormalToView,
  vec2,
  vec3,
} from "three/tsl";
import { MeshStandardNodeMaterial, type Texture } from "three/webgpu";
import { buildTextGraph } from "lettra/three";

import { curlNormal, curlPaper, wrapAngle } from "../paper-curl";
import { paperFibre } from "../paper-fiber";
import { paperTone } from "../paper-tone";
import { CHAR_WIDTH } from "../sheet-metrics";
import type { FloatNode, Vec3Node } from "../tsl-types";

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

/** The distance field is 0 … 1 with the stroke's edge at the iso-value. */
const EDGE = 0.5;
/** How far outside the stroke the paper is still crushed. */
const DENT_REACH = 0.22;
/** How steeply the dent's wall tilts the normal. */
const DENT_DEPTH = 0.9;
/** How visible the crushed rim is at its strongest. It is the same colour as
 * the page; what shows is only the change in shading. */
const DENT_PRESENCE = 0.9;

/**
 * A glyph is one flat quad. Bent over the roller it cannot follow the curve,
 * so its middle sags under the finely tessellated page and the depth test
 * eats the stroke — the j loses its stem first, being the tallest. This lifts
 * the ink along the curled normal by about that sag, and only where there is
 * any curve to sag under.
 */
const CURL_LIFT = 0.0016;

/** Stable pseudo-random in [0, 1) from a glyph's seed. */
const hash = /*#__PURE__*/ Fn(([n]: [FloatNode]) =>
  fract(sin(n.mul(12.9898)).mul(43758.5453)),
);

/**
 * Tilts a surface normal by the screen-space slope of a height field — the
 * same construction as three's bump map, but taking the base normal as an
 * input so the dent can sit on the curled page rather than on the flat quad.
 */
const dented = /*#__PURE__*/ Fn(
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
  const travelling = vec2(onPaper.x, onPaper.y);

  const strike = force.mul(1 - WEAKEST_STRIKE).add(WEAKEST_STRIKE);
  const grain = paperFibre(travelling).mul(FIBRE_BITE).add(1);
  const density = strike.mul(grain).clamp(0, 1);

  const inkAlpha = graph.coverage.mul(
    density.mul(1 - FAINTEST_COVERAGE).add(FAINTEST_COVERAGE),
  );

  // The dent: the stroke is the floor, the paper around it the wall. The rim
  // is painted in the page's own colour, so only its shading shows.
  const floor = smoothstep(EDGE - 0.08, EDGE + 0.08, graph.distance);
  const rim = smoothstep(EDGE - DENT_REACH, EDGE, graph.distance).mul(
    graph.coverage.oneMinus(),
  );
  const page = paperTone(travelling, onPaper.y);

  material.transparent = true;
  material.depthWrite = false;
  material.metalness = 0;
  material.roughness = 0.94;

  const ink = mix(color(INK_WEAK), color(INK_STRONG), density);
  material.colorNode = mix(page.colour, ink, inkAlpha);
  material.opacityNode = max(inkAlpha, rim.mul(DENT_PRESENCE));
  const curled = curlNormal(onPaper);
  const lift = smoothstep(0, 0.35, wrapAngle(onPaper)).mul(CURL_LIFT);
  material.positionNode = curlPaper(onPaper).add(curled.mul(lift));
  material.normalNode = dented(
    transformNormalToView(curled),
    floor.negate(),
    DENT_DEPTH,
  );

  return material;
};
