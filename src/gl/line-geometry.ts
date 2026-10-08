/**
 * Turns one typed line into a buffer of glyph quads placed in document space.
 *
 * lettra lays out and measures; this module decides where on the page the
 * result lands, and flattens an overstruck cell into the two separate glyphs
 * a real machine would have left stacked there.
 */

import { layout, type LayoutGlyph, type LayoutResult, type MSDFFont } from "lettra";
import { buildTextGeometry } from "lettra/three";
import type { BufferGeometry } from "three/webgpu";

import type { Line } from "@/core/typewriter-machine";
import {
  CHAR_WIDTH,
  INK_LIFT,
  LEFT_MARGIN,
  SHEET_WIDTH,
  lineBaselineY,
} from "./sheet-metrics";

/** Seeds repeat every so many lines, far past anything on screen at once. */
const LINE_SEED_PERIOD = 251;
/** Wider than the widest line, so no two columns of a line collide. */
const LINE_SEED_STRIDE = 97;
/** Keeps a stacked glyph from inheriting its neighbour's misalignment. */
const LAYER_SEED_STRIDE = 997;

/**
 * A small, stable number identifying one struck character on the page. The
 * ink material hashes it, so it has to stay far below float precision limits
 * and still never repeat among the letters visible at once.
 */
const glyphSeed = (lineNumber: number, column: number, layer: number): number =>
  (lineNumber % LINE_SEED_PERIOD) * LINE_SEED_STRIDE +
  column +
  layer * LAYER_SEED_STRIDE;

/** Monospace: every glyph advances by the same amount. */
export const advancePx = (font: MSDFFont): number => {
  const tuple = font.glyphs[" "] ?? Object.values(font.glyphs)[0];
  if (!tuple) throw new Error("font has no glyphs");
  return tuple[6];
};

export const worldPerLayoutPx = (font: MSDFFont): number =>
  CHAR_WIDTH / advancePx(font);

/** How deep the deepest stack of overstrikes on this line goes. */
const stackDepth = (line: Line): number =>
  line.reduce((deepest, cell) => Math.max(deepest, cell.length), 1);

/** The characters struck at layer `k` across the whole line, blanks included
 * so each one keeps its column. */
const layerText = (line: Line, layer: number): string =>
  line.map((cell) => cell[layer] ?? " ").join("");

const seeded = (
  glyphs: readonly LayoutGlyph[],
  lineNumber: number,
  layer: number,
): LayoutGlyph[] =>
  glyphs.map((glyph) => ({
    ...glyph,
    index: glyphSeed(lineNumber, glyph.index, layer),
  }));

/** Lays out every layer of the line and merges them into one result, so the
 * whole line — overstrikes and all — is a single draw call. */
export const layoutLine = (
  font: MSDFFont,
  line: Line,
  lineNumber: number,
): LayoutResult => {
  const base = layout(font, layerText(line, 0), { mode: "nowrap" });
  const glyphs = seeded(base.glyphs, lineNumber, 0);

  for (let layer = 1; layer < stackDepth(line); layer += 1) {
    const text = layerText(line, layer);
    if (text.trim() === "") continue;
    glyphs.push(
      ...seeded(layout(font, text, { mode: "nowrap" }).glyphs, lineNumber, layer),
    );
  }

  return { ...base, glyphs };
};

/** Geometry for one line, already sitting where it belongs on the page. */
export const buildLineGeometry = (
  font: MSDFFont,
  line: Line,
  lineNumber: number,
): BufferGeometry => {
  const geometry = buildTextGeometry(layoutLine(font, line, lineNumber), {
    anchor: "baseline-left",
    scale: worldPerLayoutPx(font),
    glyphIndexOf: (glyph) => glyph.index,
  });

  geometry.translate(
    LEFT_MARGIN - SHEET_WIDTH / 2,
    lineBaselineY(lineNumber),
    INK_LIFT,
  );

  return geometry;
};
