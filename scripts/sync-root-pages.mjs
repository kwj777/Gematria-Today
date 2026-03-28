import { promises as fs } from 'node:fs';
import path from 'node:path';

const mode = process.argv.includes('--check') ? 'check' : 'write';
const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');
const exts = new Set(['.html', '.css', '.js']);

const normalize = (content) => content.replace(/\r\n/g, '\n');

const entries = await fs.readdir(publicDir, { withFileTypes: true });
const candidates = entries
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => exts.has(path.extname(name)))
  .sort();

const mirrored = [];
for (const fileName of candidates) {
  const rootFile = path.join(rootDir, fileName);
  try {
    const stat = await fs.stat(rootFile);
    if (stat.isFile()) {
      mirrored.push(fileName);
    }
  } catch {
    // no mirrored root file
  }
}

if (mirrored.length === 0) {
  console.log('No mirrored root-level page sources found.');
  process.exit(0);
}

const drifted = [];
for (const fileName of mirrored) {
  const publicFile = path.join(publicDir, fileName);
  const rootFile = path.join(rootDir, fileName);

  const [publicContent, rootContent] = await Promise.all([
    fs.readFile(publicFile, 'utf8'),
    fs.readFile(rootFile, 'utf8')
  ]);

  if (normalize(publicContent) !== normalize(rootContent)) {
    drifted.push(fileName);

    if (mode === 'write') {
      await fs.copyFile(publicFile, rootFile);
      console.log(`Synced ${fileName} from public/${fileName}`);
    }
  }
}

if (mode === 'check') {
  if (drifted.length > 0) {
    console.error('Mirrored page sources have drifted from public/:');
    for (const fileName of drifted) {
      console.error(` - ${fileName}`);
    }
    process.exit(1);
  }

  console.log(`All mirrored page sources match public/ (${mirrored.length} files checked).`);
  process.exit(0);
}

if (drifted.length === 0) {
  console.log(`Mirrored page sources already in sync (${mirrored.length} files checked).`);
} else {
  console.log(`Synced ${drifted.length} mirrored file(s).`);
}
