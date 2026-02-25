# esbuild-ejs

An [esbuild](https://esbuild.github.io/) plugin that compiles `.ejs` templates into JavaScript modules. Each template exports a function that returns an array of DOM elements built with [dolla](https://github.com/bemky/dolla)'s `createElement`.

## Installation

```sh
npm install esbuild-ejs
```

Requires `esbuild` as a peer dependency.

## Usage

### Build configuration

```js
import esbuild from 'esbuild';
import ejsPlugin from 'esbuild-ejs';

await esbuild.build({
  entryPoints: ['app.js'],
  bundle: true,
  outfile: 'out.js',
  plugins: [ejsPlugin()],
});
```

### Importing templates

```js
import layout from './layouts/application.html.ejs';

const elements = layout();
for (const el of elements) {
  document.body.appendChild(el);
}
```

### Template syntax

A template like this:

```html
<div><span><%= 'Hello World' %></span></div>
```

Compiles to:

```js
import { createElement } from 'dolla';

export default function application(locals) {
  return [createElement("div", {content: createElement("span", {content: 'Hello World'})})];
}
```

#### Tags

| Tag | Purpose |
|-----|---------|
| `<%= expr %>` | Evaluate expression and output the result |
| `<%- expr %>` | Evaluate expression and output without escaping |
| `<%# comment %>` | Comment (omitted from output) |

### Options

```js
ejsPlugin({
  filter: /\.ejs$/i,  // regex to match files (default: /\.ejs$/i)
  open: '<%',         // opening delimiter (default: '<%')
  close: '%>',        // closing delimiter (default: '%>')
})
```

#### Custom delimiters

```js
ejsPlugin({ open: '[[', close: ']]' })
```

Then in your template:

```html
<div><span>[[= 'Hello World' ]]</span></div>
```

## Development

```sh
git clone https://github.com/laserkats/esbuild-ejs.git
cd esbuild-ejs
npm install
```

### Running tests

```sh
npm test
```

### Project structure

```
src/
  index.js      - esbuild plugin entry point
  parser.js     - recursive descent template parser
  compiler.js   - AST to JavaScript compiler
test/
  test.js       - parser, compiler, and esbuild integration tests
  fixtures/     - template fixtures used by tests
```

## License

MIT
