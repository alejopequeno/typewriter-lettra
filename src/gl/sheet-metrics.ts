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

/** Centre of a typed column — where the type guide parks and the next
 * character lands. `tools/blender/roller.py` repeats this to build the scale's
 * ticks, so the fork lines up with them. */
export const columnX = (column: number): number =>
  LEFT_MARGIN - SHEET_WIDTH / 2 + (column + 0.5) * CHAR_WIDTH;

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

/**
 * How far below the roller the carriage prints. Fixed: it is where the scale
 * and the type guide are bolted, and the paper is what moves past them.
 *
 * A real machine prints right at the platen, which would leave barely eight
 * lines of what you wrote on screen before they roll away. Setting the print
 * line further down keeps the last twenty-odd lines in view above it, which is
 * the composition the reference photograph has anyway.
 */
export const PRINT_LINE_DROP = 3.4 * INCH;

/** How far the sheet extends past the print line before the camera loses it. */
export const SHEET_DROP = 9 * INCH;

/** How far the sheet wraps up and over the roller: past the top and down the
 * back, so from above the page never just stops on the rubber. */
export const SHEET_RISE = ROLLER_RADIUS * Math.PI * 0.92;

/** Where the alignment scale sits below the print line, and how far the type
 * guide stands off the page. Both repeated in `tools/blender/roller.py`; the
 * guide swings about the slider it rides on the scale. */
export const SCALE_DROP = PRINT_LINE_DROP + 0.46 * INCH;
export const GUIDE_STANDOFF = 0.145 * INCH;

/** Where the bail bar crosses the page. `tools/blender/roller.py` repeats
 * this; the refusal is typed just below it. */
export const BAIL_DROP = 5.4 * INCH;

/** Ink sits a hair proud of the paper so it never z-fights with it. */
export const INK_LIFT = 0.0004;

/** Document-space baseline of a line, before scrolling. Line 0 sits at the
 * print line; each line after it is one line-step further down. */
export const lineBaselineY = (lineNumber: number): number =>
  CURL_TANGENT_Y - PRINT_LINE_DROP - lineNumber * LINE_STEP;

/** Scroll offset that brings `lineNumber` up to the print line. Every carriage
 * return rolls the page one step, from the first line on — the hardware never
 * moves, the paper does. */
export const scrollForLine = (lineNumber: number): number =>
  lineNumber * LINE_STEP;
