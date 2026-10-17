package render

import (
	"bytes"
	"regexp"
	"strconv"
	"strings"

	"github.com/jav-ram/rosetta/packages/contracts"
	"github.com/jav-ram/rosetta/packages/parser/directive"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/renderer"
	"github.com/yuin/goldmark/util"
)

type htmlRenderer struct {
	cfg *config
	md  goldmark.Markdown // plain Markdown, for field values
	// sectionOpen is true while the element of a component with scope "following" is open: the content after it is inside.
	sectionOpen bool
}

func newHTMLRenderer(cfg *config) *htmlRenderer {
	return &htmlRenderer{cfg: cfg, md: goldmark.New(goldmark.WithExtensions(extension.Table))}
}

func (r *htmlRenderer) RegisterFuncs(reg renderer.NodeRendererFuncRegisterer) {
	reg.Register(directive.KindDirective, r.renderDirective)
	reg.Register(ast.KindDocument, r.renderDocument)
}

// renderDocument closes the section of the last component with scope "following": it lasts to the end of the document.
func (r *htmlRenderer) renderDocument(w util.BufWriter, _ []byte, _ ast.Node, entering bool) (ast.WalkStatus, error) {
	if entering {
		r.sectionOpen = false
	} else {
		r.closeSection(w)
	}
	return ast.WalkContinue, nil
}

func (r *htmlRenderer) closeSection(w util.BufWriter) {
	if r.sectionOpen {
		_, _ = w.WriteString("</div>\n")
		r.sectionOpen = false
	}
}

// defaultTitleLevel is the heading level of a title that has no leading "#".
const defaultTitleLevel = 3

// parseTitle reads a title attribute like a Markdown heading: one to six leading "#" followed
// by a space set the level ("###" is h3). Anything else is plain text at the default level.
// ok is false when there is no text to show.
func parseTitle(s string) (level int, text string, ok bool) {
	s = strings.TrimSpace(s)
	level, text = defaultTitleLevel, s
	n := 0
	for n < len(s) && s[n] == '#' {
		n++
	}
	if n >= 1 && n <= 6 && (n == len(s) || s[n] == ' ' || s[n] == '\t') {
		level, text = n, strings.TrimSpace(s[n:])
	}
	return level, text, text != ""
}

func esc(s string) string { return string(util.EscapeHTML([]byte(s))) }

// wrapperOpen writes the opening tag shared by every component: class, data-component, and
// data-breakable (spec 9.1; absent for components with no flag, such as leaf components).
func (r *htmlRenderer) wrapperOpen(w util.BufWriter, d *directive.Directive, attrs map[string]string) {
	classes := "rosetta-" + d.Name
	if c := attrs["class"]; c != "" {
		classes += " " + c
	}
	_, _ = w.WriteString(`<div class="` + esc(classes) + `" data-component="` + esc(d.Name) + `" data-kind="` + string(d.ComponentKind) + `"`)
	if d.Breakable != nil {
		if *d.Breakable {
			_, _ = w.WriteString(` data-breakable="true"`)
		} else {
			_, _ = w.WriteString(` data-breakable="false"`)
		}
	}
	if id := attrs["id"]; id != "" {
		_, _ = w.WriteString(` id="` + esc(id) + `"`)
	}
	// A leaf component has no content to show, so what it says is in data attributes, for the theme (a layout's template).
	if d.ComponentKind == contracts.NodeKindLeaf {
		def := r.cfg.defs[d.Name]
		if def.Scope != nil {
			_, _ = w.WriteString(` data-scope="` + esc(string(*def.Scope)) + `"`)
		}
		for _, a := range def.Attributes {
			if v, ok := attrs[a.Name]; ok && dataName.MatchString(a.Name) {
				_, _ = w.WriteString(` data-` + strings.ToLower(a.Name) + `="` + esc(v) + `"`)
			}
		}
	}
	_, _ = w.WriteString(">\n")
}

