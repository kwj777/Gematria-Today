import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const INCLUDE_EXTENSIONS = new Set(['.js', '.mjs']);
// _site is build output -- scanning it would double-report every source file.
const EXCLUDE_DIRS = new Set(['.git', 'node_modules', '_site']);
const checks = [
  { label: 'eval usage', pattern: /\beval\s*\(/ },
  { label: 'Function constructor usage', pattern: /\bnew\s+Function\s*\(/ }
];

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const absolute = join(dir, entry);
    const st = statSync(absolute);
    if (st.isDirectory()) {
      walk(absolute, acc);
      continue;
    }

    const extension = entry.slice(entry.lastIndexOf('.'));
    if (INCLUDE_EXTENSIONS.has(extension)) {
      acc.push(absolute);
    }
  }
  return acc;
}

const files = walk(ROOT);
const violations = [];

for (const file of files) {
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (syntax.status !== 0) {
    violations.push(`${relative(ROOT, file)}: syntax check failed\n${syntax.stderr.trim()}`);
    continue;
  }

  const source = readFileSync(file, 'utf8');
  for (const check of checks) {
    if (check.pattern.test(source)) {
      violations.push(`${relative(ROOT, file)}: disallowed ${check.label}`);
    }
  }
}

if (violations.length) {
  console.error('Static analysis failed:\n');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(`Static analysis passed for ${files.length} JavaScript files.`);
