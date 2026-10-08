/** Placeholder project shown until storage exists (M3). */
export interface Chapter {
  id: string;
  title: string;
  markdown: string;
}

export const sampleChapters: Chapter[] = [
  {
    id: "intro",
    title: "Introduction",
    markdown: `# Introduction

Welcome to **Rosetta**. Write Markdown and add components like these.

:::readaloud
The torches gutter as the door groans open. Beyond it, something *breathes*.
:::

:::sidebar{title="## Running this chapter"}
Keep the pace slow in the first room.
:::
`,
  },
  {
    id: "bestiary",
    title: "Bestiary",
    markdown: `# Bestiary

:::statblock{system="5e"}
name: Bone Warden
size: Medium undead
ac: 15
hp: 52 (8d8+16)
speed: 30 ft.
traits:
  - name: Brittle
    text: Takes **double** damage from bludgeoning.
:::

::pagebreak

| d6 | Loot |
|---:|---|
| 1 | A rusted key |
| 2 | Three silver coins |
`,
  },
  { id: "empty", title: "Empty chapter", markdown: "" },
];
