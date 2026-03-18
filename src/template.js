import globals from 'globals';
import { StringNode } from './template/string.js';
import { JsNode } from './template/js.js';
import { HtmlTag } from './template/html-tag.js';
import { Subtemplate } from './template/subtemplate.js';
import { VarGenerator } from './template/var-generator.js';
import { balanceScan } from './template/balance-scanner.js';

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

const JS_KEYWORDS = new Set([
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'return',
  'function', 'class', 'new', 'delete', 'typeof', 'instanceof', 'in', 'of',
  'let', 'const', 'var', 'this', 'super', 'void', 'throw', 'try', 'catch', 'finally',
  'with', 'yield', 'await', 'async', 'import', 'export', 'default', 'from',
]);

const JS_BUILTINS = new Set([
  // All ES language builtins (Array, Object, Promise, Math, JSON, etc.)
  ...Object.keys(globals.es2025),
  // All uppercase browser globals (constructors, classes, namespaces)
  ...Object.keys(globals.browser).filter(k => /^[A-Z]/.test(k)),
  // Curated lowercase browser globals that are clearly APIs, not variable names
  'console', 'fetch', 'alert', 'confirm', 'prompt',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame',
  'requestIdleCallback', 'cancelIdleCallback',
  'queueMicrotask', 'structuredClone', 'reportError',
  'atob', 'btoa', 'createImageBitmap',
  'addEventListener', 'removeEventListener', 'dispatchEvent',
  'getComputedStyle', 'getSelection', 'matchMedia',
  'globalThis', 'window', 'document', 'navigator', 'localStorage', 'sessionStorage',
  'indexedDB', 'crypto', 'performance', 'caches',
]);

export class Template {
  constructor(source, { open = '<%', close = '%>' } = {}) {
    this.source = source;
    this.pos = 0;
    this.openTag = open;
    this.closeTag = close;
    this.declaredIdentifiers = new Set();
    this.usedIdentifiers = new Set();
    this.imports = [];
    this.parse();
  }

  // Scanner methods
  eos() { return this.pos >= this.source.length; }

  peek(n = 1) { return this.source.slice(this.pos, this.pos + n); }

  advance(n = 1) {
    const chunk = this.source.slice(this.pos, this.pos + n);
    this.pos += n;
    return chunk;
  }

  match(str) { return this.source.startsWith(str, this.pos); }

  scanUntil(regex) {
    const rest = this.source.slice(this.pos);
    const m = rest.match(regex);
    if (!m) {
      this.pos = this.source.length;
      return { preMatch: rest, match: null };
    }
    const preMatch = rest.slice(0, m.index);
    this.pos += m.index + m[0].length;
    return { preMatch, match: m[0] };
  }

  skipWhitespace() {
    while (this.pos < this.source.length && /\s/.test(this.source[this.pos])) {
      this.pos++;
    }
  }

