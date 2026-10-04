/**
 * Pure helpers for the GemaBot agent UI. This module is the canonical source:
 * page-scripts/ai-agent-1.mjs imports these functions directly (see the import
 * block at the top of that file) and tests/ai-agent-helpers.test.mjs exercises
 * them. Keep new pure/parsing logic here so it stays unit-testable.
 */

export function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function englishGematria(text) {
  let total = 0;
  // NFKC, then ASCII letters only: the same rule as englishGematria.mjs.
  for (const char of String(text || '').normalize('NFKC').replace(/[^A-Za-z]/g, '').toUpperCase()) {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      total += (code - 64) * 6;
    }
  }
  return total;
}

export function gematriaLetterBreakdown(text) {
  return [...String(text || '').normalize('NFKC').replace(/[^A-Za-z]/g, '').toUpperCase()]
    .map((char) => {
      const value = (char.charCodeAt(0) - 64) * 6;
      return { char, value };
    });
}

export function digitalRoot(numberValue) {
  let root = Math.abs(Math.trunc(Number(numberValue) || 0));
  while (root >= 10) {
    root = String(root).split('').reduce((sum, digit) => sum + Number(digit), 0);
  }
  return root;
}

// A shared GemaBot link (/ai-agent.html?sharedTopic=...) also carries
// sharedTotal and sharedRoot, but the banner recomputes both from the topic so
// an edited link cannot show a site-branded result for any value it likes.
// Returns null when the topic has no A-Z letters to count.
export function describeSharedLookup(topic) {
  const text = String(topic || '').trim();
  const total = englishGematria(text);
  if (!total) return null;
  return { topic: text, total, root: digitalRoot(total) };
}

export function isBaseRootTotal(total) {
  return total >= 6 && (total - 6) % 54 === 0;
}

export function describeMatchConfidence(matchCount) {
  if (!Number.isFinite(matchCount)) return 'archive count unavailable';
  if (matchCount === 0) return 'singular — no other archived words land on this total yet';
  if (matchCount === 1) return 'rare — only one other archived word shares this total';
  if (matchCount <= 4) return 'uncommon — a small cluster of archived words shares this total';
  if (matchCount <= 14) return 'moderate — a meaningful cluster of archived words shares this total';
  if (matchCount <= 49) return 'common — a busy gematria address with many archived neighbors';
  return 'saturated — many archived words share this total, so semantic context matters more than the number';
}

export function normalizeCandidate(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export const MAX_TARGET_LENGTH = 40;
export const MAX_TARGET_WORD_LENGTH = 30;

export function isReasonableTargetLength(target) {
  if (!target || target.length > MAX_TARGET_LENGTH) return false;
  return target.split(/\s+/).every((word) => word.length <= MAX_TARGET_WORD_LENGTH);
}

export const LEARNING_STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'of', 'for', 'to', 'in', 'on', 'at', 'and', 'or', 'but', 'with', 'by',
  'as', 'it', 'this', 'that', 'these', 'those', 'i', 'you', 'we', 'me',
  'my', 'your', 'our', 'their', 'do', 'does', 'did', 'done', 'have',
  'has', 'had', 'can', 'could', 'should', 'would', 'will', 'shall', 'may',
  'might', 'must', 'if', 'so', 'then', 'than', 'about', 'from', 'into',
  'over', 'just', 'also', 'too', 'very', 'really', 'please', 'thanks',
]);

export function tokenizeForLearning(text) {
  return [...new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter((token) => token && token.length > 1 && !LEARNING_STOP_WORDS.has(token)),
  )];
}

export function scoreLearningOverlap(promptTokens, entryTokens) {
  if (!promptTokens.length || !entryTokens.length) return 0;
  const entrySet = new Set(entryTokens);
  let intersection = 0;
  for (const token of promptTokens) {
    if (entrySet.has(token)) intersection += 1;
  }
  if (intersection < 2) return 0;
  const unionSize = new Set([...promptTokens, ...entryTokens]).size;
  return intersection / unionSize;
}

