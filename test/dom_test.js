import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Template } from '../src/template.js';

async function compile(source, opts) {
  const t = new Template(source, opts);
  const code = t.toModule('template').replace(/'dolla(\/[^']*)?'/g, (m, sub) => {
    return `'` + import.meta.resolve('dolla' + (sub || '')) + `'`;
  });
  const url = `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`;
  const mod = await import(url);
  return mod.default;
}

function assertHTML(result, expected) {
  const html = result.map(x => typeof x === 'string' ? x : x.outerHTML).join('');
  assert.equal(html, expected.trim());
}

describe('parser', () => {
  test('renders a simple nested template', async () => {
    const fn = await compile(`<div><span><%= 'Hello World' %></span></div>`);
    assertHTML(fn(), '<div><span>Hello World</span></div>');
  });

  test('renders attributes', async () => {
    const fn = await compile(`<div class="container" id="main"></div>`);
    assertHTML(fn(), '<div id="main" class="container"></div>');
  });

  test('renders self-closing tags', async () => {
    const fn = await compile(`<div><br/></div>`);
    assertHTML(fn(), '<div><br></div>');
  });

  test('renders void elements', async () => {
    const fn = await compile(`<div><input type="text"></div>`);
    assertHTML(fn(), '<div><input type="text"></div>');
  });

  test('renders text content', async () => {
    const fn = await compile(`<p>Hello World</p>`);
    assertHTML(fn(), '<p>Hello World</p>');
  });

  test('renders boolean attributes', async () => {
    const fn = await compile(`<input autofocus>`);
    assertHTML(fn(), '<input autofocus>');
  });

  test('renders EJS comment as empty output', async () => {
    const fn = await compile(`<div><%# this is a comment %></div>`);
    assertHTML(fn(), '<div></div>');
  });

  test('renders unescaped EJS tags', async () => {
    const fn = await compile(`<div><%- rawHTML %></div>`);
    assertHTML(fn({rawHTML: 'hello'}), '<div>hello</div>');
  });

  test('renders with custom [[ ]] delimiters', async () => {
    const fn = await compile(
      `<div><span>[[= 'Hello World' ]]</span></div>`,
      { open: '[[', close: ']]' }
    );
    assertHTML(fn(), '<div><span>Hello World</span></div>');
  });

  test('imports listenerElement from dolla', async () => {
    const fn = await compile(
      `<% import listenerElement from 'dolla/listenerElement' %><%= listenerElement('div', {content: 'hello'}, 'click', handler) %>`
    );
    assertHTML(fn({handler: () => {}}), '<div>hello</div>');
  });
});

describe('iterators', () => {
  test('forEach pushes each value to output', async () => {
    const fn = await compile(`<% [1,2].forEach((i) => { %><%= i %><% }) %>`);
    assert.deepStrictEqual(fn(), [1, 2]);
  });

  test('nested forEach builds nested element tree', async () => {
    const fn = await compile(`<table>
<% rows.forEach((row) => { %>
<tr>
<% row.forEach((cell) => { %>
<td><%= cell %></td>
<% }) %>
</tr>
<% }) %>
</table>`);
    assertHTML(fn({rows: [['a', 'b'], ['c', 'd']]}),
      '<table>\n<tr>\n<td>a</td>\n<td>b</td>\n</tr>\n<tr>\n<td>c</td>\n<td>d</td>\n</tr>\n</table>');
  });

  test('forEach inside tag accumulates children', async () => {
    const fn = await compile(`<ul>
<% items.forEach((item) => { %>
<li><%= item %></li>
<% }) %>
</ul>`);
    assertHTML(fn({items: ['a', 'b', 'c']}),
      '<ul>\n<li>a</li>\n<li>b</li>\n<li>c</li>\n</ul>');
  });

  test('nested forEach with complex data builds correct tree', async () => {
    const fn = await compile(`<pages>
<% listings.forEach(async (listing) => { %>
<page><%= listing.id %></page>
<% listing.attachments.forEach(async (attachment) => { %>
<subpage><%= attachment %></subpage>
<% }) %>
<% }) %>
</pages>`);
    assertHTML(fn({listings: [
      {id: 'a', attachments: ['c', 'd']},
      {id: 'b', attachments: ['e', 'f']},
    ]}),
      '<pages>\n<page>a</page>\n<subpage>c</subpage>\n<subpage>d</subpage>\n<page>b</page>\n<subpage>e</subpage>\n<subpage>f</subpage>\n</pages>');
  });

  test('forEach repeats void elements for each record', async () => {
    const fn = await compile(`<% records.forEach((record) => { %>
<input type="text">
<input type="submit" />
<% }) %>`);
    assertHTML(fn({records: [1, 2]}),
      '<input type="text"><input type="submit"><input type="text"><input type="submit">');
  });

  test('map inline outputs elements', async () => {
    const fn = await compile(`<table>
<%= rows.map(row => { %>
<tr><%= row %></tr>
<% }) %>
</table>`);
    assertHTML(fn({rows: ['a', 'b', 'c']}),
      `
<table>
<tr>a</tr>
<tr>b</tr>
<tr>c</tr>
</table>
`);
  });

  test('map subtemplate assigns to variable', async () => {
    const fn = await compile(`<% var x = [1,2].map((n) => { %>
<input type="text">
<% }) %>`);
    assertHTML(fn(), '<input type="text"><input type="text">');
  });
});

