import { describe, expect, it } from "vitest";

import {
  carriageReturn,
  createState,
  currentLine,
  isPrintable,
  lineToString,
  retreat,
  strike,
  type TypewriterConfig,
} from "./typewriter-machine";

const config: TypewriterConfig = { columns: 8, bellColumn: 6 };

const type = (text: string, from = createState()) =>
  [...text].reduce((state, char) => strike(state, char, config).state, from);

describe("strike", () => {
  it("prints the character at the carriage and advances", () => {
    const { state, outcome } = strike(createState(), "A", config);

    expect(lineToString(currentLine(state))).toBe("A");
    expect(state.column).toBe(1);
    expect(outcome).toBe("printed");
  });

  it("builds up a line left to right", () => {
    expect(lineToString(currentLine(type("hola")))).toBe("hola");
  });

  it("rings the bell when the carriage reaches the warning column", () => {
    const before = type("abcde");
    expect(strike(before, "f", config).bell).toBe(true);
  });

  it("stays silent on every other column", () => {
    expect(strike(createState(), "a", config).bell).toBe(false);
    expect(strike(type("abcdef"), "g", config).bell).toBe(false);
  });

  it("jams at the right margin instead of printing", () => {
    const full = type("abcdefgh");
    const { state, outcome } = strike(full, "i", config);

    expect(outcome).toBe("jammed");
    expect(lineToString(currentLine(state))).toBe("abcdefgh");
    expect(state.column).toBe(8);
  });
});

describe("retreat", () => {
  it("moves the carriage back without erasing", () => {
    const state = retreat(type("sol"));

    expect(state.column).toBe(2);
    expect(lineToString(currentLine(state))).toBe("sol");
  });

  it("stops at the left margin", () => {
    expect(retreat(retreat(createState())).column).toBe(0);
  });

  it("stacks the next strike on top of what was already there", () => {
    const { state, outcome } = strike(retreat(type("sol")), "x", config);

    expect(outcome).toBe("overstruck");
    expect(currentLine(state)[2]).toBe("lx");
    expect(state.column).toBe(3);
  });

  it("reports the topmost character of a stacked cell as the line text", () => {
    const state = strike(retreat(type("sol")), "x", config).state;

    expect(lineToString(currentLine(state))).toBe("sox");
  });
});

describe("carriageReturn", () => {
  it("opens a new line and returns the carriage", () => {
    const state = carriageReturn(type("uno"));

    expect(state.column).toBe(0);
    expect(state.lines).toHaveLength(2);
    expect(lineToString(currentLine(state))).toBe("");
  });

  it("leaves the finished line untouched", () => {
    const state = type("dos", carriageReturn(type("uno")));

    expect(lineToString(state.lines[0])).toBe("uno");
    expect(lineToString(state.lines[1])).toBe("dos");
  });
});

describe("spaces", () => {
  it("advances the carriage over blanks", () => {
    expect(lineToString(currentLine(type("a b")))).toBe("a b");
  });

  it("keeps trailing blanks addressable after a retreat", () => {
    const state = strike(retreat(type("a  ")), "z", config).state;

    expect(lineToString(currentLine(state))).toBe("a z");
  });
});

describe("isPrintable", () => {
  it("accepts single characters, accents included", () => {
    expect(isPrintable("a")).toBe(true);
    expect(isPrintable("ñ")).toBe(true);
    expect(isPrintable("é")).toBe(true);
    expect(isPrintable(" ")).toBe(true);
  });

  it("rejects named keys", () => {
    expect(isPrintable("Enter")).toBe(false);
    expect(isPrintable("Backspace")).toBe(false);
    expect(isPrintable("ArrowLeft")).toBe(false);
    expect(isPrintable("Shift")).toBe(false);
  });
});

describe("immutability", () => {
  it("never mutates the state it was handed", () => {
    const before = type("abc");
    const snapshot = before.lines.map(lineToString);

    strike(before, "d", config);
    carriageReturn(before);
    retreat(before);

    expect(before.lines.map(lineToString)).toEqual(snapshot);
    expect(before.column).toBe(3);
  });
});
