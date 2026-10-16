import { describe, expect, test } from "vitest";
import { fitZoom, GUTTER, MAX_ZOOM, MIN_ZOOM } from "../src/fitEditor";

describe("fitting the editor page to its pane", () => {
  test("the page is scaled so it fills the pane, less a gutter on each side", () => {
    expect(fitZoom(2 * GUTTER + 400, 400)).toBe(1);
    expect(fitZoom(2 * GUTTER + 500, 400)).toBe(1.25);
  });

  test("never smaller than MIN_ZOOM or larger than MAX_ZOOM", () => {
    expect(fitZoom(200, 400)).toBe(MIN_ZOOM);
    expect(fitZoom(5000, 400)).toBe(MAX_ZOOM);
  });

  test("an unknown size changes nothing", () => {
    expect(fitZoom(0, 400)).toBe(1);
    expect(fitZoom(600, 0)).toBe(1);
    expect(fitZoom(Number.NaN, 400)).toBe(1);
  });
});
