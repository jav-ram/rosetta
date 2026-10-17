// @vitest-environment jsdom
import type { Preview, PreviewInput } from "@rosetta/preview";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import { PreviewPane } from "../src/components/PreviewPane";
import "./dom-setup";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ready = { state: "ready" as const, markdown: "# A", html: "<h1>A</h1>", ast: { rosettaVersion: "0.1", children: [], warnings: [] }, warnings: [] };

/** A preview that records what it is asked to render. */
function recorder() {
  const inputs: PreviewInput[] = [];
  const preview: Preview = { render: async (input) => (inputs.push(input), { pages: 1, layoutMs: 1, oversized: [], spreads: [], images: [] }), destroy() {} };
  return { inputs, createPreview: () => preview };
}

async function mount(props: Partial<Parameters<typeof PreviewPane>[0]>) {
  const { inputs, createPreview } = recorder();
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(<PreviewPane parsed={ready} createPreview={createPreview} {...props} />));
  return { inputs, root, host, createPreview };
}

test("how the chapter starts, and its first page number, go to the preview", async () => {
  const { inputs } = await mount({ startOn: "right-page", startPage: 5 });
  expect(inputs.at(-1)).toMatchObject({ startOn: "right-page", startPage: 5 });
});

test("changing how the chapter starts draws the pages again, without a new parse", async () => {
  const { inputs, root, createPreview } = await mount({ startOn: "next-page" });
  expect(inputs).toHaveLength(1);
  await act(async () => root.render(<PreviewPane parsed={ready} createPreview={createPreview} startOn="right-page" />));
  expect(inputs).toHaveLength(2);
  expect(inputs[1]).toMatchObject({ startOn: "right-page" });
});
