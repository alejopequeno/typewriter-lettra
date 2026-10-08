import { describe, expect, it } from "vitest";

import {
  carriageColumn,
  carriageReturn,
  createState,
  currentLine,
  isPrintable,
  strike,
  type TypewriterConfig,
} from "./typewriter-machine";

const config: TypewriterConfig = { columns: 8, bellColumn: 6 };

const type = (text: string, from = createState()) =>
  [...text].reduce((state, char) => strike(state, char, config).state, from);

describe("strike", () => {
  it("prints the character at the carriage and advances", () => {
    const { state, outcome } = strike(createState(), "A", config);

    expect(currentLine(state)).toBe("A");
    expect(carriageColumn(state)).toBe(1);
    expect(outcome).toBe("printed");
  });

  it("builds up a line left to right", () => {
    expect(currentLine(type("hola"))).toBe("hola");
  });

  it("advances the carriage over blanks", () => {
    expect(currentLine(type("a b"))).toBe("a b");
  });

  it("rings the bell when the carriage reaches the warning column", () => {
    expect(strike(type("abcde"), "f", config).bell).toBe(true);
  });

  it("stays silent on every other column", () => {
    expect(strike(createState(), "a", config).bell).toBe(false);
    expect(strike(type("abcdef"), "g", config).bell).toBe(false);
  });

  it("jams at the right margin instead of printing", () => {
    const { state, outcome } = strike(type("abcdefgh"), "i", config);

    expect(outcome).toBe("jammed");
    expect(currentLine(state)).toBe("abcdefgh");
    expect(carriageColumn(state)).toBe(8);
  });
});

describe("carriageReturn", () => {
  it("opens a new line and returns the carriage", () => {
    const state = carriageReturn(type("uno"));

    expect(carriageColumn(state)).toBe(0);
    expect(state.lines).toHaveLength(2);
    expect(currentLine(state)).toBe("");
  });

  it("leaves the finished line untouched", () => {
    const state = type("dos", carriageReturn(type("uno")));

    expect(state.lines[0]).toBe("uno");
    expect(state.lines[1]).toBe("dos");
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

    strike(before, "d", config);
    carriageReturn(before);

    expect(before.lines).toEqual(["abc"]);
    expect(carriageColumn(before)).toBe(3);
  });
});
