import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The two github-script steps of .github/workflows/delete-merged-branches.yml,
// run against a fake GitHub API. A branch name is reused across sessions here,
// so the scripts must delete only a branch whose tip is a merged PR's head and
// never a same-named branch belonging to a fork PR.
const WORKFLOW = readFileSync(new URL('../.github/workflows/delete-merged-branches.yml', import.meta.url), 'utf8');

function extractScripts(source) {
  const lines = source.split('\n');
  const scripts = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)script: \|\s*$/.exec(lines[index]);
    if (!match) continue;
    const body = [];
    let indent = null;
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.trim() === '') {
        body.push('');
        continue;
      }
      const lineIndent = line.length - line.trimStart().length;
      if (lineIndent <= match[1].length) {
        index -= 1;
        break;
      }
      indent ??= lineIndent;
      body.push(line.slice(indent));
    }
    scripts.push(body.join('\n'));
  }
  return scripts;
}

const [PER_PR_SCRIPT, BULK_SCRIPT] = extractScripts(WORKFLOW);
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

function createGithub({ refs = {}, openPRs = [], closedPRs = [] } = {}) {
  const deleted = [];
  const branchSha = new Map(Object.entries(refs));
  const github = {
    rest: {
      git: {
        getRef: async ({ ref }) => {
          const branch = ref.replace(/^heads\//, '');
          if (!branchSha.has(branch)) {
            throw Object.assign(new Error('Not Found'), { status: 404 });
          }
          return { data: { object: { sha: branchSha.get(branch) } } };
        },
        deleteRef: async ({ ref }) => {
          deleted.push(ref.replace(/^heads\//, ''));
        },
      },
      pulls: { list: Symbol('pulls.list') },
    },
    paginate: async (method, params) => {
      assert.equal(method, github.rest.pulls.list);
      return params.state === 'open' ? openPRs : closedPRs;
    },
  };
  return { github, deleted };
}

function pr({ ref, sha, repo = 'kwj777/Gematria-Today', merged = true, base = 'main' }) {
  return {
    merged_at: merged ? '2026-10-01T00:00:00Z' : null,
    head: { ref, sha, repo: repo ? { full_name: repo } : null },
    base: { ref: base },
  };
}

const CONTEXT_REPO = { owner: 'kwj777', repo: 'Gematria-Today' };

async function runPerPr(pullRequest, githubState) {
  const { github, deleted } = createGithub(githubState);
  const context = { repo: CONTEXT_REPO, payload: { pull_request: pullRequest } };
  const quietConsole = { log() {} };
  await new AsyncFunction('github', 'context', 'console', PER_PR_SCRIPT)(github, context, quietConsole);
  return deleted;
}

async function runBulk(githubState) {
  const { github, deleted } = createGithub(githubState);
  const context = { repo: CONTEXT_REPO, ref: 'refs/heads/main' };
  const quietConsole = { log() {} };
  await new AsyncFunction('github', 'context', 'console', BULK_SCRIPT)(github, context, quietConsole);
  return deleted;
}

test('the workflow has the per-PR and the bulk cleanup scripts', () => {
  assert.ok(PER_PR_SCRIPT.includes('context.payload.pull_request'));
  assert.ok(BULK_SCRIPT.includes("state: 'closed'"));
});

test('per-PR: deletes the merged branch when its tip is still the merged head', async () => {
  const deleted = await runPerPr(pr({ ref: 'claude/feature', sha: 'aaa' }), { refs: { 'claude/feature': 'aaa' } });
  assert.deepEqual(deleted, ['claude/feature']);
});

test('per-PR: keeps a branch that gained commits after the merged head', async () => {
  const deleted = await runPerPr(pr({ ref: 'claude/feature', sha: 'aaa' }), { refs: { 'claude/feature': 'bbb' } });
  assert.deepEqual(deleted, []);
});

test('per-PR: never deletes a same-named branch for a fork PR', async () => {
  const deleted = await runPerPr(
    pr({ ref: 'develop', sha: 'fork-sha', repo: 'contributor/Gematria-Today' }),
    { refs: { develop: 'fork-sha' } },
  );
  assert.deepEqual(deleted, []);
});

test('per-PR: keeps a branch an open PR still uses', async () => {
  const deleted = await runPerPr(pr({ ref: 'claude/feature', sha: 'aaa' }), {
    refs: { 'claude/feature': 'aaa' },
    openPRs: [pr({ ref: 'claude/other', sha: 'ccc', merged: false, base: 'claude/feature' })],
  });
  assert.deepEqual(deleted, []);
});

test('bulk: deletes only branches whose tip is a merged head from this repo', async () => {
  const deleted = await runBulk({
    refs: {
      'claude/done': 'merged-tip',
      'claude/reused': 'new-unmerged-work',
      develop: 'base-develop',
      'claude/open': 'open-tip',
      main: 'main-tip',
    },
    closedPRs: [
      pr({ ref: 'claude/done', sha: 'old-tip' }),
      pr({ ref: 'claude/done', sha: 'merged-tip' }),
      pr({ ref: 'claude/reused', sha: 'first-session-tip' }),
      pr({ ref: 'develop', sha: 'fork-develop', repo: 'contributor/Gematria-Today' }),
      pr({ ref: 'claude/open', sha: 'open-tip' }),
      pr({ ref: 'claude/closed-unmerged', sha: 'x', merged: false }),
      pr({ ref: 'claude/already-gone', sha: 'gone' }),
      pr({ ref: 'main', sha: 'main-tip' }),
    ],
    openPRs: [pr({ ref: 'claude/open', sha: 'open-tip', merged: false })],
  });
  assert.deepEqual(deleted, ['claude/done']);
});
