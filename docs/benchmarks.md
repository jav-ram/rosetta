# Benchmarks

Measurements for decisions in the plan. Each section says what was measured, how, and on what.

## WebAssembly parser size (T0.6)

`packages/parser-wasm/dist/rosetta.wasm`, built with `pnpm --filter @rosetta/parser-wasm build:wasm`. The size of the last build is also written to `dist/build-info.json`.

| Compiler | Raw | Gzipped | Golden suite through the build |
|---|---|---|---|
| Go 1.26.5 (`GOOS=js GOARCH=wasm`, `-trimpath -ldflags="-s -w"`) | 7.38 MB | 1.96 MB | 86 of 86 tests pass |
| TinyGo 0.42.0 (`-target wasm -opt=z -stack-size=1mb -no-debug`) | 1.94 MB | 0.67 MB | 81 of 86 tests pass (see below) |

TinyGo is about 3.8x smaller (2.9x gzipped).

**Decision for now: standard Go only.** The build script has no TinyGo option, because the module it produces crashes on invalid input. The measurements below were taken with `tinygo build -o rosetta.wasm -target wasm -opt=z -no-debug -stack-size=1mb .` run in `packages/parser-wasm`.

### What was found trying TinyGo

TinyGo compiles the whole parser, and it works for everything except invalid YAML. Getting there needed three things:

1. **Stack size.** With TinyGo's default stack the module panics at start-up, because goldmark compiles many regular expressions when it loads and that recursion needs more stack. 256 KB still fails and 384 KB works; the build uses 1 MB. This does not change the file size. (The other GC modes tried, `precise` and `leaking`, did not help on their own.)
2. **The schema validator.** `contracts` compiled all its JSON Schemas when the package loaded, which panicked under TinyGo (a nil dereference inside the validator). They are now compiled on first use, and `contracts.M1Components()` no longer validates on every call (the Go tests validate the definitions instead). This helps every Go consumer, not only TinyGo. `setComponents` (which does validate) is covered by tests and passes under TinyGo.
3. **Invalid YAML still crashes the module.** `recover()` does not work in TinyGo's wasm target (checked with a 10-line program: `panic("x")` inside a function with a deferred `recover()` terminates the program). `yaml.v3` reports every error by panicking and recovering, so any data component with invalid YAML, and invalid front matter, ends in `RuntimeError: unreachable`, and the module cannot be used afterwards. These are the 5 failing tests: `errors/statblock-yaml-syntax` and `errors/front-matter-invalid` (HTML and warnings each) and the "bad input never throws" test.

**To use TinyGo**, the YAML body would have to be read without `yaml.v3`. The spec only needs a small subset (mappings, sequences, scalars, block scalars, comments, one level of flow collections), so a purpose-written reader is realistic, about a day of work including tests. The golden suite would catch differences. This is not part of T0.6; it is worth doing if the 2 MB vs 7 MB download matters, and the build script would then need a TinyGo path again (with the stack size above). Any other library that fails by panicking and recovering would have the same problem.

## WebAssembly parser speed (T0.6)

Node 22.12 on an Apple M1 Pro (macOS 26.4), calling `rosetta.parse` directly. Two runs of each; they differed by up to 30%, so read these as orders of magnitude.

| What | Go | TinyGo |
|---|---|---|
| Compile the module (`WebAssembly.compile`) | 7 to 8 ms | 2 to 5 ms |
| Start the runtime and `main` (`go.run`) | 54 to 73 ms | 38 to 46 ms |
| Parse a 419-byte document with all four M1 components (mean of 200 runs after a warm-up) | 0.6 to 0.9 ms | ~21 ms |
| Parse a 39,700-byte document of 100 such sections (mean of 10 runs after a warm-up) | 63 to 64 ms | 51 to 52 ms |

TinyGo starts faster and is a little faster on the large document, but about 30 times slower on the small one; I did not investigate why (garbage collection is the likely cause). Time includes HTML rendering, the AST and JSON encoding, but not `JSON.parse` on the JavaScript side. Browser numbers will differ.
