import type { Chapter } from "@rosetta/contracts";
import { describe, expect, test } from "vitest";
import { pageInfo, pageLabel } from "../src/pageNumbers";

const ch = (id: string, pages?: number, stale?: boolean): Chapter => ({ id, title: id, ...(pages === undefined ? {} : { pages }), ...(stale ? { stale } : {}) });

describe("first page of each chapter", () => {
  test("is 1 plus the pages of the chapters before it", () => {
    expect(pageInfo([ch("a", 4), ch("b", 10), ch("c", 1)]).map((i) => i.start)).toEqual([1, 5, 15]);
  });

  test("a chapter that has not been laid out is counted as one page, and is flagged, with everything after it", () => {
    const info = pageInfo([ch("a", 4), ch("b"), ch("c", 3), ch("d", 2)]);
    expect(info.map((i) => i.start)).toEqual([1, 5, 6, 9]);
    expect(info.map((i) => i.stale)).toEqual([false, true, true, true]);
  });

  test("a chapter marked stale flags itself and every chapter after it, not the ones before", () => {
    const info = pageInfo([ch("a", 2), ch("b", 2, true), ch("c", 2), ch("d", 2)]);
    expect(info.map((i) => i.stale)).toEqual([false, true, true, true]);
  });

  test("a project whose chapters are all laid out and fresh is not flagged", () => {
    expect(pageInfo([ch("a", 2), ch("b", 3)]).every((i) => !i.stale)).toBe(true);
    expect(pageInfo([])).toEqual([]);
  });
});

describe("the label", () => {
  test("a single page, a range, and unknown", () => {
    expect(pageLabel({ start: 7, pages: 1, stale: false })).toBe("p. 7");
    expect(pageLabel({ start: 7, pages: 4, stale: false })).toBe("pp. 7–10");
    expect(pageLabel({ start: 7, pages: undefined, stale: true })).toBe("p. ?");
  });
});
