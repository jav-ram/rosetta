# The `.rosetta` file and the book folder

A `.rosetta` file is a zip. Unpacked, it is the book folder Claude works in. Rosetta checks the whole file before it creates anything and refuses a file with a plain message if any rule below is broken, so nothing half-imports. `scripts/check-book.mjs` checks these rules, and `scripts/chapters.mjs` keeps the chapter files right.

```
manifest.json                    the book's title, settings and the ordered list of chapters
chapters/01-introduction.md      one Rosetta Markdown file per chapter
assets/assets.json               the list of images (a JSON list; [] when there are none)
assets/originals/<id>.<ext>      the image files
```

The files must be at the top of the zip (`manifest.json`, not `book/manifest.json`). Everything is UTF-8.

## manifest.json

```json
{
  "rosettaVersion": "0.1",
  "title": "The Drowned Crown",
  "system": "5e",
  "theme": "classic",
  "cover": { "title": "Optional cover text", "image": { "id": "…", "mediaType": "image/png", "size": 123 } },
  "chapters": [
    { "id": "introduction", "title": "Introduction" },
    { "id": "the-crypt", "title": "The Crypt", "start": "right-page" }
  ]
}
```

- Required: `rosettaVersion` (like `0.1`), `title` (not empty), `chapters` (a list, in book order). Optional: `system`, `theme` (`classic` is the only theme), `cover`.
- A chapter needs an `id` and a `title`. The id is letters, digits, `-` and `_`, starting with a letter or digit, at most 64 characters, **unique in the book**, and never changed afterwards: it is how Rosetta keeps a chapter's text when it is renamed or moved.
- `start` is optional: `right-page` starts the chapter on a right-hand page (a blank page is added when needed); absent means a new page. `pages` and `stale` are written by Rosetta after it lays pages out; leave them alone (they may be absent).
- No other keys are allowed in a chapter or at the top of the manifest.
- The `cover.image`, if there is one, must be one of the assets.

## Chapter files

- The **position** of a chapter in `manifest.chapters` decides its file: chapter 3 is the file starting `03-`, any text after the number is free (`03-the-crypt.md`). With 100 or more chapters the number has three digits (`001-`), so renumber all files when the count crosses 99.
- **Every chapter must have a file**, even an empty one. A missing file refuses the whole import.
- A file with no matching chapter is ignored by Rosetta but reported by the checker.
- The text is Rosetta Markdown (`references/markdown.md`). The chapter's title for the reader is the `# heading` inside the file; the manifest `title` is the name in the chapter list. Keep them the same.
- Reordering chapters means renumbering files and the manifest together. `chapters.mjs move` and `chapters.mjs add` do both.

## Assets

`assets/assets.json` is a list of entries:

```json
[{ "id": "a1b2c3", "name": "tavern.png", "mediaType": "image/png", "size": 482113, "width": 1600, "height": 900 }]
```

- Required: `id` (the same rule as chapter ids, unique), `mediaType` (lower case, like `image/png`), `size` (the file's size in bytes). `name` is the original file name, what chapters usually refer to (`::figure{src="tavern.png"}`); `width` and `height` are optional.
- The file must be `assets/originals/<id>.<ext>` with the extension that goes with the type: `image/png` `png`, `image/jpeg` `jpg`, `image/gif` `gif`, `image/webp` `webp`, `image/avif` `avif`, `image/svg+xml` `svg`. A file named `.jpeg` for a `image/jpeg` asset is not found.
- Every listed asset needs its file. Files nobody lists are ignored.
- **Do not create assets by hand unless you must.** Ids and sizes are easy to get wrong, and Rosetta's own import button (Images, `+`) does it right. The usual way is: the author adds the images in Rosetta, exports, and Claude then writes chapters that refer to them by file name. If you do add one: copy the file into `assets/originals/<id>.<ext>`, add the entry with the exact byte size, and run the checker.

## Making the file

```bash
cd the-book-folder && zip -r ../the-book.rosetta manifest.json chapters assets -x '*.DS_Store'
```

Naming the three entries keeps notes, the book bible and other files that sit in the folder out of the file. In Rosetta, **Import…** on the projects screen opens it as a new project.
