# Spike: pinned art bands (`art-top`, `art-bottom`, `art-full`)

Task T2.7. Question: can art be pinned to the top or bottom of one page, with the text flowing in the space that is left, using Paged.js? The plan called this the hardest layout feature and asked for a spike before M4 builds on it.

**Answer: yes, and it works with a small hook, not with the approach the plan assumed.** A working prototype is in `docs/spikes/art-bands/`. The plan's fallback (a `figure` spanning all columns at the start of a new page) is not needed.

## What was tried

Three prototypes, all standalone HTML pages that run Paged.js 0.4.3 (the same file the app uses) on A4 with the Classic theme's margins. Each has two columns, a running header and page numbers, long enough text to run over several pages, and an SVG band for art.

| | Idea | Result |
|---|---|---|
| **A** `a-css-running.html` | What the plan described: a named page `art-top`, `@page art-top:first` with a taller `margin-top`, and the art as a Paged.js **running element** shown in a margin box (`content: element(band)`). CSS only. | **Works**, with limits (below). |
| **A2** `a2-css-running-in-layout.html` | A put inside a one-column layout (T2.6). | **The art page loses the layout**: it came out two-column with the default margins. |
| **B** `b-page-hooks.html` | A small hook on Paged.js's `beforePageLayout`: if the page starts at an art marker, set the page's margin and add the band to the page. | **Works, with none of A's limits.** |
| **B2** `b2-art-first.html` | B with the marker as the very first thing in the document. | Works once the hook looks down into the first element (it did not before; see "Gotchas"). |

To look at them: `pnpm` is not needed; serve the repository folder with any static server (the `spikes` entry in `.claude/launch.json` is `python3 -m http.server 5175`) and open `http://localhost:5175/docs/spikes/art-bands/b-page-hooks.html`.

## Results

**A (named page + running element).** On the art page the text area went from 956 px to 699 px high (a 90 mm band on A4 at 96 dpi), the band showed in the margin box, and the next page was back to normal. The band could be made to bleed to the left, right and top edge with negative margins on the image. But:

1. **Per-instance height needs a rule per instance.** `@page` cannot read custom properties (the T2.2 finding again), and the margin is set by the `@page` rule, so `height="40%"` on one `::page` and `30%` on another means generating `@page art-top-1`, `@page art-top-2`... and a page name per instance.
2. **The named page replaces the layout** (A2). A page has one name, so a page that is both "one-column" and "art-top" needs its own name, `one-column-art-top`, for every combination of layout and art template, each with its own margins and columns. With the planned templates that is already 2 layouts × 3 art templates, and a theme author would have to write them all.
3. **Named pages continue.** In Paged.js a named page applies to an element and everything inside it, so the text after the art must be inside a wrapper, and its pages keep the art page's name. That wrapper would have to end after one page, which only layout knows, and the parser does not.
4. A running element is cloned from the content into a margin box by a handler that Paged.js controls; the width of a margin box is the page width minus the margins, so full bleed needs negative margins on the image, and the image sat about 6 px above the page edge.

**B (hook).** Paged.js lays out a page in three steps: it creates the page, runs `beforePageLayout`, then lays the content out into it, measuring the area at that moment (`new Layout(page.area)` is made inside `Page.layout`, after the hook). So changing the page's margin *in* the hook is seen by the layout and the text area shrinks correctly. The hook looks at where the page starts (`breakToken.node`; for the first page, the first element of the content). If that is an art marker, it:

- sets `--pagedjs-margin-top` (or `-bottom`) on the page to the band's height, and
- adds a band element (the image, `position: absolute`, full width) to the page box.

Measured on `b-page-hooks.html` (A4, 1123 px high page):

| Page | What | Text area | Band |
|---|---|---|---|
| 2 | `art-top`, 90 mm | 699 px high, starts 340 px down | 340 px high, full width (794 px) |
| 4 | `art-bottom`, 60 mm | 813 px high | 227 px high at the bottom, full width |
| 5 | `art-full` | empty | the whole page (1123 × 794) |
| 6 | the text after the full-page art | normal | none |
| 7 → 9 | a one-column layout, with a 30% `art-top` inside it | 337 px down (30% of the page height) | 337 px high; **the page is still one column, with its layout's margins** |

