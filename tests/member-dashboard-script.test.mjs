import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// member-1.js is a classic page script: every helper is a closure inside one
// DOMContentLoaded-style block, so nothing can be imported. These tests lift
// the named functions out of the source and run them in a VM context next to
// stand-ins for the page state and the helpers they call.
const SOURCE = readFileSync(new URL('../page-scripts/member-1.js', import.meta.url), 'utf8');
const MEMBER_PAGE = readFileSync(new URL('../src/member.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const match = new RegExp(`(?:async\\s+)?function ${name}\\(`).exec(SOURCE);
  assert.ok(match, `member-1.js no longer defines ${name}()`);
  let index = match.index + match[0].length;
  for (let depth = 1; depth > 0; index += 1) {
    if (SOURCE[index] === '(') depth += 1;
    if (SOURCE[index] === ')') depth -= 1;
  }
  const bodyStart = SOURCE.indexOf('{', index);
  let depth = 0;
  for (let cursor = bodyStart; cursor < SOURCE.length; cursor += 1) {
    if (SOURCE[cursor] === '{') depth += 1;
    if (SOURCE[cursor] === '}') {
      depth -= 1;
      if (depth === 0) return SOURCE.slice(match.index, cursor + 1);
    }
  }
  throw new Error(`Unbalanced braces in ${name}()`);
}

function run(code, context) {
  return vm.runInNewContext(code, { URL, JSON, Promise, ...context });
}

// Arrays made inside the VM have that realm's prototypes, which deepStrictEqual
// treats as different from the test's own.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function memoryStorage(entries = []) {
  const map = new Map(entries);
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

// ---------- signed-out visitors (M15) ----------

const BOOTSTRAP_STUBS = `
  let session = null;
  let csrfToken = null;
  let membershipHeroReady = false;
  let chatSessions = [];
  let favoriteHistoryIds = new Set();
  let historyItems = [];
  let historyTotal = 0;
  let historyHasMore = false;
  const gemabotModuleEnabled = false;
  const forumModuleEnabled = false;
  const record = (name) => (...args) => { calls.push([name, ...args]); };
  const recordAsync = (name) => async (...args) => { calls.push([name, ...args]); };
  const normalizeAuthView = (view) => view;
  const setAuthView = record('setAuthView');
  const showAlert = record('showAlert');
  const scrollToLoginArea = record('scrollToLoginArea');
  const revealResendVerificationPanel = record('revealResendVerificationPanel');
  const loadFavoriteHistoryIds = record('loadFavoriteHistoryIds');
  const setLoggedIn = record('setLoggedIn');
  const populateProfile = record('populateProfile');
  const loadHistory = recordAsync('loadHistory');
  const renderChatSessions = record('renderChatSessions');
  const scheduleIdle = record('scheduleIdle');
  const loadMemberProposals = recordAsync('loadMemberProposals');
  const loadMemberChatbotFeedback = recordAsync('loadMemberChatbotFeedback');
  const confirmStripePayment = recordAsync('confirmStripePayment');
  const flushPendingHistoryNoteSaves = record('flushPendingHistoryNoteSaves');
  const renderAchievementsEmpty = record('renderAchievementsEmpty');
  const renderHistory = record('renderHistory');
  const hideWorkingOverlay = record('hideWorkingOverlay');
  const scrollToInitialHashTarget = record('scrollToInitialHashTarget');
`;

async function bootstrapWith(sessionPayload) {
  const calls = [];
  const window = {
    location: { href: 'https://gematria.today/member.html?verify_email_token=tok&auth=login#authSection' },
    localStorage: memoryStorage([['learningPathStep1Intent', 'true']]),
    sessionStorage: memoryStorage(),
    history: { replaceState: () => {} },
  };
  const request = async (url) => {
    calls.push(['request', url]);
    if (url.startsWith('/api/member-session')) return sessionPayload;
    return {};
  };
  const bootstrap = run(`${BOOTSTRAP_STUBS}\n${extractFunction('bootstrapSession')}\nbootstrapSession;`, { calls, window, request });
  await bootstrap();
  return plain(calls.filter(([name]) => name === 'setLoggedIn' || name === 'loadHistory' || name === 'populateProfile'));
}

test('a signed-out visitor gets the sign-in form, not the dashboard', async () => {
  // member-session answers 200 { authenticated: false } for visitors. Treating
  // that as signed in ran setLoggedIn(true), which also consumed the signup's
  // Level 1 intent and redirected away from the verification link's form.
  assert.deepEqual(await bootstrapWith({ authenticated: false }), [['setLoggedIn', false]]);
});

test('a signed-in member still gets the dashboard', async () => {
  const calls = await bootstrapWith({ authenticated: true, member: { id: 'm1' }, profile: {}, user: {} });
  assert.deepEqual(calls.map(([name, value]) => [name, name === 'setLoggedIn' ? value : undefined]), [
    ['setLoggedIn', true],
    ['populateProfile', undefined],
    ['loadHistory', undefined],
  ]);
});

// ---------- legacy note migration (L19) ----------

function migrationHarness({ storedNotes, historyItems, historyHasMore = false, requestFails }) {
  const storage = memoryStorage([['member-history-notes:m1', JSON.stringify(storedNotes)]]);
  const patches = [];
  const api = run(`
    let session = { member: { id: 'm1' } };
    let historyItems = ${JSON.stringify(historyItems)};
    let historyHasMore = ${historyHasMore};
    const showAlert = () => {};
    async function request(url, options) {
      patches.push(JSON.parse(options.body));
      if (requestFails) throw new Error('offline');
      return { item: { id: JSON.parse(options.body).id, note: JSON.parse(options.body).note } };
    }
    ${extractFunction('getHistoryNote')}
    ${extractFunction('saveHistoryNoteToServer')}
    ${extractFunction('migrateLegacyHistoryNotesToServer')}
    migrateLegacyHistoryNotesToServer;
  `, { window: { localStorage: storage }, patches, requestFails });
  return { migrate: api, storage, patches };
}

test('legacy local notes are kept when saving them to the server fails', async () => {
  const { migrate, storage, patches } = migrationHarness({
    storedNotes: { h1: 'my note' },
    historyItems: [{ id: 'h1', note: '' }],
    requestFails: true,
  });
  await migrate();
  assert.equal(patches.length, 1);
  assert.equal(storage.map.has('member-history-notes:m1'), true, 'the only copy of the note was deleted');
});

test('legacy local notes are removed once every one reached the server', async () => {
  const { migrate, storage } = migrationHarness({
    storedNotes: { h1: 'my note' },
    historyItems: [{ id: 'h1', note: '' }],
    requestFails: false,
  });
  await migrate();
  assert.equal(storage.map.has('member-history-notes:m1'), false);
});

test('legacy notes for saves on a page not loaded yet are kept for a later pass', async () => {
  const { migrate, storage, patches } = migrationHarness({
    storedNotes: { h1: 'my note', h40: 'older note' },
    historyItems: [{ id: 'h1', note: '' }],
    historyHasMore: true,
    requestFails: false,
  });
  await migrate();
  assert.deepEqual(patches.map((patch) => patch.id), ['h1']);
  assert.equal(storage.map.has('member-history-notes:m1'), true);
});

// ---------- paging (M38) ----------

function pagingHarness({ favorites, historyItems = [], responses = [] }) {
  const requests = [];
  const favoriteStorage = memoryStorage();
  const api = run(`
    const HISTORY_PAGE_SIZE = 25;
    const historyLoadMoreButton = { disabled: false };
    let historyItems = ${JSON.stringify(historyItems)};
    let historyTotal = 0;
    let historyHasMore = true;
    let historyLoadMoreInFlight = false;
    let favoriteHistoryIds = new Set(${JSON.stringify(favorites)});
    const showAlert = () => {};
    const renderHistory = () => {};
    const migrateLegacyHistoryNotesToServer = async () => {};
    const persistFavoriteHistoryIds = () => favoriteStorage.setItem('favorites', JSON.stringify([...favoriteHistoryIds]));
    async function request(url) {
      requests.push(url);
      return responses.shift();
    }
    ${extractFunction('applyHistoryPage')}
    ${extractFunction('loadHistory')}
    ${extractFunction('loadMoreHistory')}
    ({
      loadHistory,
      loadMoreHistory,
      state: () => ({ historyItems, historyTotal, historyHasMore, favorites: [...favoriteHistoryIds] }),
    });
  `, { requests, responses, favoriteStorage });
  return { api, requests };
}

test('the dashboard asks for a page and keeps favorites that belong to pages not loaded yet', async () => {
  const { api, requests } = pagingHarness({
    favorites: ['h1', 'h30'],
    responses: [{ history: [{ id: 'h1' }, { id: 'h2' }], hasMore: true, total: 40 }],
  });
  await api.loadHistory();
  assert.deepEqual(requests, ['/api/member-history?limit=25']);
  const state = plain(api.state());
  assert.equal(state.historyTotal, 40);
  assert.equal(state.historyHasMore, true);
  assert.deepEqual(state.favorites, ['h1', 'h30']);
});

test('loading more appends the next page from the current offset without repeating rows', async () => {
  const { api, requests } = pagingHarness({
    favorites: ['h1', 'h99'],
    historyItems: [{ id: 'h1' }, { id: 'h2' }],
    responses: [{ history: [{ id: 'h2' }, { id: 'h3' }], hasMore: false, total: 3 }],
  });
  await api.loadMoreHistory();
  assert.deepEqual(requests, ['/api/member-history?limit=25&offset=2']);
  const state = plain(api.state());
  assert.deepEqual(state.historyItems.map((item) => item.id), ['h1', 'h2', 'h3']);
  assert.equal(state.historyHasMore, false);
  // Everything is loaded now, so a favorite with no row really is stale.
  assert.deepEqual(state.favorites, ['h1']);
});

test('member.html carries the load-more control the dashboard toggles', () => {
  assert.match(MEMBER_PAGE, /id="historyLoadMoreWrap" class="[^"]*\bd-none\b/);
  assert.match(MEMBER_PAGE, /<button id="historyLoadMoreButton"[^>]*type="button"/);
});

