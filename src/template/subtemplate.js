import { balanceScan } from './balance-scanner.js';
import { StringNode } from './string.js';

export class Subtemplate {
  constructor(opening, modifier = null) {
    this.opening = opening;
    this.modifier = modifier;
    this.children = [];
    this.closing = null;
    this.balanceStack = balanceScan(opening);
  }

  push(...values) { this.children.push(...values); return this; }

  balanced() {
    return this.balanceStack.length === 0;
  }

  updateBalance(code) {
    this.balanceStack = balanceScan(code, [...this.balanceStack]);
  }

  endingBalance() {
    const CLOSE = { '{': '}', '(': ')' };
    return this.balanceStack.map(ch => CLOSE[ch] || ch).reverse().join('');
  }

  // Check if a JsNode is a continuation line (starts with }) like "} else {" or "} catch {"
  _isContinuation(child) {
    return child.modifier === null && child.value && /^\s*[}\)]/.test(child.value);
  }

  // Function/const declarations should use a local accumulator and return it
  _isFuncDecl() {
    return /^\s*(?:function\s+\w|(?:const|let)\s+\w+\s*=)/.test(this.opening);
  }

  toJS(accumulator, varGen) {
    const lines = [];
    let childAcc;
    const isFuncDecl = this._isFuncDecl();
    const funcDecl = !this.modifier && isFuncDecl;

    if (this.modifier && isFuncDecl) {
      // Declaration that opens a block and outputs the declared variable
      // e.g., <%= const table = () => { %>...<% }() %>
      // Wrap arrow functions for valid IIFE syntax: const x = (() => { ... })()
      childAcc = varGen.next();
      const varName = this.opening.match(/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/)[1];
      const isArrow = /=>\s*\{\s*$/.test(this.opening);
      if (isArrow) {
        // const name = () => {  →  const name = (() => {
        lines.push(this.opening.replace(/=\s*(.*=>\s*\{)\s*$/, '= ($1'));
      } else {
        lines.push(this.opening);
      }
      lines.push(`  var ${childAcc} = [];`);
      this._funcDeclOutputVar = varName;
      this._isArrowIIFE = isArrow;
    } else if (this.modifier) {
      childAcc = varGen.next();
      lines.push(`${accumulator}.push(...[].concat(${this.opening}`);
      lines.push(`  var ${childAcc} = [];`);
    } else if (funcDecl) {
      childAcc = varGen.next();
      lines.push(this.opening);
      lines.push(`  var ${childAcc} = [];`);
    } else {
      childAcc = accumulator;
      lines.push(this.opening);
    }

    for (const child of this.children) {
      if (child instanceof Subtemplate) {
        // Subtemplate returns multi-line string; indent each line
        for (const l of child.toJS(childAcc, varGen).split('\n')) {
          lines.push(`  ${l}`);
        }
      } else if (child instanceof StringNode) {
        lines.push(`  ${childAcc}.push(${JSON.stringify(child.value)});`);
      } else if (child.modifier === 'escape' || child.modifier === 'unescape') {
        lines.push(`  ${childAcc}.push(...[].concat(${child.value}));`);
      } else if (child.modifier === 'comment') {
        lines.push(`  // ${child.value}`);
      } else if (child.name !== undefined) {
        // HtmlTag
        const js = child.toJS(varGen);
        if (typeof js === 'object' && js.lines) {
          for (const l of js.lines) {
            lines.push(`  ${l}`);
          }
          lines.push(`  ${childAcc}.push(${js.expr});`);
        } else {
          lines.push(`  ${childAcc}.push(${js});`);
        }
      } else if (this._isContinuation(child)) {
        // Continuation line (} else {, } catch {) — same indent as opening
        lines.push(child.toJS(null));
      } else {
        // plain scriptlet
        const code = child.toJS ? child.toJS(null) : String(child);
        lines.push(`  ${code}`);
      }
    }

    if (this._funcDeclOutputVar) {
      lines.push(`  return ${childAcc}.filter(x => typeof x !== "string" || x.trim());`);
      let closing = this.closing || this.endingBalance();
      if (this._isArrowIIFE) {
        // }() → })()  to close the IIFE wrapping parens
        closing = closing.replace(/^\s*\}/, '})');
      }
      lines.push(`${closing};`);
      lines.push(`${accumulator}.push(...[].concat(${this._funcDeclOutputVar}));`);
    } else if (this.modifier) {
      lines.push(`  return ${childAcc};`);
      lines.push(`${this.closing || this.endingBalance()}).flat());`);
    } else if (funcDecl) {
      lines.push(`  return ${childAcc}.filter(x => typeof x !== "string" || x.trim());`);
      lines.push(this.closing || this.endingBalance());
    } else {
      lines.push(this.closing || this.endingBalance());
    }

    return lines.join('\n');
  }
}
