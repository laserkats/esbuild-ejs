export class VarGenerator {
  constructor() {
    this.counter = 0;
    this.createElement = 'createElement';
  }
  // Names run __a..__z, then __aa, __ab, ... (bijective base-26).
  next() {
    let n = this.counter++ + 1;
    let name = '';
    while (n > 0) {
      n--;
      name = String.fromCharCode(97 + (n % 26)) + name;
      n = Math.floor(n / 26);
    }
    return '__' + name;
  }
}