Also: a percentage height is a percentage of the page height (30% gave 337 of 1123 px); the continuation pages of an art page, and every page after, are normal; the pages around an art page are unaffected; no text was lost; the page number is drawn over a bottom band and stays visible (given a light colour and a shadow); layout took 50 to 200 ms for 7 to 9 pages, no slower than without the hook. A marker nested inside a layout's element worked as well as a top-level one.

Because the hook does not use named pages, it does **not interact with layouts**: the page keeps whatever named page it has (`one-column`, ...), and the band is added on top. That removes problems 1 to 3 of A.

## Recommendation

**Use B for `art-top`, `art-bottom` and `art-full`.** Do not use named pages for the art templates. Keep named pages for what they do well (`layout`, T2.6).

How it fits what exists, for T4.3 and T4.4:

- **Parser:** `page` is a plain **leaf component**, no `scope`: attributes `template` (`art-full`, `art-top`, `art-bottom`), `art` (asset path), `height` (optional), `side` (optional, T4.5). T2.6 already writes a leaf component's attributes as `data-*`, so the HTML is `<div class="rosetta-page" data-component="page" data-kind="leaf" data-template="art-top" data-art="assets/tavern.jpg" data-height="40%"></div>`. Nothing about art in Go.
- **Theme:** `.rosetta-page { break-before: page; height: 0; overflow: hidden }` and, for `art-full`, `break-after: page` (the marker must have a box, not `display: none`, for Paged.js to honour a break after it). The theme says what each template means with **custom properties on the marker**, which the hook reads: for example `[data-template="art-top"] { --page-band: top; --page-band-height: var(--page-art-top-height) }` with the default height as a theme token (the plan says "the theme sets a default"), and `art-full { --page-band: full }`. The hook then has no template names in it. The page number over art, its colour, the mask on the band (`mask-image`, from the plan's custom theme section) and whether the header is hidden on `art-full` are CSS on the classes the hook puts on the page (`has-art-top`, ...).
- **Preview:** the hook belongs in `@rosetta/preview` next to the table header hook, as a source string installed on `chunker.hooks.beforePageLayout`. It reads the marker's `data-art`, `data-height` and the two custom properties, resolves `height` (a length, or a percentage of the page height) and the asset URL (the same `resolveImage` the preview already has), and adds the band. About 25 lines.
- **Editor:** a page divider block like `layout` (T2.6) showing the template and a thumbnail from `data-art`; the form (a select, the art path, the height) comes from the definition.
- **Export (M5):** the same hook runs in the server-side Paged.js, so the preview and the PDF agree. The band is a normal image, so it prints.
- **`side="left"`:** Paged.js already handles `break-before: left` (it inserts a blank page); put it on the marker.

## Gotchas found

- **A marker as the first thing in the document** is not the "break token" of any page, so the hook must look down from the first element of the content (`B2`; fixed in the prototypes). In the app the first element is the `.rosetta-document` wrapper, so this will happen.
- **Inline styles are ignored** by Paged.js for breaks: `style="break-before: page"` did nothing; the rule has to be in a stylesheet.
- **`var()` does not work inside `@page`**, as found in T2.2. The hook sets a CSS variable on the page from JavaScript, which is fine, and the band's height is a normal style.
- **The hook depends on Paged.js's own names:** `chunker.hooks.beforePageLayout` (public, documented), the page box element, and the variables `--pagedjs-margin-top` and `--pagedjs-margin-bottom` (internal). Pin the Paged.js version, and have a test that renders an art page and checks that the text area shrinks, so an upgrade that renames them fails loudly.
- **Oversized elements (T2.5):** a stat block that fits a normal column but not an art page's reduced one simply moves to the next page, as any unbreakable element does. The check compares with the text area of the pages it ended up on, so it still means "does not fit on any page".
- **Images in the band load after layout**, and do not delay it. Fine for the preview; the exporter must wait for them before printing.

## Not tested

- Real images (the bands were SVG gradients), so no check on resolution, cropping (`object-fit: cover` was used) or loading time.
- Facing pages and `side="left"`; two `art-full` pages in a row.
- Bleed (the plan puts bleed in print output, later).
- A very tall band (the whole page is covered by `art-full`; a band taller than the page minus one line of text was not tried).
- Firefox and Safari. Paged.js and the hook are plain DOM and CSS, but only Chrome was used.
- The hook inside the real preview package: it was proved on standalone pages with the same Paged.js build and the same message-channel scheduler, not inside `@rosetta/preview`.