// dataName is what an attribute name must look like to become a data-* attribute.
var dataName = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9-]*$`)

func (r *htmlRenderer) warnings(w util.BufWriter, ws []contracts.Warning) {
	if r.cfg.hideWarnings || len(ws) == 0 {
		return
	}
	_, _ = w.WriteString(`<ul class="rosetta-warnings">` + "\n")
	for _, x := range ws {
		_, _ = w.WriteString(`<li class="rosetta-warning" data-code="` + esc(x.Code) + `" data-severity="` + string(x.Severity) + `">` + esc(x.Message) + "</li>\n")
	}
	_, _ = w.WriteString("</ul>\n")
}

// warningBlock replaces a component that cannot render, showing its raw source (spec 8.3).
func (r *htmlRenderer) warningBlock(w util.BufWriter, source []byte, d *directive.Directive, title string) {
	_, _ = w.WriteString(`<div class="rosetta-warning-block" data-component="` + esc(d.Name) + `" role="note">` + "\n")
	_, _ = w.WriteString("<p><strong>" + esc(title) + "</strong></p>\n")
	r.warnings(w, d.Warnings)
	if d.Range.Start.Offset != nil && d.Range.End.Offset != nil {
		_, _ = w.WriteString("<pre><code>" + esc(string(source[*d.Range.Start.Offset:*d.Range.End.Offset])) + "</code></pre>\n")
	}
	_, _ = w.WriteString("</div>\n")
}

func (r *htmlRenderer) renderDirective(w util.BufWriter, source []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	d := n.(*directive.Directive)
	if d.ComponentKind == contracts.NodeKindUnknown {
		if entering {
			r.warningBlock(w, source, d, "Unknown component “"+d.Name+"”")
		}
		return ast.WalkSkipChildren, nil
	}
	valid, _ := d.Attribute(attrAttrs)
	validAttrs, _ := valid.(map[string]string)
	if validAttrs == nil {
		validAttrs = d.Attrs.Values
	}

	switch d.ComponentKind {
	case contracts.NodeKindContainer:
		if entering {
			r.wrapperOpen(w, d, validAttrs)
			if level, t, ok := parseTitle(validAttrs["title"]); ok {
				tag := "h" + strconv.Itoa(level)
				_, _ = w.WriteString("<" + tag + ` class="rosetta-title">` + esc(t) + "</" + tag + ">\n")
			}
			return ast.WalkContinue, nil
		}
		r.warnings(w, d.Warnings)
		_, _ = w.WriteString("</div>\n")
		return ast.WalkContinue, nil
	case contracts.NodeKindData:
		if !entering {
			return ast.WalkContinue, nil
		}
		res, _ := d.Attribute(attrData)
		data, _ := res.(*dataResult)
		if data == nil || data.Fatal != nil {
			r.warningBlock(w, source, d, "The body of “"+d.Name+"” could not be read")
			return ast.WalkSkipChildren, nil
		}
		r.wrapperOpen(w, d, validAttrs)
		r.fields(w, data.Fields)
		r.warnings(w, d.Warnings)
		_, _ = w.WriteString("</div>\n")
		return ast.WalkSkipChildren, nil
	default: // leaf
		if !entering {
			return ast.WalkContinue, nil
		}
		if d.Name == figureName {
			r.figure(w, source, d, validAttrs)
			return ast.WalkSkipChildren, nil
		}
		// A component with scope "following" (at the top level) holds the content after it: its element stays open
		// until the next such component or the end of the document.
		def := r.cfg.defs[d.Name]
		scoped := def.Scope != nil && n.Parent() != nil && n.Parent().Kind() == ast.KindDocument
		if scoped {
			r.closeSection(w)
		}
		r.wrapperOpen(w, d, validAttrs)
		r.warnings(w, d.Warnings)
		if scoped {
			r.sectionOpen = true
		} else {
			_, _ = w.WriteString("</div>\n")
		}
		return ast.WalkSkipChildren, nil
	}
}

// figureName is the one leaf component that shows something itself: an image with an optional caption.
const figureName = "figure"

// figure writes `::figure{src="…" alt="…" caption="…" span="all"}` as a <figure>. An image never splits, so it is always
// data-breakable="false" (a leaf definition does not carry the flag). data-span says whether it is as wide as its column or
// spans all of them; the theme does the rest. The source of the image is written as it is: the app finds the file.
func (r *htmlRenderer) figure(w util.BufWriter, source []byte, d *directive.Directive, attrs map[string]string) {
	src := strings.TrimSpace(attrs["src"])
	if src == "" {
		r.warningBlock(w, source, d, "A figure needs an image: write src=\"…\"")
		return
	}
	span := "column"
	if attrs["span"] == "all" {
		span = "all"
	}
	classes := "rosetta-figure"
	if c := attrs["class"]; c != "" {
		classes += " " + c
	}
	_, _ = w.WriteString(`<figure class="` + esc(classes) + `" data-component="figure" data-kind="leaf" data-breakable="false" data-span="` + span + `"`)
	if id := attrs["id"]; id != "" {
		_, _ = w.WriteString(` id="` + esc(id) + `"`)
	}
	_, _ = w.WriteString(">\n")
	_, _ = w.WriteString(`<img src="` + esc(src) + `" alt="` + esc(attrs["alt"]) + `">` + "\n")
	if caption := strings.TrimSpace(attrs["caption"]); caption != "" {
		_, _ = w.WriteString("<figcaption>" + esc(caption) + "</figcaption>\n")
	}
	r.warnings(w, d.Warnings)
	_, _ = w.WriteString("</figure>\n")
}

func (r *htmlRenderer) fields(w util.BufWriter, fields []Field) {
	_, _ = w.WriteString(`<dl class="rosetta-fields">` + "\n")
	for _, f := range fields {
		_, _ = w.WriteString(`<div class="rosetta-field" data-field="` + esc(f.Name) + `"><dt>` + esc(f.Name) + "</dt><dd")
		if f.Missing {
			_, _ = w.WriteString(` class="rosetta-missing">Missing required field</dd></div>` + "\n")
			continue
		}
		_, _ = w.WriteString(">")
		r.value(w, f.Value)
		_, _ = w.WriteString("</dd></div>\n")
	}
	_, _ = w.WriteString("</dl>\n")
}

func (r *htmlRenderer) value(w util.BufWriter, v Value) {
	switch v.Kind {
	case List:
		_, _ = w.WriteString(`<ul class="rosetta-list">`)
		for _, item := range v.Items {
			_, _ = w.WriteString("<li>")
			r.value(w, item)
			_, _ = w.WriteString("</li>")
		}
		_, _ = w.WriteString("</ul>")
	case Map:
		fields := make([]Field, len(v.Fields))
		copy(fields, v.Fields)
		var buf bytes.Buffer
		bw := &bufWriter{&buf}
		r.fields(bw, fields)
		_, _ = w.WriteString(strings.TrimSpace(buf.String()))
	default:
		_, _ = w.WriteString(r.scalar(v))
	}
}

// scalar renders a string as Markdown: block Markdown for block scalars (| and >), inline
// otherwise (spec 4.1). Plain fields (and non-strings) are escaped text.
func (r *htmlRenderer) scalar(v Value) string {
	if v.Type != "str" || v.Plain {
		return esc(v.Text)
	}
	var buf bytes.Buffer
	if err := r.md.Convert([]byte(v.Text), &buf); err != nil {
		return esc(v.Text)
	}
	out := strings.TrimRight(buf.String(), "\n")
	if !v.Block && strings.HasPrefix(out, "<p>") && strings.HasSuffix(out, "</p>") && strings.Count(out, "<p>") == 1 {
		out = strings.TrimSuffix(strings.TrimPrefix(out, "<p>"), "</p>")
	}
	return out
}

// bufWriter adapts bytes.Buffer to util.BufWriter.
type bufWriter struct{ *bytes.Buffer }

func (b *bufWriter) Available() int                { return 1 << 20 }
func (b *bufWriter) Buffered() int                 { return b.Len() }
func (b *bufWriter) Flush() error                  { return nil }
func (b *bufWriter) WriteRune(r rune) (int, error) { return b.Buffer.WriteRune(r) }
