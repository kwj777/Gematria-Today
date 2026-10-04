import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import {
  NO_COUNTABLE_LETTERS_MESSAGE,
  hasCountableLetters,
  isBaseRootValue,
} from '../netlify/functions/englishGematria.mjs';
import { buildReturnUrl, sanitizeReturnPath } from '../netlify/functions/_oauth.mjs';

// The calculator, name calculator, results and admin pages run as classic
// scripts against the DOM, so they cannot be imported. These tests lift the
// functions under test out of the page source and run them in a vm context
// with just enough of a browser around them.

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const SAFE_RETURN_PATH_SOURCE = read('../page-scripts/safe-return-path.js');
const ADMIN_SOURCE = read('../page-scripts/admin-1.js');
const CALCULATOR_SOURCE = read('../page-scripts/calculator-1.js');
const NAME_CALCULATOR_SOURCE = read('../page-scripts/name-calculator-1.js');
const RESULTS_SOURCE = read('../page-scripts/gematria-results-1.js');
const MEMBER_SOURCE = read('../page-scripts/member-1.js');
const ENGLISH_GEMATRIA_SOURCE = read('../netlify/functions/englishGematria.mjs');

const ORIGIN = 'https://gematria.today';

function skipString(source, index) {
  const quote = source[index];
  let i = index + 1;
  while (i < source.length) {
    const char = source[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (quote === '`' && char === '$' && source[i + 1] === '{') {
      i = skipBalanced(source, i + 1, '{', '}');
      continue;
    }
    if (char === quote) return i + 1;
    i += 1;
  }
  throw new Error('unterminated string literal');
}

function skipBalanced(source, index, open, close) {
  let depth = 0;
  let i = index;
  while (i < source.length) {
    const char = source[i];
    if (char === '\'' || char === '"' || char === '`') {
      i = skipString(source, i);
      continue;
    }
    if (char === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
      continue;
    }
    if (char === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i) + 2;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  throw new Error(`unbalanced ${open}${close}`);
}

// Returns the source of `[async] function name(...) { ... }` from a page script.
function extractFunction(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `function ${name} not found`);
  const paramsEnd = skipBalanced(source, match.index + match[0].length - 1, '(', ')');
  const bodyStart = source.indexOf('{', paramsEnd);
  return source.slice(match.index, skipBalanced(source, bodyStart, '{', '}'));
}

function createWindow({ search = '' } = {}) {
  return { location: { origin: ORIGIN, search, href: `${ORIGIN}/${search}` } };
}

function loadSafePathHelper(window = createWindow()) {
  const context = vm.createContext({ window, URL });
  vm.runInContext(SAFE_RETURN_PATH_SOURCE, context);
  return window;
}

function createFakeElement(tagName) {
  return {
    tagName,
    children: [],
    className: '',
    textContent: '',
    hidden: false,
    attributes: {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    append(...children) {
      this.children.push(...children);
    },
    setAttribute(key, value) {
      this.attributes[key] = String(value);
    },
  };
}

const fakeDocument = {
  createElement: (tagName) => createFakeElement(tagName),
  createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
};

// ---------- M6: one safe-path check for every "go back here" parameter ----------

test('the shared helper keeps on-site paths as they are', () => {
  const { gematriaSafePath } = loadSafePathHelper();
  assert.equal(gematriaSafePath.toSafeInternalPath('/gematria-basics.html'), '/gematria-basics.html');
  assert.equal(
    gematriaSafePath.toSafeInternalPath('/calculator.html?query=276&source=learning-path#gematria-result'),
    '/calculator.html?query=276&source=learning-path#gematria-result',
  );
  assert.equal(gematriaSafePath.toSafeInternalPath('/admin-posts.html?loadProposal=7'), '/admin-posts.html?loadProposal=7');
});

test('the shared helper refuses every way of naming another site', () => {
  const { gematriaSafePath } = loadSafePathHelper();
  const offSite = [
    // The dot-segment bypass: one leading slash, same origin, but the path
    // normalizes to //evil.example, a protocol-relative URL.
    '/.//evil.example/admin.html',
    '/./\\evil.example',
    '/a/..//evil.example',
    '/x/../..//evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    'https://evil.example/',
    'javascript:alert(1)',
    'gematria-basics.html',
    '',
    null,
    undefined,
  ];
  for (const value of offSite) {
    assert.equal(gematriaSafePath.toSafeInternalPath(value), '', `${JSON.stringify(value)} must be refused`);
  }
});

test('admin sign-in no longer follows next=/.//host off the site', () => {
  const run = (search, storage = new Map()) => {
    const window = loadSafePathHelper(createWindow({ search }));
    const sessionStorage = {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    };
    const context = vm.createContext({ window, sessionStorage, URL, URLSearchParams });
    vm.runInContext(`${extractFunction(ADMIN_SOURCE, 'consumeSafeNextRedirect')}\nresult = consumeSafeNextRedirect();`, context);
    return context.result;
  };

  assert.equal(run('?next=/.//evil.example/admin.html'), null);
  assert.equal(run('?next=%2F.%2F%2Fevil.example'), null);
  assert.equal(run('?next=//evil.example'), null);
  assert.equal(run('?next=/admin-posts.html?loadProposal=7'), '/admin-posts.html?loadProposal=7');
});

test('the calculators drop a learning-path return link that leaves the site', () => {
  for (const [label, source] of [['calculator', CALCULATOR_SOURCE], ['name calculator', NAME_CALCULATOR_SOURCE]]) {
    const run = (returnTo) => {
      const search = `?${new URLSearchParams({ source: 'learning-path', returnTo })}`;
      const window = loadSafePathHelper(createWindow({ search }));
      window.gematriaLearningPath = { getLevel: (pathname) => (pathname === '/gematria-basics.html' ? 1 : null) };
      const link = { href: '', textContent: '' };
      const context = vm.createContext({
        window,
        URL,
        URLSearchParams,
        learningPathReturnNode: { hidden: true },
        learningPathReturnLink: link,
      });
      vm.runInContext(
        `let learningPathReturnHref = ''; let shouldShowLearningPathReturn = false;\n${extractFunction(source, 'configureLearningPathReturn')}\nconfigureLearningPathReturn();`,
        context,
      );
      return link;
    };

    assert.equal(run('/.//evil.example/').href, '', `${label}: dot-segment return link must be dropped`);
    assert.equal(run('https://evil.example/').href, '', `${label}: absolute off-site link must be dropped`);
    const lesson = run('/gematria-basics.html');
    assert.equal(lesson.href, '/gematria-basics.html', `${label}: lesson link must survive`);
    assert.equal(lesson.textContent, 'Nice! Back to Level 1');
  }
});

test('the results page back link refuses the dot-segment bypass', () => {
  const window = loadSafePathHelper();
  const context = vm.createContext({ window, URL });
  vm.runInContext(extractFunction(RESULTS_SOURCE, 'getSafeInternalReturnPath'), context);
  const check = (value) => vm.runInContext(`getSafeInternalReturnPath(${JSON.stringify(value)})`, context);
  assert.equal(check('/.//evil.example/calculator.html'), '');
  assert.equal(check('/calculator'), '/calculator.html');
  assert.equal(check('/name-calculator.html?name1=Jon#name-form'), '/name-calculator.html?name1=Jon#name-form');
});

test('every page that reads a return parameter loads the shared helper first', () => {
  const pages = [
    ['../admin.html', '/page-scripts/admin-1.js'],
    ['../src/calculator.html', '/page-scripts/calculator-1.js'],
    ['../src/name-calculator.html', '/page-scripts/name-calculator-1.js'],
    ['../src/gematria-results.html', '/page-scripts/gematria-results-1.js'],
  ];
  for (const [page, script] of pages) {
    const html = read(page);
    const helperAt = html.indexOf('/page-scripts/safe-return-path.js');
    assert.ok(helperAt !== -1, `${page} must load safe-return-path.js`);
    assert.ok(helperAt < html.indexOf(script), `${page} must load the helper before ${script}`);
  }
  for (const source of [ADMIN_SOURCE, CALCULATOR_SOURCE, NAME_CALCULATOR_SOURCE, RESULTS_SOURCE]) {
    assert.match(source, /window\.gematriaSafePath\?\.toSafeInternalPath\(/);
  }
});

test('OAuth return paths refuse the dot-segment bypass too', () => {
  assert.equal(sanitizeReturnPath('/.//evil.example/steal'), '/member.html');
  assert.equal(sanitizeReturnPath('/a/..//evil.example'), '/member.html');
  assert.ok(buildReturnUrl('/.//evil.example', { oauth_error: 'denied' }).startsWith('/member.html?'));
  assert.equal(sanitizeReturnPath('/member.html?auth=login#authSection'), '/member.html?auth=login#authSection');
});

// ---------- M16: a failed name lookup renders its error card ----------

test('a name whose lookup failed gets an error card instead of a TypeError', () => {
  const context = vm.createContext({
    document: fakeDocument,
    createDefinitionLink: () => createFakeElement('a'),
    hasDefinition: () => Promise.resolve(false),
  });
  vm.runInContext(extractFunction(NAME_CALCULATOR_SOURCE, 'createResultCard'), context);
  context.failed = { error: 'Too many calculator requests.' };
  const article = vm.runInContext("createResultCard('Kevin', failed)", context);
  const error = article.children.find((child) => child.className === 'error');
  assert.ok(error, 'the card must carry the error paragraph');
  assert.equal(error.textContent, 'Too many calculator requests.');
});

// ---------- L13: share totals stay paired with their names ----------

function loadNameShareBuilders() {
  const context = vm.createContext({ URL, getCanonicalShareOrigin: () => ORIGIN });
  const formatter = NAME_CALCULATOR_SOURCE.includes('function formatShareTotals(')
    ? extractFunction(NAME_CALCULATOR_SOURCE, 'formatShareTotals')
    : '';
  vm.runInContext(
    [formatter, extractFunction(NAME_CALCULATOR_SOURCE, 'createNameShareUrl'), extractFunction(NAME_CALCULATOR_SOURCE, 'createNameShareImageUrl')].join('\n'),
    context,
  );
  return context;
}

test('a failed lookup keeps its slot in the comparison share link and image', () => {
  const context = loadNameShareBuilders();
  // Kevin's lookup failed; John and Smith succeeded. This is the positional
  // list renderResults builds.
  context.names = ['Kevin', 'John', 'Smith'];
  context.totals = ['', '282', '414'];
  const shareUrl = new URL(vm.runInContext('createNameShareUrl(names, totals)', context));
  const imageUrl = new URL(vm.runInContext('createNameShareImageUrl(names, totals).toString()', context));
  assert.equal(shareUrl.searchParams.get('totals'), '?,282,414');
  assert.equal(imageUrl.searchParams.get('totals'), '?,282,414');
});

test('a comparison where every lookup failed carries no totals at all', () => {
  const context = loadNameShareBuilders();
  context.names = ['Kevin', 'John'];
  context.totals = ['', ''];
  const shareUrl = new URL(vm.runInContext('createNameShareUrl(names, totals)', context));
  assert.equal(shareUrl.searchParams.get('totals'), null);
});

test('renderResults passes one total per name, failures included', () => {
  const renderResults = extractFunction(NAME_CALCULATOR_SOURCE, 'renderResults');
  assert.match(renderResults, /const shareTotals = results\.map\(/);
  assert.ok(!/results\s*\.filter\([^)]*\)\s*\.map\(\(result\) => result\.gematria\.gematria\.total\)/.test(renderResults));
  assert.match(renderResults, /createNameShareUrl\(names, shareTotals\)/);
  assert.match(renderResults, /createNameShareImageUrl\(names, shareTotals\)/);
});

test('member history share links keep each total on its own name', async () => {
  const context = vm.createContext({ URL, getCanonicalShareOrigin: () => ORIGIN });
  vm.runInContext(extractFunction(MEMBER_SOURCE, 'buildHistoryShareUrl'), context);
  context.item = {
    calculatorSource: 'name-calculator',
    resultPayload: {
      names: ['Kevin', 'John', 'Smith'],
      results: [
        { error: 'Too many calculator requests.' },
        { gematria: { gematria: { total: '282' } } },
        { gematria: { gematria: { total: '414' } } },
      ],
    },
  };
  const url = new URL(await vm.runInContext('buildHistoryShareUrl(item)', context));
  assert.equal(url.searchParams.get('totals'), '?,282,414');
});

// ---------- L16: the base-root tooltip states the real rule ----------

test('the base-root tooltip describes 6 plus a multiple of 54, not "multiple of 6"', () => {
  const context = vm.createContext({ document: fakeDocument });
  vm.runInContext(extractFunction(CALCULATOR_SOURCE, 'createBaseRootStatusNode'), context);
  const rootedTitle = vm.runInContext('createBaseRootStatusNode(true)', context).children[0].title;
  const notRootedTitle = vm.runInContext('createBaseRootStatusNode(false)', context).title;

  for (const title of [rootedTitle, notRootedTitle]) {
    // Every total in this cipher is a multiple of 6 (LIGHT = 336 is one and
    // is not base rooted), so that can never be the stated rule.
    assert.ok(!/multiple of 6\b/.test(title), title);
    assert.match(title, /6 plus a multiple of 54/);
    const ladder = (title.match(/\d+(?:, \d+)+/) || [''])[0].split(', ').map(Number);
    assert.ok(ladder.length >= 3, `the tooltip should list the ladder: ${title}`);
    for (const value of ladder) {
      assert.ok(isBaseRootValue(value), `${value} is listed as base rooted but is not`);
    }
  }
  assert.equal(isBaseRootValue(336), false);
});

// ---------- L57: input with no A-Z letters is a validation error, not 0 ----------

test('input with no countable letters is refused rather than totalled as 0', () => {
  for (const value of ['שלום', 'Ελλάδα', '😀', '!!!', '123', '   ']) {
    assert.equal(hasCountableLetters(value), false, `${JSON.stringify(value)} has no A-Z letter`);
  }
  for (const value of ['Kevin', 'café', 'a1', 'straße']) {
    assert.equal(hasCountableLetters(value), true, `${JSON.stringify(value)} has an A-Z letter`);
  }
});

test('the englishGematria endpoint answers 400 before it touches the cache or the words table', () => {
  const processWord = extractFunction(ENGLISH_GEMATRIA_SOURCE, 'processWord');
  const guard = processWord.indexOf('if (!hasCountableLetters(trimmedWord))');
  assert.ok(guard !== -1, 'processWord must refuse input with no countable letters');
  assert.ok(guard < processWord.indexOf('withCachedJson('), 'the refusal must come before the cache and any write');
  assert.match(processWord, /new Error\(NO_COUNTABLE_LETTERS_MESSAGE\), \{ statusCode: 400 \}/);
});

test('the calculator shows the same message inline instead of a result of 0', () => {
  const clientMessage = /const NO_COUNTABLE_LETTERS_MESSAGE = '([^']+)';/.exec(CALCULATOR_SOURCE)?.[1];
  assert.equal(clientMessage, NO_COUNTABLE_LETTERS_MESSAGE);

  const submitStart = CALCULATOR_SOURCE.indexOf("lookupForm.addEventListener('submit'");
  const submit = CALCULATOR_SOURCE.slice(submitStart, CALCULATOR_SOURCE.indexOf('requestGematria(term', submitStart));
  const guard = submit.indexOf('if (!getPerLetterValues(term).length)');
  assert.ok(guard !== -1, 'the word branch must check for a countable letter');
  assert.ok(guard < submit.lastIndexOf('showCalculatorLoadingOverlay()'), 'the check must run before the lookup starts');
  assert.match(submit.slice(guard), /showLookupInputError\(NO_COUNTABLE_LETTERS_MESSAGE\)/);

  const context = vm.createContext({});
  vm.runInContext(extractFunction(CALCULATOR_SOURCE, 'getPerLetterValues'), context);
  assert.equal(vm.runInContext("getPerLetterValues('שלום').length", context), 0);
  assert.equal(vm.runInContext("getPerLetterValues('LIGHT').length", context), 5);
});

test('the name calculator names the entry that has no letters', () => {
  const submitStart = NAME_CALCULATOR_SOURCE.indexOf("form.addEventListener('submit'");
  const submit = NAME_CALCULATOR_SOURCE.slice(submitStart, NAME_CALCULATOR_SOURCE.indexOf('await renderResults(names)', submitStart));
  assert.match(submit, /names\.find\(\(name\) => !getPerLetterValues\(name\)\.length\)/);
  assert.match(submit, /showNameFormError\(`This calculator counts English letters A-Z only, and "\$\{nameWithoutLetters\}" has none\.`\)/);
});

// ---------- L62: Share reaches navigator.share without waiting on the network ----------

test('the Share click awaits nothing before handing off to sharePage', () => {
  const summary = extractFunction(CALCULATOR_SOURCE, 'renderSearchGematriaSummary');
  const handlerStart = summary.indexOf("shareButton.addEventListener('click', async () => {");
  assert.ok(handlerStart !== -1);
  const beforeShare = summary.slice(handlerStart, summary.indexOf('await sharePage(', handlerStart));
  assert.ok(!/\bawait\b/.test(beforeShare), `nothing may be awaited before sharePage:\n${beforeShare}`);
  // The preview is fetched when the result renders instead.
  assert.ok(summary.indexOf('createWordShareImageUrl(searchGematria)') < handlerStart);
});

test('a refused share and a refused clipboard write fall back to the copy prompt', async () => {
  const prompts = [];
  const context = vm.createContext({
    document: { title: 'Calculator' },
    window: {
      location: { href: `${ORIGIN}/calculator.html` },
      prompt: (message, value) => prompts.push(value),
    },
    navigator: {
      share: () => Promise.reject(Object.assign(new Error('not allowed'), { name: 'NotAllowedError' })),
      clipboard: { writeText: () => Promise.reject(Object.assign(new Error('not allowed'), { name: 'NotAllowedError' })) },
    },
    toCanonicalShareUrl: (url) => url,
    setShareStatus: () => {},
  });
  vm.runInContext(extractFunction(CALCULATOR_SOURCE, 'sharePage'), context);
  context.payload = { title: 'Gematria lookup for light', text: 'Look', url: `${ORIGIN}/calculator.html?query=light` };
  await vm.runInContext('sharePage(payload)', context);
  assert.deepEqual(prompts, [`${ORIGIN}/calculator.html?query=light`]);
});

test('the definition pill and the share preview share one request per word', async () => {
  const fetches = [];
  const context = vm.createContext({
    fetch: (url) => {
      fetches.push(url);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ definitions: [{ text: 'Electromagnetic <xref>radiation</xref>.' }] }) });
    },
  });
  vm.runInContext(
    [
      'const definitionPayloadRequests = new Map();',
      extractFunction(CALCULATOR_SOURCE, 'requestDefinitionPayload'),
      extractFunction(CALCULATOR_SOURCE, 'hasDefinition'),
      extractFunction(CALCULATOR_SOURCE, 'stripHtmlTags'),
      extractFunction(CALCULATOR_SOURCE, 'fetchDefinitionPreview'),
    ].join('\n'),
    context,
  );
  const [exists, preview] = await vm.runInContext("Promise.all([hasDefinition('light'), fetchDefinitionPreview('light')])", context);
  assert.equal(exists, true);
  assert.equal(preview, 'Electromagnetic radiation .');
  assert.equal(fetches.length, 1);
  assert.match(CALCULATOR_SOURCE, /const definitionPayloadRequests = new Map\(\);/);
});
