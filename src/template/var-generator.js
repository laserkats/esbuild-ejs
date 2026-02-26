export class VarGenerator {
  constructor() { this.counter = 0; }
  next() { return '__' + String.fromCharCode(97 + this.counter++); }
}
