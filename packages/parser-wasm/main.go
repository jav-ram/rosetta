//go:build js && wasm

// Command main is the Rosetta parser compiled to WebAssembly. It defines a global `rosetta`
// object with two functions, then keeps running so JavaScript can call them:
//
//	rosetta.parse(markdown: string): string            JSON { html, ast, warnings }
//	rosetta.setComponents(json: string): string        "" on success, else an error message
//
// Both return strings (JSON for parse) so they work the same under Go and TinyGo. The
// TypeScript client in src/ wraps them in a typed API.
package main

import (
	"encoding/json"
	"syscall/js"

	"github.com/jav-ram/rosetta/packages/parser-wasm/api"
)

func main() {
	p, err := api.New()
	if err != nil {
		panic(err)
	}
	js.Global().Set("rosetta", map[string]any{
		"parse": js.FuncOf(func(this js.Value, args []js.Value) any {
			if len(args) < 1 {
				return errorJSON("parse(markdown) needs a string")
			}
			out, err := p.Parse(args[0].String())
			if err != nil {
				return errorJSON(err.Error())
			}
			return out
		}),
		"setComponents": js.FuncOf(func(this js.Value, args []js.Value) any {
			if len(args) < 1 {
				return "setComponents(json) needs a string"
			}
			if err := p.SetComponents(args[0].String()); err != nil {
				return err.Error()
			}
			return ""
		}),
	})
	select {} // keep the module alive
}

func errorJSON(msg string) string {
	b, _ := json.Marshal(map[string]string{"error": msg})
	return string(b)
}
