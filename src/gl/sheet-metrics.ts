/**
 * The physical dimensions of the page, in world units.
 *
 * One world unit is the width of a US Letter sheet (8.5"), so every other
 * measurement can be written as the real-world measurement it actually is.
 * Typing is pica: ten characters to the inch, six lines to the inch — the
 * spacing of the machine in the reference photo.
 */

export const SHEET_WIDTH = 1;
export const INCH = SHEET_WIDTH / 8.5;

export const CHAR_WIDTH = INCH / 10;
export const LINE_STEP = INCH / 6;

/** Left margin, measured from the sheet's left edge. */
export const LEFT_MARGIN = 1.15 * INCH;

/**
 * Paper space has y pointing up with the origin at the curl tangent — the
 * line where the sheet leaves the roller and becomes flat. Everything the
 * typist can read lives below it.
 */
export const CURL_TANGENT_Y = 0;

/**
 * Radius the sheet wraps around.
 *
 * `tools/blender/roller.py` repeats this number and models the rubber just
 * inside it, so the platen never coincides with the paper's own path. Change
 * it here and rerun that script.
 */
export const ROLLER_RADIUS = 0.85 * INCH;

/** Where the first line of a fresh page lands, as on a sheet just rolled in. */
export const FIRST_LINE_DROP = 1.15 * INCH;

/**
 * How far below the roller the carriage settles once the page is rolling.
 *
 * A real machine prints right at the platen, which would leave barely eight
 * lines of what you wrote on screen before they roll away. Settling the print
 * line further down keeps the last twenty-odd lines in view above it, which is
 * the composition the reference photograph has anyway.
 */
export const PRINT_LINE_DROP = 3.4 * INCH;

/** How far the sheet extends past the print line before the camera loses it. */
export const SHEET_DROP = 9 * INCH;

/** How far the sheet wraps up and over the roller. */
export const SHEET_RISE = ROLLER_RADIUS * Math.PI * 0.55;

/** Ink sits a hair proud of the paper so it never z-fights with it. */
export const INK_LIFT = 0.0004;

/** Document-space baseline of a line, before scrolling. Line 0 sits where a
 * fresh sheet starts; each line after it is one line-step further down. */
export const lineBaselineY = (lineNumber: number): number =>
  CURL_TANGENT_Y - FIRST_LINE_DROP - lineNumber * LINE_STEP;

/**
 * Scroll offset that puts `lineNumber` where the typist should be looking.
 *
 * On a fresh page the platen does not move at all: the typing works its way
 * down from the top, the way it does on a sheet you have just rolled in. Only
 * once the carriage reaches the print line does the page start travelling,
 * and from there the active line stays put while everything above it climbs.
 */
export const scrollForLine = (lineNumber: number): number =>
  Math.max(0, lineNumber * LINE_STEP - (PRINT_LINE_DROP - FIRST_LINE_DROP));
