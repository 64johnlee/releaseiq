import { describe, expect, it } from "vitest";
import { clampInt, parseRepo } from "./params";

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

describe("parseRepo", () => {
  it("parses owner/name", () => {
    expect(parseRepo("acme/web")).toEqual(["acme", "web"]);
  });

  it("returns null for missing or non-slashed input", () => {
    expect(parseRepo(null)).toBeNull();
    expect(parseRepo(undefined)).toBeNull();
    expect(parseRepo("")).toBeNull();
    expect(parseRepo("noslash")).toBeNull();
  });

  it("returns null when owner or name is empty", () => {
    expect(parseRepo("/web")).toBeNull();
    expect(parseRepo("acme/")).toBeNull();
  });
});