function toLearningMatchText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Learned entries are written by members and shown as a note on matching
// replies, so a match has to mean the prompts are about the same thing. Apart
// from the same prompt (ignoring case and punctuation), an entry only matches
// when every meaningful word of it appears in the prompt and it has at least
// two of them. Requiring all of them keeps the subject word in play: a note
// saved for "what is the gematria value of love" must not land on the same
// question about "jerusalem", which a share-of-words score (or the prompt being
// part of the entry) let through. Two words keeps an entry saved for "e" (or
// "love") from attaching its note to nearly every reply.
//
// A context-dependent prompt ("what does that mean", "why", "yes") names no
// subject, so it neither matches nor is matched: an entry saved under one
// (older entries were saved under the raw prompt) would put a note written
// after "love" on "what does jerusalem mean" and on every later "why".
// buildLearningPrompt gives those replies a key that carries their subject.
export function findLearnedEntry(prompt, entries = []) {
  const normalizedPrompt = normalizeCandidate(prompt).toLowerCase();
  if (!isLearnablePrompt(normalizedPrompt)) return null;
  if (!Array.isArray(entries) || !entries.length) return null;

  const promptText = toLearningMatchText(normalizedPrompt);
  const usable = entries.filter((entry) => isLearnablePrompt(entry?.prompt)
    && normalizeCandidate(entry?.explanation));
  const exactHit = usable.find((entry) => toLearningMatchText(entry.prompt) === promptText);
  if (exactHit) return exactHit;

  const promptTokens = new Set(tokenizeForLearning(normalizedPrompt));
  let best = null;
  let bestSize = 0;
  for (const entry of usable) {
    const entryTokens = tokenizeForLearning(entry.prompt);
    if (entryTokens.length < 2 || entryTokens.length <= bestSize) continue;
    if (entryTokens.every((token) => promptTokens.has(token))) {
      best = entry;
      bestSize = entryTokens.length;
    }
  }
  return best;
}

// The visible part of a learned response. It used to be a hidden span, so a
// saved learning (or an admin's "Train from this") changed nothing anyone
// could see. data-applied-learning stays on it: the "No" feedback button
// reads it to drop a device-local learning that missed.
export function buildLearnedNoteHtml(entry) {
  const prompt = normalizeCandidate(entry?.prompt);
  const explanation = normalizeCandidate(entry?.explanation);
  if (!prompt || !explanation) return '';
  return `<p class="mb-2 small agent-learned-note" data-applied-learning="${escapeHtml(prompt)}"><strong>Community note:</strong> ${escapeHtml(explanation)}</p>`;
}

export function isAffirmativePrompt(prompt) {
  const normalized = normalizeCandidate(prompt).toLowerCase();
  if (!normalized) return false;
  return /^(?:yes|yep|yeah|sure|ok|okay|please do|go ahead|do it|sounds good|that works|absolutely|affirmative)\b/.test(normalized);
}

export function isCancellationPrompt(prompt) {
  const stripped = normalizeCandidate(prompt).toLowerCase().replace(/[?.!]+$/g, '').trim();
  if (!stripped) return false;
  return /^(?:never\s*mind|nvm|cancel(?:\s+that)?|stop(?:\s+it)?|forget\s+(?:it|that|this)|skip\s+(?:it|that)|drop\s+it)$/.test(stripped);
}

