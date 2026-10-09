/**
 * Turns one typed line into a buffer of glyph quads placed in document space.
 *
 * lettra lays out and measures; this module decides where on the page the
 * result lands, and tags every glyph with a stable seed the ink material
 * hashes for its per-strike misalignment.
 */

import { layout, type LayoutResult, type MSDFFont } from "lettra";
import { buildTextGeometry } from "lettra/three";
import type { BufferGeometry } from "three/webgpu";

import { leadingColumns, type Line } from "@/core/typewriter-machine";
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

/**
 * A small, stable number identifying one struck character on the page. The
 * ink material hashes it, so it has to stay far below float precision limits
 * and still never repeat among the letters visible at once.
 */
const glyphSeed = (lineNumber: number, column: number): number =>
  (lineNumber % LINE_SEED_PERIOD) * LINE_SEED_STRIDE + column;

/** Monospace: every glyph advances by the same amount. */
export const advancePx = (font: MSDFFont): number => {
  const tuple = font.glyphs[" "] ?? Object.values(font.glyphs)[0];
  if (!tuple) throw new Error("font has no glyphs");
  return tuple[6];
};

export const worldPerLayoutPx = (font: MSDFFont): number =>
  CHAR_WIDTH / advancePx(font);

export const layoutLine = (
  font: MSDFFont,
  line: Line,
  lineNumber: number,
): LayoutResult => {
  const base = layout(font, line, { mode: "nowrap" });
  return {
    ...base,
    glyphs: base.glyphs.map((glyph) => ({
      ...glyph,
      index: glyphSeed(lineNumber, glyph.index),
    })),
  };
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

  // lettra's layout drops leading whitespace; the carriage did not.
  geometry.translate(
    LEFT_MARGIN - SHEET_WIDTH / 2 + leadingColumns(line) * CHAR_WIDTH,
    lineBaselineY(lineNumber),
    INK_LIFT,
  );

  return geometry;
};
