import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse } from './parser.js';
import { compile } from './compiler.js';

function toValidIdentifier(name) {
  let id = name.replace(/\.html$/i, '').replace(/[^A-Za-z0-9_$]/g, '_');
  if (/^[0-9]/.test(id) || id.length === 0) id = '_' + id;
  return id;
}

export default function ejsPlugin(options = {}) {
  const { filter = /\.ejs$/i } = options;

  return {
    name: 'ejs-plugin',
    setup(build) {
      build.onLoad({ filter }, async (args) => {
        const source = await fs.readFile(args.path, 'utf8');
        const base = path.basename(args.path, '.ejs');
        const fnName = toValidIdentifier(base);

        const tree = parse(source);
        const contents = compile(tree, fnName);

        return { contents, loader: 'js' };
      });
    },
  };
}
