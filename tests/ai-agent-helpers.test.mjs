import test from 'node:test';
import assert from 'node:assert/strict';

import {
  escapeHtml,
  englishGematria,
  gematriaLetterBreakdown,
  digitalRoot,
  describeSharedLookup,
  isBaseRootTotal,
  describeMatchConfidence,
  normalizeCandidate,
  isReasonableTargetLength,
  MAX_TARGET_LENGTH,
  MAX_TARGET_WORD_LENGTH,
  tokenizeForLearning,
  scoreLearningOverlap,
  findLearnedEntry,
  buildLearnedNoteHtml,
  buildLearningPrompt,
  isContextDependentPrompt,
  isBareAffirmation,
  isLearnablePrompt,
  isAffirmativePrompt,
  isCancellationPrompt,
  isFollowupQuestion,
  isComparisonRequest,
  resolvePronouns,
  parseSpelledNumber,
  normalizeNumericInput,
  extractReverseGematriaValue,
  buildGematriaRangeValues,
  extractRangeReverseLookup,
  classifyGeneralChatTopic,
  extractRecallTarget,
  extractHypothesisIntent,
  extractQuotedTargets,
  extractCalculationTargets,
  extractWordnikRelationshipType,
  buildCloseSpellingVariants,
  formatComparisonText,
  describeMatchCountError,
  formatReverseLookupText,
  formatReverseRangeText,
} from '../page-scripts/ai-agent-helpers.mjs';

// ---------- escapeHtml ----------

