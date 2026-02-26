export class StringNode {
  constructor(value) { this.value = value; }
  toJS() { return JSON.stringify(this.value); }
}
