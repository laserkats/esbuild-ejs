export class JsNode {
  constructor(value, modifier) {
    this.value = value;
    this.modifier = modifier; // 'escape', 'unescape', 'comment', or null (plain scriptlet)
  }

  toJS(accumulator) {
    if (this.modifier === 'comment') {
      return `// ${this.value}`;
    }

    if (this.modifier === 'escape' || this.modifier === 'unescape') {
      if (accumulator) {
        return `${accumulator}.push(${this.value});`;
      }
      return this.value;
    }

    // Plain scriptlet
    return this.value;
  }
}
