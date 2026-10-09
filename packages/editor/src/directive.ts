import { Node, mergeAttributes, type Editor, type Extension } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { atomView, containerView, type ViewOptions } from "./components/views";
import { createRegistry, defaults, fieldsOf, type Definition, type Registry } from "./components/registry";
import type { RenderComponent } from "./components/render";

/** An attribute stored as JSON in the document and in copied HTML. */
const json = (name: string, fallback: unknown = null) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => {
    const value = el.getAttribute(`data-${name}`);
    return value === null ? fallback : (JSON.parse(value) as unknown);
  },
  renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${name}`]: JSON.stringify(attrs[name] ?? fallback) }),
});

const attributes = () => ({
  name: { default: "" },
  form: { default: "block" },
  kind: { default: "unknown" },
  breakable: json("breakable"),
  attributes: json("attributes", {}),
  attributesRaw: json("attributesRaw"),
  fields: json("fields"),
  raw: json("raw"),
  warnings: json("warnings", []),
});

export interface DirectiveOptions {
  registry: Registry;
  render?: RenderComponent;
}

const parse = (tag: string) => [
  { tag, getAttrs: (el: HTMLElement | string) => (typeof el === "string" ? false : { name: el.getAttribute("data-directive") ?? "", form: el.getAttribute("data-form") ?? "block", kind: el.getAttribute("data-kind") ?? "unknown" }) },
];

/**
 * Any component, as one document node. Two node types share the same attributes:
 *
 * - `directive`: a container component. It holds blocks, shown inside a frame with its attributes in a header.
 * - `directiveLeaf`: a component without editable content (data, leaf, or one nobody has a definition for). It is
 *   one unit: the parser's rendering normally, a form made from its definition while it is selected.
 *
 * What the node keeps: `name`, `attributes` and `fields` (parsed), and `raw` / `attributesRaw` (the author's text).
 * The serializer writes the text when present, so whoever edits `fields` must set `raw` to null, and whoever edits
 * `attributes` must set `attributesRaw` to null. The forms do.
 */
export const Directive = Node.create<DirectiveOptions>({
  name: "directive",
  group: "block",
  content: "block*",
  defining: true,
  isolating: true,

  addOptions() {
    return { registry: createRegistry() };
  },
  addAttributes: attributes,
  parseHTML: () => parse("div[data-directive]:not([data-leaf])"),
  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-directive": node.attrs.name, "data-form": node.attrs.form, "data-kind": node.attrs.kind, class: "rosetta-directive" }), 0];
  },
  addNodeView() {
    return containerView(this.options as ViewOptions);
  },

  addStorage() {
    return { registry: this.options.registry };
  },

  addCommands() {
    return {
      /** Inserts a new component by name, with its default values, and selects it (a form opens for data components). */
      insertComponent:
        (name: string) =>
        ({ state, tr, dispatch }) => {
          const def = this.options.registry.get(name);
          if (!def) return false;
          const attrs = newComponent(def);
          const type = state.schema.nodes[def.kind === "container" ? "directive" : "directiveLeaf"]!;
          const node = type.create(attrs, def.kind === "container" ? state.schema.nodes.paragraph!.create() : undefined);
          if (dispatch) {
            const { $to } = state.selection;
            const pos = $to.depth === 0 ? $to.pos : $to.after($to.depth); // after the block the cursor is in
            tr.insert(pos, node);
            // A form opens for a data or leaf component; the cursor goes into a container, ready to type.
            tr.setSelection(def.kind === "container" ? TextSelection.create(tr.doc, pos + 2) : NodeSelection.create(tr.doc, pos));
            dispatch(tr.scrollIntoView());
          }
          return true;
        },
    };
  },
});

export const DirectiveLeaf = Node.create<DirectiveOptions>({
  name: "directiveLeaf",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { registry: createRegistry() };
  },
  addAttributes: attributes,
  parseHTML: () => parse("div[data-directive][data-leaf]"),
  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-directive": node.attrs.name, "data-form": node.attrs.form, "data-kind": node.attrs.kind, "data-leaf": "", class: "rosetta-directive" })];
  },
  addNodeView() {
    return atomView(this.options as ViewOptions);
  },
});

/** The attributes of a component that was just inserted. */
export function newComponent(def: Definition): Record<string, unknown> {
  const attributes: Record<string, string> = {};
  for (const a of def.attributes ?? []) if (a.default !== undefined) attributes[a.name] = a.default;
  return {
    name: def.name,
    form: def.form,
    kind: def.kind,
    breakable: def.breakable ?? null,
    attributes,
    attributesRaw: null,
    fields: def.kind === "data" ? defaults(fieldsOf(def)) : null,
    raw: null,
    warnings: [],
  };
}

/** The definitions the editor was given. */
export const componentsOf = (editor: Editor): Definition[] => (editor.storage as { directive?: { registry: Registry } }).directive?.registry.all() ?? [];

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    directive: {
      insertComponent: (name: string) => ReturnType;
    };
  }
}

export type { Extension };
