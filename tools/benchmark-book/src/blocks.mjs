/**
 * One generator per component. Each returns { markdown, pages }, where `pages` is a rough
 * estimate of the space it takes (a page holds about 500 words). The real page count is only
 * known once the preview exists (M2); the estimate just sizes the book.
 *
 * EXTENDING: when a component is added to `m1Components` (or its successor), add a generator
 * for it to `components` below. The test fails until you do. (`::page`, M2, goes here too when it is defined.)
 */
import { creatureName, paragraph, shortPhrase, title } from "./text.mjs";

export const paragraphs = (rng, count) => ({
  markdown: Array.from({ length: count }, () => paragraph(rng)).join("\n\n"),
  pages: count * 0.12,
});

/** Components, keyed by the name in the component definitions. */
export const components = {
  statblock(rng) {
    const trait = () => `  - name: ${shortPhrase(rng)}\n    text: ${paragraph(rng)}`;
    const lines = [
      ":::statblock{system=\"example\"}",
      `name: ${creatureName(rng)}`,
      `size: ${rng.pick(["Small", "Medium", "Large"])} ${rng.pick(["undead", "beast", "construct", "fey"])}`,
      `ac: ${rng.int(10, 19)}`,
      `hp: ${rng.int(10, 120)} (${rng.int(2, 12)}d8+${rng.int(0, 30)})`,
      `speed: ${rng.pick([20, 30, 40])} ft.`,
      "traits:",
      trait(),
      trait(),
      "actions: |",
      `  **Slam.** Melee Weapon Attack: +${rng.int(2, 9)} to hit, reach 5 ft.`,
      "",
      `  *Hit:* ${rng.int(4, 20)} (2d6+${rng.int(1, 5)}) bludgeoning damage.`,
      ":::",
    ];
    return { markdown: lines.join("\n"), pages: 0.5 };
  },

  readaloud(rng) {
    return { markdown: `:::readaloud\n${paragraph(rng)}\n\n${paragraph(rng)}\n:::`, pages: 0.25 };
  },

  sidebar(rng) {
    const heading = rng.pick(["", "## ", "### "]);
    return {
      markdown: `:::sidebar{title="${heading}${title(rng)}"}\n${paragraph(rng)}\n\n- ${paragraph(rng)}\n- ${paragraph(rng)}\n:::`,
      pages: 0.4,
    };
  },

  pagebreak() {
    return { markdown: "::pagebreak", pages: 0.5 }; // on average half a page is left empty
  },

  /**
   * An illustration as the `figure` component, with a caption; every fourth one spans all columns. Illustrations are numbered
   * because each refers to its own placeholder asset (see `figure` below, which chooses between this and a Markdown image).
   */
  figure(_rng, number = 1) {
    const id = String(number).padStart(3, "0");
    const span = number % 4 === 0 ? ' span="all"' : "";
    return { markdown: `::figure{src="assets/originals/ill-${id}.svg" alt="Placeholder illustration ${id}" caption="Illustration ${id}"${span}}`, pages: span ? 0.5 : 0.4 };
  },

  /** The table of contents: two levels of headings, which takes about a page and a half. */
  toc() {
    return { markdown: "::toc{depth=2}", pages: 1.5 };
  },

  /** A page of art, as the `page` component: full-page on every other one, otherwise a band at the top (and the text that follows fills the rest of the page). */
  page(_rng, number = 1) {
    const id = String(number).padStart(3, "0");
    const art = `art="assets/originals/ill-${id}.svg"`;
    return Math.floor(number / 6) % 2 === 0 ? { markdown: `::page{template="art-full" ${art}}`, pages: 1 } : { markdown: `::page{template="art-top" ${art} height="40%"}`, pages: 0.4 };
  },

  /** Switches the page template for the rest of the chapter, or until the next layout. Always starts a new page. */
  layout(rng) {
    return { markdown: `::layout{template="${rng.pick(["one-column", "two-column"])}"}`, pages: 0.5 };
  },
};

/** Plain Markdown blocks, so the book also covers what CommonMark and GFM provide. */
export const markdownBlocks = {
  list(rng) {
    const items = Array.from({ length: rng.int(3, 6) }, () => `- ${paragraph(rng).split(". ")[0].replace(/\.$/, "")}.`);
    return { markdown: items.join("\n"), pages: items.length * 0.04 };
  },

  numbered(rng) {
    const items = Array.from({ length: rng.int(3, 5) }, (_, i) => `${i + 1}. ${paragraph(rng).split(". ")[0].replace(/\.$/, "")}.`);
    return { markdown: items.join("\n"), pages: items.length * 0.04 };
  },

  table(rng) {
    const rows = Array.from({ length: rng.int(4, 8) }, (_, i) => `| ${i + 1} | ${shortPhrase(rng)} | ${rng.int(1, 100)} gp |`);
    return { markdown: ["| d8 | Result | Value |", "|---:|---|---:|", ...rows].join("\n"), pages: 0.1 + rows.length * 0.03 };
  },

  quote(rng) {
    return { markdown: `> ${paragraph(rng)}`, pages: 0.12 };
  },

  code(rng) {
    return { markdown: "```\n" + paragraph(rng).split(". ").join(".\n") + "\n```", pages: 0.15 };
  },
};

/** An illustration, referencing a placeholder asset: a full page of art for every sixth, otherwise a `figure` component on even numbers and a plain Markdown image on odd ones. */
export function figure(number) {
  if (number % 6 === 0) return components.page(null, number);
  if (number % 2 === 0) return components.figure(null, number);
  const id = String(number).padStart(3, "0");
  return { markdown: `![Placeholder illustration ${id}](assets/originals/ill-${id}.svg)`, pages: 0.4 };
}

/** A container nested in another with a longer fence, to exercise nesting. */
export function nested(rng) {
  const inner = components.readaloud(rng).markdown;
  return {
    markdown: `::::sidebar{title="${title(rng)}"}\n${paragraph(rng)}\n\n${inner}\n::::`,
    pages: 0.6,
  };
}
