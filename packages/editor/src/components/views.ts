import type { NodeViewRendererProps } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { toMarkdown } from "../save";
import { createForm, type Form, type FormValue } from "./form";
import type { Registry } from "./registry";
import type { RenderComponent } from "./render";

export interface ViewOptions {
  registry: Registry;
  /** Without it, components show their data as plain text. */
  render?: RenderComponent;
}

type NodeView = ReturnType<NonNullable<ReturnType<typeof Object>>> & Record<string, unknown>;

const attrsOf = (node: PMNode) => ({
  attributes: ((node.attrs.attributes ?? {}) as Record<string, string>) ?? {},
  fields: ((node.attrs.fields ?? {}) as Record<string, unknown>) ?? {},
});

function frame(node: PMNode, extra: string): HTMLDivElement {
  const dom = document.createElement("div");
  dom.className = `rosetta-component ${extra}`;
  dom.dataset.component = node.attrs.name;
  dom.dataset.kind = node.attrs.kind;
  return dom;
}

/** Writes new attributes into the node. The text the author wrote for them is dropped, so the new values are what gets saved. */
function patchAttributes(props: NodeViewRendererProps, node: PMNode, attributes: Record<string, string>) {
  const pos = props.getPos();
  if (pos === undefined) return;
  props.view.dispatch(props.view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, attributes, attributesRaw: null }));
}

// ---------------------------------------------------------------------------------------------------------------
// Container: a frame around editable content, with the attributes in its header.

export function containerView(options: ViewOptions) {
  return (props: NodeViewRendererProps) => {
    let node = props.node;
    const def = options.registry.get(node.attrs.name);
    const dom = frame(node, "rosetta-component-container");
    const header = document.createElement("div");
    header.className = "rosetta-component-header";
    header.contentEditable = "false";
    const title = document.createElement("span");
    title.className = "rosetta-component-name";
    title.textContent = node.attrs.name;
    header.append(title);
    const contentDOM = document.createElement("div");
    contentDOM.className = "rosetta-component-body";
    dom.append(header, contentDOM);

    // Attributes are edited in a small form in the header. It is built once and kept while typing.
    let form: Form | null = null;
    if (def?.attributes?.length) {
      form = createForm({ ...def, fields: undefined }, { ...attrsOf(node), fields: {} }, (value: FormValue) => patchAttributes(props, node, value.attributes));
      form.element.classList.add("rosetta-form-inline");
      header.append(form.element);
    }

    const view = {
      dom,
      contentDOM,
      update(updated: PMNode) {
        if (updated.type !== node.type || updated.attrs.name !== node.attrs.name) return false;
        node = updated;
        if (form && !form.shows({ ...attrsOf(node), fields: {} })) form.set({ ...attrsOf(node), fields: {} });
        return true;
      },
      stopEvent: (e: Event) => header.contains(e.target as Node),
      ignoreMutation: (m: { target: Node }) => !contentDOM.contains(m.target),
    };
    return view as unknown as NodeView;
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Data, leaf and unknown components: the parser's rendering normally, a form while selected.

export function atomView(options: ViewOptions) {
  return (props: NodeViewRendererProps) => {
    let node = props.node;
    const def = options.registry.get(node.attrs.name);
    const hasForm = !!def && (!!def.fields?.length || !!def.attributes?.length);

    const dom = frame(node, "rosetta-component-atom");
    dom.contentEditable = "false";
    const rendered = document.createElement("div");
    rendered.className = "rosetta-component-rendered";
    const formHost = document.createElement("div");
    formHost.className = "rosetta-component-form";
    formHost.hidden = true;
    dom.append(rendered, formHost);

    let form: Form | null = null;
    let selected = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let version = 0;

    const markdown = () => toMarkdown({ type: "doc", content: [node.toJSON()] }).replace(/\n$/, "");

    function draw() {
      if (selected && form) return;
      const mine = ++version;
      const source = markdown();
      if (!options.render) {
        rendered.textContent = source;
        return;
      }
      options.render(source).then(
        (html) => {
          // A newer render may have been asked for in the meantime.
          if (mine === version) rendered.innerHTML = html;
        },
        (e: Error) => {
          if (mine === version) rendered.textContent = `Could not render ${node.attrs.name}: ${e.message}`;
        },
      );
    }
    const drawSoon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(draw, 120);
    };

    function openForm() {
      if (!hasForm || !def) return;
      const value = attrsOf(node);
      form = createForm(def, value, (next) => {
        const pos = props.getPos();
        if (pos === undefined) return;
        const patch: Record<string, unknown> = {};
        // Editing the values drops the text the author wrote for them, so the new values are what gets saved.
        patch.fields = next.fields;
        patch.raw = null;
        patch.attributes = next.attributes;
        patch.attributesRaw = null;
        props.view.dispatch(props.view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch }));
      });
      formHost.replaceChildren(form.element);
      formHost.hidden = false;
      rendered.hidden = true;
    }

    draw();

    const view = {
      dom,
      update(updated: PMNode) {
        if (updated.type !== node.type || updated.attrs.name !== node.attrs.name) return false;
        node = updated;
        if (form) {
          if (!form.shows(attrsOf(node))) form.set(attrsOf(node)); // changed from outside, for example by undo
        } else drawSoon();
        return true;
      },
      selectNode() {
        selected = true;
        dom.classList.add("is-selected");
        openForm();
      },
      deselectNode() {
        selected = false;
        dom.classList.remove("is-selected");
        form = null;
        formHost.replaceChildren();
        formHost.hidden = true;
        rendered.hidden = false;
        draw();
      },
      // Everything that happens inside the form belongs to the form, not to the editor.
      stopEvent: (e: Event) => formHost.contains(e.target as Node),
      ignoreMutation: () => true,
      destroy() {
        if (timer) clearTimeout(timer);
        version++;
      },
    };
    return view as unknown as NodeView;
  };
}
