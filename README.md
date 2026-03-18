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
import createElement from 'dolla/createElement';

export default function application() {
  return [createElement("div", {content: createElement("span", {content: 'Hello World'})})];
}
```

#### Tags

| Tag | Purpose |
|-----|---------|
| `<%= expr %>` | Evaluate expression and output the result |
| `<%- expr %>` | Evaluate expression and output without escaping |
| `<% code %>` | Execute JavaScript without outputting |
| `<%# comment %>` | Comment (omitted from output) |

### Features

#### Parameter extraction

Free variables used in template expressions are automatically extracted into destructured function parameters. Locally declared variables, function params, arrow params, and JS builtins are excluded.

```html
<div><%= user.name %></div>
<div><%= avatarTemplate({ account: account }) %></div>
```

Compiles to:

```js
export default function template({user, avatarTemplate, account}) {
  return [createElement("div", {content: user.name}), createElement("div", {content: avatarTemplate({ account: account })})];
}
```

#### Subtemplates

Define reusable functions within templates. Function and arrow subtemplates return their content and can be called with `<%= %>`.

```html
<% function renderItem(x) { %>
  <span><%= x %></span>
<% } %>
<div><%= renderItem(name) %></div>
```

Callback subtemplates work with iterators and higher-order functions:

```html
<% formTag(function () { %>
  <input type="text">
  <input type="submit" />
<% }) %>
```

#### Iterators

Use `forEach` or `map` to loop over data:

```html
<ul>
<% items.forEach((item) => { %>
  <li><%= item %></li>
<% }) %>
</ul>
```

`map` with `<%= %>` inlines the results:

```html
<table>
<%= rows.map(row => { %>
  <tr><%= row %></tr>
<% }) %>
</table>
```

#### Conditional statements

```html
<% if (show) { %>
  <div class="visible">yes</div>
<% } else { %>
  <div class="hidden">no</div>
<% } %>
```

#### Attribute interpolation

Embed expressions inside HTML attributes:

```html
<div class="uniformLabel [[= foo ? 'disabled' : 'bold' ]] -yellow">
  Hello World
</div>
```

#### Comment scrubbing

Both EJS comments and HTML comments are stripped from output:

```html
<%# This EJS comment is removed %>
<!-- This HTML comment is also removed -->
```

#### Import hoisting

Import statements in `<% %>` tags are hoisted to the module level:

```html
<% import listenerElement from 'dolla/listenerElement' %>
<%= listenerElement('div', {content: 'click me'}, 'click', handler) %>
```

Compiles to:

```js
import createElement from 'dolla/createElement';
import listenerElement from 'dolla/listenerElement';

export default function template({handler}) {
  return [listenerElement('div', {content: 'click me'}, 'click', handler)];
}
```

If a template imports `createElement` from another package, the built-in dolla import is automatically aliased to `__createElement` to avoid collisions.

#### Promise rendering

Template expressions can contain Promises. The promise passes through in the result array for the caller to await:

```html
<div><%= fetchData() %></div>
```

```js
const result = template({fetchData: () => fetch('/api').then(r => 'loaded')});
document.body.append(result)
```

starts as
```html
<body><div></div></body>
```
then when loaded
<body><div>loaded</div></body>
```

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

### Compiling a single template

To quickly inspect the compiled output of a template:

```sh
npm run compile -- path/to/template.html.ejs
```

This writes the compiled JS module next to the source file (e.g., `template.html.js`) and prints the output path. Files with an `.ejx` extension automatically use `[[ ]]` delimiters.

### Project structure

```
src/
  index.js                   - esbuild plugin entry point
  template.js                - state-machine parser and code generator
  template/
    balance-scanner.js       - bracket/brace balance tracking
    html-tag.js              - HTML element code generation
    js.js                    - JavaScript expression node
    string.js                - text content node
    subtemplate.js            - block construct (loops, conditionals, callbacks)
    var-generator.js         - unique variable name generator
test/
  compilation_test.js        - compiled output assertions
  dom_test.js                - runtime DOM assertions via linkedom
  integration_test.js        - esbuild plugin integration tests
  setup.js                   - linkedom DOM globals setup
  fixtures/                  - template fixtures used by tests
```

## License

MIT
