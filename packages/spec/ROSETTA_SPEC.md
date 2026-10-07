# Rosetta Markdown Specification

**Version 0.1 (draft)**

Rosetta Markdown is a superset of [CommonMark](https://spec.commonmark.org/) with GFM tables. Any CommonMark document is a valid Rosetta document. Rosetta adds **directives**: a small, uniform syntax for TTRPG components such as stat blocks, read-aloud text and sidebars.

The key words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119.

## 1. Design goals

1. **Readable anywhere.** A Rosetta file opened in a plain Markdown viewer stays legible.
2. **Never fail the document.** Bad input produces a visible warning for the affected part. The rest of the document is unaffected (see section 8).
3. **One syntax for every component.** Components, including those added by game-system plugins, use the same directive syntax. The parser needs no component-specific grammar.

## 2. Directives

A directive is a line-level construct that starts with colons followed by a component name.

| Form | Syntax | Has body? |
|---|---|---|
| Block directive | `:::name{attrs}` … `:::` | Yes |
| Leaf directive | `::name{attrs}` | No |

```md
:::readaloud
The torches gutter as the door groans open...
:::

::pagebreak
```

### 2.1 Names

A component name matches `[a-z][a-z0-9-]*` (lowercase letters, digits, hyphens). Names are case-sensitive. A line that starts with colons followed by anything else is not a directive and is ordinary Markdown text.

### 2.2 Block directives

- The **opening line** is three or more colons, the name, and optional attributes: `:::name{attrs}`. Nothing else may follow on the line except spaces.
- The **closing line** is a line containing only colons and optional spaces, with **at least as many colons** as the opening line.
- Everything between is the **body**. How the body is read depends on the component kind (section 4).
- The opening and closing lines MAY be indented by up to three spaces.
- Block directives MAY appear at the top level of the document and inside container components (section 4.2). They MUST start at the beginning of a block (after a blank line, a heading, or the start of the body). They cannot interrupt a paragraph.

**Nesting.** To nest block directives, the outer one uses more colons than the inner ones:

```md
::::sidebar{title="Variant: Ambush"}
Roll initiative twice.

:::readaloud
Steel rings out in the dark.
:::
::::
```

A closing line closes the nearest open block directive whose opening fence has the same or fewer colons. Because an inner fence is always shorter than its parent, an inner `:::` can never close the outer `::::`.

**Fenced code.** Directive lines inside a fenced code block (``` or ~~~) or an indented code block are literal text, not directives. This includes a closing line: a `:::` inside a fenced code block in a directive body does not close the directive.

**Which block a closing line closes.** A closing line with n colons closes the innermost open block directive whose fence has n or fewer colons. A longer closing line therefore closes an inner block first, and the outer block is then reported as unclosed.

### 2.3 Leaf directives

A leaf directive is exactly **two** colons, the name, and optional attributes, alone on its line: `::name{attrs}`. It has no body and no closing line. It MAY appear wherever a block directive may.

A leaf directive written with three or more colons (`:::pagebreak`) is parsed as a block directive. If the component is defined as a leaf, the parser emits `directive.wrong-form`, treats the directive as a leaf, and keeps the lines up to the closing line as uninterpreted raw text so no content is lost.

### 2.4 Reserved forms

Inline directives (`:name[text]{attrs}`) are **not part of v0.1**. A single colon followed by a name in running text is plain text. The form is reserved for a future version.

**Planned use: dice rolls.** The first inline directive is expected to be `:roll[1d6+4]`. Making a roll a real node, instead of plain text, lets tools compute values from it, such as the average, lowest and highest result. v0.1 defines no syntax or behaviour for it: until it exists, dice notation such as `1d6 + 4` is ordinary text.

## 3. Attributes

Attributes follow the name in curly braces, with no space between the name and `{`.

```md
:::statblock{system="5e" id=bone-warden}
::page{template="art-top" art="assets/tavern.jpg" height="40%"}
:::sidebar{title="Variant: \"Lingering\" Injuries"}
```

### 3.1 Grammar

```
attrs      = "{" S* ( attr ( S+ attr )* )? S* "}"
attr       = key "=" value | key | "#" id | "." class
key        = [A-Za-z_][A-Za-z0-9_-]*
value      = quoted | bare
quoted     = '"' ( char | escape )* '"'
bare       = [^\s"'=<>`{}]+
escape     = "\" ( '"' | "\" )
```

- **Quoted values** use double quotes. Inside them, `\"` is a quote and `\\` is a backslash. No other escapes exist; a backslash before any other character is a literal backslash. Quoted values MAY NOT contain newlines. Single quotes are not delimiters.
- **Bare values** need no quotes if they contain no whitespace or any of `" ' = < > ` { }`.
- **Flags.** A key with no value (`{wide}`) is a boolean flag. Its value is the string `"true"`.
- **Shorthands.** `#id` is `id="id"`, and `.class` is added to the `class` attribute (several `.class` shorthands join with spaces).
- All values are **strings**. Typing (number, boolean, enum) is applied by the component's definition, not by the syntax.
- **Duplicates.** If a key appears more than once, the last value wins and the parser emits `attr.duplicate`. `class` is the exception: repeated `class` values are joined.
- **Malformed attributes** (unterminated quote, stray `=`, unclosed brace) emit `attr.syntax`. The parser keeps every attribute parsed before the error and ignores the rest of the attribute list. The directive itself is still recognised.
- An empty attribute list `{}` is equivalent to none.

### 3.2 Attributes on every directive

`id` and `class` are accepted on any directive and are passed to the rendered element. All other attributes are defined by the component.

## 4. Components

A **component** is a named kind of directive with a definition: its form (block or leaf), its **kind** (data or container), its attributes, its fields, and its `breakable` flag. Definitions come from the built-in set (section 9) and from game-system plugins.

### 4.1 Data components

A **data component** has structured content. Its body is a **YAML-style mapping** of fields. Example: `statblock`.

```md
:::statblock{system="5e"}
name: Bone Warden
size: Medium undead
ac: 15
hp: 52 (8d8+16)
speed: 30 ft.
traits:
  - name: Undead Fortitude
    text: If damage reduces the warden to 0 hit points, it makes a Constitution saving throw...
actions: |
  **Slam.** Melee Weapon Attack: +5 to hit, reach 5 ft.

  *Hit:* 11 (2d6+4) bludgeoning damage.
:::
```

**Body format.** The body is read as a restricted subset of YAML 1.2:

- A top-level **mapping** of `key: value` pairs. Keys are `[A-Za-z_][A-Za-z0-9_-]*`.
- Values may be **scalars** (string, number, boolean, `null`), **sequences** (`- item` lines), nested **mappings**, and **block scalars** (`|` keeps line breaks, `>` folds them).
- Indentation uses spaces only. Tabs are an error.
- `#` starts a comment only at the start of a line or after a space.
- **Not supported**, each emitting `yaml.unsupported`: anchors and aliases (`&`, `*`), tags (`!!`), merge keys (`<<`), multiple documents (`---` inside the body), flow collections (`{}` and `[]`) nested deeper than one level.
- If the body is not valid YAML, the whole body is a `yaml.syntax` error: the component renders as a warning block (section 8.3).

**Field values and Markdown.** Unless a field's definition says `plain`, string values are read as **inline Markdown** (emphasis, links, code), and block scalars (`|`, `>`) as **block Markdown** (paragraphs, lists). This lets a field such as `actions` hold formatted text without any special syntax.

**Fields, types and validation.** The component definition declares each field's name, type (string, number, boolean, enum, list, object), whether it is required, and its default. The spec does not fix any fields: they belong to the component's definition (for `statblock`, the active system plugin). After parsing, the parser validates each field (section 8.2).

The `system` attribute on `statblock` selects which system plugin supplies the definition. When absent, the document's default system is used (section 9.1).

### 4.2 Container components

A **container component** has free-form content. Its body is **Markdown**, which MAY include any block element and other block directives. Example: `readaloud`.

```md
:::readaloud
The torches gutter as the door groans open.

- A cold draught rolls across the floor.
- Something *shifts* in the dark.
:::
```

Container components take their parameters only from attributes. The body is parsed as normal Rosetta Markdown, recursively.

### 4.3 Leaf components

A **leaf component** has no body, only attributes. Example: `pagebreak`. Leaf components are neither data nor container.

### 4.4 Summary

| | Data | Container | Leaf |
|---|---|---|---|
| Directive form | block | block | leaf |
| Body read as | restricted YAML mapping | Markdown | none |
| Parameters | attributes + fields | attributes | attributes |
| Can contain directives | no | yes | n/a |
| Example | `statblock` | `readaloud`, `sidebar` | `pagebreak` |

Directive lines inside a data component's body are not parsed as directives. The only line that is recognised there is the closing line (section 2.2).

## 5. Escaping

| To write literally | Write |
|---|---|
| A line starting with `::name` that is not a directive | `\::name` (a backslash before the first colon) |
| A closing-looking `:::` line inside a block body | Not possible for the same or shorter fence. Use a longer fence on the outer directive (section 2.2). |
| `"` inside a quoted attribute value | `\"` |
| `\` inside a quoted attribute value | `\\` |
| Any Markdown special character in a Markdown body | The CommonMark backslash escape (`\*`, `\#`, ...) |

A backslash before the first colon of a would-be directive line removes its directive meaning and is itself removed from the output. Code spans and fenced code blocks need no escaping.

## 6. Unknown components

If a directive's name is not defined by the built-in set or the loaded plugins:

1. The parser produces a **generic node** that keeps the name, the attributes and the raw body text.
2. It emits `component.unknown`.
3. Editors and renderers show a **visible warning block** in place of the component, containing the component name and its raw source. The body is not interpreted, because without a definition the parser cannot know whether it is YAML or Markdown.

The document is unaffected otherwise. Saving the document MUST preserve the unknown directive exactly, so opening a file in an editor that lacks a plugin never destroys content.

## 7. Document-level notes

- Files are UTF-8, with `\n` or `\r\n` line endings.
- A document MAY begin with a YAML front matter block delimited by `---` lines. Its fields are not defined in v0.1, but the parser MUST preserve it. The document's `rosetta` version, if present, declares the spec version (for example `rosetta: "0.1"`).
- Source positions (line and column) are recorded for every directive, so warnings can point at the source.

## 8. Errors and warnings

### 8.1 The rule

**A problem in one part of a document never prevents the rest from parsing or rendering.** The parser has no fatal error for malformed content. Every problem becomes a **warning** attached to the smallest affected part.

A warning has:

| Field | Meaning |
|---|---|
| `code` | Stable identifier, such as `component.unknown` |
| `severity` | `warning`, or `error` when the affected part cannot render |
| `message` | Human-readable explanation |
| `component` | Component name, if applicable |
| `field` | Field name or path, if applicable (`traits[0].name`) |
| `range` | Start and end line and column in the source |

Warnings are returned in a list alongside the AST and are also attached to the affected node, so renderers can draw them in place.

### 8.2 Invalid fields

When a field in a data component fails validation (wrong type, value not in an enum, missing required field, unknown field):

| Problem | Behaviour | Code |
|---|---|---|
| Wrong type | The field is dropped and the default is used, or the field is left empty if none | `field.type` |
| Not in enum | As above | `field.enum` |
| Missing required field | The component still renders; the field shows a visible placeholder | `field.missing` |
| Unknown field | Ignored in rendering, preserved in the AST and when saving | `field.unknown` |

The component renders with every valid field. Only the invalid fields are affected.

Invalid attributes follow the same rules (`attr.type`, `attr.enum`, `attr.missing`, `attr.unknown`).

### 8.3 Visible warnings

Renderers MUST make warnings visible in the editor and the preview, as a marked block or inline badge at the affected place, showing the message. A renderer MAY hide warnings in final export, but SHOULD offer an option to keep them.

When a whole component cannot render (`yaml.syntax`, `component.unknown`), the warning block replaces it and shows the raw source.

### 8.4 Structural problems

| Problem | Behaviour | Code |
|---|---|---|
| Unclosed block directive | The body runs to the end of the enclosing container (or the document) | `directive.unclosed` |
| Stray closing line (`:::` with no open block) | Treated as an ordinary paragraph | `directive.stray-close` |
| Leaf component written with a block fence (section 2.3), or block component written as a leaf (it gets an empty body) | The component is still recognised | `directive.wrong-form` |
| Unknown component | See section 6 | `component.unknown` |
| Attribute syntax error | See section 3.1 | `attr.syntax` |
| Duplicate attribute | Last wins | `attr.duplicate` |
| Unsupported YAML feature | The feature is ignored | `yaml.unsupported` |
| Invalid YAML | The component renders as a warning | `yaml.syntax` |
| Unbreakable element taller than a column | Rendering warning (see section 9.3) | `layout.too-tall` |

## 9. Built-in components, `breakable`, and the M1 set

### 9.1 The `breakable` flag

Every component definition MUST declare `breakable`, a boolean:

- `breakable: true`: when the component reaches the end of a column or page, it **splits**; the rest continues at the top of the next column or page.
- `breakable: false`: the component **never splits**. If it does not fit in the space left, the whole component moves to the next column or page.

Rules:

1. `breakable` is part of the component definition, so a component added by a plugin follows the same flow rules as a built-in.
2. A theme MAY override a component's default (for example, make `readaloud` unbreakable) when its design needs it.
3. Leaf components that are not content (`pagebreak`) have no `breakable` flag.
4. An unbreakable component taller than a whole column has nowhere to go. The renderer emits `layout.too-tall`, shows it in the editor and preview, and places the component where it starts. How to resolve this case (span columns, scale, or split with a "continued" marker) is an open question in the v1 plan; v0.1 only requires the warning.

Built-in Markdown elements have fixed defaults:

| Element | Breakable? | Notes |
|---|---|---|
| Paragraph | Yes | Theme sets `orphans` and `widows` |
| List | Yes | Individual items do not split |
| Table | Yes | Header row repeats on each continued part |
| Heading | No | Also stays with the content that follows it |
| Image | No | |

### 9.2 M1 components

| Component | Form | Kind | `breakable` default |
|---|---|---|---|
| `statblock` | block | data | `false` |
| `readaloud` | block | container | `true` |
| `sidebar` | block | container | `true` |
| `pagebreak` | leaf | leaf | n/a |

#### `statblock`

- Form: block, data component.
- Attributes: `system` (string, optional): id of the system plugin that defines the fields. If absent, the document's default system is used. If no system is available, `field.unknown` is emitted for all fields and they render as a plain key/value list.
- Body: restricted YAML mapping (section 4.1). Fields come from the system plugin's definition.
- Example:

```md
:::statblock{system="5e"}
name: Bone Warden
size: Medium undead
ac: 15
hp: 52 (8d8+16)
:::
```

#### `readaloud`

- Form: block, container component.
- Attributes: none beyond `id` and `class`.
- Body: Markdown.
- Renders as boxed narration text.

#### `sidebar`

- Form: block, container component.
- Attributes: `title` (string, optional): shown as the callout heading. It is read like a Markdown heading: one to six leading `#` followed by a space set the heading level (`title="## Variant"` is level 2). With no leading `#`, or with seven or more, the title is plain text at the default level 3. A title with no text shows no heading.
- Body: Markdown.
- Example:

```md
:::sidebar{title="Variant: Lingering Injuries"}
Instead of resting to full, roll on the table below...
:::
```

#### `pagebreak`

- Form: leaf.
- Attributes: none beyond `id` and `class`.
- Starts a new page. It is the only manual flow control: there is no column break.
- Example: `::pagebreak`

### 9.3 Reserved names

The names `layout`, `page`, `figure`, `toc`, `spell`, `item` and `roll` are reserved for later milestones. Until a definition for them is loaded, they are treated as unknown components (section 6).

## 10. Conformance

An implementation conforms to v0.1 if, for every example in this document, it produces the node tree, attributes, body and warnings described. The golden test suite in `contracts` is the executable form of this spec. This file wins if the two disagree, and the disagreement is a bug to fix in one of them.

## Appendix A. Complete example

```md
---
rosetta: "0.1"
---

# The Crypt of Ash

:::readaloud
The torches gutter as the door groans open.
:::

::::sidebar{title="Variant: Lingering Injuries"}
Instead of resting to full, roll on the table below.

| d6 | Injury |
|----|--------|
| 1  | Limp   |
| 2  | Scar   |
::::

:::statblock{system="5e"}
name: Bone Warden
size: Medium undead
ac: 15
hp: 52 (8d8+16)
:::

::pagebreak

:::mystery{x=1}
Not a known component.
:::
```

The last block produces a `component.unknown` warning and renders as a visible warning; the rest of the document is unaffected.
