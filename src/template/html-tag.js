import { StringNode } from './string.js';
import { Subtemplate } from './subtemplate.js';

export class HtmlTag {
  constructor(name) {
    this.name = name;
    this.attrs = {};
    this.children = [];
  }

  push(...values) { this.children.push(...values); return this; }

  hasBlocks() {
    return this.children.some(c => c instanceof Subtemplate);
  }

  toJS(varGen) {
    const attrParts = [];

    for (const [key, val] of Object.entries(this.attrs)) {
      if (val === true) {
        attrParts.push(`${JSON.stringify(key)}: true`);
      } else if (Array.isArray(val)) {
        const expr = val.map(part => {
          if (typeof part === 'string') return JSON.stringify(part);
          return `(${part.value})`;
        }).join(' + ');
        attrParts.push(`${JSON.stringify(key)}: ${expr}`);
      } else {
        attrParts.push(`${JSON.stringify(key)}: ${JSON.stringify(val)}`);
      }
    }

    if (this.children.length === 0) {
      if (attrParts.length > 0) {
        return `${varGen.createElement}(${JSON.stringify(this.name)}, {${attrParts.join(', ')}})`;
      }
      return `${varGen.createElement}(${JSON.stringify(this.name)})`;
    }

    if (this.hasBlocks()) {
      // Accumulator mode: declare var, push children, use array as content
      const acc = varGen.next();
      const lines = [];
      lines.push(`var ${acc} = [];`);
      for (const child of this.children) {
        if (child instanceof Subtemplate) {
          // Subtemplate.toJS returns a multi-line string; push each line separately
          for (const l of child.toJS(acc, varGen).split('\n')) {
            lines.push(l);
          }
        } else if (child instanceof StringNode) {
          lines.push(`${acc}.push(${JSON.stringify(child.value)});`);
        } else {
          // JsNode or HtmlTag
          const js = child.toJS ? child.toJS(varGen) : String(child);
          if (child.modifier === 'escape' || child.modifier === 'unescape') {
            lines.push(`${acc}.push(${child.value});`);
          } else if (child.modifier === 'comment') {
            lines.push(`// ${child.value}`);
          } else if (child.name) {
            // HtmlTag
            lines.push(`${acc}.push(${js});`);
          } else {
            // plain scriptlet
            lines.push(js);
          }
        }
      }
      attrParts.push(`content: ${acc}`);
      const createExpr = `${varGen.createElement}(${JSON.stringify(this.name)}, {${attrParts.join(', ')}})`;
      return { lines, expr: createExpr };
    }

    // Inline mode: no blocks
    const compiledChildren = [];
    for (const child of this.children) {
      if (child instanceof StringNode) {
        compiledChildren.push(JSON.stringify(child.value));
      } else if (child.toJS) {
        if (child.modifier === 'comment') continue;
        if (child.name !== undefined) {
          // HtmlTag
          compiledChildren.push(child.toJS(varGen));
        } else {
          // JsNode - inline
          compiledChildren.push(child.toJS(null));
        }
      }
    }

    if (compiledChildren.length === 1) {
      attrParts.push(`content: ${compiledChildren[0]}`);
    } else if (compiledChildren.length > 1) {
      attrParts.push(`content: [${compiledChildren.join(', ')}]`);
    }

    if (attrParts.length > 0) {
      return `${varGen.createElement}(${JSON.stringify(this.name)}, {${attrParts.join(', ')}})`;
    }
    return `${varGen.createElement}(${JSON.stringify(this.name)})`;
  }
}
