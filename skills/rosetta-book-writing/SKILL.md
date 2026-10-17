---
name: rosetta-book-writing
description: Help write and edit a tabletop RPG book in Rosetta (the WYSIWYG editor for tabletop RPG books) - drafting adventure and rules chapters, read-aloud text, stat blocks, sidebars, tables, figures and full-page art, fixing Rosetta Markdown and parser warnings, deciding page layout (columns, art pages, spreads, chapter starts), and checking the whole book for consistency, broken image references and unused art. Use this whenever the user talks about their book, a chapter, a .rosetta file or a folder of chapter .md files, encounters, NPCs, locations, monsters, "write the next chapter", "fix the warnings", "does the book hang together", or asks for Rosetta/directive syntax such as ::figure, ::page, :::statblock, :::readaloud, even if they do not say "skill" or "Rosetta".
---

# Writing a book in Rosetta

Rosetta stores a project in the browser, so Claude cannot see the book directly. The working method is to **export the project as a `.rosetta` file, unpack it into a folder, edit the chapter files there, check them, pack them again, and import the file back into Rosetta to see the result.** Everything below follows from that.

## 1. Get the book into a folder

Ask the user for the folder if there is none yet; `book/` in the current working directory is a good default (the book is their content: do not commit it or publish it unless they say so). A `.rosetta` file is a zip:

```
manifest.json                  title, theme, chapter ids and titles, start rules
chapters/01-introduction.md    one Rosetta Markdown file per chapter, in book order
assets/assets.json             the images: id, original file name, type, size
assets/originals/<id>.<ext>    the image files
```

Unpack with `unzip -o the-book.rosetta -d book/project` and work in `book/project/`. Put anything that is only for you (the bible, notes, outlines) in `book/`, **outside** `project/`, so it never ends up in the file you pack.

**Starting a book from nothing.** If there is no Rosetta project yet, make the folder yourself; the author does not need Rosetta open to begin:

```bash
node <this skill's folder>/scripts/chapters.mjs new book/project --title "The Book" --chapters "Introduction,The Crypt" [--system "5e"]
```

That writes a valid `manifest.json`, an empty image list and one starter file per chapter (`# Title`). Write the chapters, run the checker, pack the folder (section 7) and the author imports it. Images come later: the author adds them in Rosetta, exports, and you write the `::figure` and `::page` lines that refer to them by file name. Until then, write the figure lines with the name the image will have and tell the author which images the book is waiting for.

To add a chapter or change the order, use `chapters.mjs add <folder> "Title" [--at N]` and `chapters.mjs move <folder> <from> <to>`: chapter files are matched to the manifest by their number, so the script renames the files and updates the manifest together. `chapters.mjs renumber <folder>` fixes the file names after you edit the manifest by hand. The exact rules of the folder (manifest keys, ids, file names, image files) are in `references/rosetta-file.md`; read it before changing anything in `manifest.json` or `assets/` yourself.

If the user would rather paste text than use a folder, work from what they paste: write Rosetta Markdown for it and say plainly which chapter it belongs to. The rest of this skill still applies; only the file steps and the checker do not.

## 2. Keep a book bible

Consistency across chapters is what a collaborator on a long book is for, and it is the thing that goes wrong first. Keep `book/BIBLE.md` (start from `references/bible-template.md`): the system and its terms, tone, the cast and places with their spellings, canon facts decided so far, open questions. Read it before writing anything, and update it whenever a chapter creates something the next one will need (a name, a number, a rule). When you have to invent something the bible does not cover, say so in your reply instead of slipping it in, so the author can overrule it.

Ask before guessing at things only the author knows: the game system and its rules (never invent mechanics or stat numbers for a system you were not told), the intended level range, the voice. If the author's earlier chapters show the voice, match that instead of asking.

## 3. Writing or editing a chapter

1. Read the bible, the chapter you are changing, and the chapters on either side of it.
2. Write Rosetta Markdown (section 4 below; syntax details in `references/markdown.md`). Keep the chapter's first line a single `# Title`.
3. Run the checker (section 6) and fix what it reports before you hand the chapter back.
4. Reply with what changed and what you decided on your own; list new canon and questions at the end, short.

