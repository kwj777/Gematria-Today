import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const INCLUDED_EXTENSIONS = new Set(['.js', '.mjs', '.json', '.md', '.yml', '.yaml', '.toml', '.sql', '.css', '.html']);
// _site is build output; checking it would double-report every source file.
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '_site']);
const EXCLUDED_PATH_PREFIXES = ['assets/vendor/'];

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const absolute = join(dir, entry);
    const rel = relative(ROOT, absolute).split(/[\\/]/).join('/');
    const st = statSync(absolute);
    if (st.isDirectory()) {
      if (EXCLUDED_PATH_PREFIXES.some((prefix) => `${rel}/`.startsWith(prefix))) continue;
      walk(absolute, acc);
      continue;
    }

    if (EXCLUDED_PATH_PREFIXES.some((prefix) => rel.startsWith(prefix))) continue;

    const extension = entry.includes('.') ? entry.slice(entry.lastIndexOf('.')) : '';
    if (INCLUDED_EXTENSIONS.has(extension)) {
      acc.push(absolute);
    }
  }
  return acc;
}

const files = walk(ROOT);
const violations = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);

  if (source.length > 0 && !source.endsWith('\n')) {
    violations.push(`${rel}: missing trailing newline`);
  }

  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/\s+$/.test(line)) {
      violations.push(`${rel}:${i + 1}: trailing whitespace`);
      break;
    }
  }
}

if (violations.length) {
  console.error('Formatting check failed:\n');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(`Formatting check passed for ${files.length} files.`);
