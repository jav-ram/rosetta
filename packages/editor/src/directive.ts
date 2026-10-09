import { Node, mergeAttributes } from "@tiptap/core";

/** An attribute stored as JSON in the document and in copied HTML. */
const json = (name: string, fallback: unknown = null) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => {
    const value = el.getAttribute(`data-${name}`);
    return value === null ? fallback : (JSON.parse(value) as unknown);
  },
  renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${name}`]: JSON.stringify(attrs[name] ?? fallback) }),
});

/**
 * Any component (`:::name{...}` or `::name`), whether or not its definition is known. This is the generic
 * handling: the node keeps everything the parser reported as attributes and shows it as plain text.
 * The component node views (T1.5) replace the display.
 *
 * - containers and unknown components with a body hold their blocks as content;
 * - data components keep their parsed `fields`; unknown ones keep `raw`.
 */
export const Directive = Node.create({
  name: "directive",
  group: "block",
  content: "block*",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      name: { default: "" },
      form: { default: "block" },
      kind: { default: "unknown" },
      breakable: json("breakable"),
      attributes: json("attributes", {}),
      fields: json("fields"),
      raw: json("raw"),
      warnings: json("warnings", []),
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-directive]",
        getAttrs: (el) => ({ name: el.getAttribute("data-directive") ?? "", form: el.getAttribute("data-form") ?? "block", kind: el.getAttribute("data-kind") ?? "unknown" }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-directive": node.attrs.name, "data-form": node.attrs.form, "data-kind": node.attrs.kind, class: "rosetta-directive" }), 0];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className = "rosetta-directive";
      dom.dataset.directive = node.attrs.name;
      dom.dataset.kind = node.attrs.kind;

      const attributes = Object.entries((node.attrs.attributes ?? {}) as Record<string, string>)
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      const warnings = (node.attrs.warnings ?? []) as { message: string }[];
      const header = document.createElement("div");
      header.className = "rosetta-directive-header";
      header.contentEditable = "false";
      header.textContent = `${node.attrs.form === "leaf" ? "::" : ":::"}${node.attrs.name}${attributes ? ` ${attributes}` : ""}`;
      if (warnings.length) header.title = warnings.map((w) => w.message).join("\n");
      dom.append(header);

      const data = node.attrs.fields ?? node.attrs.raw;
      if (data !== null && data !== undefined && data !== "") {
        const pre = document.createElement("pre");
        pre.className = "rosetta-directive-data";
        pre.contentEditable = "false";
        pre.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        dom.append(pre);
      }

      if (node.content.size === 0 && node.attrs.kind !== "container") return { dom };
      const contentDOM = document.createElement("div");
      contentDOM.className = "rosetta-directive-body";
      dom.append(contentDOM);
      return { dom, contentDOM };
    };
  },
});
