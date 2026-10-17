import type { Chapter } from "@rosetta/contracts";

export interface PageInfo {
  /** The book page number of the chapter's first page: 1, plus the pages of the chapters before it. */
  start: number;
  /** Its page count from its last layout, if it has had one. */
  pages: number | undefined;
  /** True when `start` (and so the page numbers, and any blank page) may be out of date: the chapter, or one before it, has changed or has not been laid out yet. */
  stale: boolean;
}

/** An estimate for a chapter that has not been laid out yet. */
const UNKNOWN_PAGES = 1;

/** First page number and freshness of every chapter, from the page counts stored in the manifest. */
export function pageInfo(chapters: Chapter[]): PageInfo[] {
  let next = 1;
  let uncertain = false;
  return chapters.map((c) => {
    const info: PageInfo = { start: next, pages: c.pages, stale: uncertain || c.stale === true || c.pages === undefined };
    next += c.pages ?? UNKNOWN_PAGES;
    // This chapter's count may still change, which moves every chapter after it.
    uncertain = info.stale;
    return info;
  });
}

/** "p. 12", "pp. 12–15", or "p. ?" before the chapter has been laid out. */
export function pageLabel(info: PageInfo): string {
  if (info.pages === undefined) return "p. ?";
  return info.pages > 1 ? `pp. ${info.start}–${info.start + info.pages - 1}` : `p. ${info.start}`;
}