describe('conditional statements', () => {
  test('if/else renders truthy branch', async () => {
    const fn = await compile(`<% if (show) { %>
<div class="visible">yes</div>
<% } else { %>
<div class="hidden">no</div>
<% } %>`);

    assertHTML(fn({show: true}), '<div class="visible">yes</div>');
    assertHTML(fn({show: false}), '<div class="hidden">no</div>');
  });

  test('if/else inside function subtemplate renders correct branch', async () => {
    const fn = await compile(`<% function renderer() { %>
<% if (true) { %>
<div>Hello World</div>
<% } else { %>
<div>NOT THIS</div>
<% } %>
<% } %>
<%= renderer() %>`);
    assertHTML(fn(), '<div>Hello World</div>');
  });

  test('if/else inside callback subtemplate', async () => {
    const fn = await compile(`<% formTag(function () { %>
<% if (show) { %>
<div>yes</div>
<% } else { %>
<div>no</div>
<% } %>
<% }) %>`);

    assertHTML(fn({show: true, formTag: function(cb) { cb(); }}), '<div>yes</div>');
    assertHTML(fn({show: false, formTag: function(cb) { cb(); }}), '<div>no</div>');
  });
});

describe('subtemplates', () => {
  test('function subtemplate renders content', async () => {
    const fn = await compile(`<% function renderItem(x) { %>
<span><%= x %></span>
<% } %>
<div><%= renderItem(name) %></div>`);
    assertHTML(fn({name: 'World'}), '<div><span>World</span></div>');
  });

  test('const arrow subtemplate renders content', async () => {
    const fn = await compile(`<% const renderItem = (x) => { %>
<i><%= x %></i>
<% } %>
<div><%= renderItem(name) %></div>`);
    assertHTML(fn({name: 'World'}), '<div><i>World</i></div>');
  });

  test('callback subtemplate inside tag', async () => {
    const fn = await compile(`<form>
<% formTag(function () { %>
<input type="text">
<input type="submit" />
<% }) %>
</form>`);
    assertHTML(fn({formTag: function(cb) { cb(); }}),
      '<form>\n<input type="text">\n<input type="submit">\n</form>');
  });

  test('callback subtemplate at root level', async () => {
    const fn = await compile(`<% formTag(function () { %>
<input type="text">
<input type="submit" />
<% }) %>`);
    assertHTML(fn({formTag: function(cb) { cb(); }}),
      '<input type="text"><input type="submit">');
  });

  test('arrow callback subtemplate at root level', async () => {
    const fn = await compile(`<% formTag(() => { %>
<input type="text">
<input type="submit" />
<% }) %>`);
    assertHTML(fn({formTag: function(cb) { cb(); }}),
      '<input type="text"><input type="submit">');
  });

  test('subtemplate as first argument with trailing arguments', async () => {
    const fn = await compile(`<% formTag(function () { %>
<input type="text">
<input type="submit" />
<% }, function () { return 1; }) %>`);
    let secondResult;
    const result = fn({formTag: function(cb, extra) { cb(); secondResult = extra(); }});
    assertHTML(result, '<input type="text"><input type="submit">');
    assert.equal(secondResult, 1);
  });

  test('multiple callback subtemplates as arguments', async () => {
    const fn = await compile(`<% formTag(function () { %>
<input type="text">
<% }, function () { %>
<input type="submit" />
<% }) %>`);
    assertHTML(fn({formTag: function(cb1, cb2) { cb1(); cb2(); }}),
      '<input type="text"><input type="submit">');
  });

  test('nested callback subtemplates', async () => {
    const fn = await compile(`<% outer(a => { %>
<% inner(b => { %>
<span><%= b %></span>
<% }) %>
<% }) %>`);
    assertHTML(fn({
      outer: function(cb) { cb('x'); },
      inner: function(cb) { cb('hello'); cb('world'); },
    }), '<span>hello</span><span>world</span>');
  });
});

describe('output mode', () => {
  test('escape and unescape both output string values', async () => {
    const fn = await compile(`<%= '<div>t1</div>' %>
<%- '<div>t2</div>' %>`);
    assert.deepStrictEqual(fn(), ['<div>t1</div>', '<div>t2</div>']);
  });

  test('outputs a Promise that resolves to a value', async () => {
    const fn = await compile(`<%= promise %>`);
    const result = fn({promise: Promise.resolve('async value')});
    assert.equal(await result[0], 'async value');
  });

  test('outputs a Promise that resolves to HTML inside an element', async () => {
    const fn = await compile(`<div><%= promise %></div>`);
    const fn2 = await compile(`<span><%= foo %></span>`);
    const inner = fn2({foo: 'hello'})[0];
    const result = fn({promise: await Promise.resolve(inner.outerHTML)});
    assertHTML(result, '<div><span>hello</span></div>');
  });
});

describe('attribute interpolation', () => {
  test('interpolates expression in double-quoted attribute', async () => {
    const fn = await compile(
      `<div class="[[= klass ]]"></div>`,
      { open: '[[', close: ']]' }
    );
    assertHTML(fn({klass: 'name'}), '<div class="name"></div>');
  });

  test('interpolates expression in single-quoted attribute', async () => {
    const fn = await compile(
      `<div class='[[= klass ]]'></div>`,
      { open: '[[', close: ']]' }
    );
    assertHTML(fn({klass: 'name'}), '<div class="name"></div>');
  });

  test('interpolates ternary expression in attribute with surrounding text', async () => {
    const fn = await compile(
      `<div class="uniformLabel [[= foo ? 'disabled' : 'bold' ]] -yellow">Hello World</div>`,
      { open: '[[', close: ']]' }
    );
    assertHTML(fn({foo: true}), '<div class="uniformLabel disabled -yellow">Hello World</div>');
    assertHTML(fn({foo: false}), '<div class="uniformLabel bold -yellow">Hello World</div>');
  });
});
