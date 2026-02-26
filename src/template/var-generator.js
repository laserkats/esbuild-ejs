export class VarGenerator {
  constructor() {
    this.counter = 0;
    this.createElement = 'createElement';
  }
  next() { return '__' + String.fromCharCode(97 + this.counter++); }
}
