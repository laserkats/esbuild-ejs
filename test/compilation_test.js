import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Template } from '../src/template.js';

describe('compilation', () => {
  test('compiles simple nested template', () => {
    const t = new Template(`<div><span><%= 'Hello World' %></span></div>`);
    const result = t.toModule('application');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function application() {
  return [createElement("div", {content: createElement("span", {content: 'Hello World'})})];
}
`);
  });

  test('compiles multiple root elements', () => {
    const t = new Template(`<div>A</div><div>B</div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template() {
  return [createElement("div", {content: "A"}), createElement("div", {content: "B"})];
}
`);
  });

  test('compiles tag with attributes', () => {
    const t = new Template(`<div class="container"><span>Hello</span></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template() {
  return [createElement("div", {"class": "container", content: createElement("span", {content: "Hello"})})];
}
`);
  });

  test('compiles tag with multiple children', () => {
    const t = new Template(`<div><span>A</span><span>B</span></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template() {
  return [createElement("div", {content: [createElement("span", {content: "A"}), createElement("span", {content: "B"})]})];
}
`);
  });

  test('compiles empty tag', () => {
    const t = new Template(`<div></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template() {
  return [createElement("div")];
}
`);
  });

  test('compiles text with expression', () => {
    const t = new Template('Hello <%= name %>');
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  let {name} = locals;
  return ["Hello ", name];
}
`);
  });

  test('compiles expression with object literal access', () => {
    const t = new Template("Hello <%= {foo: 'test'}[name] %>");
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  let {name} = locals;
  return ["Hello ", {foo: 'test'}[name]];
}
`);
  });

  test('compiles inline async arrow function', () => {
    const t = new Template(
      'Hello <%= Array.from([name]).forEach(async (clause_code, index) => { return clause_code }) %>'
    );
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  let {name} = locals;
  return ["Hello ", Array.from([name]).forEach(async (clause_code, index) => { return clause_code })];
}
`);
  });

  test('compiles consecutive expressions', () => {
    const t = new Template('<%= 1 %>\n<%= 2 %>');
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template() {
  return [1, 2];
}
`);
  });

  test('compiles expression followed by HTML tag', () => {
    const t = new Template('<%= 1 %>\n<span>span</span>');
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template() {
  return [1, createElement("span", {content: "span"})];
}
`);
  });

  test('strips trailing semicolon from expression output', () => {
    const t = new Template('Hello <%= x(); %>');
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  let {x} = locals;
  return ["Hello ", x()];
}
`);
  });

  test('hoists import statement to module level', () => {
    const t = new Template(`<% import { listenerElement } from 'dolla' %><div><%= listenerElement('div', {content: name}, 'click', handler) %></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';
import { listenerElement } from 'dolla';

export default function template(locals={}) {
  let {name, handler} = locals;
  return [createElement("div", {content: listenerElement('div', {content: name}, 'click', handler)})];
}
`);
  });

  test('aliases createElement when user imports createElement from another package', () => {
    const t = new Template(`<% import createElement from 'jquery' %><div><%= createElement() %></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import __createElement from 'dolla/createElement';
import createElement from 'jquery';

export default function template() {
  return [__createElement("div", {content: createElement()})];
}
`);
  });
});

describe('parameter extraction', () => {
  test('destructures variables from expressions into function params', () => {
    const t = new Template(`<div><span><%= name %></span><span><%= greeting %></span></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  let {name, greeting} = locals;
  return [createElement("div", {content: [createElement("span", {content: name}), createElement("span", {content: greeting})]})];
}
`);
  });

  test('ignores string literals in variable extraction', () => {
    const t = new Template(`<div><%= 'Hello World' %></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template() {
  return [createElement("div", {content: 'Hello World'})];
}
`);
  });

  test('ignores property accesses in variable extraction', () => {
    const t = new Template(`<div><%= user.name %></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  let {user} = locals;
  return [createElement("div", {content: user.name})];
}
`);
  });

  test('deduplicates variables across expressions', () => {
    const t = new Template(`<div><%= foo %><%= foo %></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  let {foo} = locals;
  return [createElement("div", {content: [foo, foo]})];
}
`);
  });

  test('extracts variables from typeof expressions', () => {
    const t = new Template(`<div><%= typeof transparent != "undefined" ? klass : '' %></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  let {transparent, klass} = locals;
  return [createElement("div", {content: typeof transparent != "undefined" ? klass : ''})];
}
`);
  });

  test('extracts function call and object value as free variables', () => {
    const t = new Template(`<div><%= avatarTemplate({ account: account }) %></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  let {avatarTemplate, account} = locals;
  return [createElement("div", {content: avatarTemplate({ account: account })})];
}
`);
  });

  test('does not extract "locals" as a free variable', () => {
    const t = new Template(`<div><%= locals.name %></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  return [createElement("div", {content: locals.name})];
}
`);
  });

  test('does not extract object keys as free variables', () => {
    const t = new Template(`<div><%= fn({ key: value }) %></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  let {fn, value} = locals;
  return [createElement("div", {content: fn({ key: value })})];
}
`);
  });
});

describe('scoping', () => {
  test('excludes locally declared functions and classes from free variables', () => {
    const t = new Template(`<% function x(files) { return files.test(); } %>
