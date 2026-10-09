// Package render turns Rosetta documents into HTML. Components are rendered from their
// definitions (contracts.ComponentDefinition), passed in as data: nothing about a particular
// component is hardcoded here.
package render

import (
	"bytes"

	"github.com/jav-ram/rosetta/packages/contracts"
	"github.com/jav-ram/rosetta/packages/parser/directive"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

type config struct {
	defs         map[string]contracts.ComponentDefinition
	hideWarnings bool
}

// Option configures Convert and Extension.
type Option func(*config)

// WithComponents sets the component definitions to render, such as contracts.M1Components()
// or those of a system plugin.
func WithComponents(defs ...contracts.ComponentDefinition) Option {
	return func(c *config) {
		for _, d := range defs {
			c.defs[d.Name] = d
		}
	}
}

// WithoutWarningsInHTML leaves warnings out of the HTML (they are still returned by Convert).
// Spec 8.3: renderers may hide warnings in final export.
func WithoutWarningsInHTML() Option { return func(c *config) { c.hideWarnings = true } }

func newConfig(opts []Option) *config {
	c := &config{defs: map[string]contracts.ComponentDefinition{}}
	for _, o := range opts {
		o(c)
	}
	return c
}

func (c *config) definitions() []contracts.ComponentDefinition {
	out := make([]contracts.ComponentDefinition, 0, len(c.defs))
	for _, d := range c.defs {
		out = append(out, d)
	}
	return out
}

// Result is the output of Convert.
type Result struct {
	HTML     string
	Warnings []contracts.Warning
	// FrontMatter is the parsed YAML front matter (spec section 7), nil if there is none.
	// FrontMatterRaw is its text, so tools can preserve it exactly. It is never rendered.
	FrontMatter    map[string]any
	FrontMatterRaw string
	// Document is the AST in the shape of the contracts Document schema, for the editor.
	Document contracts.Document
}

// Convert parses Rosetta Markdown and renders it to HTML. Front matter is split off first, so
// Extension on its own (without Convert) does not recognise it.
func Convert(source []byte, opts ...Option) (Result, error) {
	source, fm := splitFrontMatter(source)
	md := goldmark.New(goldmark.WithExtensions(extension.Table, Extension(opts...)))
	pc := parser.NewContext()
	root := md.Parser().Parse(text.NewReader(source), parser.WithContext(pc))
	var buf bytes.Buffer
	if err := md.Renderer().Render(&buf, source, root); err != nil {
		return Result{}, err
	}
	res := Result{HTML: buf.String(), Warnings: directive.Warnings(pc), FrontMatter: fm.values, FrontMatterRaw: fm.raw}
	if fm.warning != nil {
		res.Warnings = append([]contracts.Warning{*fm.warning}, res.Warnings...)
	}
	res.Document = buildDocument(source, root, res.Warnings, fm)
	return res, nil
}

// Extension returns the goldmark extension: directive parsing, field validation and HTML rendering.
func Extension(opts ...Option) goldmark.Extender {
	c := newConfig(opts)
	return &ext{cfg: c}
}

type ext struct{ cfg *config }

func (e *ext) Extend(m goldmark.Markdown) {
	directive.New(directive.WithComponents(e.cfg.definitions()...)).Extend(m)
	m.Parser().AddOptions(parser.WithASTTransformers(util.Prioritized(&transformer{cfg: e.cfg}, 100)))
	m.Renderer().AddOptions(renderer.WithNodeRenderers(util.Prioritized(newHTMLRenderer(e.cfg), 100)))
}

var (
	attrData  = []byte("rosetta.data")
	attrAttrs = []byte("rosetta.attrs")
)

// dataResult is what the transformer found for a data component.
type dataResult struct {
	Fields []Field
	Fatal  *bodyProblem
}

// transformer validates attributes and data-component fields after parsing, and records the
// results on the nodes for the renderer.
type transformer struct{ cfg *config }

func (t *transformer) Transform(doc *ast.Document, reader text.Reader, pc parser.Context) {
	_ = ast.Walk(doc, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		d, ok := n.(*directive.Directive)
		if !ok || !entering {
			return ast.WalkContinue, nil
		}
		def, known := t.cfg.defs[d.Name]
		if !known {
			return ast.WalkContinue, nil
		}
		var problems []problem
		valid, ps := validateAttrs(d.Attrs.Values, d.Attrs.Order, def.Attributes)
		problems = append(problems, ps...)
		d.SetAttribute(attrAttrs, valid)

		if d.ComponentKind == contracts.NodeKindData && d.Form == contracts.NodeFormBlock {
			raw := d.Raw(reader.Source())
			fields, bp, fatal := parseBody(raw)
			res := &dataResult{Fatal: fatal}
			bodyStart := d.Range.Start.Line + 1
			for _, p := range bp {
				problems = append(problems, problem{p.code, p.message, "", bodyStart + p.line - 1})
			}
			if fatal != nil {
				problems = append(problems, problem{fatal.code, fatal.message, "", bodyStart + fatal.line - 1})
			} else {
				var vp []problem
				res.Fields, vp = validateFields(fields, def.Fields, "", 0)
				for _, p := range vp {
					if p.line > 0 {
						p.line += bodyStart - 1
					}
					problems = append(problems, p)
				}
			}
			d.SetAttribute(attrData, res)
		}

		var ws []contracts.Warning
		for _, p := range problems {
			rng := d.Range
			if p.line > 0 {
				rng = contracts.Position{
					Start: contracts.Point{Line: p.line, Column: 1},
					End:   contracts.Point{Line: p.line, Column: 1},
				}
			}
			w := contracts.Warning{Code: p.code, Severity: contracts.WarningSeverityWarning, Message: p.message, Component: &d.Name, Range: &rng}
			if p.code == "yaml.syntax" {
				w.Severity = contracts.WarningSeverityError
			}
			if p.field != "" {
				f := p.field
				w.Field = &f
			}
			ws = append(ws, w)
		}
		d.Warnings = append(d.Warnings, ws...)
		directive.AddWarnings(pc, ws...)
		return ast.WalkContinue, nil
	})
}
