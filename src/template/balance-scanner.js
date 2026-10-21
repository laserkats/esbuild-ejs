const BALANCE = { '}': '{', ')': '(', '{': '}', '(': ')' };

// Minimal bracket balance scanner that skips strings, template literals
// (including `${}` interpolations), regex literals and comments. Replaces the
// character-parser dependency, which throws on unbalanced brackets — exactly
// what EJS produces when splitting JS across <% %> tags.
// Keywords after which a `/` starts a regex literal rather than a division
const REGEX_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'case', 'do', 'else', 'yield', 'await',
]);

// Decide whether a `/` at `i` opens a regex literal, from the preceding
// significant (non-whitespace) token
function startsRegex(source, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(source[j])) j--;
  if (j < 0) return true;
  const prev = source[j];
  if (/[\w$]/.test(prev)) {
    let k = j;
    while (k >= 0 && /[\w$]/.test(source[k])) k--;
    return REGEX_KEYWORDS.has(source.slice(k + 1, j + 1));
  }
  return !(prev === ')' || prev === ']' || prev === '}' || prev === '"' || prev === "'" || prev === '`');
}

// Returns the index just past the regex literal starting at `i`
function skipRegex(source, i) {
  let inClass = false;
  for (let j = i + 1; j < source.length; j++) {
    const ch = source[j];
    if (ch === '\\') j++;
    else if (ch === '\n') return j;
    else if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) return j + 1;
  }
  return source.length;
}

export function balanceScan(source, stack = []) {
  // Bracket-stack depths at each open `${` so the matching `}` can resume the
  // enclosing template literal
  const interpolations = [];
  let inTemplate = false;
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];

    if (inTemplate) {
      if (ch === '\\') i += 2;
      else if (ch === '`') { inTemplate = false; i++; }
      else if (ch === '$' && source[i + 1] === '{') {
        interpolations.push(stack.length);
        inTemplate = false;
        i += 2;
      } else i++;
      continue;
    }

    if (ch === "'" || ch === '"') {
      i++;
      while (i < n && source[i] !== ch) {
        if (source[i] === '\\') i++;
        i++;
      }
      i++;
    } else if (ch === '`') {
      inTemplate = true;
      i++;
    } else if (ch === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i++;
    } else if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
    } else if (ch === '/' && startsRegex(source, i)) {
      i = skipRegex(source, i);
    } else {
      if (ch === '{' || ch === '(') {
        stack.push(ch);
      } else if (ch === '}' && interpolations.length && interpolations[interpolations.length - 1] === stack.length) {
        interpolations.pop();
        inTemplate = true;
      } else if (ch === '}' || ch === ')') {
        if (stack.length && stack[stack.length - 1] === BALANCE[ch]) stack.pop();
        else stack.push(ch);
      }
      i++;
    }
  }
  return stack;
}