<% class B {} %>
<div><%= models.map(m => m.name) %></div>
<div><%= avatarTemplate({ account: x(files), klass: B }) %></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  let {models, avatarTemplate, files} = locals;
  function x(files) { return files.test(); }
  class B {}
  return [createElement("div", {content: models.map(m => m.name)}), createElement("div", {content: avatarTemplate({ account: x(files), klass: B })})];
}
`);
  });

  test('handles shadow variables in nested function params', () => {
    const t = new Template(`<% function f(items, template) { return items.map((file) => { const row = template(file); return row; }); } %>
<div><%= f(items, (f) => { return __v; }) %></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  let {items, __v} = locals;
  function f(items, template) { return items.map((file) => { const row = template(file); return row; }); }
  return [createElement("div", {content: f(items, (f) => { return __v; })})];
}
`);
  });

  test('scopes catch parameter to catch block', () => {
    const t = new Template(`<% try { %><%= avatarTemplate({ account: account }) %><% } catch(e) { console.error(e); } %>
<div><%= e %></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  let {avatarTemplate, account} = locals;
  var __output = [];
  try {
    __output.push(...[].concat(avatarTemplate({ account: account })));
  } catch(e) { console.error(e); }
  __output.push(createElement("div", {content: e}));
  return __output.filter(x => typeof x !== "string" || x.trim());
}
`);
  });

  test('scopes rest parameters in arrow functions', () => {
    const t = new Template(`<div><%= ((...args) => { return y(...args); })(z, y) %></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  let {y, z} = locals;
  return [createElement("div", {content: ((...args) => { return y(...args); })(z, y)})];
}
`);
  });

  test('excludes arrow function parameters from free variables', () => {
    const t = new Template(`<div><%= models.map(m => m.name) %></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  let {models} = locals;
  return [createElement("div", {content: models.map(m => m.name)})];
}
`);
  });

  test('excludes multiple const declarations in one block from parameters', () => {
    const t = new Template(
      `[[
const locals = { library };
const body = State(locals);
const activeTab = State('a');
const tabs = [{ template: foo }];
]]
[[ tabs.forEach(tab => { ]]
    [[= body ]]
[[ }); ]]`,
      { open: '[[', close: ']]' }
    );
    const result = t.toModule('template');

    const paramMatch = result.match(/let \{([^}]+)\} = locals/);
    assert.ok(paramMatch, 'should have destructured parameters');
    const params = paramMatch[1];
    assert.ok(!params.includes('locals'), 'locals should not appear in parameters');
    assert.ok(!params.includes('body'), 'body should not appear in parameters');
    assert.ok(!params.includes('activeTab'), 'activeTab should not appear in parameters');
    assert.ok(!params.includes('tabs'), 'tabs should not appear in parameters');
  });

  test('excludes function declaration name inside multi-statement scriptlet from free variables', () => {
    const t = new Template(
`<div>
    <%
    let x;
    function handleAdd() {
}
%>
</div>`);
    const free = t.freeVariables();
    assert.ok(!free.has('x'), 'x should not be a free variable');
    assert.ok(!free.has('handleAdd'), 'handleAdd should not be a free variable');
  });

  test('excludes async function declaration name inside multi-statement scriptlet from free variables', () => {
    const t = new Template(
`<div class="mt-6 border-t pt-4">
    <h3 class="text-sm font-medium text-gray-700 mb-2">Bulk Add Attributes</h3>
    <p class="text-xs text-gray-500 mb-2">Enter attribute names separated by tabs or commas</p>
    <%
    let bulkTextarea;
    async function handleBulkAdd() {
}
%>
</div>`);
    const free = t.freeVariables();
    assert.ok(!free.has('bulkTextarea'), 'bulkTextarea should not be a free variable');
    assert.ok(!free.has('handleBulkAdd'), 'handleBulkAdd should not be a free variable');
  });

  test('does not treat var/let/const inside function body as declarations', () => {
    const t = new Template(
      'Hello <%= el(() => { var x = 2; let y = 3; const z = 4; return 5; }) %>'
    );
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  let {el} = locals;
  return ["Hello ", el(() => { var x = 2; let y = 3; const z = 4; return 5; })];
}
`);
  });
});

