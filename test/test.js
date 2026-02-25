import { describe, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import { parse } from '../src/parser.js';
import { compile } from '../src/compiler.js';
import ejsPlugin from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('parser', () => {
  test('parses a simple nested template', () => {
    const tree = parse(`<div><span><%= 'Hello World' %></span></div>`);
    assert.deepStrictEqual(tree, {
      type: 'root',
      children: [{
        type: 'tag',
        name: 'div',
        attrs: {},
        children: [{
          type: 'tag',
          name: 'span',
          attrs: {},
          children: [{
            type: 'expression',
            value: "'Hello World'",
            modifier: 'escape'
          }]
        }]
      }]
    });
  });

  test('parses attributes', () => {
    const tree = parse(`<div class="container" id="main"></div>`);
    assert.deepStrictEqual(tree.children[0].attrs, {
      class: 'container',
      id: 'main'
    });
  });

  test('parses self-closing tags', () => {
    const tree = parse(`<div><br/></div>`);
    assert.equal(tree.children[0].children[0].name, 'br');
    assert.deepStrictEqual(tree.children[0].children[0].children, []);
  });

  test('parses void elements', () => {
    const tree = parse(`<div><input type="text"></div>`);
    const input = tree.children[0].children[0];
    assert.equal(input.name, 'input');
    assert.equal(input.attrs.type, 'text');
    assert.deepStrictEqual(input.children, []);
  });

  test('parses text content', () => {
    const tree = parse(`<p>Hello World</p>`);
    assert.deepStrictEqual(tree.children[0].children, [{
      type: 'text',
      value: 'Hello World'
    }]);
  });

  test('parses boolean attributes', () => {
    const tree = parse(`<input autofocus>`);
    assert.equal(tree.children[0].attrs.autofocus, true);
  });

  test('parses EJS comment tags', () => {
    const tree = parse(`<div><%# this is a comment %></div>`);
    assert.equal(tree.children[0].children[0].modifier, 'comment');
  });

  test('parses unescaped EJS tags', () => {
    const tree = parse(`<div><%- rawHTML %></div>`);
    const expr = tree.children[0].children[0];
    assert.equal(expr.value, 'rawHTML');
    assert.equal(expr.modifier, 'unescape');
  });

  test('parses with custom [[ ]] delimiters', () => {
    const tree = parse(
      `<div><span>[[= 'Hello World' ]]</span></div>`,
      { open: '[[', close: ']]' }
    );
    assert.deepStrictEqual(tree, {
      type: 'root',
      children: [{
        type: 'tag',
        name: 'div',
        attrs: {},
        children: [{
          type: 'tag',
          name: 'span',
          attrs: {},
          children: [{
            type: 'expression',
            value: "'Hello World'",
            modifier: 'escape'
          }]
        }]
      }]
    });
  });
});

describe('compiler', () => {
  test('compiles simple nested template', () => {
    const tree = parse(`<div><span><%= 'Hello World' %></span></div>`);
    const result = compile(tree, 'application');

    assert.equal(result, [
      `import { createElement } from 'dolla';`,
      ``,
      `export default function application(locals) {`,
      `  return createElement("div", {content: createElement("span", {content: 'Hello World'})});`,
      `}`,
      ``
    ].join('\n'));
  });

  test('compiles tag with attributes', () => {
    const tree = parse(`<div class="container"><span>Hello</span></div>`);
    const result = compile(tree, 'template');

    assert.ok(result.includes('"class": "container"'));
    assert.ok(result.includes('content: createElement("span"'));
  });

  test('compiles tag with multiple children', () => {
    const tree = parse(`<div><span>A</span><span>B</span></div>`);
    const result = compile(tree, 'template');

    assert.ok(result.includes('content: [createElement("span"'));
  });

  test('compiles empty tag', () => {
    const tree = parse(`<div></div>`);
    const result = compile(tree, 'template');

    assert.ok(result.includes('createElement("div")'));
    assert.ok(!result.includes('content'));
  });

  test('skips comment expressions', () => {
    const tree = parse(`<div><%# comment %></div>`);
    const result = compile(tree, 'template');

    assert.ok(result.includes('createElement("div")'));
    assert.ok(!result.includes('comment'));
  });
});

describe('esbuild integration', () => {
  test('compiles .ejs file through esbuild', async () => {
    const result = await esbuild.build({
      entryPoints: [path.join(__dirname, 'fixtures/simple.html.ejs')],
      bundle: false,
      write: false,
      plugins: [ejsPlugin()],
    });

    const output = result.outputFiles[0].text;
    assert.ok(output.includes('createElement'));
    assert.ok(output.includes('Hello World'));
  });

  test('compiles .ejs file with custom delimiters', async () => {
    const result = await esbuild.build({
      entryPoints: [path.join(__dirname, 'fixtures/custom_delimiters.html.ejs')],
      bundle: false,
      write: false,
      plugins: [ejsPlugin({ open: '[[', close: ']]' })],
    });

    const output = result.outputFiles[0].text;
    assert.ok(output.includes('createElement'));
    assert.ok(output.includes('Hello World'));
    assert.ok(!output.includes('[['));
  });

  test('uses filename as function name', async () => {
    const result = await esbuild.build({
      entryPoints: [path.join(__dirname, 'fixtures/simple.html.ejs')],
      bundle: false,
      write: false,
      plugins: [ejsPlugin()],
    });

    const output = result.outputFiles[0].text;
    assert.ok(output.includes('function simple'));
  });
});
