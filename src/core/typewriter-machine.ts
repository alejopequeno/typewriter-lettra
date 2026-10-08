/**
 * The typewriter's rules, as a pure state machine. No DOM, no Three.js, no
 * React — strike a key, get a new state back.
 *
 * The machine is faithful to a mechanical typewriter in the way that matters:
 * the carriage only ever moves forward when you type, and nothing you have
 * already printed can be taken off the page.
 */

/** Characters struck at one column, oldest first. More than one means the
 * carriage was walked back and the typist printed on top of their own ink. */
export type Cell = string;

export type Line = readonly Cell[];

export interface TypewriterState {
  readonly lines: readonly Line[];
  /** Carriage position on the current line, 0-based. */
  readonly column: number;
}

export interface TypewriterConfig {
  /** Columns between the left and right margins. The carriage jams past this. */
  readonly columns: number;
  /** Carriage position whose arrival rings the margin bell. */
  readonly bellColumn: number;
}

export type StrikeOutcome =
  /** Ink went onto bare paper. */
  | "printed"
  /** Ink went on top of ink: the cell now holds a stack. */
  | "overstruck"
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

const EMPTY_LINE: Line = [];

export const createState = (): TypewriterState => ({
  lines: [EMPTY_LINE],
  column: 0,
});

export const currentLine = (state: TypewriterState): Line =>
  state.lines[state.lines.length - 1];

/** The topmost character of each cell — what a reader sees, and what a screen
 * reader is told. */
export const lineToString = (line: Line): string =>
  line.map((cell) => cell[cell.length - 1] ?? " ").join("");

const isBlank = (cell: Cell | undefined): boolean =>
  cell === undefined || cell.trim() === "";

const replaceLine = (
  state: TypewriterState,
  line: Line,
  column: number,
): TypewriterState => ({
  lines: [...state.lines.slice(0, -1), line],
  column,
});

export const strike = (
  state: TypewriterState,
  char: string,
  config: TypewriterConfig = DEFAULT_CONFIG,
): StrikeResult => {
  if (state.column >= config.columns) {
    return { state, outcome: "jammed", bell: false };
  }

  const line = currentLine(state);
  const existing = line[state.column];
  // Ink on bare paper replaces; ink on ink stacks.
  const struck = isBlank(existing) ? char : existing + char;

  const next = [...line];
  next[state.column] = struck;

  const column = state.column + 1;

  return {
    state: replaceLine(state, next, column),
    outcome: isBlank(existing) ? "printed" : "overstruck",
    bell: column === config.bellColumn,
  };
};

/** Walks the carriage back one column without erasing, so the next strike
 * lands on top of what is already there. This is how a typewriter crosses a
 * word out, and it is the only way to build a stacked cell. */
export const retreat = (state: TypewriterState): TypewriterState =>
  state.column === 0 ? state : { ...state, column: state.column - 1 };

export const carriageReturn = (state: TypewriterState): TypewriterState => ({
  lines: [...state.lines, EMPTY_LINE],
  column: 0,
});

/** A `KeyboardEvent.key` that stands for a character rather than a command.
 * Named keys ("Enter", "ArrowLeft") are longer than one code point. */
export const isPrintable = (key: string): boolean =>
  [...key].length === 1 && key !== "\n" && key !== "\t";
