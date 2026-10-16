import type { NodeViewRendererProps } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { toMarkdown } from "../save";
import { createForm, normalizeFields, type Form, type FormValue } from "./form";
import { createInline, skeleton, type Fields } from "./inline";
import { deepEqual, type Definition, type Registry } from "./registry";
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

/**
 * The frame of a component: `data-component` and `data-kind`, as in the parser's HTML.
 */
function frame(node: PMNode, extra: string): HTMLDivElement {
  const dom = document.createElement("div");
  dom.className = `rosetta-component ${extra}`;
  dom.dataset.component = node.attrs.name;
  dom.dataset.kind = node.attrs.kind;
  return dom;
}

/** A container's frame is the component's element, so it takes the theme's classes and flags as the parser's HTML has them. */
function themed(dom: HTMLElement, node: PMNode, def?: Definition) {
  const custom = ((node.attrs.attributes ?? {}) as Record<string, string>).class;
  dom.classList.add(`rosetta-${node.attrs.name}`, ...(custom ? custom.split(/\s+/).filter(Boolean) : []));
  const breakable = node.attrs.breakable ?? def?.breakable;
  if (breakable !== undefined && breakable !== null) dom.dataset.breakable = String(breakable);
}

/** A title attribute is read like a Markdown heading: one to six leading "#" set the level, otherwise it is an h3. */
export function parseTitle(value: string | undefined): { level: number; text: string } | null {
  const s = (value ?? "").trim();
  const hashes = /^#{1,6}(?=\s|$)/.exec(s)?.[0].length ?? 0;
  const text = hashes ? s.slice(hashes).trim() : s;
  return text ? { level: hashes || 3, text } : null;
}

/** Shows (or removes) the title heading of a container, as the preview's HTML has it. */
function drawTitle(dom: HTMLElement, before: Node, node: PMNode) {
  const current = dom.querySelector(":scope > .rosetta-title");
  const title = parseTitle(((node.attrs.attributes ?? {}) as Record<string, string>).title);
  if (!title) return void current?.remove();
  const tag = `h${title.level}`;
  if (current && current.tagName.toLowerCase() === tag) {
    current.textContent = title.text;
    return;
  }
  const heading = document.createElement(tag);
  heading.className = "rosetta-title";
  heading.contentEditable = "false";
  heading.textContent = title.text;
  if (current) current.replaceWith(heading);
  else dom.insertBefore(heading, before);
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
    themed(dom, node, def);
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
    drawTitle(dom, contentDOM, node);

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
        drawTitle(dom, contentDOM, node);
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

    const dom = frame(node, "rosetta-component-atom"); // the parser's HTML inside is the component's element
    dom.contentEditable = "false";
    const rendered = document.createElement("div");
    rendered.className = "rosetta-component-rendered";
    const formHost = document.createElement("div");
    formHost.className = "rosetta-component-form";
    formHost.hidden = true;
    dom.append(rendered, formHost);

    let form: Form | null = null;
    // A data component is edited where it is shown (`inline.ts`) when there is a renderer to show it with; otherwise in a form.
    let inline: { model: Fields; header: HTMLElement | null; headerForm: Form | null } | null = null;
    let opened = 0; // counts openings, so a render that comes back after the component was closed or opened again is dropped
    let selected = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let version = 0;

    // The final newline stays: the parser reads a closing `:::` with no newline after it as text.
    const markdown = () => toMarkdown({ type: "doc", content: [node.toJSON()] });

    function draw() {
      if (selected && (form || inline)) return;
      const mine = ++version;
      const source = markdown();
      if (!options.render) {
        rendered.textContent = source.trimEnd();
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

    const editsInline = () => !!options.render && !!def && node.attrs.kind === "data" && !!def.fields?.length;

    const skeletonMarkdown = (model: Fields) =>
      toMarkdown({ type: "doc", content: [{ ...node.toJSON(), attrs: { ...node.attrs, fields: skeleton(def!, model), raw: null } }] });

    function commit(fields: Fields) {
      const pos = props.getPos();
      if (pos === undefined) return;
      // Editing the values drops the text the author wrote for them, so the new values are what gets saved.
      props.view.dispatch(props.view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, fields: normalizeFields(fields, def!), raw: null }));
    }

    /** Shows the component as the parser renders it, with a control in place of each value. Falls back to the form if that cannot be done. */
    async function showInline(model: Fields, focusPath?: string) {
      const mine = ++opened;
      let html: string;
      try {
        html = await options.render!(skeletonMarkdown(model));
      } catch {
        if (mine === opened && selected) openForm(true);
        return;
      }
      if (mine !== opened || !selected) return;
      const made = createInline({
        def: def!,
        html,
        fields: model,
        focusPath,
        onEdit: commit,
        onStructure: (fields, focus) => void showInline(fields, focus),
      });
      if (!made) return void openForm(true);
      if (!inline) {
        const header = def!.attributes?.length ? document.createElement("div") : null;
        let headerForm: Form | null = null;
        if (header) {
          header.className = "rosetta-component-header rosetta-inline-header";
          const name = document.createElement("span");
          name.className = "rosetta-component-name";
          name.textContent = node.attrs.name;
          headerForm = createForm({ ...def!, fields: undefined }, { ...attrsOf(node), fields: {} }, (value: FormValue) => patchAttributes(props, node, value.attributes));
          headerForm.element.classList.add("rosetta-form-inline");
          header.append(name, headerForm.element);
        }
        inline = { model, header, headerForm };
      }
      inline.model = model;
      formHost.replaceChildren(...(inline.header ? [inline.header] : []), made.element);
      formHost.hidden = false;
      rendered.hidden = true;
    }

    function openForm(plain = false) {
      if (!hasForm || !def) return;
      if (!plain && editsInline()) {
        void showInline(structuredClone(attrsOf(node).fields) as Fields);
        return;
      }
      inline = null;
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
        if (inline) {
          const { fields } = attrsOf(node);
          if (inline.headerForm && !inline.headerForm.shows({ ...attrsOf(node), fields: {} })) inline.headerForm.set({ ...attrsOf(node), fields: {} });
          // changed from outside, for example by undo: show the new values
          if (!deepEqual(normalizeFields(inline.model, def!), normalizeFields(fields as Fields, def!))) void showInline(structuredClone(fields) as Fields);
        } else if (form) {
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
        inline = null;
        opened++;
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
        opened++;
      },
    };
    return view as unknown as NodeView;
  };
}
