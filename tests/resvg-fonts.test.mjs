import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

import { FONT_DIRECTORY, buildResvgFontOptions, resolveFontFiles } from '../netlify/functions/_fonts.mjs';

const FUNCTIONS_DIRECTORY = 'netlify/functions';

// Count lit pixels: the test SVGs draw white text on a black ground.
function inkFor(svg, font) {
  const { pixels } = new Resvg(svg, { font }).render();
  let lit = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] > 128) lit += 1;
  }
  return lit;
}

function textSvg(fontFamily, weight = 400) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="80"><rect width="420" height="80" fill="#000"/><text x="10" y="56" fill="#fff" font-size="40" font-family="${fontFamily}" font-weight="${weight}">GEMATRIA 666</text></svg>`;
}

function resvgFunctionNames() {
  return readdirSync(FUNCTIONS_DIRECTORY)
    .filter((entry) => entry.endsWith('.mjs') && !entry.startsWith('_'))
    .filter((entry) => readFileSync(join(FUNCTIONS_DIRECTORY, entry), 'utf8').includes('new Resvg('))
    .map((entry) => entry.replace(/\.mjs$/, ''));
}

function includedFilesFor(functionName) {
  const toml = readFileSync('netlify.toml', 'utf8');
  const block = toml.split(/\n(?=\[)/).find((section) => section.startsWith(`[functions."${functionName}"]`));
  const match = block?.match(/included_files\s*=\s*(\[[^\]]*\])/);
  return match ? JSON.parse(match[1]) : [];
}

// included_files globs here are all "<directory>/*.<ext>".
function expandGlob(glob) {
  const slash = glob.lastIndexOf('/');
  const directory = glob.slice(0, slash);
  const pattern = new RegExp(`^${glob.slice(slash + 1).replace(/[.]/g, '\\.').replace(/\*/g, '[^/]*')}$`);
  try {
    return readdirSync(directory).filter((entry) => pattern.test(entry)).map((entry) => `${directory}/${entry}`);
  } catch {
    return [];
  }
}

test('the bundled faces are TTF cuts of Fraunces and Inter', () => {
  const names = resolveFontFiles().map((file) => file.split('/').pop());
  assert.ok(names.length > 0, `no TTF/OTF in ${FONT_DIRECTORY}; resvg cannot read the woff2 files`);
  assert.ok(names.some((name) => name.startsWith('fraunces-')), names.join(', '));
  assert.ok(names.some((name) => name.startsWith('inter-')), names.join(', '));
});

test('with no fonts at all resvg drops text -- the state of every Lambda render', () => {
  // The control for the next test: this is what production looked like.
  assert.equal(inkFor(textSvg('Arial, Helvetica, sans-serif'), { loadSystemFonts: false }), 0);
});

test('the bundled faces render text without any system font', () => {
  const font = buildResvgFontOptions();
  assert.equal(font.loadSystemFonts, false, 'output must not depend on the host fonts');
  for (const family of ['Inter', 'Fraunces', 'Arial, Helvetica, sans-serif', 'Georgia, serif', 'NoSuchFace']) {
    assert.ok(inkFor(textSvg(family, 700), font) > 0, `${family} rendered no text`);
  }
});

test('buildResvgFontOptions falls back to system fonts only when nothing is bundled', () => {
  assert.deepEqual(buildResvgFontOptions([]), { loadSystemFonts: true });
});

test('every resvg endpoint loads the bundled fonts', () => {
  const names = resvgFunctionNames();
  assert.ok(names.includes('name-chart-image'));
  assert.ok(names.includes('ai-agent-share-image'));
  for (const name of names) {
    const source = readFileSync(join(FUNCTIONS_DIRECTORY, `${name}.mjs`), 'utf8');
    assert.ok(source.includes('buildResvgFontOptions('), `${name} renders without the bundled fonts`);
  }
});

test('netlify.toml ships the bundled fonts with every resvg endpoint', () => {
  // A glob that matches nothing is silently ignored at deploy time -- the old
  // "assets/fonts/*.ttf" rule matched no file for as long as only woff2 existed.
  const bundled = resolveFontFiles().map((file) => relative(process.cwd(), file).split('\\').join('/'));
  for (const name of resvgFunctionNames()) {
    const shipped = new Set(includedFilesFor(name).flatMap(expandGlob));
    for (const file of bundled) {
      assert.ok(shipped.has(file), `${name}: included_files does not ship ${file}`);
    }
  }
});