test('escapeHtml escapes ampersands, angle brackets, and quotes', () => {
  assert.equal(escapeHtml('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
});

test('escapeHtml escapes apostrophes', () => {
  assert.equal(escapeHtml("it's"), 'it&#39;s');
});

test('escapeHtml coerces nullish to empty', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

// ---------- englishGematria ----------

test('englishGematria returns 0 for empty', () => {
  assert.equal(englishGematria(''), 0);
  assert.equal(englishGematria(null), 0);
});

test('englishGematria computes A=6 and Z=156', () => {
  assert.equal(englishGematria('a'), 6);
  assert.equal(englishGematria('Z'), 156);
});

test('englishGematria sums letters and ignores non-letters', () => {
  assert.equal(englishGematria('abc'), 36);
  assert.equal(englishGematria('a b c'), 36);
  assert.equal(englishGematria('a1b2c3'), 36);
});

// ---------- gematriaLetterBreakdown ----------

test('gematriaLetterBreakdown returns per-letter values', () => {
  assert.deepEqual(gematriaLetterBreakdown('ab'), [
    { char: 'A', value: 6 },
    { char: 'B', value: 12 },
  ]);
});

test('gematriaLetterBreakdown skips non-A-Z characters', () => {
  assert.deepEqual(gematriaLetterBreakdown('a-1'), [{ char: 'A', value: 6 }]);
});

// ---------- digitalRoot ----------

test('digitalRoot reduces 144 to 9', () => {
  assert.equal(digitalRoot(144), 9);
});

test('digitalRoot of 0 is 0', () => {
  assert.equal(digitalRoot(0), 0);
});

test('digitalRoot handles negative input via absolute value', () => {
  assert.equal(digitalRoot(-144), 9);
});

// ---------- describeSharedLookup ----------

test('describeSharedLookup computes the banner values from the shared topic', () => {
  // O90 + B12 + A6 + M78 + A6
  assert.deepEqual(describeSharedLookup('  Obama '), { topic: 'Obama', total: 192, root: 3 });
});

test('describeSharedLookup returns null when there is nothing to count', () => {
  assert.equal(describeSharedLookup(''), null);
  assert.equal(describeSharedLookup(null), null);
  assert.equal(describeSharedLookup('12345'), null);
});

test('the shared-lookup banner ignores sharedTotal and sharedRoot from the URL', async () => {
  // /ai-agent.html?sharedTopic=Obama&sharedTotal=666&sharedRoot=9 used to
  // print "Obama -> total 666, digital root 9" under the site's banner.
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../page-scripts/ai-agent-1.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('function showSharedResultIfPresent()');
  assert.ok(start > -1);
  const body = source.slice(start, source.indexOf('\n      }\n', start));
  assert.ok(body.includes("describeSharedLookup(params.get('sharedTopic'))"));
  assert.ok(!body.includes('sharedTotal'));
  assert.ok(!body.includes('sharedRoot'));
});

// ---------- isBaseRootTotal ----------

test('isBaseRootTotal accepts 6 (the seed)', () => {
  assert.equal(isBaseRootTotal(6), true);
});

test('isBaseRootTotal accepts 60, 114, 168 (resonant series)', () => {
  assert.equal(isBaseRootTotal(60), true);
  assert.equal(isBaseRootTotal(114), true);
  assert.equal(isBaseRootTotal(168), true);
});

test('isBaseRootTotal rejects non-series totals', () => {
  assert.equal(isBaseRootTotal(0), false);
  assert.equal(isBaseRootTotal(12), false);
  assert.equal(isBaseRootTotal(144), false);
});

// ---------- describeMatchConfidence ----------

test('describeMatchConfidence labels each tier', () => {
  assert.equal(describeMatchConfidence(null), 'archive count unavailable');
  assert.match(describeMatchConfidence(0), /^singular/);
  assert.match(describeMatchConfidence(1), /^rare/);
  assert.match(describeMatchConfidence(3), /^uncommon/);
  assert.match(describeMatchConfidence(10), /^moderate/);
  assert.match(describeMatchConfidence(30), /^common/);
  assert.match(describeMatchConfidence(100), /^saturated/);
});

test('describeMatchConfidence tier boundaries', () => {
  assert.match(describeMatchConfidence(4), /^uncommon/);
  assert.match(describeMatchConfidence(5), /^moderate/);
  assert.match(describeMatchConfidence(14), /^moderate/);
  assert.match(describeMatchConfidence(15), /^common/);
  assert.match(describeMatchConfidence(49), /^common/);
  assert.match(describeMatchConfidence(50), /^saturated/);
});

// ---------- normalizeCandidate ----------

test('normalizeCandidate collapses whitespace and trims', () => {
  assert.equal(normalizeCandidate('  one   two\n three '), 'one two three');
});

test('normalizeCandidate coerces nullish to empty', () => {
  assert.equal(normalizeCandidate(null), '');
  assert.equal(normalizeCandidate(undefined), '');
});

// ---------- isReasonableTargetLength ----------

test('isReasonableTargetLength accepts normal words', () => {
  assert.equal(isReasonableTargetLength('jerusalem'), true);
  assert.equal(isReasonableTargetLength('antidisestablishmentarianism'), true);
});

test('isReasonableTargetLength rejects empty', () => {
  assert.equal(isReasonableTargetLength(''), false);
});

test('isReasonableTargetLength rejects targets longer than MAX_TARGET_LENGTH', () => {
  const tooLong = 'a'.repeat(MAX_TARGET_LENGTH + 1);
  assert.equal(isReasonableTargetLength(tooLong), false);
});

test('isReasonableTargetLength rejects multi-word targets with a word over MAX_TARGET_WORD_LENGTH', () => {
  const long = `short ${'a'.repeat(MAX_TARGET_WORD_LENGTH + 1)}`;
  assert.equal(isReasonableTargetLength(long), false);
});

// ---------- tokenizeForLearning & scoreLearningOverlap ----------

test('tokenizeForLearning drops stop words and 1-char tokens', () => {
  const tokens = tokenizeForLearning('the show me base-root status please');
  assert.deepEqual(tokens.sort(), ['base-root', 'show', 'status']);
});

test('tokenizeForLearning lowercases and dedupes', () => {
  const tokens = tokenizeForLearning('Show SHOW show');
  assert.deepEqual(tokens, ['show']);
});

test('scoreLearningOverlap returns 0 when intersection below 2', () => {
  assert.equal(scoreLearningOverlap(['alpha', 'beta'], ['alpha', 'gamma']), 0);
});

test('scoreLearningOverlap returns Jaccard when at least 2 tokens overlap', () => {
  const score = scoreLearningOverlap(['alpha', 'beta', 'gamma'], ['alpha', 'beta', 'delta']);
  assert.equal(score, 2 / 4);
});

test('scoreLearningOverlap returns 0 for empty input', () => {
  assert.equal(scoreLearningOverlap([], ['a', 'b']), 0);
  assert.equal(scoreLearningOverlap(['a', 'b'], []), 0);
});

// ---------- findLearnedEntry & buildLearnedNoteHtml ----------

const LEARNED = [
  { prompt: 'calculate new jerusalem', explanation: 'Mention the Revelation 21 measurements.' },
  { prompt: 'e', explanation: 'Spam note.' },
  { prompt: 'love', explanation: 'One-word note.' },
];

test('findLearnedEntry matches the same prompt and prompts that contain it on whole words', () => {
  assert.equal(findLearnedEntry('Calculate  New Jerusalem', LEARNED), LEARNED[0]);
  assert.equal(findLearnedEntry('please calculate "new jerusalem" again', LEARNED), LEARNED[0]);
});

test('findLearnedEntry does not let a short entry attach its note to every reply', () => {
  // A saved prompt of "e" used to substring-match nearly any prompt.
  assert.equal(findLearnedEntry('compare pilot and process', LEARNED), null);
  assert.equal(findLearnedEntry('calculate lovely', LEARNED), null);
  assert.equal(findLearnedEntry('calculate love', LEARNED), null);
  assert.equal(findLearnedEntry('love', LEARNED), LEARNED[2]);
});

test('findLearnedEntry does not match a one-word prompt against a longer entry that contains it', () => {
  assert.equal(findLearnedEntry('jerusalem', LEARNED), null);
});

test('findLearnedEntry matches a reworded prompt that keeps every meaningful word of the entry', () => {
  const entries = [{ prompt: 'show base-root status for mercy', explanation: 'Explain base roots first.' }];
  assert.equal(findLearnedEntry('show the base-root status of mercy', entries), entries[0]);
  assert.equal(findLearnedEntry('mercy: show base-root status', entries), entries[0]);
  assert.equal(findLearnedEntry('', entries), null);
  assert.equal(findLearnedEntry('show the base-root status of mercy', []), null);
});

// Notes are visible, so a prompt built on the same template about a different
// word must not pick up a note written about the first word.
test('findLearnedEntry does not attach a note to the same question about a different word', () => {
  const entries = [
    { prompt: 'what is the gematria value of love', explanation: 'Love should also show its digital root 9.' },
    { prompt: 'compare alpha and omega', explanation: 'Mention Revelation 22:13.' },
    { prompt: 'what is the gematria of love', explanation: 'Start with the total.' },
  ];
  assert.equal(findLearnedEntry('what is the gematria value of jerusalem', entries), null);
  assert.equal(findLearnedEntry('compare alpha and beta', entries), null);
  assert.equal(findLearnedEntry('compare omega and delta', entries), null);
  assert.equal(findLearnedEntry('what is the gematria of hate', entries), null);
  assert.equal(findLearnedEntry('What is the gematria value of LOVE?', entries), entries[0]);
  assert.equal(findLearnedEntry('compare omega and alpha', entries), entries[1]);
});

test('findLearnedEntry does not match a prompt that is only part of an entry', () => {
  // "what is the gematria" has no subject; a note about love is not about it.
  const entries = [{ prompt: 'what is the gematria of love', explanation: 'Start with the total.' }];
  assert.equal(findLearnedEntry('what is the gematria', entries), null);
  assert.equal(findLearnedEntry('gematria of love', entries), null);
});

test('findLearnedEntry prefers the same prompt, then the most specific entry', () => {
  const entries = [
    { prompt: 'calculate love', explanation: 'General love note.' },
    { prompt: 'calculate love and hate', explanation: 'Pair note.' },
    { prompt: 'reverse gematria 324', explanation: 'Mention that love is 324.' },
  ];
  assert.equal(findLearnedEntry('please calculate love and hate', entries), entries[1]);
  assert.equal(findLearnedEntry('calculate love', entries), entries[0]);
  assert.equal(findLearnedEntry('Reverse gematria 324', entries), entries[2]);
  assert.equal(findLearnedEntry('reverse gematria 3240', entries), null);
});

test('buildLearnedNoteHtml shows the escaped explanation instead of a hidden marker', () => {
  const html = buildLearnedNoteHtml({ prompt: 'say "hi"', explanation: '<img src=x onerror=alert(1)> use the summary' });
  assert.match(html, /Community note:/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; use the summary/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /d-none/);
  assert.match(html, /data-applied-learning="say &quot;hi&quot;"/);
  assert.equal(buildLearnedNoteHtml({ prompt: 'x', explanation: '' }), '');
  assert.equal(buildLearnedNoteHtml(null), '');
});

// A follow-up names no subject. A note saved under "what does that mean"
// (after "love") used to match "what does jerusalem mean" and every later
// "what does that mean", whatever word it followed.
test('findLearnedEntry ignores notes saved under a context-dependent prompt', () => {
  const entries = [
    { prompt: 'what does that mean', explanation: 'Love = 324 because ...' },
    { prompt: 'why', explanation: 'Because of the base root.' },
    { prompt: 'tell me more', explanation: 'Jerusalem has 9 letters.' },
    { prompt: 'yes', explanation: 'Related words for love.' },
    { prompt: 'never mind', explanation: 'Cleared.' },
  ];
  assert.equal(findLearnedEntry('what does jerusalem mean', entries), null);
  assert.equal(findLearnedEntry('what does 324 mean', entries), null);
  assert.equal(findLearnedEntry('tell me more about jerusalem', entries), null);
  assert.equal(findLearnedEntry('yes calculate hate', entries), null);
  assert.equal(findLearnedEntry('what does that mean', entries), null);
  assert.equal(findLearnedEntry('why', entries), null);
  assert.equal(findLearnedEntry('never mind', entries), null);
});

test('findLearnedEntry looks nothing up for a context-dependent prompt', () => {
  const entries = [{ prompt: 'what mean', explanation: 'A note.' }];
  assert.equal(findLearnedEntry('What does that mean?', entries), null);
  assert.equal(isContextDependentPrompt('what does that mean?'), true);
  assert.equal(isContextDependentPrompt('Never mind'), true);
  assert.equal(isContextDependentPrompt('yes'), true);
  assert.equal(isContextDependentPrompt('what does jerusalem mean'), false);
});

// ---------- buildLearningPrompt ----------

const LOVE_CONTEXT = { kind: 'calculation', topic: 'love', total: 324, root: 9, isBaseRoot: false, matchCount: 3 };

test('buildLearningPrompt keys an ordinary prompt by its resolved form', () => {
  assert.equal(
    buildLearningPrompt('what is its digital root', { resolvedPrompt: "what is love's digital root", context: LOVE_CONTEXT }),
    "what is love's digital root",
  );
  assert.equal(buildLearningPrompt('  calculate   jerusalem '), 'calculate jerusalem');
});

test('buildLearningPrompt keys a follow-up with the subject it follows', () => {
  const afterLove = buildLearningPrompt('what does that mean', { context: LOVE_CONTEXT });
  const afterJerusalem = buildLearningPrompt('what does that mean', {
    context: { ...LOVE_CONTEXT, topic: 'jerusalem', total: 558 },
  });
  assert.equal(afterLove, 'about love: what does that mean');
  assert.notEqual(afterLove, afterJerusalem);
  assert.equal(isContextDependentPrompt(afterLove), false);

  // The saved key brings the note back on the same follow-up about love, and
  // only there.
  const entries = [{ prompt: afterLove, explanation: 'Love = 324 because ...' }];
  assert.equal(findLearnedEntry(buildLearningPrompt('What does that mean?', { context: LOVE_CONTEXT }), entries), entries[0]);
  assert.equal(findLearnedEntry(afterJerusalem, entries), null);
  assert.equal(findLearnedEntry('what does jerusalem mean', entries), null);
  assert.equal(findLearnedEntry('what does 324 mean', entries), null);
  assert.equal(findLearnedEntry(buildLearningPrompt('why', { context: LOVE_CONTEXT }), entries), null);
});

test('buildLearningPrompt names comparison and reverse lookup subjects', () => {
  assert.equal(
    buildLearningPrompt('why', { context: { kind: 'comparison', reports: [{ target: 'alpha' }, { target: 'omega' }] } }),
    'about compare alpha and omega: why',
  );
  assert.equal(
    buildLearningPrompt('tell me more', { context: { kind: 'reverse', value: 324, archivedCount: 2 } }),
    'about reverse gematria 324: tell me more',
  );
  assert.equal(
    buildLearningPrompt('explain', { context: { kind: 'reverseRange', min: 300, max: 360 } }),
    'about reverse gematria 300 to 360: explain',
  );
});

test('buildLearningPrompt keys a "yes" by the topic it accepts', () => {
  assert.equal(buildLearningPrompt('yes', { context: LOVE_CONTEXT, pendingTopic: 'love' }), 'about related words for love: yes');
  assert.equal(buildLearningPrompt('yes', { context: LOVE_CONTEXT }), '');
});

// buildAgentReply only takes a "yes" as accepting the related-words offer
// while one is pending; otherwise "ok what is the gematria of love" is answered
// as the question it is, so it keeps its own key and its note.
test('a question that only starts with "ok" or "yes" keeps its key and its note', () => {
  for (const prompt of ['ok what is the gematria of love', 'yes what does love mean', 'yeah but what about hate', 'yes 324']) {
    assert.equal(isContextDependentPrompt(prompt), false, `"${prompt}" should not be context-dependent`);
    assert.equal(buildLearningPrompt(prompt, { context: LOVE_CONTEXT }), prompt);
  }

  const key = buildLearningPrompt('OK what is the gematria of love?', { context: LOVE_CONTEXT });
  assert.equal(key, 'OK what is the gematria of love?');
  // Notes saved under it (or under the raw prompt, as older entries were)
  // come back on the same question.
  const entries = [{ prompt: 'ok what is the gematria of love', explanation: 'Start with the total.' }];
  assert.equal(findLearnedEntry(key, entries), entries[0]);
  assert.equal(findLearnedEntry('ok what is the gematria of hate', entries), null);
});

test('a "yes" that accepts a pending offer is keyed by the offer, whatever follows it', () => {
  assert.equal(isContextDependentPrompt('ok what is the gematria of love', { pendingTopic: 'hate' }), true);
  assert.equal(
    buildLearningPrompt('ok what is the gematria of love', { context: LOVE_CONTEXT, pendingTopic: 'hate' }),
    'about related words for hate: ok what is the gematria of love',
  );
  assert.equal(isContextDependentPrompt('calculate love', { pendingTopic: 'hate' }), false);
  assert.equal(buildLearningPrompt('calculate love', { pendingTopic: 'hate' }), 'calculate love');
});

test('a bare "yes" or "why" is still context-dependent and gets no key of its own', () => {
  for (const prompt of ['yes', 'Yes please!', 'ok go ahead', 'sure, thanks', 'why', 'Why?', 'never mind']) {
    assert.equal(isContextDependentPrompt(prompt), true, `"${prompt}" should be context-dependent`);
    assert.equal(isLearnablePrompt(prompt), false);
    assert.equal(buildLearningPrompt(prompt), '', `"${prompt}" got a key with no subject`);
  }
  assert.equal(isBareAffirmation('Yes please!'), true);
  assert.equal(isBareAffirmation('yes what does love mean'), false);
  assert.equal(isBareAffirmation('calculate love'), false);

  const entries = [
    { prompt: 'yes', explanation: 'Related words for love.' },
    { prompt: 'yes please', explanation: 'Related words for love.' },
    { prompt: 'why', explanation: 'Because of the base root.' },
  ];
  assert.equal(findLearnedEntry('yes', entries), null);
  assert.equal(findLearnedEntry('yes please', entries), null);
  assert.equal(findLearnedEntry('why', entries), null);
  assert.equal(findLearnedEntry('yes please calculate love', entries), null);
});

test('isLearnablePrompt is false for a key findLearnedEntry can never match', () => {
  assert.equal(isLearnablePrompt('ok what is the gematria of love'), true);
  assert.equal(isLearnablePrompt('about love: what does that mean'), true);
  assert.equal(isLearnablePrompt('אהבה'), false);
  assert.equal(isLearnablePrompt('???'), false);
  assert.equal(isLearnablePrompt(''), false);

  // These get a non-empty key, so "Save learning" has to ask isLearnablePrompt
  // rather than whether a key exists: a note saved under it never shows.
  for (const prompt of ['אהבה', 'αγάπη', '???']) {
    const key = buildLearningPrompt(prompt);
    assert.notEqual(key, '', `"${prompt}" should keep its own key`);
    assert.equal(isLearnablePrompt(key), false, `"${prompt}" should not promise a community note`);
    assert.equal(findLearnedEntry(key, [{ prompt: key, explanation: 'A note.' }]), null);
  }
});

test('buildLearningPrompt gives no key to a reply with no subject', () => {
  assert.equal(buildLearningPrompt('never mind', { context: LOVE_CONTEXT, pendingTopic: 'love' }), '');
  assert.equal(buildLearningPrompt('what does that mean'), '');
  assert.equal(buildLearningPrompt('why', { context: { kind: 'comparison', reports: [] } }), '');
  assert.equal(findLearnedEntry('', [{ prompt: 'why', explanation: 'x' }]), null);
});

// ---------- isAffirmativePrompt ----------

test('isAffirmativePrompt matches common confirmations', () => {
  for (const yes of ['yes', 'Yep', 'sure', 'OK', 'go ahead', 'absolutely']) {
    assert.equal(isAffirmativePrompt(yes), true, `expected ${yes} to be affirmative`);
  }
});

test('isAffirmativePrompt rejects non-confirmations', () => {
  assert.equal(isAffirmativePrompt('no'), false);
  assert.equal(isAffirmativePrompt('calculate jerusalem'), false);
});

// ---------- isCancellationPrompt ----------

test('isCancellationPrompt matches stop phrases', () => {
  for (const cancel of ['never mind', 'nevermind', 'cancel', 'stop', 'forget it', 'forget that', 'skip it', 'drop it', 'nvm']) {
    assert.equal(isCancellationPrompt(cancel), true, `expected ${cancel} to cancel`);
  }
});

test('isCancellationPrompt strips trailing punctuation', () => {
  assert.equal(isCancellationPrompt('stop!'), true);
  assert.equal(isCancellationPrompt('never mind.'), true);
});

test('isCancellationPrompt rejects partial matches', () => {
  assert.equal(isCancellationPrompt('do not stop'), false);
  assert.equal(isCancellationPrompt('cancel my subscription'), false);
});

// ---------- isFollowupQuestion ----------

test('isFollowupQuestion matches short interpretive prompts', () => {
  for (const q of ['why?', 'what does that mean?', 'explain', 'elaborate', 'tell me more', 'meaning?', 'huh?']) {
    assert.equal(isFollowupQuestion(q), true, `expected ${q} to be followup`);
  }
});

test('isFollowupQuestion rejects long prompts', () => {
  assert.equal(isFollowupQuestion('why is jerusalem the most important city in the gematria archive these days?'), false);
});

test('isFollowupQuestion rejects calculation prompts', () => {
  assert.equal(isFollowupQuestion('calculate jerusalem'), false);
});

// ---------- isComparisonRequest ----------

test('isComparisonRequest matches compare/vs/versus/contrast', () => {
  assert.equal(isComparisonRequest('compare alpha and omega'), true);
  assert.equal(isComparisonRequest('alpha vs omega'), true);
  assert.equal(isComparisonRequest('alpha versus omega'), true);
  assert.equal(isComparisonRequest('contrast light and dark'), true);
  assert.equal(isComparisonRequest('difference between light and dark'), true);
});

test('isComparisonRequest rejects unrelated prompts', () => {
  assert.equal(isComparisonRequest('calculate jerusalem'), false);
});

// ---------- resolvePronouns ----------

test('resolvePronouns replaces it/its/it\'s when calculation context exists', () => {
  const ctx = { kind: 'calculation', topic: 'jerusalem' };
  assert.equal(resolvePronouns('calculate it', ctx), 'calculate jerusalem');
  assert.equal(resolvePronouns('show its variants', ctx), "show jerusalem's variants");
  assert.equal(resolvePronouns("it's base-root?", ctx), 'jerusalem is base-root?');
});

test('resolvePronouns replaces "that one" / "the result" / "the last word"', () => {
  const ctx = { kind: 'calculation', topic: 'omega' };
  assert.equal(resolvePronouns('compare that one to alpha', ctx), 'compare omega to alpha');
  assert.equal(resolvePronouns('save the result', ctx), 'save omega');
  assert.equal(resolvePronouns('show the last word', ctx), 'show omega');
});

test('resolvePronouns is a no-op without calculation context', () => {
  assert.equal(resolvePronouns('calculate it', null), 'calculate it');
  assert.equal(resolvePronouns('calculate it', { kind: 'reverse', value: 144 }), 'calculate it');
});

test('resolvePronouns leaves bare "that" and "this" untouched (too ambiguous)', () => {
  const ctx = { kind: 'calculation', topic: 'jerusalem' };
  assert.equal(resolvePronouns('what about that?', ctx), 'what about that?');
  assert.equal(resolvePronouns('this is interesting', ctx), 'this is interesting');
});

test('resolvePronouns resolves to first target in comparison context', () => {
  const ctx = {
    kind: 'comparison',
    reports: [
      { target: 'alpha', total: 156 },
      { target: 'omega', total: 270 },
    ],
  };
  assert.equal(resolvePronouns('is it base-root?', ctx), 'is alpha base-root?');
  assert.equal(resolvePronouns('save the result', ctx), 'save alpha');
  assert.equal(resolvePronouns('show that one', ctx), 'show alpha');
});

test('resolvePronouns is a no-op for comparison context without reports', () => {
  assert.equal(resolvePronouns('is it base-root?', { kind: 'comparison', reports: [] }), 'is it base-root?');
  assert.equal(resolvePronouns('is it base-root?', { kind: 'comparison' }), 'is it base-root?');
});

// ---------- parseSpelledNumber ----------

test('parseSpelledNumber handles single digits', () => {
  assert.equal(parseSpelledNumber('seven'), 7);
});

test('parseSpelledNumber handles teens and tens', () => {
  assert.equal(parseSpelledNumber('seventeen'), 17);
  assert.equal(parseSpelledNumber('forty'), 40);
  assert.equal(parseSpelledNumber('forty-two'), 42);
});

test('parseSpelledNumber handles hundreds and thousands', () => {
  assert.equal(parseSpelledNumber('one hundred forty four'), 144);
  assert.equal(parseSpelledNumber('two thousand three hundred forty five'), 2345);
});

test('parseSpelledNumber tolerates "and"', () => {
  assert.equal(parseSpelledNumber('one hundred and forty four'), 144);
});

test('parseSpelledNumber returns null for non-number-words', () => {
  assert.equal(parseSpelledNumber('jerusalem'), null);
  assert.equal(parseSpelledNumber('seven words'), null);
});

// ---------- normalizeNumericInput ----------

test('normalizeNumericInput strips comma thousand separators', () => {
  assert.equal(normalizeNumericInput('reverse gematria 1,224'), 'reverse gematria 1224');
  assert.equal(normalizeNumericInput('reverse gematria 12,345'), 'reverse gematria 12345');
});

test('normalizeNumericInput converts spelled numbers when reverse intent present', () => {
  assert.equal(normalizeNumericInput('reverse gematria one hundred forty four'), 'reverse gematria 144');
});

test('normalizeNumericInput leaves spelled numbers alone without reverse intent', () => {
  // No reverse keyword → don't touch spelled numbers (avoids rewriting prose).
  assert.equal(normalizeNumericInput('calculate seven seas'), 'calculate seven seas');
});

// ---------- extractReverseGematriaValue ----------

test('extractReverseGematriaValue parses bare numbers', () => {
  assert.equal(extractReverseGematriaValue('144'), 144);
  assert.equal(extractReverseGematriaValue('144?'), 144);
});

test('extractReverseGematriaValue parses reverse-keyword phrasings', () => {
  assert.equal(extractReverseGematriaValue('reverse gematria 144'), 144);
  assert.equal(extractReverseGematriaValue('reverse lookup 432'), 432);
});

test('extractReverseGematriaValue parses word-list + gematria-context', () => {
  assert.equal(extractReverseGematriaValue('what words equal 144'), 144);
  assert.equal(extractReverseGematriaValue('find words matching 288'), 288);
});

test('extractReverseGematriaValue returns null on plain prose', () => {
  assert.equal(extractReverseGematriaValue('calculate jerusalem'), null);
});

// ---------- buildGematriaRangeValues ----------

test('buildGematriaRangeValues snaps to multiples of 6', () => {
  const r = buildGematriaRangeValues(120, 138);
  assert.deepEqual(r.values, [120, 126, 132, 138]);
  assert.equal(r.min, 120);
  assert.equal(r.max, 138);
});

test('buildGematriaRangeValues handles unordered inputs', () => {
  const r = buildGematriaRangeValues(150, 120);
  assert.deepEqual(r.values, [120, 126, 132, 138, 144, 150]);
});

test('buildGematriaRangeValues caps at 20 values and reports truncation', () => {
  const r = buildGematriaRangeValues(6, 600);
  assert.equal(r.values.length, 20);
  assert.equal(r.truncated, true);
});

test('buildGematriaRangeValues returns null for empty range', () => {
  // 7..11 has no multiples of 6 inside it
  assert.equal(buildGematriaRangeValues(7, 11), null);
});

// ---------- extractRangeReverseLookup ----------

test('extractRangeReverseLookup picks up "between X and Y"', () => {
  const r = extractRangeReverseLookup('show words between 120 and 150');
  assert.deepEqual(r.values, [120, 126, 132, 138, 144, 150]);
});

test('extractRangeReverseLookup picks up "near N" with default span', () => {
  const r = extractRangeReverseLookup('find words near 144');
  assert.equal(r.min, 126);
  assert.equal(r.max, 162);
});

test('extractRangeReverseLookup picks up "N ± span"', () => {
  const r = extractRangeReverseLookup('show words 144 ± 12');
  assert.equal(r.min, 132);
  assert.equal(r.max, 156);
});

test('extractRangeReverseLookup returns null without trigger keywords', () => {
  assert.equal(extractRangeReverseLookup('between meetings'), null);
});

test('extractRangeReverseLookup parses spelled "between X and Y"', () => {
  const r = extractRangeReverseLookup('show words between one hundred and two hundred');
  assert.equal(r.min, 102);
  assert.equal(r.max, 198);
});

test('extractRangeReverseLookup parses spelled "near N"', () => {
  const r = extractRangeReverseLookup('find words near one hundred forty four');
  assert.equal(r.min, 126);
  assert.equal(r.max, 162);
});

test('extractRangeReverseLookup parses spelled "N plus or minus span"', () => {
  const r = extractRangeReverseLookup('list words one hundred forty four plus or minus twelve');
  assert.equal(r.min, 132);
  assert.equal(r.max, 156);
});

test('extractRangeReverseLookup ignores spelled ranges without trigger keywords', () => {
  assert.equal(extractRangeReverseLookup('somewhere between one hundred and two hundred miles'), null);
});

test('extractRangeReverseLookup falls through when spelled operands are not numbers', () => {
  assert.equal(extractRangeReverseLookup('show words between cats and dogs'), null);
});

// ---------- classifyGeneralChatTopic ----------

test('classifyGeneralChatTopic routes conceptual questions', () => {
  assert.equal(classifyGeneralChatTopic('what is gematria?'), 'what-is-gematria');
  assert.equal(classifyGeneralChatTopic('explain gematria to me'), 'what-is-gematria');
  assert.equal(classifyGeneralChatTopic('is mercy a base-root'), 'base-root');
  assert.equal(classifyGeneralChatTopic('what does digital root mean'), 'digital-root');
  assert.equal(classifyGeneralChatTopic('how does this work'), 'how-it-works');
  assert.equal(classifyGeneralChatTopic('which cipher do you use'), 'how-it-works');
  assert.equal(classifyGeneralChatTopic('why english gematria'), 'how-it-works');
  assert.equal(classifyGeneralChatTopic('what can you do?'), 'capabilities');
  assert.equal(classifyGeneralChatTopic('help'), 'capabilities');
});

test('classifyGeneralChatTopic prefers base-root over generic gematria', () => {
  assert.equal(classifyGeneralChatTopic('what is a base root in gematria'), 'base-root');
});

test('classifyGeneralChatTopic returns empty when nothing matches', () => {
  assert.equal(classifyGeneralChatTopic('the weather is nice today'), '');
  assert.equal(classifyGeneralChatTopic(''), '');
});

// ---------- extractRecallTarget ----------

test('extractRecallTarget catches "what was the total for X"', () => {
  assert.equal(extractRecallTarget('what was the total for jerusalem?'), 'jerusalem');
});

test('extractRecallTarget catches "X again?"', () => {
  assert.equal(extractRecallTarget('jerusalem again?'), 'jerusalem');
});

test('extractRecallTarget returns null on calculation prompts', () => {
  assert.equal(extractRecallTarget('calculate jerusalem'), null);
});

// ---------- extractHypothesisIntent ----------

test('extractHypothesisIntent picks up base-root questions', () => {
  assert.deepEqual(extractHypothesisIntent('is jerusalem a base-root?'), { kind: 'baseRoot', target: 'jerusalem' });
  assert.deepEqual(extractHypothesisIntent('does omega have a base-root?'), { kind: 'baseRoot', target: 'omega' });
});

test('extractHypothesisIntent picks up equality questions', () => {
  assert.deepEqual(extractHypothesisIntent('does alpha equal omega?'), { kind: 'equal', a: 'alpha', b: 'omega' });
});

test('extractHypothesisIntent picks up comparison questions', () => {
  assert.deepEqual(
    extractHypothesisIntent('is jerusalem bigger than omega?'),
    { kind: 'compareTotals', a: 'jerusalem', b: 'omega', direction: 'greater' },
  );
  assert.deepEqual(
    extractHypothesisIntent('is alpha smaller than omega?'),
    { kind: 'compareTotals', a: 'alpha', b: 'omega', direction: 'less' },
  );
});

test('extractHypothesisIntent returns null on unrelated prompts', () => {
  assert.equal(extractHypothesisIntent('calculate jerusalem'), null);
});

// ---------- extractQuotedTargets ----------

test('extractQuotedTargets pulls quoted strings', () => {
  assert.deepEqual(extractQuotedTargets('"alpha" and "omega"'), ['alpha', 'omega']);
});

test('extractQuotedTargets splits comma-separated quoted strings', () => {
  assert.deepEqual(extractQuotedTargets('"alpha, omega"'), ['alpha', 'omega']);
});

test('extractQuotedTargets enforces length cap', () => {
  const long = 'a'.repeat(MAX_TARGET_LENGTH + 1);
  assert.deepEqual(extractQuotedTargets(`"${long}"`), []);
});

// ---------- extractCalculationTargets ----------

test('extractCalculationTargets parses single target', () => {
  assert.deepEqual(extractCalculationTargets('calculate jerusalem'), ['jerusalem']);
});

test('extractCalculationTargets splits on "and"', () => {
  assert.deepEqual(extractCalculationTargets('calculate alpha and omega'), ['alpha', 'omega']);
});

test('extractCalculationTargets splits on "vs"', () => {
  assert.deepEqual(extractCalculationTargets('alpha vs omega'), ['alpha', 'omega']);
});

test('extractCalculationTargets returns empty for short conversational questions', () => {
  assert.deepEqual(extractCalculationTargets('what is gematria?'), []);
});

test('extractCalculationTargets caps to 6 targets', () => {
  const targets = extractCalculationTargets('calculate a, b, c, d, e, f, g, h');
  assert.equal(targets.length, 6);
});

// ---------- extractWordnikRelationshipType ----------

test('extractWordnikRelationshipType detects relationship classes', () => {
  assert.equal(extractWordnikRelationshipType('show synonyms of jerusalem'), 'synonym');
  assert.equal(extractWordnikRelationshipType('antonyms of light'), 'antonym');
  assert.equal(extractWordnikRelationshipType('cross-references for alpha'), 'cross-reference');
  assert.equal(extractWordnikRelationshipType('hyponyms of cat'), 'hyponym');
  assert.equal(extractWordnikRelationshipType('same context'), 'same-context');
});

test('extractWordnikRelationshipType defaults to synonym', () => {
  assert.equal(extractWordnikRelationshipType('related words for jerusalem'), 'synonym');
  assert.equal(extractWordnikRelationshipType('nothing relevant here'), 'synonym');
});

// ---------- buildCloseSpellingVariants ----------

test('buildCloseSpellingVariants produces vowel substitutions', () => {
  const variants = buildCloseSpellingVariants('cat');
  assert.ok(variants.includes('cet'));
  assert.ok(variants.includes('cit'));
});

test('buildCloseSpellingVariants does not include the original word', () => {
  const variants = buildCloseSpellingVariants('cat');
  assert.equal(variants.includes('cat'), false);
});

test('buildCloseSpellingVariants caps to 12 variants', () => {
  const variants = buildCloseSpellingVariants('balaam');
  assert.ok(variants.length <= 12);
});

test('buildCloseSpellingVariants returns empty for empty input', () => {
  assert.deepEqual(buildCloseSpellingVariants(''), []);
});

// ---------- formatComparisonText ----------

test('formatComparisonText renders multi-line summary', () => {
  const text = formatComparisonText([
    { target: 'alpha', total: 156, root: 3, isBaseRoot: false },
    { target: 'omega', total: 270, root: 9, isBaseRoot: false },
  ]);
  assert.match(text, /alpha: 156 \(root 3\)/);
  assert.match(text, /omega: 270 \(root 9\)/);
  assert.match(text, /Range 156–270 \(span 114\)/);
});

test('formatComparisonText calls out exact matches', () => {
  const text = formatComparisonText([
    { target: 'x', total: 144, root: 9, isBaseRoot: false },
    { target: 'y', total: 144, root: 9, isBaseRoot: false },
  ]);
  assert.match(text, /Exact gematria match at 144/);
});

test('formatComparisonText returns empty for empty input', () => {
  assert.equal(formatComparisonText([]), '');
  assert.equal(formatComparisonText(null), '');
});

// ---------- describeMatchCountError ----------

test('describeMatchCountError distinguishes rate-limit, network, server, unknown', () => {
  assert.match(describeMatchCountError('rate-limit'), /rate-limit/);
  assert.match(describeMatchCountError('network'), /network failure/);
  assert.match(describeMatchCountError('server'), /server error/);
  assert.match(describeMatchCountError('unknown'), /unavailable/);
  assert.match(describeMatchCountError(null), /unavailable/);
});

// ---------- formatReverseLookupText ----------

test('formatReverseLookupText lists archived words with root and base-root metadata', () => {
  const text = formatReverseLookupText({ value: 144, words: ['alpha', 'omega'] });
  assert.match(text, /Reverse gematria 144/);
  assert.match(text, /root 9/);
  assert.match(text, /Archived matches \(2\): alpha, omega/);
});

test('formatReverseLookupText reports empty archives without crashing', () => {
  const text = formatReverseLookupText({ value: 144, words: [] });
  assert.match(text, /No archived words match this total yet/);
});

test('formatReverseLookupText returns empty string when value is not a number', () => {
  assert.equal(formatReverseLookupText({ value: 'oops', words: [] }), '');
});

// ---------- formatReverseRangeText ----------

test('formatReverseRangeText lists buckets with words', () => {
  const text = formatReverseRangeText({
    min: 120,
    max: 144,
    buckets: [
      { value: 120, words: ['foo'] },
      { value: 144, words: ['alpha', 'omega'] },
    ],
  });
  assert.match(text, /Reverse gematria range 120–144/);
  assert.match(text, /3 matches across 2 buckets/);
  assert.match(text, /120: foo/);
  assert.match(text, /144: alpha, omega/);
});

test('formatReverseRangeText handles empty range without crashing', () => {
  const text = formatReverseRangeText({ min: 6, max: 12, buckets: [] });
  assert.match(text, /No archived words land in this range/);
});

test('formatReverseRangeText returns empty string when min/max are not numbers', () => {
  assert.equal(formatReverseRangeText({ min: 'a', max: 'b', buckets: [] }), '');
});