// ---------- blog proposal errors (L18) ----------

test('a failed blog proposal submit is caught and reported', () => {
  const start = SOURCE.indexOf("premiumBlogProposalForm.addEventListener('submit'");
  const end = SOURCE.indexOf('memberProposalFeedbackList?.addEventListener', start);
  assert.ok(start > -1 && end > start);
  const listener = SOURCE.slice(start, end);
  assert.match(listener, /try \{\s*await request\('\/api\/member-blog-proposals', \{\s*method: 'POST'/);
  assert.match(listener, /catch \(error\) \{\s*showAlert\(error\.message \|\| '[^']+'\);\s*return;/);
  assert.match(listener, /proposalSubmitButton\.disabled = true/);
  assert.match(listener, /finally \{\s*if \(proposalSubmitButton\) \{\s*proposalSubmitButton\.disabled = false;/);
});

// ---------- signup blog opt-in (L64) ----------

function optInHarness({ remembered = null, profilePreferences = {}, opens }) {
  const calls = [];
  const storage = memoryStorage(remembered ? [['memberFollowItPendingSubscribeEmail', remembered]] : []);
  const maybeOpen = run(`
    const FOLLOW_IT_PENDING_SUBSCRIBE_KEY = 'memberFollowItPendingSubscribeEmail';
    let session = null;
    const showAlert = (message, tone) => calls.push(['showAlert', tone]);
    const openFollowItSubscription = (email, preopened, options) => {
      calls.push(['open', email, options]);
      return opens;
    };
    const rememberBlogSubscriptionEmail = (email) => calls.push(['remember', email]);
    ${extractFunction('getBlogSubscriptionEmailFromPreferences')}
    ${extractFunction('readRememberedFollowItSubscriptionIntent')}
    ${extractFunction('clearRememberedFollowItSubscriptionIntent')}
    ${extractFunction('getPendingBlogSubscriptionEmail')}
    ${extractFunction('maybeOpenFollowItAfterVerifiedSignIn')}
    maybeOpenFollowItAfterVerifiedSignIn;
  `, { calls, localStorage: storage, opens });
  const activeSession = {
    member: { email: 'Kev@Example.com', emailVerified: true },
    profile: { preferences: profilePreferences },
  };
  maybeOpen(activeSession);
  return { calls: plain(calls), storage };
}

test('a blocked follow.it popup after sign-in keeps the opt-in and says how to finish', () => {
  const { calls, storage } = optInHarness({ remembered: 'kev@example.com', opens: false });
  assert.deepEqual(calls[0].slice(0, 2), ['open', 'kev@example.com']);
  assert.equal(calls[0][2].allowBlankFallback, false);
  assert.deepEqual(calls.slice(1), [['showAlert', 'warning']]);
  assert.equal(storage.getItem('memberFollowItPendingSubscribeEmail'), 'kev@example.com');
});

test('the opt-in recorded on the profile reaches a device that never saw the signup', () => {
  const { calls, storage } = optInHarness({ profilePreferences: { blogSubscriptionPending: true }, opens: true });
  assert.deepEqual(calls.map(([name]) => name), ['open', 'remember']);
  assert.equal(calls[1][1], 'kev@example.com');
  assert.equal(storage.getItem('memberFollowItPendingSubscribeEmail'), null);
});

test('no opt-in, or one already completed, opens nothing', () => {
  assert.deepEqual(optInHarness({ opens: true }).calls, []);
  assert.deepEqual(optInHarness({
    profilePreferences: { blogSubscriptionPending: true, blogSubscriptionEmail: 'kev@example.com' },
    opens: true,
  }).calls, []);
});

test('openFollowItSubscription sends nothing when asked not to fall back to a blocked _blank tab', () => {
  const forms = [];
  const makeElement = () => ({ style: {}, appendChild() {}, submit() { this.submitted = true; }, remove() { this.removed = true; } });
  const open = run(`
    const FOLLOW_IT_SUBSCRIPTION_URL = 'https://api.follow.it/subscription-form/x';
    const scheduleFollowItTabAutoClose = () => {};
    ${extractFunction('openFollowItSubscription')}
    openFollowItSubscription;
  `, {
    window: { open: () => null },
    document: {
      createElement: () => {
        const element = makeElement();
        forms.push(element);
        return element;
      },
      body: { appendChild() {} },
    },
  });
  assert.equal(open('kev@example.com', null, { allowBlankFallback: false }), false);
  assert.equal(forms[0].submitted, undefined);
  assert.equal(forms[0].removed, true);
  // The explicit subscribe button keeps the old fallback: it runs in a click.
  assert.equal(open('kev@example.com'), true);
  assert.equal(forms[2].target, '_blank');
  assert.equal(forms[2].submitted, true);
});

test('the signup form sends the opt-in to member-register and the dashboard shows it as pending', () => {
  assert.match(SOURCE, /extraFields: \(\) => \(\{ blogSubscribe: document\.getElementById\('registerBlogSubscribe'\)\.checked \}\)/);
  assert.match(MEMBER_PAGE, /id="blogSubscriptionPendingNotice" class="[^"]*\bd-none\b/);
});
