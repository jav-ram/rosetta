# Rosetta Markdown reference

The full, authoritative rules are in `spec.md` (in this folder). This is what is needed to write a chapter.

## What works

CommonMark (headings, paragraphs, emphasis, links, lists, block quotes, code, rules, images) and GFM tables, plus directives. Files are UTF-8. A chapter may start with `---` front matter; it is kept and never shown. Inline directives (`:name[text]`) do not exist: a single colon in text is plain text.

Headings: the `#` heading is the chapter title, set across both columns, and is the running header on every page of that chapter. Use `##` and `###` inside. Headings stay with the text after them.

Images in plain Markdown, `![alt](tavern.png)`, work and are placed at column width; prefer `::figure` so that you can give a caption and choose the width.

## Directives

A **block** directive wraps content and needs a closing line; a **leaf** directive is one line.

```md
:::readaloud
The torches gutter as the door groans open.
:::

::pagebreak
```

- Opening line: three or more colons, the name, optional `{attributes}` with no space before the brace. Nothing else on the line.
- Closing line: only colons (at least as many as the opening line).
- A leaf is exactly two colons: `::name{attrs}`. Written with three it still works but warns (`directive.wrong-form`).
- A block directive starts at the beginning of a block (after a blank line); it cannot interrupt a paragraph.
- Nest by making the outer fence longer: `::::sidebar` ... `::::` around `:::readaloud` ... `:::`.
- Directive lines inside fenced code are literal. To show a directive line as text, write `\::name`.

## Attributes

`{title="Variant: Ambush" id=ambush .wide}`. Values are strings. Quote values with spaces or special characters, with `\"` for a quote inside. `#id` and `.class` shorthands exist; `id` and `class` work on every directive. A bare key is a flag (`{wide}`). Mistakes become warnings (`attr.missing`, `attr.enum`, `attr.unknown`, `attr.syntax`, `attr.duplicate`) and the rest of the line is kept.

## The components

| Component | Form | What it is |
|---|---|---|
| `statblock` | block, data | A creature. Never splits across columns or pages. |
| `readaloud` | block, container | Boxed narration, Markdown inside. May split. |
| `sidebar` | block, container | A callout, Markdown inside. `title="..."` is optional; `title="## Variant"` sets the heading level (default 3). May split. |
| `figure` | leaf | An image with an optional caption. Never splits. |
| `page` | leaf | One special page of art. |
| `layout` | leaf | Changes the page template from here on. Starts a new page. |
| `pagebreak` | leaf | Starts a new page. There is no column break. |

### `statblock`

The body is a restricted YAML mapping (spaces only, no tabs; no anchors, tags or flow collections nested deeply). Plain fields are not read as Markdown; `traits` items' `text` and `actions` are.

```md
:::statblock
name: Bone Warden
size: Medium undead
ac: 15
hp: 52 (8d8+16)
speed: 30 ft.
traits:
  - name: Undead Fortitude
    text: If damage reduces the warden to 0 hit points, it makes a Constitution saving throw.
actions: |
  **Slam.** Melee Weapon Attack: +5 to hit, reach 5 ft.

  *Hit:* 11 (2d6+4) bludgeoning damage.
:::
```

Fields: `name` (required), `size`, `ac` (a **number**; `ac: 15 (chain mail)` is a type warning, put the detail in `hp`/`traits` or a note), `hp`, `speed`, `traits` (list of `name` + `text`), `actions` (Markdown block). These are the temporary built-in fields; do not add fields for a system you were not given. An unknown field is ignored (`field.unknown`) and a missing `name` shows a placeholder.

### `figure`

```md
::figure{src="tavern.png" alt="The Gilded Boar at night" caption="The Gilded Boar, seen from the road"}
::figure{src="map.png" alt="Map of the cellars" span="all"}
```

`src` (required): the image's file name or id. `alt`: for people who cannot see it. `caption`: plain text. `span`: `column` (default, as wide as the column) or `all` (across every column at that point in the text). Two images with the same file name resolve to the first one added; use the id to choose.

### `page`

```md
::page{template="art-full" art="dragon.png"}
::page{template="art-top" art="tavern.png" height="40%"}
::page{template="art-bottom" art="road.png"}
::page{template="art-full" art="map-left.png" side="left"}
::page{template="art-full" art="map-right.png"}
```

`template` (required): `art-full` (the image fills the whole page, no header, the page number sits on the art), `art-top` or `art-bottom` (a band across the top or bottom, and the text after it flows in the rest of the page). `art` (required): image file name or id. `height`: for the bands, a length (`90mm`) or a percentage of the page (`40%`); the theme's default is 30%; a bad value is ignored without a warning. `side="left"`: make this a left-hand page, with a blank page before it if needed. A `page` always starts a new page; the flow then goes on in the layout in force. `art-full` ends its page, so what follows starts another.

### `layout`

`::layout{template="one-column"}` or `two-column`. Applies to every following page until the next `layout`. Starts a new page. The default, before any `layout`, is two columns.

## Warnings the parser gives, and what to do

| Code | Meaning | Fix |
|---|---|---|
| `component.unknown` | Directive name not defined | Check the spelling; use only the components above |
| `attr.missing` | A required attribute is absent (`src`, `art`, `template`) | Add it |
| `attr.enum` | Value not allowed (`span="wide"`, `template="art-middle"`) | Use a listed value |
| `attr.unknown`, `attr.duplicate`, `attr.syntax` | Unknown, repeated or malformed attribute | Fix the line |
| `field.type`, `field.enum`, `field.missing`, `field.unknown` | A stat block field is wrong | Fix the field |
| `yaml.syntax`, `yaml.unsupported` | The YAML body is invalid or uses an unsupported feature | Indent with spaces, simplify |
| `directive.unclosed`, `directive.stray-close` | A block is not closed, or a `:::` closes nothing | Add or remove the closing line; remember inner fences must be shorter than outer ones |
| `directive.wrong-form` | `:::` used for a leaf component, or `::` for a block | Use the right form |
| `layout.too-tall` | (from the preview, not the checker) a stat block or figure is taller than a column | Shorten it, split it, or make a figure `span="all"` |
