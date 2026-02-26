import { describe, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import ejsPlugin from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('esbuild integration', () => {
  test('compiles .ejs file through esbuild', async () => {
    const result = await esbuild.build({
      entryPoints: [path.join(__dirname, 'fixtures/simple.html.ejs')],
      bundle: false,
      write: false,
      plugins: [ejsPlugin()],
    });

    const output = result.outputFiles[0].text;
    assert.ok(output.includes('createElement'));
    assert.ok(output.includes('Hello World'));
  });

  test('compiles .ejs file with custom delimiters', async () => {
    const result = await esbuild.build({
      entryPoints: [path.join(__dirname, 'fixtures/custom_delimiters.html.ejs')],
      bundle: false,
      write: false,
      plugins: [ejsPlugin({ open: '[[', close: ']]' })],
    });

    const output = result.outputFiles[0].text;
    assert.ok(output.includes('createElement'));
    assert.ok(output.includes('Hello World'));
    assert.ok(!output.includes('[['));
  });

  test('uses filename as function name', async () => {
    const result = await esbuild.build({
      entryPoints: [path.join(__dirname, 'fixtures/simple.html.ejs')],
      bundle: false,
      write: false,
      plugins: [ejsPlugin()],
    });

    const output = result.outputFiles[0].text;
    assert.ok(output.includes('function simple'));
  });
});
