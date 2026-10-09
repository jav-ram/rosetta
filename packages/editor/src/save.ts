import type { JSONContent } from "@tiptap/core";
import { yamlMapping } from "./yaml";

export interface SaveOptions {
  /** The front matter text as the parser reported it (`frontMatterRaw`). Written back unchanged. */
  frontMatterRaw?: string;
  /** Used only when there is no raw text. */
  frontMatter?: Record<string, unknown>;
}

/**
 * Writes the editor's document as Rosetta Markdown. The output parses back to the same content: the same
 * AST apart from source positions and, where the source was invalid, the problems the writer repaired.
 * It does not keep the author's formatting (bullet characters, setext headings, wrapping); it writes one style.
 */
export function toMarkdown(doc: JSONContent, options: SaveOptions = {}): string {
  const body = blocks(doc.content ?? [], { tight: false });
  const out: string[] = [];
  if (options.frontMatterRaw !== undefined) out.push(`---\n${options.frontMatterRaw}\n---`);
  else if (options.frontMatter && Object.keys(options.frontMatter).length) out.push(`---\n${yamlMapping(options.frontMatter as never).join("\n")}\n---`);
  if (body) out.push(body);
  return out.length ? out.join("\n\n") + "\n" : "";
}

// ---------------------------------------------------------------------------------------------------------------
// Blocks

interface Context {
  /** Inside a tight list item: blocks are separated by a single newline where that stays tight. */
  tight: boolean;
}

const isList = (n: JSONContent) => n.type === "bulletList" || n.type === "orderedList";
const isEmptyParagraph = (n: JSONContent) => n.type === "paragraph" && !n.content?.length;

/** Blocks joined into one string. Empty paragraphs are dropped: Markdown cannot say them. */
function blocks(nodes: JSONContent[], ctx: Context): string {
  const kept = nodes.filter((n) => !isEmptyParagraph(n));
  const parts: string[] = [];
  let previous: JSONContent | undefined;
  kept.forEach((node, i) => {
    const text = block(node, previous, kept[i + 1]);
    if (i > 0) parts.push(ctx.tight && isList(node) ? "\n" : "\n\n");
    parts.push(text);
    previous = node;
  });
  return parts.join("");
}

