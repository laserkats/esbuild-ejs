export function compile(results, functionName = 'template') {

  function compileNode(node) {
    if (node.type === 'text') {
      if (!node.value.trim()) return null;
      return JSON.stringify(node.value.trim());
    }

    if (node.type === 'expression') {
      if (node.modifier === 'comment') return null;
      return node.value;
    }

    if (node.type === 'tag') {
      const attrParts = [];

      for (const [key, val] of Object.entries(node.attrs)) {
        if (val === true) {
          attrParts.push(`${JSON.stringify(key)}: true`);
        } else {
          attrParts.push(`${JSON.stringify(key)}: ${JSON.stringify(val)}`);
        }
      }

      const compiledChildren = node.children
        .map(compileNode)
        .filter(c => c !== null);

      if (compiledChildren.length === 1) {
        attrParts.push(`content: ${compiledChildren[0]}`);
      } else if (compiledChildren.length > 1) {
        attrParts.push(`content: [${compiledChildren.join(', ')}]`);
      }

      if (attrParts.length > 0) {
        return `createElement(${JSON.stringify(node.name)}, {${attrParts.join(', ')}})`;
      }
      return `createElement(${JSON.stringify(node.name)})`;
    }

    return null;
  }

  const rootChildren = results
    .map(compileNode)
    .filter(c => c !== null);

  let body;
  if (rootChildren.length > 0) {
    body = `return [${rootChildren.join(', ')}];`;
  } else {
    body = 'return [];';
  }

  return [
    `import { createElement } from 'dolla';`,
    ``,
    `export default function ${functionName}(locals) {`,
    `  ${body}`,
    `}`,
    ``
  ].join('\n');
}
