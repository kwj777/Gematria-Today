import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const readRepoFile = (relativePath) => fs.readFile(new URL(relativePath, import.meta.url), 'utf8');

// `netlify env:pull` writes the live database URL, SendGrid key and Stripe
// keys into .env. Two paths would publish that file, and both are closed here.

test('.gitignore keeps local env files out of the repository', async () => {
  const gitignore = await readRepoFile('../.gitignore');
  const entries = gitignore.split('\n').map((line) => line.trim());

  assert.ok(entries.includes('.env'), '.gitignore must ignore .env');
  assert.ok(entries.includes('.env.*'), '.gitignore must ignore .env.local and friends');
});

test('the build never copies a local env file into the published site', async () => {
  const config = await readRepoFile('../eleventy.config.mjs');

  // Without this the file lands in _site/, and `netlify deploy --dir=_site`
  // serves it at /.env.
  assert.match(config, /isLocalEnvFile/);
  assert.match(config, /name === '\.env' \|\| name\.startsWith\('\.env\.'\)/);
});

test('.nvmrc pins the same Node major the workflow installs', async () => {
  const nvmrc = (await readRepoFile('../.nvmrc')).trim();
  const workflow = await readRepoFile('../.github/workflows/check-page-mirror.yml');
  const [, workflowNode] = workflow.match(/node-version:\s*'?(\d+)'?/) || [];

  assert.match(nvmrc, /^\d+$/, '.nvmrc should pin a bare major version');
  assert.equal(nvmrc, workflowNode, '.nvmrc and CI must agree on the Node major');
});

test('.nvmrc is not published with the site', async () => {
  const config = await readRepoFile('../eleventy.config.mjs');
  assert.match(config, /'\.nvmrc',/);
});
