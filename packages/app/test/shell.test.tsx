import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ChapterSidebar } from "../src/components/ChapterSidebar";
import { EditorPane } from "../src/components/EditorPane";
import { PreviewPane } from "../src/components/PreviewPane";
import { sampleChapters } from "./sample-chapters";

const noop = () => {};

test("the sidebar lists every chapter and marks the active one", () => {
  const html = renderToStaticMarkup(<ChapterSidebar chapters={sampleChapters} activeId="bestiary" onSelect={noop} />);
  for (const c of sampleChapters) expect(html).toContain(c.title);
  expect(html.match(/aria-current="true"/g)).toHaveLength(1);
  expect(html).toMatch(/aria-current="true"[^>]*>Bestiary/);
});

test("the editor shows the chapter text", () => {
  const html = renderToStaticMarkup(<EditorPane chapterId="a" markdown="# Hello" parsed={{ state: "loading" }} onChange={noop} />);
  expect(html).toContain("# Hello");
});

test("the preview reports each parser state", () => {
  expect(renderToStaticMarkup(<PreviewPane parsed={{ state: "loading" }} />)).toContain("loading the parser");
  expect(renderToStaticMarkup(<PreviewPane parsed={{ state: "error", message: "boom" }} />)).toContain("boom");
});
