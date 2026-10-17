# rosetta-book-writing

A Claude skill that helps write a tabletop RPG book in [Rosetta](https://github.com/jav-ram/rosetta): drafting and editing chapters in Rosetta Markdown, fixing parser warnings, layout decisions, and book-wide checks. Claude reads `SKILL.md` when the work is about your book; the rest of this folder is loaded only when needed.

## What is in the folder

```
SKILL.md                       the workflow Claude follows
references/markdown.md         directive syntax, components, attributes, warning codes
references/layout.md           page layout decisions
references/rosetta-file.md     the .rosetta file and book folder: every rule Rosetta checks
references/bible-template.md   template for a book bible
references/spec.md             the Rosetta Markdown specification (a copy)
scripts/check-book.mjs         checks an unpacked book with the real Rosetta parser
scripts/chapters.mjs           starts a book folder, adds and moves chapters, keeps file names right
scripts/vendor/                the parser (WebAssembly) and its VERSION
```

It has no dependencies beyond **Node 18 or newer** (only used by the scripts). It does not need the Rosetta repository. Keep the folder together: the checker needs `scripts/vendor/`.

## Install

Copy the `rosetta-book-writing` folder (or unzip `rosetta-book-writing.skill`, which is the same folder zipped) into one of:

- `~/.claude/skills/` for every project (Claude Code, Claude desktop app's Code tab);
- `<your project>/.claude/skills/` for one project.

For Claude.ai or the Claude apps that take uploads, add the `.skill` file where skills are managed (Settings, Capabilities, Skills). The checker script only runs where Claude can run Node.

Then start a Claude session in the folder where your book lives and say what you want ("write chapter 3", "check the book"). The first time, Claude will ask you to export the project from Rosetta as a `.rosetta` file and unpack it (see `SKILL.md`, section 1).

## Updating it

`scripts/vendor/VERSION` says which Rosetta version the skill matches. When Rosetta changes, refresh the copy of the parser and the specification from the Rosetta repository and package it again:

```bash
pnpm skill:sync       # rebuild the parser, copy it and the spec into the skill
pnpm skill:package    # the same, plus skills/dist/rosetta-book-writing.skill
```
