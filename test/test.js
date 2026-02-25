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
    const results = parse(`<div><span><%= 'Hello World' %></span></div>`);
    assert.deepStrictEqual(results, [{
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
    }]);
  });

  test('parses attributes', () => {
    const results = parse(`<div class="container" id="main"></div>`);
    assert.deepStrictEqual(results[0].attrs, {
      class: 'container',
      id: 'main'
    });
  });

  test('parses self-closing tags', () => {
    const results = parse(`<div><br/></div>`);
    assert.equal(results[0].children[0].name, 'br');
    assert.deepStrictEqual(results[0].children[0].children, []);
  });

  test('parses void elements', () => {
    const results = parse(`<div><input type="text"></div>`);
    const input = results[0].children[0];
    assert.equal(input.name, 'input');
    assert.equal(input.attrs.type, 'text');
    assert.deepStrictEqual(input.children, []);
  });

  test('parses text content', () => {
    const results = parse(`<p>Hello World</p>`);
    assert.deepStrictEqual(results[0].children, [{
      type: 'text',
      value: 'Hello World'
    }]);
  });

  test('parses boolean attributes', () => {
    const results = parse(`<input autofocus>`);
    assert.equal(results[0].attrs.autofocus, true);
  });

  test('parses EJS comment tags', () => {
    const results = parse(`<div><%# this is a comment %></div>`);
    assert.equal(results[0].children[0].modifier, 'comment');
  });

  test('parses unescaped EJS tags', () => {
    const results = parse(`<div><%- rawHTML %></div>`);
    const expr = results[0].children[0];
    assert.equal(expr.value, 'rawHTML');
    assert.equal(expr.modifier, 'unescape');
  });

  test('parses with custom [[ ]] delimiters', () => {
    const results = parse(
      `<div><span>[[= 'Hello World' ]]</span></div>`,
      { open: '[[', close: ']]' }
    );
    assert.deepStrictEqual(results, [{
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
    }]);
  });
});

describe('compiler', () => {
  test('compiles simple nested template', () => {
    const results = parse(`<div><span><%= 'Hello World' %></span></div>`);
    const result = compile(results, 'application');

    assert.equal(result, [
      `import { createElement } from 'dolla';`,
      ``,
      `export default function application(locals) {`,
      `  return [createElement("div", {content: createElement("span", {content: 'Hello World'})})];`,
      `}`,
      ``
    ].join('\n'));
  });

  test('compiles multiple root elements', () => {
    const results = parse(`<div>A</div><div>B</div>`);
    const result = compile(results, 'template');

    assert.ok(result.includes('return [createElement("div", {content: "A"}), createElement("div", {content: "B"})]'));
  });

  test('compiles tag with attributes', () => {
    const results = parse(`<div class="container"><span>Hello</span></div>`);
    const result = compile(results, 'template');

    assert.ok(result.includes('"class": "container"'));
    assert.ok(result.includes('content: createElement("span"'));
  });

  test('compiles tag with multiple children', () => {
    const results = parse(`<div><span>A</span><span>B</span></div>`);
    const result = compile(results, 'template');

    assert.ok(result.includes('content: [createElement("span", {content: "A"}), createElement("span", {content: "B"})]'));
  });

  test('compiles empty tag', () => {
    const results = parse(`<div></div>`);
    const result = compile(results, 'template');

    assert.ok(result.includes('createElement("div")'));
    assert.ok(!result.includes('content'));
  });

  test('skips comment expressions', () => {
    const results = parse(`<div><%# comment %></div>`);
    const result = compile(results, 'template');

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
