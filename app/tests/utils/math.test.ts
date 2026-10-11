import { afterEach, expect, test, vi } from "bun:test";
import { secureRandomInt } from "@/utils/math";

afterEach(() => vi.restoreAllMocks());

test("secure random integers reject excess draws for non-power-of-two bounds", () => {
  const draws = [3, 1, 2, 0];
  const source = vi
    .spyOn(crypto, "getRandomValues")
    .mockImplementation((array: Uint32Array) => {
      const value = draws.shift();
      if (value === undefined) throw new Error("Unexpected random draw");
      array[0] = value;
      return array;
    });
  expect(secureRandomInt(3)).toBe(1);
  expect(secureRandomInt(3)).toBe(2);
  expect(secureRandomInt(3)).toBe(0);
  expect(source).toHaveBeenCalledTimes(4);
});

test("secure random integers preserve unsigned values at the 32-bit bound", () => {
  vi.spyOn(crypto, "getRandomValues").mockImplementation((array: Uint32Array) => {
    array[0] = 0xffff_ffff;
    return array;
  });
  expect(secureRandomInt(0x1_0000_0000)).toBe(0xffff_ffff);
  expect(secureRandomInt(256)).toBe(255);
});

test("secure random singleton ranges need no draw", () => {
  const source = vi.spyOn(crypto, "getRandomValues");
  expect(secureRandomInt(1)).toBe(0);
  expect(source).not.toHaveBeenCalled();
});

test("secure random integers reject invalid bounds", () => {
  for (const bound of [0, -1, 1.5, NaN, Infinity, 0x1_0000_0001]) {
    expect(() => secureRandomInt(bound)).toThrow(RangeError);
  }
});