  // Identifier tracking
  extractIdentifiers(expr) {
    // Strip string literals
    let cleaned = expr
      .replace(/'[^']*'/g, '""')
      .replace(/"[^"]*"/g, '""')
      .replace(/`[^`]*`/g, '""');

    // Collect locally-scoped identifiers (function/arrow params, local declarations)
    const scoped = new Set();

    // Arrow function params: (a, b, ...c) => (use [^()] to avoid matching outer parens)
    let m;
    const arrowParenRe = /\(([^()]*)\)\s*=>/g;
    while ((m = arrowParenRe.exec(cleaned)) !== null) {
      this._extractParamNames(m[1], scoped);
    }

    // Single arrow param: x =>
    const arrowSingleRe = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/g;
    while ((m = arrowSingleRe.exec(cleaned)) !== null) {
      scoped.add(m[1]);
    }

    // Function params: function name(...) or function(...)
    const funcParamRe = /function\s*[a-zA-Z_$]?[a-zA-Z0-9_$]*\s*\(([^()]*)\)/g;
    while ((m = funcParamRe.exec(cleaned)) !== null) {
      this._extractParamNames(m[1], scoped);
    }

    // Catch params: catch(e)
    const catchRe = /catch\s*\(([^()]*)\)/g;
    while ((m = catchRe.exec(cleaned)) !== null) {
      this._extractParamNames(m[1], scoped);
    }

    // Local var/let/const declarations
    const varRe = /\b(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    while ((m = varRe.exec(cleaned)) !== null) {
      scoped.add(m[1]);
    }

    // Strip object key positions: { key: or , key: (but not ternary ? :)
    cleaned = cleaned.replace(/([{,])\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1 :');

    const re = /(?<!\.)(?<![a-zA-Z0-9_$])\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
    const ids = new Set();
    while ((m = re.exec(cleaned)) !== null) {
      if (!JS_KEYWORDS.has(m[1]) && !scoped.has(m[1])) {
        ids.add(m[1]);
      }
    }
    return ids;
  }

  _extractParamNames(paramStr, scoped) {
    for (let part of paramStr.split(',')) {
      part = part.trim();
      if (part.startsWith('...')) part = part.slice(3).trim();
      const nameMatch = part.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
      if (nameMatch) scoped.add(nameMatch[1]);
    }
  }

  // When a block opens (arrow/function with {), declare its params so child
  // expressions don't treat them as free variables.
  _declareBlockParams(code) {
    const scoped = new Set();
    let m;

    // Arrow paren params: (a, b) => {
    const arrowParenRe = /\(([^()]*)\)\s*=>/g;
    while ((m = arrowParenRe.exec(code)) !== null) {
      this._extractParamNames(m[1], scoped);
    }

    // Single arrow param: x => {
    const arrowSingleRe = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/g;
    while ((m = arrowSingleRe.exec(code)) !== null) {
      scoped.add(m[1]);
    }

    // Function params: function name(a, b) {
    const funcRe = /function\s*[a-zA-Z_$]?[a-zA-Z0-9_$]*\s*\(([^()]*)\)/g;
    while ((m = funcRe.exec(code)) !== null) {
      this._extractParamNames(m[1], scoped);
    }

    for (const id of scoped) {
      this.declaredIdentifiers.add(id);
    }
  }

  trackIdentifiers(code, modifier) {
    if (modifier === 'comment') return;

    for (const id of this.extractIdentifiers(code)) {
      this.usedIdentifiers.add(id);
    }

    // Track declarations: function name, class name, var/let/const names
    const funcMatch = code.match(/^\s*function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (funcMatch) this.declaredIdentifiers.add(funcMatch[1]);

    const classMatch = code.match(/^\s*class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (classMatch) this.declaredIdentifiers.add(classMatch[1]);

    for (const varMatch of code.matchAll(/(?:^|;|\n)\s*(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g)) {
      this.declaredIdentifiers.add(varMatch[1]);
    }

    const catchMatch = code.match(/catch\s*\(([a-zA-Z_$][a-zA-Z0-9_$]*)\)/);
    if (catchMatch) this.declaredIdentifiers.add(catchMatch[1]);
  }

  // Main parse
  parse() {
    this.tree = [[]];
    this.stack = ['str'];

    while (!this.eos()) {
      const state = this.stack[this.stack.length - 1];
      switch (state) {
        case 'str': this.parseStr(); break;
        case 'js': this.parseJs(); break;
        case 'html_tag': this.parseHtmlTag(); break;
        case 'html_close_tag': this.parseHtmlCloseTag(); break;
        case 'html_tag_attr_key': this.parseHtmlTagAttrKey(); break;
        case 'html_tag_attr_value': this.parseHtmlTagAttrValue(); break;
        case 'html_comment': this.parseHtmlComment(); break;
        default:
          throw new Error(`Unknown parser state: ${state}`);
      }
    }
  }

  currentNode() {
    return this.tree[this.tree.length - 1];
  }

  pushToTree(node) {
    this.currentNode().push(node);
  }

  parseStr() {
    if (this.match(this.openTag)) {
      this.advance(this.openTag.length);
      this.stack.push('js');
      return;
    }

    if (this.match('<!--')) {
      this.advance(4);
      this.stack.push('html_comment');
      return;
    }

    if (this.match('</')) {
      // Close tag - don't consume, let html_close_tag handle it
      this.stack.push('html_close_tag');
      return;
    }

    if (this.match('<')) {
      this.advance(1);
      this.stack.push('html_tag');
      return;
    }

    // Scan text until next interesting token
    let text = '';
    while (!this.eos() && !this.match('<') && !this.match(this.openTag)) {
      text += this.advance();
    }
    if (text) {
      this.pushToTree(new StringNode(text));
    }
  }

  parseJs() {
    // Read modifier
    let modifier = null;
    if (this.match('=')) { modifier = 'escape'; this.advance(); }
    else if (this.match('-')) { modifier = 'unescape'; this.advance(); }
    else if (this.match('#')) { modifier = 'comment'; this.advance(); }

    // Scan until close tag
    let code = '';
    while (!this.eos() && !this.match(this.closeTag)) {
      code += this.advance();
    }
    if (this.match(this.closeTag)) {
      this.advance(this.closeTag.length);
    }
    // Eat trailing newline after close tag (standard EJS newline slurp)
    if (this.match('\r\n')) this.advance(2);
    else if (this.match('\n')) this.advance();
    this.stack.pop(); // pop 'js'

    code = code.trim();
    if (!code) return;

    // Detect import statements — hoist to module level
    if (!modifier && /^\s*import\s/.test(code)) {
      this.imports.push(code.endsWith(';') ? code : code + ';');
      // Track imported names as declared so they're not free variables
      const namedMatch = code.match(/import\s+\{([^}]+)\}\s+from/);
      if (namedMatch) {
        for (const name of namedMatch[1].split(',')) {
          this.declaredIdentifiers.add(name.trim());
        }
      }
      const defaultMatch = code.match(/^import\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from/);
      if (defaultMatch) {
        this.declaredIdentifiers.add(defaultMatch[1]);
      }
      return;
    }

    // Strip trailing semicolons from output expressions (like ejx does)
    if ((modifier === 'escape' || modifier === 'unescape') && /;\s*$/.test(code)) {
      code = code.replace(/;\s*$/, '');
    }

    // Detect `<%= const/let/var name = expr %>` — split into declaration + output
    if (modifier === 'escape' || modifier === 'unescape') {
      const declMatch = code.match(/^((?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*.+)$/s);
      if (declMatch) {
        const declNode = new JsNode(declMatch[1], null);
        this.pushToTree(declNode);
        this.trackIdentifiers(declMatch[1], null);
        const outputNode = new JsNode(declMatch[2], modifier);
        this.pushToTree(outputNode);
        this.trackIdentifiers(declMatch[2], modifier);
        return;
      }
    }

    // Check if current tree top is a Subtemplate and this code closes it
    const treeCurrent = this.currentNode();
    if (treeCurrent instanceof Subtemplate && !modifier) {
      // Update balance with this code
      const testStack = balanceScan(code, [...treeCurrent.balanceStack]);
      if (testStack.length === 0) {
        // This closes the subtemplate - store the actual closing code
        treeCurrent.closing = code;
        this.trackIdentifiers(code, modifier);
        this.tree.pop();
        return;
      }

      // Check if code has unmatched close brackets (} or )) in standalone context.
      // This indicates a continuation pattern like "} else {" or "} catch(e) {"
      // that transitions within the current block rather than opening a new one.
      const standaloneBalance = balanceScan(code);
      const hasUnmatchedClose = standaloneBalance.some(ch => ch === '}' || ch === ')');
      if (hasUnmatchedClose) {
        treeCurrent.updateBalance(code);
        const node = new JsNode(code, modifier);
        this.pushToTree(node);
        this.trackIdentifiers(code, modifier);
        return;
      }
    }

    // Check if this expression opens a new block (ends with {)
    if (modifier !== 'comment') {
      const balance = balanceScan(code);
      const hasOpenBrace = balance.some(ch => ch === '{');
      if (hasOpenBrace) {
        // Open a Subtemplate
        const sub = new Subtemplate(code, modifier);
        this.pushToTree(sub);
        this.tree.push(sub);
        this.trackIdentifiers(code, modifier);
        // Declare block params (arrow/function params) so they're not free variables
        this._declareBlockParams(code);
        return;
      }
    }

    // Regular JS node
    const node = new JsNode(code, modifier);
    this.pushToTree(node);
    this.trackIdentifiers(code, modifier);
  }

  parseHtmlTag() {
    // Read tag name
    let name = '';
    while (!this.eos() && /[a-zA-Z0-9\-]/.test(this.source[this.pos])) {
      name += this.advance();
    }

    const tag = new HtmlTag(name);
    this.pushToTree(tag);

    // Transition to attribute parsing
    this._currentTag = tag;
    this.stack.pop(); // pop 'html_tag'
    this.stack.push('html_tag_attr_key');
  }

  parseHtmlTagAttrKey() {
    this.skipWhitespace();

    if (this.match('/>')) {
      this.advance(2);
      this.stack.pop();
      this._currentTag = null;
      return;
    }

    if (this.match('>')) {
      this.advance();
      this.stack.pop();

      const tag = this._currentTag;
      this._currentTag = null;

      if (VOID_ELEMENTS.has(tag.name.toLowerCase())) {
        return;
      }

      // Push tag onto tree stack and continue parsing children
      this.tree.push(tag);
      return;
    }

    // Read attribute key
    let key = '';
    while (!this.eos() && /[a-zA-Z0-9\-]/.test(this.source[this.pos])) {
      key += this.advance();
    }

    if (!key) {
      this.stack.pop();
      return;
    }

    this.skipWhitespace();
    if (this.match('=')) {
      this.advance();
      this.skipWhitespace();
      this._currentAttrKey = key;
      this.stack.pop();
      this.stack.push('html_tag_attr_value');
    } else {
      this._currentTag.attrs[key] = true;
      // Stay in attr_key state to read more attributes
    }
  }

  parseHtmlTagAttrValue() {
    let value;

    if (this.match('"') || this.match("'")) {
      const quote = this.advance();
      const parts = [];
      let current = '';

      while (!this.eos() && !this.match(quote)) {
        if (this.match(this.openTag)) {
          if (current) parts.push(current);
          current = '';

          this.advance(this.openTag.length);
          let modifier = null;
          if (this.match('=')) { modifier = 'escape'; this.advance(); }
          else if (this.match('-')) { modifier = 'unescape'; this.advance(); }
          else if (this.match('#')) { modifier = 'comment'; this.advance(); }

          let code = '';
          while (!this.eos() && !this.match(this.closeTag)) {
            code += this.advance();
          }
          if (this.match(this.closeTag)) this.advance(this.closeTag.length);

          code = code.trim();
          if (code && modifier !== 'comment') {
            if ((modifier === 'escape' || modifier === 'unescape') && /;\s*$/.test(code)) {
              code = code.replace(/;\s*$/, '');
            }
            const node = new JsNode(code, modifier || 'escape');
            parts.push(node);
            this.trackIdentifiers(code, modifier);
          }
        } else {
          current += this.advance();
        }
      }
      if (this.match(quote)) this.advance();

      if (parts.length === 0) {
        value = current;
      } else {
        if (current) parts.push(current);
        value = parts;
      }
    } else {
      value = '';
      while (!this.eos() && !/[\s>\/]/.test(this.source[this.pos])) {
        value += this.advance();
      }
    }

    this._currentTag.attrs[this._currentAttrKey] = value;
    this._currentAttrKey = null;
    this.stack.pop();
    this.stack.push('html_tag_attr_key');
  }

  parseHtmlCloseTag() {
    this.advance(2); // </
    let name = '';
    while (!this.eos() && /[a-zA-Z0-9\-]/.test(this.source[this.pos])) {
      name += this.advance();
    }
    this.skipWhitespace();
    if (this.match('>')) this.advance();

    // Pop the tree back to find the matching open tag
    while (this.tree.length > 1) {
      const top = this.tree[this.tree.length - 1];
      if (top instanceof HtmlTag && top.name === name) {
        this.tree.pop();
        break;
      }
      this.tree.pop();
    }

    this.stack.pop(); // pop 'html_close_tag'
  }

  parseHtmlComment() {
    let comment = '';
    while (!this.eos()) {
      if (this.match('-->')) {
        this.advance(3);
        break;
      }
      comment += this.advance();
    }
    this.stack.pop();
  }

  // Code generation
  freeVariables() {
    const free = new Set();
    for (const id of this.usedIdentifiers) {
      if (!this.declaredIdentifiers.has(id) &&
          !JS_KEYWORDS.has(id) &&
          !JS_BUILTINS.has(id)) {
        free.add(id);
      }
    }
    // Remove generated internal variables (__output, __promises, etc)
    free.delete('__output');
    free.delete('__promises');
    free.delete('__createElement');
    return free;
  }

  _createElementName() {
    const hasDollaImport = this.imports.some(imp => /dolla\/createElement/.test(imp));
    if (hasDollaImport) return 'createElement';
    const hasConflict = this.imports.some(imp => /\bcreateElement\b/.test(imp));
    return hasConflict ? '__createElement' : 'createElement';
  }

  _buildImportLines(createElementName) {
    const hasDollaImport = this.imports.some(imp => /dolla\/createElement/.test(imp));
    const lines = [];
    if (!hasDollaImport) {
      lines.push(`import ${createElementName} from 'dolla/createElement';`);
    }
    for (const imp of this.imports) {
      lines.push(imp);
    }
    return lines;
  }

  toModule(functionName = 'template') {
    const varGen = new VarGenerator();
    varGen.createElement = this._createElementName();
    const children = this.tree[0];

    // Check if we have any block constructs at root level
    const hasRootBlocks = children.some(c => c instanceof Subtemplate);

    if (hasRootBlocks) {
      return this._toModuleWithBlocks(children, functionName, varGen);
    }

    return this._toModuleInline(children, functionName, varGen);
  }

  _toModuleInline(children, functionName, varGen) {
    const compiledChildren = [];

    for (const child of children) {
      if (child instanceof StringNode) {
        if (child.value.trim()) compiledChildren.push(JSON.stringify(child.value));
      } else if (child instanceof JsNode) {
        if (child.modifier === 'comment') continue;
        if (child.modifier === null) {
          // Plain scriptlet at root - still include as statement
          compiledChildren.push(child);
        } else {
          compiledChildren.push(child.toJS(null));
        }
      } else if (child instanceof HtmlTag) {
        const js = child.toJS(varGen);
        if (typeof js === 'object' && js.lines) {
          // Tag with blocks - need accumulator mode at root
          return this._toModuleWithAccumulatorTag(children, functionName, varGen);
        }
        compiledChildren.push(js);
      }
    }

    // Separate scriptlets from return values
    const statements = [];
    const returnValues = [];
    for (const c of compiledChildren) {
      if (c instanceof JsNode) {
        statements.push(c.toJS(null));
      } else {
        returnValues.push(c);
      }
    }

    const free = this.freeVariables();
    const params = free.size > 0 ? `{${[...free].join(', ')}}` : '';

    const lines = [...this._buildImportLines(varGen.createElement), ''];
    lines.push(`export default function ${functionName}(${params}) {`);

    for (const s of statements) {
      lines.push(`  ${s}`);
    }

    if (returnValues.length > 0) {
      lines.push(`  return [${returnValues.join(', ')}];`);
    } else {
      lines.push('  return [];');
    }

    lines.push('}', '');
    return lines.join('\n');
  }

  _toModuleWithAccumulatorTag(children, functionName, varGen) {
    // Re-do with fresh varGen since we need accumulator mode
    const freshVarGen = new VarGenerator();
    const free = this.freeVariables();
    const params = free.size > 0 ? `{${[...free].join(', ')}}` : '';

    const lines = [...this._buildImportLines(varGen.createElement), ''];
    lines.push(`export default function ${functionName}(${params}) {`);

    const returnValues = [];
    const bodyLines = [];

    for (const child of children) {
      if (child instanceof StringNode) {
        if (child.value.trim()) returnValues.push(JSON.stringify(child.value));
      } else if (child instanceof JsNode) {
        if (child.modifier === 'comment') continue;
        if (child.modifier === null) {
          bodyLines.push(`  ${child.toJS(null)}`);
        } else {
          returnValues.push(child.toJS(null));
        }
      } else if (child instanceof HtmlTag) {
        const js = child.toJS(freshVarGen);
        if (typeof js === 'object' && js.lines) {
          for (const l of js.lines) {
            for (const line of l.split('\n')) {
              bodyLines.push(`  ${line}`);
            }
          }
          returnValues.push(js.expr);
        } else {
          returnValues.push(js);
        }
      }
    }

    for (const l of bodyLines) {
      lines.push(l);
    }

    if (returnValues.length > 0) {
      lines.push(`  return [${returnValues.join(', ')}];`);
    } else {
      lines.push('  return [];');
    }

    lines.push('}', '');
    return lines.join('\n');
  }

  _toModuleWithBlocks(children, functionName, varGen) {
    const free = this.freeVariables();
    const params = free.size > 0 ? `{${[...free].join(', ')}}` : '';

    const lines = [...this._buildImportLines(varGen.createElement), ''];
    lines.push(`export default function ${functionName}(${params}) {`);
    lines.push('  var __output = [];');

    for (const child of children) {
      if (child instanceof StringNode) {
        if (child.value.trim()) {
          lines.push(`  __output.push(${JSON.stringify(child.value)});`);
        }
      } else if (child instanceof Subtemplate) {
        const js = child.toJS('__output', varGen);
        for (const l of js.split('\n')) {
          lines.push(`  ${l}`);
        }
      } else if (child instanceof JsNode) {
        if (child.modifier === 'comment') {
          lines.push(`  // ${child.value}`);
        } else if (child.modifier === 'escape' || child.modifier === 'unescape') {
          lines.push(`  __output.push(...[].concat(${child.value}));`);
        } else {
          lines.push(`  ${child.value}`);
        }
      } else if (child instanceof HtmlTag) {
        const js = child.toJS(varGen);
        if (typeof js === 'object' && js.lines) {
          for (const l of js.lines) {
            lines.push(`  ${l}`);
          }
          lines.push(`  __output.push(${js.expr});`);
        } else {
          lines.push(`  __output.push(${js});`);
        }
      }
    }

    lines.push('  return __output.filter(x => typeof x !== "string" || x.trim());');
    lines.push('}', '');
    return lines.join('\n');
  }
}
