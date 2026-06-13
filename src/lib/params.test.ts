import { describe, expect, it } from "vitest";
import { clampInt } from "./params";

describe("clampInt", () => {
  it("returns the fallback for null/undefined/empty", () => {
    expect(clampInt(null, 10, 1, 50)).toBe(10);
    expect(clampInt(undefined, 10, 1, 50)).toBe(10);
    expect(clampInt("", 10, 1, 50)).toBe(10);
  });

  it("returns the fallback for non-numeric input", () => {
    expect(clampInt("abc", 10, 1, 50)).toBe(10);
  });

  it("parses valid integers", () => {
    expect(clampInt("5", 10, 1, 50)).toBe(5);
    expect(clampInt(20, 10, 1, 50)).toBe(20);
  });

  it("clamps to the max and min bounds", () => {
    expect(clampInt("100", 10, 1, 50)).toBe(50);
    expect(clampInt("-3", 10, 1, 50)).toBe(1);
  });

  it("truncates fractional input", () => {
    expect(clampInt("7.9", 10, 1, 50)).toBe(7);
  });
});
