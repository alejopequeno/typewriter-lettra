/**
 * The letterhead: a mark printed at the head of every sheet before it ever
 * reached the machine. It is ink like the typing — it takes the paper's
 * grain, sits in a shallow dent, wraps over the roller and rides up with the
 * page — but it is printed, not struck, so it lands square and even.
 */

import {
  color,
  max,
  mix,
  positionLocal,
  texture,
  transformNormalToView,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import {
  CanvasTexture,
  Mesh,
  MeshStandardNodeMaterial,
  NoColorSpace,
  PlaneGeometry,
} from "three/webgpu";

import { dented, inkOnCurl } from "./ink-surface";
import { curlNormal } from "./paper-curl";
import { paperFibre } from "./paper-fiber";
import { paperTone } from "./paper-tone";
import { INCH, INK_LIFT, lineBaselineY } from "./sheet-metrics";
import type { FloatNode } from "./tsl-types";

/** The OpenAI mark, from simple-icons (CC0), on a 24 × 24 grid. */
const MARK_PATH =
  "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z";
const MARK_GRID = 24;

/** Printed size of the mark, edge to edge. */
const MARK_SIZE = 1.35 * INCH;
/** How far above the first typed line the mark's centre sits. */
const MARK_ABOVE_FIRST_LINE = 1.6 * INCH;

/** Raster the mark is drawn into. Large enough to stay crisp full-screen. */
const RASTER = 1024;
/** Share of the raster the mark fills; the rest is room for the dent. */
const MARK_FILL = 0.84;
/** Blur that turns the hard mark into the soft height field of its dent. */
const DENT_BLUR_PX = 10;

/** Enough subdivisions for the quad to follow the curl over the roller. */
const SEGMENTS = 24;

/** Printing ink is even, but the paper still eats into it. */
const FIBRE_BITE = 0.18;
const INK = "#0d0b08";
const DENT_DEPTH = 0.5;
const DENT_PRESENCE = 0.7;

type Raster = (context: CanvasRenderingContext2D) => void;

/** A white-on-black grayscale map: the red channel is the value. */
const rasterTexture = (draw: Raster): CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = RASTER;
  canvas.height = RASTER;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2d context for the letterhead");

  context.fillStyle = "#000";
  context.fillRect(0, 0, RASTER, RASTER);
  draw(context);

  const map = new CanvasTexture(canvas);
  map.colorSpace = NoColorSpace;
  map.anisotropy = 8;
  return map;
};

const drawMark: Raster = (context) => {
  const scale = (RASTER * MARK_FILL) / MARK_GRID;
  const inset = (RASTER * (1 - MARK_FILL)) / 2;
  context.setTransform(scale, 0, 0, scale, inset, inset);
  context.fillStyle = "#fff";
  context.fill(new Path2D(MARK_PATH));
  context.setTransform(1, 0, 0, 1, 0, 0);
};

export interface LetterheadOptions {
  /** How far the sheet has travelled up through the roller, in world units. */
  readonly scrollY: FloatNode;
}

export interface Letterhead {
  readonly mesh: Mesh;
  readonly dispose: () => void;
}

export const createLetterhead = ({ scrollY }: LetterheadOptions): Letterhead => {
  const markMap = rasterTexture(drawMark);
  const dentMap = rasterTexture((context) => {
    context.filter = `blur(${DENT_BLUR_PX}px)`;
    drawMark(context);
  });

  const centreY = lineBaselineY(0) + MARK_ABOVE_FIRST_LINE;
  const geometry = new PlaneGeometry(MARK_SIZE, MARK_SIZE, SEGMENTS, SEGMENTS);
  geometry.translate(0, centreY, INK_LIFT);

  const material = new MeshStandardNodeMaterial();
  const coverage = texture(markMap, uv()).r;
  const height = texture(dentMap, uv()).r;

  // Document space, scrolled here exactly like the typed lines.
  const onPaper = vec3(positionLocal.x, positionLocal.y.add(scrollY), positionLocal.z);
  const travelling = vec2(positionLocal.x, positionLocal.y);

  const density = paperFibre(travelling).mul(FIBRE_BITE).add(1).clamp(0, 1);
  const inkAlpha = coverage.mul(density);
  const rim = height.mul(coverage.oneMinus());
  const page = paperTone(travelling, onPaper.y);

  material.transparent = true;
  material.depthWrite = false;
  material.metalness = 0;
  material.roughness = 0.94;
  material.colorNode = mix(page.colour, color(INK), inkAlpha);
  material.opacityNode = max(inkAlpha, rim.mul(DENT_PRESENCE));
  material.positionNode = inkOnCurl(onPaper);
  material.normalNode = dented(
    transformNormalToView(curlNormal(onPaper)),
    height.negate(),
    DENT_DEPTH,
  );

  const mesh = new Mesh(geometry, material);
  // Scrolled by the material, so CPU-side bounds never match where it draws.
  mesh.frustumCulled = false;

  return {
    mesh,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      markMap.dispose();
      dentMap.dispose();
    },
  };
};