function block(node: JSONContent, previous: JSONContent | undefined, _next: JSONContent | undefined): string {
  const a = node.attrs ?? {};
  switch (node.type) {
    case "paragraph":
      return inline(node.content ?? []);
    case "heading": {
      const text = inline(node.content ?? [], { noBreaks: true }).replace(/(^| )(#+)$/, "$1\\$2");
      return `${"#".repeat(Number(a.level) || 1)}${text ? " " + text : ""}`;
    }
    case "blockquote": {
      const inner = blocks(node.content ?? [], { tight: false });
      return inner ? inner.split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n") : ">";
    }
    case "bulletList":
    case "orderedList":
      return list(node, previous);
    case "codeBlock": {
      const text = (node.content ?? []).map((c) => c.text ?? "").join("");
      const fence = "`".repeat(Math.max(3, longestRun(text, "`") + 1));
      const info = typeof a.language === "string" ? a.language.replace(/[`\n]/g, "") : "";
      return `${fence}${info}\n${text}${text ? "\n" : ""}${fence}`;
    }
    case "horizontalRule":
      return "---";
    case "table":
      return table(node);
    case "directive":
    case "directiveLeaf":
      return directive(node);
    default:
      throw new Error(`Cannot save a "${node.type}" node`);
  }
}

const longestRun = (text: string, char: string) => Math.max(0, ...(text.match(new RegExp(`${char === "`" ? "`" : `\\${char}`}+`, "g")) ?? []).map((r) => r.length));

function list(node: JSONContent, previous: JSONContent | undefined): string {
  const a = node.attrs ?? {};
  const ordered = node.type === "orderedList";
  const tight = a.tight !== false;
  // Two lists in a row would merge into one if they used the same marker.
  const alternate = previous?.type === node.type;
  const start = ordered ? Number(a.start ?? 1) : 0;
  const items = (node.content ?? []).map((item, i) => {
    const marker = ordered ? `${start + i}${alternate ? ")" : "."}` : alternate ? "*" : "-";
    const body = blocks(item.content ?? [], { tight });
    const indent = " ".repeat(marker.length + 1);
    return body
      .split("\n")
      .map((line, n) => (n === 0 ? (line ? `${marker} ${line}` : marker) : line ? `${indent}${line}` : ""))
      .join("\n");
  });
  return items.join(tight ? "\n" : "\n\n");
}

function table(node: JSONContent): string {
  const rows = (node.content ?? []).map((row) => (row.content ?? []).map((cell) => ({ align: cell.attrs?.align as string | null, text: cellText(cell) })));
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const line = (cells: { text: string }[]) => `| ${Array.from({ length: width }, (_, i) => cells[i]?.text ?? "").join(" | ")} |`;
  const rule = Array.from({ length: width }, (_, i) => {
    const align = rows[0]![i]?.align;
    return align === "left" ? ":--" : align === "right" ? "--:" : align === "center" ? ":-:" : "---";
  });
  return [line(rows[0]!), `| ${rule.join(" | ")} |`, ...rows.slice(1).map(line)].join("\n");
}

/** A cell is one line of inline content; a pipe is `\|`, also inside code. */
const cellText = (cell: JSONContent) =>
  (cell.content ?? [])
    .map((p) => inline(p.content ?? [], { noBreaks: true }))
    .filter(Boolean)
    .join(" ")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");

// --- components

function directive(node: JSONContent): string {
  const a = node.attrs ?? {};
  const name = String(a.name);
  // The text as written wins (shorthands, quoting, order); the parsed values are for tools that edit them.
  const attrs =
    typeof a.attributesRaw === "string"
      ? a.attributesRaw.trim()
        ? a.attributesRaw
        : ""
      : Object.entries((a.attributes ?? {}) as Record<string, string>)
          .map(([k, v]) => `${k}=${attributeValue(String(v))}`)
          .join(" ");
  const head = `${name}${attrs ? `{${attrs}}` : ""}`;
  if (a.form === "leaf") return `::${head}`;

  const body = directiveBody(node);
  // The fence is longer than any closing line inside, so nothing in the body can close this directive.
  const inner = Math.max(0, ...[...body.matchAll(/^ {0,3}(:{3,})[ \t]*$/gm)].map((m) => m[1]!.length));
  const fence = ":".repeat(Math.max(3, inner + 1));
  return body ? `${fence}${head}\n${body}\n${fence}` : `${fence}${head}\n${fence}`;
}

/** Bare when the grammar allows it (`x=1`), otherwise in double quotes with `\"` and `\\` escaped. */
const attributeValue = (v: string) => (/^[^\s"'=<>`{}]+$/.test(v) ? v : `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`);

function directiveBody(node: JSONContent): string {
  const a = node.attrs ?? {};
  if (node.content?.some((c) => !isEmptyParagraph(c))) return blocks(node.content, { tight: false });
  // The body as written wins over the parsed fields: it keeps field order and comments, and it is the only
  // thing there is for a body that could not be read. Whoever edits `fields` must clear `raw`.
  if (typeof a.raw === "string") return a.raw;
  if (a.fields && typeof a.fields === "object") return yamlMapping(a.fields as never).join("\n");
  return "";
}

// ---------------------------------------------------------------------------------------------------------------
// Inline content

type Mark = NonNullable<JSONContent["marks"]>[number];
interface Span {
  key: string;
  mark: Mark;
  children: (Span | JSONContent)[];
}

/** Outermost first. */
// Italic is outside bold because `***x***`, the usual way to write both, is read as italic around bold.
const ORDER = ["link", "italic", "bold", "code"];
const markKey = (m: Mark) => (m.type === "link" ? `link:${String(m.attrs?.href)}|${String(m.attrs?.title ?? "")}` : m.type);

function tree(nodes: JSONContent[]): (Span | JSONContent)[] {
  const root: Span = { key: "", mark: { type: "" }, children: [] };
  let stack: Span[] = [root];
  for (const node of nodes) {
    const marks = (node.marks ?? []).filter((m) => ORDER.includes(m.type)).sort((x, y) => ORDER.indexOf(x.type) - ORDER.indexOf(y.type));
    let depth = 1;
    while (depth < stack.length && depth - 1 < marks.length && stack[depth]!.key === markKey(marks[depth - 1]!)) depth++;
    stack = stack.slice(0, depth);
    for (const m of marks.slice(depth - 1)) {
      const span: Span = { key: markKey(m), mark: m, children: [] };
      stack.at(-1)!.children.push(span);
      stack.push(span);
    }
    stack.at(-1)!.children.push(node);
  }
  return root.children;
}

interface InlineOptions {
  /** Hard breaks cannot appear (headings, table cells). */
  noBreaks?: boolean;
}

function inline(nodes: JSONContent[], options: InlineOptions = {}): string {
  const state = { lineStart: true };
  // A break at the very end has nothing after it, so it cannot be read back; drop it.
  const trimmed = [...nodes];
  while (trimmed.at(-1)?.type === "hardBreak") trimmed.pop();
  return render(tree(trimmed), state, options);
}

function render(children: (Span | JSONContent)[], state: { lineStart: boolean }, options: InlineOptions): string {
  return children.map((child) => ("children" in child ? span(child as Span, state, options) : leaf(child as JSONContent, state, options))).join("");
}

function span(s: Span, state: { lineStart: boolean }, options: InlineOptions): string {
  const inner = { lineStart: false };
  const text = render(s.children, inner, options);
  state.lineStart = false;
  // Spaces just inside a delimiter would stop it from working (`** bold**`); move them outside.
  const [, lead = "", core = "", trail = ""] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  if (!core) return text;
  switch (s.mark.type) {
    case "bold":
      return `${lead}**${core}**${trail}`;
    case "italic":
      return `${lead}*${core}*${trail}`;
    case "link":
      return `${lead}[${core}](${destination(String(s.mark.attrs?.href ?? ""))}${title(s.mark.attrs?.title)})${trail}`;
    default:
      return text;
  }
}

function leaf(node: JSONContent, state: { lineStart: boolean }, options: InlineOptions): string {
  switch (node.type) {
    case "text": {
      const marks = (node.marks ?? []).map((m) => m.type);
      if (marks.includes("code")) {
        state.lineStart = false;
        return codeSpan(node.text ?? "");
      }
      const out = escapeText(node.text ?? "", state.lineStart);
      state.lineStart = (node.text ?? "").endsWith("\n");
      return out;
    }
    case "image": {
      state.lineStart = false;
      const a = node.attrs ?? {};
      return `![${escapeText(String(a.alt ?? ""), false)}](${destination(String(a.src ?? ""))}${title(a.title)})`;
    }
    case "hardBreak":
      if (options.noBreaks) return " ";
      state.lineStart = true;
      return "\\\n";
    default:
      return "";
  }
}

function codeSpan(text: string): string {
  const ticks = "`".repeat(longestRun(text, "`") + 1);
  const pad = text.startsWith("`") || text.endsWith("`") || (text.startsWith(" ") && text.endsWith(" ") && text.trim() !== "") ? " " : "";
  return `${ticks}${pad}${text}${pad}${ticks}`;
}

const destination = (url: string) => (url === "" || /[\s()<>]/.test(url) ? `<${url.replace(/[<>\\]/g, "\\$&")}>` : url);
const title = (t: unknown) => (typeof t === "string" && t !== "" ? ` "${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : "");

const alnum = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/** Backslash-escapes what would otherwise be read as Markdown or as a directive. */
function escapeText(text: string, lineStart: boolean): string {
  let out = "";
  let atStart = lineStart;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const rest = text.slice(i);
    let piece = c;
    if (c === "\\" || c === "`" || c === "*" || c === "[" || c === "]" || c === "<") piece = `\\${c}`;
    else if (c === "_") piece = alnum(text[i - 1]) && alnum(text[i + 1]) ? c : "\\_"; // snake_case is safe
    else if (c === "&" && /^&(#\d+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/.test(rest)) piece = "\\&";
    else if (atStart && c !== " " && c !== "\t") {
      if (c === "#" || c === ">" || (c === "+" && /^\+(\s|$)/.test(rest))) piece = `\\${c}`;
      else if (c === "-" && /^-+(\s|$)/.test(rest)) piece = "\\-";
      else if (c === "=" && /^=+\s*(\n|$)/.test(rest)) piece = "\\=";
      else if (c === "~" && rest.startsWith("~~~")) piece = "\\~";
      else if (c === ":" && rest.startsWith("::")) piece = "\\:";
      else if (/\d/.test(c)) {
        const m = /^(\d{1,9})([.)])(\s|$)/.exec(rest);
        if (m) {
          out += m[1] + "\\" + m[2];
          i += m[1]!.length; // the loop moves past the marker
          atStart = false;
          continue;
        }
      }
    }
    out += piece;
    if (c === "\n") atStart = true;
    else if (c !== " " && c !== "\t") atStart = false;
  }
  return out;
}
