/**
 * The typewriter's rules, as a pure state machine. No DOM, no Three.js, no
 * React — strike a key, get a new state back.
 *
 * The machine is faithful to a mechanical typewriter in the one way that
 * matters: the carriage only ever moves forward. There is no key that takes
 * it back, so nothing you have printed can be reached again, let alone taken
 * off the page.
 */

export type Line = string;

export interface TypewriterState {
  readonly lines: readonly Line[];
}

export interface TypewriterConfig {
  /** Columns between the left and right margins. The carriage jams past this. */
  readonly columns: number;
  /** Carriage position whose arrival rings the margin bell. */
  readonly bellColumn: number;
}

export type StrikeOutcome =
  /** Ink went onto the page. */
  | "printed"
  /** The carriage is against the right margin and the keys are locked. */
  | "jammed";

export interface StrikeResult {
  readonly state: TypewriterState;
  readonly outcome: StrikeOutcome;
  /** True on the one strike that brings the carriage to the warning column. */
  readonly bell: boolean;
}

export const DEFAULT_CONFIG: TypewriterConfig = {
  columns: 62,
  bellColumn: 54,
};

export const createState = (): TypewriterState => ({ lines: [""] });

export const currentLine = (state: TypewriterState): Line =>
  state.lines[state.lines.length - 1];

/** Where the next character lands. The carriage can only advance, so this is
 * always the end of the line being typed. */
export const carriageColumn = (state: TypewriterState): number =>
  currentLine(state).length;

const replaceLine = (state: TypewriterState, line: Line): TypewriterState => ({
  lines: [...state.lines.slice(0, -1), line],
});

export const strike = (
  state: TypewriterState,
  char: string,
  config: TypewriterConfig = DEFAULT_CONFIG,
): StrikeResult => {
  if (carriageColumn(state) >= config.columns) {
    return { state, outcome: "jammed", bell: false };
  }

  const line = currentLine(state) + char;

  return {
    state: replaceLine(state, line),
    outcome: "printed",
    bell: line.length === config.bellColumn,
  };
};

export const carriageReturn = (state: TypewriterState): TypewriterState => ({
  lines: [...state.lines, ""],
});

/** A `KeyboardEvent.key` that stands for a character rather than a command.
 * Named keys ("Enter", "ArrowLeft") are longer than one code point. */
export const isPrintable = (key: string): boolean =>
  [...key].length === 1 && key !== "\n" && key !== "\t";
