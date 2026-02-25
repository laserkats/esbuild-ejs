const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

export function parse(template, { open = '<%', close = '%>' } = {}) {
  let pos = 0;

  function peek() {
    return template[pos];
  }

  function advance(n = 1) {
    const chunk = template.slice(pos, pos + n);
    pos += n;
    return chunk;
  }

  function match(str) {
    return template.startsWith(str, pos);
  }

  function skipWhitespace() {
    while (pos < template.length && /\s/.test(template[pos])) {
      pos++;
    }
  }

  function parseTagName() {
    let name = '';
    while (pos < template.length && /[a-zA-Z0-9\-]/.test(template[pos])) {
      name += advance();
    }
    return name;
  }

  function parseAttrValue() {
    if (match('"')) {
      advance();
      let value = '';
      while (pos < template.length && !match('"')) {
        value += advance();
      }
      advance();
      return value;
    }
    if (match("'")) {
      advance();
      let value = '';
      while (pos < template.length && !match("'")) {
        value += advance();
      }
      advance();
      return value;
    }
    let value = '';
    while (pos < template.length && !/[\s>\/]/.test(template[pos])) {
      value += advance();
    }
    return value;
  }

  function parseAttrs() {
    const attrs = {};
    while (pos < template.length) {
      skipWhitespace();
      if (match('>') || match('/>')) break;

      const key = parseTagName();
      if (!key) break;

      skipWhitespace();
      if (match('=')) {
        advance();
        skipWhitespace();
        attrs[key] = parseAttrValue();
      } else {
        attrs[key] = true;
      }
    }
    return attrs;
  }

  function parseText() {
    let text = '';
    while (pos < template.length && !match('<') && !match(open)) {
      text += advance();
    }
    if (text) return { type: 'text', value: text };
    return null;
  }

  function parseEJS() {
    advance(open.length);
    let modifier = null;
    if (match('=')) { modifier = 'escape'; advance(); }
    else if (match('-')) { modifier = 'unescape'; advance(); }
    else if (match('#')) { modifier = 'comment'; advance(); }

    let code = '';
    while (pos < template.length && !match(close)) {
      code += advance();
    }
    advance(close.length);

    return { type: 'expression', value: code.trim(), modifier };
  }

  function parseTag() {
    advance(); // <
    const name = parseTagName();
    const attrs = parseAttrs();

    if (match('/>')) {
      advance(2);
      return { type: 'tag', name, attrs, children: [] };
    }

    advance(); // >

    if (VOID_ELEMENTS.has(name.toLowerCase())) {
      return { type: 'tag', name, attrs, children: [] };
    }

    const children = parseChildren();

    if (match('</')) {
      advance(2);
      parseTagName();
      skipWhitespace();
      if (match('>')) advance();
    }

    return { type: 'tag', name, attrs, children };
  }

  function parseChildren() {
    const children = [];
    while (pos < template.length) {
      if (match('</')) break;

      if (match(open)) {
        children.push(parseEJS());
      } else if (match('<')) {
        children.push(parseTag());
      } else {
        const text = parseText();
        if (text) children.push(text);
      }
    }
    return children;
  }

  const children = parseChildren();
  return { type: 'root', children };
}
