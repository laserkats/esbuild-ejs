const BALANCE = { '}': '{', ')': '(', '{': '}', '(': ')' };

// Minimal string/comment context tracker (replaces character-parser dependency
// since character-parser throws on unbalanced brackets, which is exactly
// what EJS produces when splitting JS across <% %> tags)
class StringContext {
  constructor() {
    this.mode = null; // 'sq' | 'dq' | 'tq' | 'lc' | 'bc' | null
    this.escaped = false;
    this.lastChar = '';
  }

  isString() {
    return this.mode === 'sq' || this.mode === 'dq' || this.mode === 'tq';
  }

  isComment() {
    return this.mode === 'lc' || this.mode === 'bc';
  }

  feed(ch) {
    switch (this.mode) {
      case 'lc': // line comment
        if (ch === '\n') this.mode = null;
        break;
      case 'bc': // block comment
        if (this.lastChar === '*' && ch === '/') this.mode = null;
        break;
      case 'sq': // single quote
        if (ch === "'" && !this.escaped) this.mode = null;
        else if (ch === '\\' && !this.escaped) { this.escaped = true; this.lastChar = ch; return; }
        else this.escaped = false;
        break;
      case 'dq': // double quote
        if (ch === '"' && !this.escaped) this.mode = null;
        else if (ch === '\\' && !this.escaped) { this.escaped = true; this.lastChar = ch; return; }
        else this.escaped = false;
        break;
      case 'tq': // template literal
        if (ch === '`' && !this.escaped) this.mode = null;
        else if (ch === '\\' && !this.escaped) { this.escaped = true; this.lastChar = ch; return; }
        else this.escaped = false;
        break;
      default:
        if (ch === "'") this.mode = 'sq';
        else if (ch === '"') this.mode = 'dq';
        else if (ch === '`') this.mode = 'tq';
        else if (this.lastChar === '/' && ch === '/') this.mode = 'lc';
        else if (this.lastChar === '/' && ch === '*') this.mode = 'bc';
        break;
    }
    this.lastChar = ch;
    this.escaped = false;
  }
}

export function balanceScan(source, stack = []) {
  const ctx = new StringContext();
  for (const ch of source) {
    const wasString = ctx.isString();
    const wasComment = ctx.isComment();
    ctx.feed(ch);
    if (wasString || wasComment || ctx.isString() || ctx.isComment()) continue;

    if (ch === '{' || ch === '(') {
      stack.push(ch);
    } else if (ch === '}' || ch === ')') {
      if (stack.length && stack[stack.length - 1] === BALANCE[ch]) stack.pop();
      else stack.push(ch);
    }
  }
  return stack;
}
