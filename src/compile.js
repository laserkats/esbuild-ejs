#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Template } from './template.js';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: npm run compile <path/to/template.ejs>');
  process.exit(1);
}

const resolved = path.resolve(inputPath);
const source = await fs.readFile(resolved, 'utf8');
const ext = path.extname(resolved);
const base = path.basename(resolved, ext);
const fnName = base.replace(/\.html$/i, '').replace(/[^A-Za-z0-9_$]/g, '_').replace(/^([0-9])/, '_$1') || '_';

const open = ext === '.ejx' ? '[[' : undefined;
const close = ext === '.ejx' ? ']]' : undefined;

const template = new Template(source, { open, close });
const output = template.toModule(fnName);

const outputPath = path.join(path.dirname(resolved), base + '.js');
await fs.writeFile(outputPath, output);
console.log(outputPath);
