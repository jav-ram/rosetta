// Package directive is a Goldmark extension that parses Rosetta directives (spec section 2):
// block directives (:::name{attrs} ... :::) and leaf directives (::name{attrs}).
package directive

import (
	"github.com/jav-ram/rosetta/packages/contracts"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

// Option configures the extension.
type Option func(*extension)

// WithComponents adds component definitions, such as contracts.M1Components() or those of a
// system plugin. Definitions are data: nothing is built in, and a directive whose name is not
// defined is unknown.
func WithComponents(defs ...contracts.ComponentDefinition) Option {
	return func(e *extension) {
		for _, d := range defs {
			e.components[d.Name] = d
		}
	}
}

type extension struct {
	components map[string]contracts.ComponentDefinition
}

// New returns the directive extension for goldmark.New(goldmark.WithExtensions(...)).
func New(opts ...Option) goldmark.Extender {
	e := &extension{components: map[string]contracts.ComponentDefinition{}}
	for _, o := range opts {
		o(e)
	}
	return e
}

func (e *extension) Extend(m goldmark.Markdown) {
	m.Parser().AddOptions(parser.WithBlockParsers(util.Prioritized(&blockParser{components: e.components}, 800)))
}

// Parse parses source with the extension and returns the document and its warnings.
func Parse(source []byte, opts ...Option) (ast.Node, []contracts.Warning) {
	md := goldmark.New(goldmark.WithExtensions(New(opts...)))
	pc := parser.NewContext()
	doc := md.Parser().Parse(text.NewReader(source), parser.WithContext(pc))
	return doc, Warnings(pc)
}
