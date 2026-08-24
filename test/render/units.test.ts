import { describe, expect, it } from "vitest";
import { toDots } from "../../src/render/zpl/units.js";

describe("toDots", () => {
  it("converts mm to dots for the real 50x30mm label at 203dpi", () => {
    expect(toDots(50, 203)).toBe(400);
    expect(toDots(30, 203)).toBe(240);
    expect(toDots(2, 203)).toBe(16);
  });

  it("rounds exact .5 dot boundaries up", () => {
    // 254dpi = exactly 10 dots/mm, so these land on exact fractional-dot boundaries.
    expect(toDots(0.05, 254)).toBe(1);
    expect(toDots(0.15, 254)).toBe(2);
    expect(toDots(0.25, 254)).toBe(3);
  });

  it("returns 0 dots for 0mm", () => {
    expect(toDots(0, 203)).toBe(0);
  });
});
