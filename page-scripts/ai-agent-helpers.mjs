/**
 * Pure helpers for the GemaBot agent UI. Mirrors the inline definitions in
 * page-scripts/ai-agent-1.js — this module is the canonical source and is
 * exercised by tests/ai-agent-helpers.test.mjs. The page script still
 * inlines these for now; migrate it to `import` from this file when
 * convenient.
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
  for (const char of String(text || '').toUpperCase()) {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      total += (code - 64) * 6;
    }
  }
  return total;
}

export function gematriaLetterBreakdown(text) {
  return [...String(text || '').toUpperCase()]
    .filter((char) => char >= 'A' && char <= 'Z')
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

export function isComparisonRequest(prompt) {
  const normalized = normalizeCandidate(prompt);
  if (!normalized) return false;
  return /\b(?:compare|comparison|comparing|contrast|contrasting|difference\s+between|side[\s-]?by[\s-]?side|vs\.?|versus|v\.)\b/i.test(normalized);
}

export function resolvePronouns(prompt, context) {
  if (!context || context.kind !== 'calculation' || !context.topic) return prompt;
  const topic = context.topic;
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
