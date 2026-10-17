# Page layout decisions

The theme is "Classic": A4 pages, two text columns, Georgia body text at 10 pt, a running header with the chapter title and a page number at the bottom. Each chapter is laid out on its own and starts on a new page. Text flows down the first column, then the second, then the next page. There is no column break and no way to force one: shape the content instead.

You cannot see the pages from the chapter files. For anything below that says "look at the preview", the Rosetta preview shows the result and lists layout problems.

## One column or two

- **Two columns** (default): rules, procedures, tables, adventure keys, anything that gets looked up. Narrow columns suit short paragraphs, lists and stat blocks.
- **One column** (`::layout{template="one-column"}`): continuous reading, such as an introduction, fiction, a letter, a handout. Wider text, larger margins. Switch back with `::layout{template="two-column"}` when the reading is over. Each `layout` starts a new page, so use it at natural breaks, not mid-scene.

## What does not split

Stat blocks and figures never split: if one does not fit in the space left, it moves whole to the next column or page, and the space it leaves stays empty. Consequences:

- Several stat blocks in a row waste space at the bottom of columns; put prose between them when you can.
- A stat block or figure taller than a column cannot fit anywhere. The preview flags it ("taller than a column"). Shorten the block, split a monster into two, or give a figure `span="all"` (it then uses the full width and its height only needs to fit the page).
- Paragraphs, lists, tables, read-aloud boxes and sidebars may split; table headers repeat on the next page, list items and table rows do not split.

## Figures

- `span="column"` (default): small illustrations, portraits, a map of one room. About 83 mm wide.
- `span="all"`: maps, battle scenes, anything that needs width. It interrupts the columns at that point: the text before it balances across the columns, then the image, then the text continues. Do not put one directly under a heading that must stay with the text after it.
- Captions are plain text under the image. Always give `alt`.
- Resolution: an image needs roughly 150 dpi at its printed size (300 is best). A column figure is about 3.3 in wide (so 500 px is the least), a full-width figure about 6.9 in (1000 px), a full A4 page about 8.3 × 11.7 in (1250 × 1750 px at the least). The preview warns about images that are too small.

## Art pages

- `art-full`: a splash page or chapter opener; no header, the page number is over the image. Use an image with a calm area at the bottom centre for the number, or accept the dark pill the theme puts behind it.
- `art-top` / `art-bottom`: a band across the page, with text flowing in what is left, for a section opener or scene art. `height` sets the band's size; 25-40% is typical. Text taller than the room left continues on the next page as normal.
- A `page` always starts a new page. After an `art-full` page, text starts on the next one.

### Spreads

A spread is two `art-full` pages in a row that face each other in the printed book: the first on a left-hand page, the second on the right. Write the first with `side="left"`; Rosetta adds a blank page before it if it would otherwise land on a right-hand page. The preview warns when two art pages in a row start on a right-hand page. A spread cannot cross a chapter boundary. Left and right depend on the page number: even pages are left, and the first page of the book is page 1, on the right.

## Chapters

Every chapter starts on a new page. In the app, a chapter can be set to start on a right-hand page (the "R" button in the chapter list), with a blank page inserted when needed; that is a project setting, not part of the Markdown. A chapter that begins with an `art-full` page with `side="left"` starts on a left-hand page whatever that setting says. A chapter's page numbers continue from the chapters before it; reordering or changing the length of one chapter changes the numbers of the later ones.

## Length

Roughly 450-550 words fill a page of two-column text, less with stat blocks, tables and art. Use the checker's estimate to see how a chapter compares with its neighbours and with the target, and the preview for the real count.
