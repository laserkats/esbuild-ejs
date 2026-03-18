# esbuild-ejs

An esbuild plugin that compiles `.ejs` templates into JavaScript modules that return DOM elements via [dolla](https://github.com/bemky/dolla)'s `createElement`.

## Commands

- `npm test` — run all tests (compilation, DOM, integration)
- `npm run compile -- path/to/template.ejs` — compile a single template to JS for spot testing. Outputs a `.js` file next to the source. `.ejx` files automatically use `[[ ]]` delimiters.

## Architecture

- `src/template.js` — state-machine parser and code generator. Handles parameter extraction (free variables become destructured function params), scoping (declared variables excluded), and import hoisting.
- `src/index.js` — esbuild plugin entry point.
- `src/compile.js` — CLI script for single-file compilation.
- `src/template/` — node types (html-tag, js, string, subtemplate) and utilities (balance-scanner, var-generator).

## Testing

Tests use Node's built-in test runner (`node:test`). Three test files:
- `test/compilation_test.js` — asserts compiled JS module output
- `test/dom_test.js` — runtime DOM rendering assertions via linkedom
- `test/integration_test.js` — esbuild plugin end-to-end tests

## Conventions

- Templates use `<% %>` delimiters by default; `[[ ]]` is the alternate delimiter set (used with `.ejx` files or `{ open: '[[', close: ']]' }` option).
- Free variables in templates become destructured parameters on the exported function. Declared variables (`const`/`let`/`var`), function/class declarations, imports, and JS builtins are excluded.