Write for use at the table. Text that gets read mid-session should be scannable: a clear heading per location or scene, short paragraphs, the thing the game master needs first (what the players see, what is hidden, what happens if they do X). Read-aloud text is boxed narration: keep it to what the characters can perceive, in the present tense, a few sentences, with no decisions made for the players. Put mechanics in stat blocks and tables, and the story around them in prose, so each can be found at a glance.

## 4. Rosetta Markdown in short

It is CommonMark plus GFM tables, plus **directives**. Components: `:::statblock`, `:::readaloud`, `:::sidebar{title="..."}` (blocks with a closing `:::`), and `::figure{src= alt= caption= span=}`, `::page{template= art= height= side=}`, `::layout{template=}`, `::pagebreak` (single lines). Attribute values are quoted; `src` and `art` name an image of the project by **file name or id**. Nest blocks with a longer outer fence (`::::sidebar` around `:::readaloud`). A chapter that has problems still renders: the parser turns each problem into a warning on that part, which is why the checker exists. For every attribute, field and edge case read `references/markdown.md`; the full rules are in `references/spec.md` (the Rosetta Markdown specification).

Do not invent components or attributes. An unknown directive renders as a warning block, and the book would print with it.

## 5. Layout is a decision, not decoration

Chapters always start on a new page; the default page is two columns. Choose layout deliberately and say why in one line when you change it: `references/layout.md` covers one column vs two, figures and wide figures, art pages and spreads, chapter start rules, and what makes a stat block or figure not fit. You cannot see the pages from the folder, so for anything that depends on how the text falls (a spread facing correctly, a stat block fitting, the page count) tell the author to look at the Rosetta preview, which flags those problems.

## 6. Check the book

```bash
node <this skill's folder>/scripts/check-book.mjs book/project            # whole book
node <this skill's folder>/scripts/check-book.mjs book/project --chapter 3 # one chapter
```

It runs the real Rosetta parser over every chapter and reports warnings with file and line, image references that match no asset, assets nothing uses, chapters and files that do not match the manifest, headings that look wrong, art pages in a row, and rough sizes (words, estimated pages). It needs only Node 18 or newer; the parser it uses is in `scripts/vendor/`. Zero warnings is the bar for handing back a chapter.

For a book-wide pass beyond the script, read the chapters and look for what a script cannot see: names spelled two ways, a number that changes between chapters, something a later chapter relies on that no earlier one sets up, a monster whose stats disagree with the text about it, a location described differently twice. Report these as a short list with chapter and line, and fix the ones the bible settles.

## 7. Getting it back into Rosetta

Pack only the project files, then ask the author to use Import in Rosetta (projects screen). Rosetta checks the whole file before it creates anything, and refuses it with a plain message if a chapter file, an image file or the manifest is wrong, so a bad file never leaves a half-imported project. The checker enforces the same rules, so a folder that passes it will import. The files must sit at the top of the zip (`manifest.json`, not `project/manifest.json`), which the command below does:

```bash
cd book/project && zip -r ../the-book-edited.rosetta manifest.json chapters assets -x '*.DS_Store'
```

Import makes a **new project** each time (it does not overwrite), so tell the author the old copy can be deleted once the new one looks right. For a small change to one chapter it is quicker to paste that chapter's text into the Markdown tab of the open chapter, and you can offer that instead.

Never change chapter ids by hand, and do not edit the manifest's structure beyond adding, renaming or reordering chapters (use `chapters.mjs`). To add an image, the author adds it in Rosetta: the folder cannot safely invent asset ids (see `references/rosetta-file.md`).

## What to leave to the author

The art choices, canon decisions that change the story, anything about the game system's rules that was not given to you, and the final look of the pages. Suggest, flag, and keep the question short enough to answer in a word.

## How current this skill is

`scripts/vendor/VERSION` says which Rosetta parser and specification this skill was built from. Rosetta moves on: if the app behaves differently from what the references say (a new component, a changed attribute, a warning the checker does not give), trust the app, tell the author, and note the difference rather than writing around it.