export function isFollowupQuestion(prompt) {
  const stripped = normalizeCandidate(prompt).toLowerCase().replace(/[?.!]+$/g, '').trim();
  if (!stripped || stripped.length > 60) return false;
  return /^(?:why|how come|huh|wait|so what|context|meaning|interpret(?:\s+(?:that|this|it))?|explain(?:\s+(?:that|this|it|more))?|elaborate|tell\s+me\s+more|more(?:\s+details?)?|details?|what(?:'s|\s+is|\s+does)?\s*(?:that|this|it)?\s*(?:mean|meaning|matter|signify|imply)?)$/.test(stripped);
}

const AFFIRMATION_WORDS = new Set([
  'yes', 'yep', 'yup', 'yeah', 'sure', 'ok', 'okay', 'absolutely', 'affirmative', 'alright',
  'please', 'thanks', 'thank', 'you', 'do', 'go', 'ahead', 'for', 'it', 'that', 'thats', 'this',
  'sounds', 'good', 'great', 'cool', 'fine', 'works', 'thing', 'of', 'course', 'lets', 'now', 'then',
]);

// "yes", "Yes please!", "ok go ahead": a confirmation and nothing else, as
// opposed to "ok what is the gematria of love", which is a question of its own.
export function isBareAffirmation(prompt) {
  if (!isAffirmativePrompt(prompt)) return false;
  const words = normalizeCandidate(prompt).toLowerCase().replace(/['\u2019]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.length > 0 && words.every((word) => AFFIRMATION_WORDS.has(word));
}

// "why", "what does that mean", "yes", "never mind": the reply to these is
// about whatever came before, not about their own words. A prompt that only
// starts with a "yes" ("ok what is the gematria of love", "yeah but what
// about hate") counts only when buildAgentReply would take it as accepting
// the related-words offer, which it does only while one is pending
// (pendingTopic); otherwise it is answered as the question it is. Without a
// pendingTopic (a stored key, a note's entry) only a bare "yes" counts.
export function isContextDependentPrompt(prompt, { pendingTopic = '' } = {}) {
  if (isFollowupQuestion(prompt) || isCancellationPrompt(prompt)) return true;
  if (!isAffirmativePrompt(prompt)) return false;
  return Boolean(normalizeCandidate(pendingTopic)) || isBareAffirmation(prompt);
}

// Whether a note saved under this key can ever be shown: findLearnedEntry
// skips keys with no letters or digits to match on and context-dependent keys.
export function isLearnablePrompt(prompt) {
  return Boolean(toLearningMatchText(normalizeCandidate(prompt))) && !isContextDependentPrompt(prompt);
}

// What the previous answer was about, in words a note's key can carry.
function describeLearningSubject(context) {
  if (!context) return '';
  if (context.kind === 'calculation') return normalizeCandidate(context.topic);
  if (context.kind === 'comparison' && Array.isArray(context.reports)) {
    const targets = context.reports.map((entry) => normalizeCandidate(entry?.target)).filter(Boolean);
    return targets.length ? `compare ${targets.join(' and ')}` : '';
  }
  if (context.kind === 'reverse' && Number.isFinite(context.value)) return `reverse gematria ${context.value}`;
  if (context.kind === 'reverseRange' && Number.isFinite(context.min) && Number.isFinite(context.max)) {
    return `reverse gematria ${context.min} to ${context.max}`;
  }
  return '';
}

// The key a reply's community note is looked up and saved under: the resolved
// prompt, except for a context-dependent one, which gets the subject of the
// answer it follows put in front ("about love: what does that mean"). That way
// a note written after "love" shows on that follow-up after "love" and not
// after "jerusalem". With no subject (never mind, a follow-up with nothing
// before it, a bare "yes" when nothing was offered) the key is empty, so no
// note is shown and none is saved for everyone. Same order of checks as
// buildAgentReply: cancellation and follow-up on the raw prompt, then a "yes"
// on the resolved one, which only accepts the offer while one is pending; an
// "ok what is the gematria of love" with nothing pending keeps its own key.
export function buildLearningPrompt(prompt, { resolvedPrompt = prompt, context = null, pendingTopic = '' } = {}) {
  const raw = normalizeCandidate(prompt);
  const resolved = normalizeCandidate(resolvedPrompt);
  if (isCancellationPrompt(raw)) return '';
  if (isFollowupQuestion(raw)) {
    const subject = describeLearningSubject(context);
    return subject ? `about ${subject}: ${raw}` : '';
  }
  if (!isContextDependentPrompt(raw) && !isContextDependentPrompt(resolved, { pendingTopic })) return resolved;
  // A "yes" that accepts the pending offer, or a bare one with nothing offered.
  const offeredTopic = normalizeCandidate(pendingTopic);
  return offeredTopic && isAffirmativePrompt(resolved) ? `about related words for ${offeredTopic}: ${raw}` : '';
}

export function isComparisonRequest(prompt) {
  const normalized = normalizeCandidate(prompt);
  if (!normalized) return false;
  return /\b(?:compare|comparison|comparing|contrast|contrasting|difference\s+between|side[\s-]?by[\s-]?side|vs\.?|versus|v\.)\b/i.test(normalized);
}

export function resolvePronouns(prompt, context) {
  if (!context) return prompt;
  let topic = '';
  if (context.kind === 'calculation' && context.topic) {
    topic = context.topic;
  } else if (context.kind === 'comparison' && Array.isArray(context.reports) && context.reports.length) {
    topic = String(context.reports[0]?.target || '');
  }
  if (!topic) return prompt;
  return String(prompt || '')
    .replace(/\bit's\b/gi, `${topic} is`)
    .replace(/\bits\b/gi, `${topic}'s`)
    .replace(/\bit\b/gi, topic)
    .replace(/\bthat\s+(?:one|word|name|topic|target|result|total)\b/gi, topic)
    .replace(/\bthe\s+(?:result|previous|last|same|prior)(?:\s+(?:one|word|topic|target|result|total|calculation))?\b/gi, topic);
}

export const NUMBER_WORD_VALUES = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000,
};
export const NUMBER_WORD_PATTERN = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)(?:[\s-]+(?:and[\s-]+)?(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand))+\b/gi;

// Matches a single spelled-out number phrase (one or more number words, e.g.
// "twelve", "one hundred forty four"). Unlike NUMBER_WORD_PATTERN it allows a
// lone word, so it can capture range operands like the span in "144 ± twelve".
const SPELLED_NUMBER_WORDS = Object.keys(NUMBER_WORD_VALUES).join('|');
export const SPELLED_NUMBER_SOURCE = `(?:${SPELLED_NUMBER_WORDS})(?:[\\s-]+(?:and[\\s-]+)?(?:${SPELLED_NUMBER_WORDS}))*`;

export function parseSpelledNumber(text) {
  const tokens = String(text || '').toLowerCase().split(/[\s-]+/).filter((token) => token && token !== 'and');
  if (!tokens.length) return null;
  let total = 0;
  let current = 0;
  for (const token of tokens) {
    if (!(token in NUMBER_WORD_VALUES)) return null;
    const value = NUMBER_WORD_VALUES[token];
    if (value === 100) {
      current = (current || 1) * 100;
    } else if (value === 1000) {
      current = (current || 1) * 1000;
      total += current;
      current = 0;
    } else {
      current += value;
    }
  }
  return total + current;
}

export function normalizeNumericInput(prompt) {
  let result = String(prompt || '').replace(/\b(\d{1,3}(?:,\d{3})+)\b/g, (match) => match.replaceAll(',', ''));
  const reverseContext = /\b(?:reverse|gematria|equals?|matching|matches|sum|sums|total|totals|value|number)\b/i.test(result);
  if (reverseContext) {
    result = result.replace(NUMBER_WORD_PATTERN, (match) => {
      const parsed = parseSpelledNumber(match);
      return parsed === null ? match : String(parsed);
    });
  }
  return result;
}

export function extractReverseGematriaValue(prompt) {
  const normalized = normalizeCandidate(prompt);
  if (!normalized) return null;

  const bareNumeric = normalized.match(/^\s*(\d{1,6})\s*[?.!]*\s*$/);
  if (bareNumeric) return Number(bareNumeric[1]);

  const reverseKeyword = /\breverse(?:\s+(?:gematria|lookup|search))?\b/i.test(normalized);
  const wordListIntent = /\b(?:show|list|find|get|give|which|what|any|search|look(?:\s*up)?)\b[\s\S]*\b(?:words?|matches?|results?|hits?|entries?|terms?)\b/i.test(normalized);
  const gematriaContext = /\b(?:gematria|equal|equals|matching|matches|match|total|totals|totaling|sum|sums|summing|value|values|number|numbers|calculation)\b/i.test(normalized);

  const labeledNumberMatch = normalized.match(
    /\b(?:gematria(?:\s+value)?|value|number|calculation|total|sum|equals?|matches?|matching|reverse)\s*(?:of|for|is|to|at|=)?\s*(\d{1,6})\b/i,
  );
  const trailingLabeledMatch = normalized.match(
    /\b(\d{1,6})\s*(?:gematria|value|total|sum|matches?)\b/i,
  );
  const numberMatch = labeledNumberMatch || trailingLabeledMatch || normalized.match(/\b(\d{1,6})\b/);

  if (numberMatch && (reverseKeyword || (wordListIntent && gematriaContext))) {
    return Number(numberMatch[1]);
  }

  return null;
}

export function buildGematriaRangeValues(minRaw, maxRaw) {
  const a = Number(minRaw);
  const b = Number(maxRaw);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const lo = Math.max(6, Math.min(a, b));
  const hi = Math.max(a, b);
  const firstMultiple = Math.ceil(lo / 6) * 6;
  const lastMultiple = Math.floor(hi / 6) * 6;
  if (lastMultiple < firstMultiple) return null;
  const MAX_VALUES = 20;
  const values = [];
  for (let value = firstMultiple; value <= lastMultiple && values.length < MAX_VALUES; value += 6) {
    values.push(value);
  }
  const fullCount = (lastMultiple - firstMultiple) / 6 + 1;
  return {
    values,
    min: firstMultiple,
    max: values[values.length - 1],
    requestedMin: Math.min(a, b),
    requestedMax: Math.max(a, b),
    truncated: fullCount > MAX_VALUES,
  };
}

export function extractRangeReverseLookup(prompt) {
  const normalized = normalizeCandidate(prompt);
  if (!normalized) return null;

  const reverseKeyword = /\breverse(?:\s+(?:gematria|lookup|search))?\b/i.test(normalized);
  const wordListIntent = /\b(?:show|list|find|get|give|which|what|any|search|look(?:\s*up)?)\b[\s\S]*\b(?:words?|matches?|results?|hits?|entries?|terms?)\b/i.test(normalized);
  const gematriaContext = /\b(?:gematria|equal|equals|matching|matches|match|total|totals|sum|sums|value|values|number|numbers)\b/i.test(normalized);
  const triggered = reverseKeyword || wordListIntent || gematriaContext;

  const betweenMatch = normalized.match(/\b(?:between|from)\s+(\d{1,6})\s+(?:to|and|-|–|—)\s+(\d{1,6})\b/i);
  if (betweenMatch && triggered) {
    return buildGematriaRangeValues(betweenMatch[1], betweenMatch[2]);
  }

  const plusMinusMatch = normalized.match(/\b(\d{1,6})\s*(?:±|\+\/?-|plus\s+or\s+minus)\s*(\d{1,4})\b/i);
  if (plusMinusMatch && triggered) {
    const center = Number(plusMinusMatch[1]);
    const span = Number(plusMinusMatch[2]);
    return buildGematriaRangeValues(center - span, center + span);
  }

  const nearMatch = normalized.match(/\b(?:near|around|close\s+to|approximately|approx\.?|about|circa|~)\s*(\d{1,6})\b/i);
  if (nearMatch && triggered) {
    const center = Number(nearMatch[1]);
    const defaultSpan = 18;
    return buildGematriaRangeValues(center - defaultSpan, center + defaultSpan);
  }

  // Spelled-out operands ("between one hundred and two hundred", "near one
  // hundred forty four", "one hundred ± twelve"). The numeric normalizer can
  // mangle spelled ranges (its greedy match merges across the "and"), so the
  // caller also retries this on the raw prompt. Each operand is parsed with
  // parseSpelledNumber; if any side isn't a positive number we fall through.
  const parsePositiveSpelled = (raw) => {
    const value = parseSpelledNumber(normalizeCandidate(raw).toLowerCase());
    return Number.isFinite(value) && value > 0 ? value : null;
  };

  if (triggered) {
    const spelledBetween = normalized.match(
      new RegExp(`\\b(?:between|from)\\s+(${SPELLED_NUMBER_SOURCE})\\s+(?:to|and|through|thru)\\s+(${SPELLED_NUMBER_SOURCE})\\b`, 'i'),
    );
    if (spelledBetween) {
      const lo = parsePositiveSpelled(spelledBetween[1]);
      const hi = parsePositiveSpelled(spelledBetween[2]);
      if (lo !== null && hi !== null) return buildGematriaRangeValues(lo, hi);
    }

    const spelledPlusMinus = normalized.match(
      new RegExp(`\\b(${SPELLED_NUMBER_SOURCE})\\s*(?:±|\\+\\/?-|plus\\s+or\\s+minus)\\s*(${SPELLED_NUMBER_SOURCE})\\b`, 'i'),
    );
    if (spelledPlusMinus) {
      const center = parsePositiveSpelled(spelledPlusMinus[1]);
      const span = parsePositiveSpelled(spelledPlusMinus[2]);
      if (center !== null && span !== null) return buildGematriaRangeValues(center - span, center + span);
    }

    const spelledNear = normalized.match(
      new RegExp(`\\b(?:near|around|close\\s+to|approximately|approx\\.?|about|circa)\\s+(${SPELLED_NUMBER_SOURCE})\\b`, 'i'),
    );
    if (spelledNear) {
      const center = parsePositiveSpelled(spelledNear[1]);
      if (center !== null) return buildGematriaRangeValues(center - 18, center + 18);
    }
  }

  return null;
}

export function extractRecallTarget(prompt) {
  const normalized = normalizeCandidate(prompt);
  if (!normalized) return null;
  const match = normalized.match(
    /\b(?:what(?:'s|\s+was|\s+is|\s+were)?|recall|remind\s+me\s+(?:of|about)|remember)\s+(?:the\s+)?(?:total|value|number|gematria|root)\s+(?:for|of|on)\s+([A-Za-z][A-Za-z' -]{0,40})/i,
  ) || normalized.match(
    /\b([A-Za-z][A-Za-z' -]{0,40})\s+again\b\??\s*$/i,
  );
  if (!match) return null;
  return normalizeCandidate(match[1]).replace(/[?.!,;:]+$/g, '');
}

export function extractHypothesisIntent(prompt) {
  const normalized = normalizeCandidate(prompt);
  if (!normalized) return null;

  const baseRootMatch = normalized.match(
    /\b(?:is|does)\s+([A-Za-z][A-Za-z' -]{0,40}?)\s+(?:a\s+)?(?:have\s+a\s+)?base[-\s]?root\b/i,
  );
  if (baseRootMatch) {
    return { kind: 'baseRoot', target: normalizeCandidate(baseRootMatch[1]).replace(/[?.!,;:]+$/g, '') };
  }

  const equalMatch = normalized.match(
    /\b(?:does|do)\s+([A-Za-z][A-Za-z' -]{0,40}?)\s+(?:equal|match)\s+([A-Za-z][A-Za-z' -]{0,40}?)\s*[?.!]*\s*$/i,
  );
  if (equalMatch) {
    return {
      kind: 'equal',
      a: normalizeCandidate(equalMatch[1]).replace(/[?.!,;:]+$/g, ''),
      b: normalizeCandidate(equalMatch[2]).replace(/[?.!,;:]+$/g, ''),
    };
  }

  const comparisonMatch = normalized.match(
    /\bis\s+([A-Za-z][A-Za-z' -]{0,40}?)\s+(bigger|larger|greater|higher|smaller|lower|less)\s+than\s+([A-Za-z][A-Za-z' -]{0,40}?)\s*[?.!]*\s*$/i,
  );
  if (comparisonMatch) {
    const direction = /bigger|larger|greater|higher/i.test(comparisonMatch[2]) ? 'greater' : 'less';
    return {
      kind: 'compareTotals',
      a: normalizeCandidate(comparisonMatch[1]).replace(/[?.!,;:]+$/g, ''),
      b: normalizeCandidate(comparisonMatch[3]).replace(/[?.!,;:]+$/g, ''),
      direction,
    };
  }

  return null;
}

export function extractQuotedTargets(prompt) {
  const rawPrompt = normalizeCandidate(prompt);
  if (!rawPrompt) return [];

  return [...rawPrompt.matchAll(/"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’/g)]
    .flatMap((match) => normalizeCandidate(match[1] || match[2] || match[3] || match[4])
      .split(',')
      .map((target) => normalizeCandidate(target)))
    .filter(Boolean)
    .filter(isReasonableTargetLength);
}

export function extractCalculationTargets(prompt) {
  const quotedTargets = extractQuotedTargets(prompt);
  if (quotedTargets.length) {
    return [...new Set(quotedTargets)];
  }

  const normalizedPrompt = normalizeCandidate(prompt);
  if (!normalizedPrompt) return [];

  const likelyConversationalQuestion = /\?\s*$/.test(normalizedPrompt)
    && /^(?:what|who|when|where|why|how)\b/i.test(normalizedPrompt)
    && /\b(?:is|are|was|were|do|does|did|can|could|should)\b/i.test(normalizedPrompt)
    && !/\b(?:calculate|calculation|value|values|number|numbers|math|snapshot|lookup|analy(?:ze|sis)|compare|comparison)\b/i.test(normalizedPrompt);

  if (likelyConversationalQuestion) {
    return [];
  }

  const keywordTargetMatch = normalizedPrompt.match(
    /\b(?:calculate|calculation|calculate\s+for|gematria|value|values|number|numbers|math|snapshot|lookup|analyze|analysis|compare|comparison|contrast|contrasting)\b[^A-Za-z0-9]+(?:for|of|on|about|between)?\s*([A-Za-z][A-Za-z' -]*(?:\s*(?:,|and|&|vs\.?|versus)\s*[A-Za-z][A-Za-z' -]*)*)/i,
  );
  const candidateBlock = keywordTargetMatch ? keywordTargetMatch[1] : normalizedPrompt;
  const trailingPunctuationStripped = candidateBlock
    .replace(/[?.!]+$/g, '')
    .replace(/\b(?:please|thanks?|thank you|now|today|right now)\b\s*$/gi, '')
    .trim();

  const sanitizeTarget = (value) => normalizeCandidate(value)
    .replace(
      /^(?:please\s+)?(?:(?:provide|give|show|get|run|do|make|find)\s+)?(?:results?\s+)?(?:for|of|on|about)\s+/i,
      '',
    )
    .replace(
      /^(?:please\s+)?(?:provide|give|show|get|run|do|make|find)\s+/i,
      '',
    )
    .replace(
      /^(?:calculate|calculation|gematria|value|values|number|numbers|snapshot|lookup|analyze|analysis|compare|comparison)\s+(?:for|of|on|about)\s+/i,
      '',
    )
    .replace(
      /^(?:calculate|calculation|gematria|value|values|number|numbers|snapshot|lookup|analyze|analysis|compare|comparison)\s+/i,
      '',
    )
    .trim();

  const splitTargets = trailingPunctuationStripped
    .split(/\s*(?:,| and | & | vs\.? | versus | v\. )\s*/i)
    .map((target) => sanitizeTarget(target).replace(/^[^A-Za-z]+|[^A-Za-z'-]+$/g, ''))
    .filter((target) => /^[A-Za-z][A-Za-z' -]*$/.test(target))
    .filter((target) => {
      const wordCount = target.split(/\s+/).filter(Boolean).length;
      if (wordCount > 5) return false;
      if (!isReasonableTargetLength(target)) return false;
      if (/^(?:please|provide|give|show|calculate|calculation|gematria|value|values|number|numbers|for|of|and|vs|versus)$/i.test(target)) return false;
      return true;
    });

  return [...new Set(splitTargets)].slice(0, 6);
}

export function extractWordnikRelationshipType(prompt) {
  const normalized = normalizeCandidate(prompt).toLowerCase();
  if (!normalized) return 'synonym';
  if (/\bantonyms?\b/.test(normalized)) return 'antonym';
  if (/\bsynonyms?\b/.test(normalized)) return 'synonym';
  if (/\bequivalents?\b/.test(normalized)) return 'equivalent';
  if (/\bcross(?: |-)?references?\b/.test(normalized)) return 'cross-reference';
  if (/\bhypernyms?\b/.test(normalized)) return 'hypernym';
  if (/\bhyponyms?\b/.test(normalized)) return 'hyponym';
  if (/\bvariants?\b/.test(normalized)) return 'variant';
  if (/\bsame context\b/.test(normalized)) return 'same-context';
  if (/\brelated words?\b/.test(normalized)) return 'synonym';
  return 'synonym';
}

export function buildCloseSpellingVariants(word) {
  const normalized = normalizeCandidate(word).toLowerCase();
  if (!normalized) return [];

  const variants = new Set();
  const vowels = ['a', 'e', 'i', 'o', 'u', 'y'];
  variants.add(normalized);

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];

    if (vowels.includes(char)) {
      for (const vowel of vowels) {
        if (vowel !== char) {
          variants.add(`${normalized.slice(0, i)}${vowel}${normalized.slice(i + 1)}`);
        }
      }
    }

    if (i > 0 && char === normalized[i - 1]) {
      variants.add(`${normalized.slice(0, i)}${normalized.slice(i + 1)}`);
    }
  }

  if (normalized.includes('ph')) variants.add(normalized.replaceAll('ph', 'f'));
  if (normalized.includes('f')) variants.add(normalized.replaceAll('f', 'ph'));
  if (normalized.includes('c')) variants.add(normalized.replaceAll('c', 'k'));
  if (normalized.includes('k')) variants.add(normalized.replaceAll('k', 'c'));
  if (normalized.endsWith('y')) variants.add(`${normalized.slice(0, -1)}i`);
  if (normalized.endsWith('i')) variants.add(`${normalized.slice(0, -1)}y`);

  variants.delete(normalized);
  return [...variants].filter((value) => /^[a-z][a-z'-]+$/.test(value)).slice(0, 12);
}

export function describeMatchCountError(error) {
  switch (error) {
    case 'rate-limit':
      return 'archive count unavailable — the archive service is rate-limiting requests, so retrying in a minute should clear it';
    case 'network':
      return 'archive count unavailable — the request did not reach the archive service (network failure); check your connection and retry';
    case 'server':
      return 'archive count unavailable — the archive service returned a server error; retrying may succeed';
    default:
      return 'archive count unavailable — the archive service did not return a usable count';
  }
}

export function formatReverseLookupText({ value, words }) {
  const safeValue = Number(value);
  if (!Number.isFinite(safeValue)) return '';
  const list = Array.isArray(words) ? words.filter(Boolean) : [];
  const root = digitalRoot(safeValue);
  const baseRoot = isBaseRootTotal(safeValue) ? ', base-root' : '';
  const header = `Reverse gematria ${safeValue} (root ${root}${baseRoot})`;
  if (!list.length) {
    return `${header}\nNo archived words match this total yet.`;
  }
  return `${header}\nArchived matches (${list.length}): ${list.join(', ')}`;
}

export function formatReverseRangeText({ min, max, buckets }) {
  const lo = Number(min);
  const hi = Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return '';
  const populated = Array.isArray(buckets)
    ? buckets.filter((bucket) => bucket && Array.isArray(bucket.words) && bucket.words.length)
    : [];
  const totalMatches = populated.reduce((sum, bucket) => sum + bucket.words.length, 0);
  const header = `Reverse gematria range ${lo}–${hi}`;
  if (!populated.length) {
    return `${header}\nNo archived words land in this range.`;
  }
  const lines = populated.map((bucket) => `  ${bucket.value}: ${bucket.words.join(', ')}`);
  return `${header}\n${totalMatches} match${totalMatches === 1 ? '' : 'es'} across ${populated.length} bucket${populated.length === 1 ? '' : 's'}:\n${lines.join('\n')}`;
}

export function formatComparisonText(reports) {
  if (!Array.isArray(reports) || !reports.length) return '';
  const lines = reports.map((entry) => `${entry.target}: ${entry.total} (root ${entry.root}${entry.isBaseRoot ? ', base-root' : ''})`);
  const totals = reports.map((entry) => entry.total);
  const span = Math.max(...totals) - Math.min(...totals);
  const allEqual = totals.every((value) => value === totals[0]);
  const summary = allEqual
    ? `Exact gematria match at ${totals[0]}.`
    : `Range ${Math.min(...totals)}–${Math.max(...totals)} (span ${span}).`;
  return `Gematria comparison\n${lines.join('\n')}\n${summary}`;
}

/**
 * Lightweight intent classifier for the general-chat fallback. When GemaBot
 * can't find a calculation target, this routes common conceptual questions
 * ("what is gematria?", "what's a base-root?") to a canned answer instead of
 * echoing the prompt. Returns a topic key, or '' when nothing matches.
 * Order matters — more specific concepts are tested before the generic
 * "what is gematria" catch.
 */
export function classifyGeneralChatTopic(prompt) {
  const normalized = normalizeCandidate(prompt).toLowerCase();
  if (!normalized) return '';

  if (/\bbase[\s-]?root\b/.test(normalized)) return 'base-root';
  if (/\bdigital[\s-]?root\b/.test(normalized)) return 'digital-root';

  if (/\b(?:who\s+are\s+you|what\s+are\s+you|what\s+can\s+you\s+do|what\s+do\s+you\s+do|how\s+do\s+i\s+use\s+(?:you|this|gemabot))\b/.test(normalized)
    || /^\s*help\b/.test(normalized)) {
    return 'capabilities';
  }

  if (/\breverse\b/.test(normalized)
    && /\b(?:lookup|look\s*up|search|how|work|find\s+words?|what\s+words?)\b/.test(normalized)) {
    return 'reverse-help';
  }

  if (/\b(?:how)\b/.test(normalized) && /\b(?:work|works|calculat|comput|add\s+up|figure)/.test(normalized)) {
    return 'how-it-works';
  }
  if (/\b(?:what|which)\b/.test(normalized) && /\b(?:cipher|system|method|scale)\b/.test(normalized)) {
    return 'how-it-works';
  }
  if (/\bwhy\b/.test(normalized) && /\benglish\b/.test(normalized)) {
    return 'how-it-works';
  }

  if (/\bgematria\b/.test(normalized)
    && /\b(?:what(?:'s| is| are)?|explain|define|definition|mean(?:s|ing)?|tell\s+me\s+about)\b/.test(normalized)) {
    return 'what-is-gematria';
  }

  return '';
}