describe('syntax', () => {
  test('skips comment expressions', () => {
    const t = new Template(`<div><%# comment %></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template() {
  return [createElement("div")];
}
`);
  });

  test('compiles text with EJS comment', () => {
    const t = new Template('Hello <%# name %>');
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template() {
  return ["Hello "];
}
`);
  });

  test('compiles text with multi-line EJS comment', () => {
    const t = new Template('Hello <%# a\n    multi\n    line\n    comment\n%>');
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template() {
  return ["Hello "];
}
`);
  });

  test('strips HTML comments from output', () => {
    const t = new Template('Hello <!-- Write your comments here -->');
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template() {
  return ["Hello "];
}
`);
  });

  test('compiles if statement', () => {
    const t = new Template(`<div><% if(show) { %>visible<% } %></div>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  let {show} = locals;
  var __a = [];
  if(show) {
    __a.push("visible");
  }
  return [createElement("div", {content: __a})];
}
`);
  });
});

describe('async', () => {
  test('emits async function when template uses top-level await', () => {
    const t = new Template(
`<% import someLibrary from 'some_package' %>
<% const players = Player.load %>
<% const teams = await players.map(p => p.team) %>

<% teams.forEach(t => { %>
<%= team.name %>
<% }) %>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';
import someLibrary from 'some_package';

export default async function template(locals={}) {
  let {Player, team} = locals;
  var __output = [];
  const players = Player.load
  const teams = await players.map(p => p.team)
  teams.forEach(t => {
    __output.push(...[].concat(team.name));
  })
  return __output.filter(x => typeof x !== "string" || x.trim());
}
`);
  });
});

describe('complex uses', () => {
  test('compiles deeply nested HTML form', () => {
    const t = new Template(
`<form class="uniformForm">
<div class="form-group">
<div class="uniformFloatingLabel">
<label for="email_address">Email Address</label>
<input type="text" class="pad-2x width-100-p" name="email_address" value="" id="email_address" autofocus>
</div>
</div>
<div class="margin-v text-small text-center">
<button class="reset js-reset-password text-gray-dark hover-blue">Forgot Password?</button>
</div>
</form>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template() {
  return [createElement("form", {"class": "uniformForm", content: ["\\n", createElement("div", {"class": "form-group", content: ["\\n", createElement("div", {"class": "uniformFloatingLabel", content: ["\\n", createElement("label", {"for": "email_address", content: "Email Address"}), "\\n", createElement("input", {"type": "text", "class": "pad-2x width-100-p", "name": "email_address", "value": "", "id": "email_address", "autofocus": true}), "\\n"]}), "\\n"]}), "\\n", createElement("div", {"class": "margin-v text-small text-center", content: ["\\n", createElement("button", {"class": "reset js-reset-password text-gray-dark hover-blue", content: "Forgot Password?"}), "\\n"]}), "\\n"]})];
}
`);
  });

  test('compiles SVG elements', () => {
    const t = new Template(
`<svg xmlns="http://www.w3.org/2000/svg" width="526" height="233">
<rect x="13" y="14" width="500" height="200" rx="50" ry="100" fill="none" stroke="blue" stroke-width="10" />
</svg>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template() {
  return [createElement("svg", {"xmlns": "http://www.w3.org/2000/svg", "width": "526", "height": "233", content: ["\\n", createElement("rect", {"x": "13", "y": "14", "width": "500", "height": "200", "rx": "50", "ry": "100", "fill": "none", "stroke": "blue", "stroke-width": "10"}), "\\n"]})];
}
`);
  });

  test('compiles forEach with void HTML elements', () => {
    const t = new Template(
`<% records.forEach((record) => { %>
<input type="text">
<input type="submit" />
<% }) %>`);
    const result = t.toModule('template');

    assert.equal(result, `import createElement from 'dolla/createElement';

export default function template(locals={}) {
  let {records} = locals;
  var __output = [];
  records.forEach((record) => {
    __output.push(createElement("input", {"type": "text"}));
    __output.push("\\n");
    __output.push(createElement("input", {"type": "submit"}));
    __output.push("\\n");
  })
  return __output.filter(x => typeof x !== "string" || x.trim());
}
`);
  });
});
