import type { Node } from "@rosetta/contracts";

// --- A canonical form both sides are reduced to. Differences in how marks are nested or text is split do not matter. ---

export type Json = { type: string; attrs?: Record<string, unknown>; content?: Json[]; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] };
type Segment = { text?: string; img?: string[]; br?: true; marks: string[] };

const link = (href: unknown, title: unknown) => `link:${String(href)}|${String(title ?? "")}`;

function merge(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const last = out.at(-1);
    if (s.text !== undefined && last?.text !== undefined && last.marks.join() === s.marks.join()) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

function astInline(nodes: Node[] | undefined, marks: string[] = []): Segment[] {
  return (nodes ?? []).flatMap((n): Segment[] => {
    const m = (extra?: string) => [...new Set(extra ? [...marks, extra] : marks)].sort();
    switch (n.type) {
      case "text": return n.value ? [{ text: n.value, marks: m() }] : [];
      case "inlineCode": return n.value ? [{ text: n.value, marks: m("code") }] : [];
      case "strong": return astInline(n.children, m("bold"));
      case "emphasis": return astInline(n.children, m("italic"));
      case "link": return astInline(n.children, m(link(n.url ?? "", n.title)));
      case "image": return [{ img: [n.url ?? "", n.alt ?? "", n.title ?? ""], marks: m() }];
      case "break": return [{ br: true, marks: [] }];
      default: throw new Error(`inline ${n.type}`);
    }
  });
}

const orEmpty = <T>(blocks: T[]): (T | { t: string; c: Segment[] })[] => (blocks.length ? blocks : [{ t: "p", c: [] }]);

export function astBlock(n: Node): unknown {
  switch (n.type) {
    case "paragraph": return { t: "p", c: merge(astInline(n.children)) };
    case "heading": return { t: "heading", level: n.depth, c: merge(astInline(n.children)) };
    case "blockquote": return { t: "quote", c: orEmpty((n.children ?? []).map(astBlock)) };
    case "list": return { t: "list", ordered: !!n.ordered, start: n.ordered ? (n.start ?? 1) : null, tight: n.tight ?? true, items: (n.children ?? []).map((i) => orEmpty((i.children ?? []).map(astBlock))) };
    case "code": return { t: "code", lang: n.lang ?? null, text: (n.value ?? "").replace(/\n$/, "") };
    case "thematicBreak": return { t: "rule" };
    case "table":
      return {
        t: "table",
        rows: (n.children ?? []).map((row) => ({
          header: !!row.header,
          cells: (row.children ?? []).map((cell, i) => ({ align: ["left", "right", "center"].includes(n.align?.[i] ?? "") ? n.align![i] : null, c: merge(astInline(cell.children)) })),
        })),
      };
    case "directive":
      return { t: "dir", name: n.name, form: n.form, kind: n.kind, breakable: n.breakable ?? null, attributes: n.attributes ?? {}, attributesRaw: n.attributesRaw ?? null, fields: n.fields ?? null, raw: n.raw ?? null, warnings: n.warnings ?? [], c: (n.children ?? []).map(astBlock) };
    default: throw new Error(`block ${n.type}`);
  }
}

function docInline(nodes: Json[] | undefined): Segment[] {
  return merge(
    (nodes ?? []).map((n): Segment => {
      const marks = (n.marks ?? []).map((m) => (m.type === "link" ? link(m.attrs?.href, m.attrs?.title) : m.type)).sort();
      if (n.type === "text") return { text: n.text, marks };
      if (n.type === "image") return { img: [String(n.attrs?.src), String(n.attrs?.alt ?? ""), String(n.attrs?.title ?? "")], marks };
      if (n.type === "hardBreak") return { br: true, marks: [] };
      throw new Error(`inline ${n.type}`);
    }),
  );
}

export function docBlock(n: Json): unknown {
  const a = n.attrs ?? {};
  const kids = n.content ?? [];
  switch (n.type) {
    case "paragraph": return { t: "p", c: docInline(kids) };
    case "heading": return { t: "heading", level: a.level, c: docInline(kids) };
    case "blockquote": return { t: "quote", c: kids.map(docBlock) };
    case "bulletList":
    case "orderedList": return { t: "list", ordered: n.type === "orderedList", start: n.type === "orderedList" ? a.start : null, tight: a.tight ?? true, items: kids.map((i) => (i.content ?? []).map(docBlock)) };
    case "codeBlock": return { t: "code", lang: a.language ?? null, text: kids.map((k) => k.text).join("") };
    case "horizontalRule": return { t: "rule" };
    case "table": return { t: "table", rows: kids.map((row) => ({ header: row.content![0]!.type === "tableHeader", cells: row.content!.map((cell) => ({ align: cell.attrs?.align ?? null, c: docInline(cell.content![0]!.content) })) })) };
    case "directive":
    case "directiveLeaf": return { t: "dir", name: a.name, form: a.form, kind: a.kind, breakable: a.breakable ?? null, attributes: a.attributes, attributesRaw: a.attributesRaw ?? null, fields: a.fields ?? null, raw: a.raw ?? null, warnings: a.warnings, c: kids.map(docBlock) };
    default: throw new Error(`doc ${n.type}`);
  }
}

// The cases are read in Node by test/global-setup.ts: the golden suite reader cannot run under jsdom.

/** The same, without the warnings on directives: for comparing a document with its saved-and-parsed-again self, where repaired problems disappear. */
export function withoutWarnings(nodes: Node[]): Node[] {
  return nodes.map(({ warnings: _w, children, ...rest }) => ({ ...rest, ...(children ? { children: withoutWarnings(children) } : {}) }));
}
