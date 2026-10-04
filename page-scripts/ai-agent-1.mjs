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
        LEARNING_STOP_WORDS,
        tokenizeForLearning,
        scoreLearningOverlap,
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
      } from '/page-scripts/ai-agent-helpers.mjs';

      const form = document.getElementById('agentForm');
      const promptInput = document.getElementById('agentPrompt');
      const chatLog = document.getElementById('chatLog');
      const clearConversationButton = document.getElementById('clearConversation');
      const saveConversationButton = document.getElementById('saveConversation');
      const askAgentButton = form?.querySelector('button[type="submit"]');
      const waitingIndicator = document.getElementById('agentWaitingIndicator');
      const toggleHeroButton = document.getElementById('toggleHeroVisibility');
      const heroPanel = document.getElementById('agentHeroPanel');
      const compactTitle = document.getElementById('agentCompactTitle');
      const examplePromptsPanel = document.getElementById('agentExamplePrompts');
      const premiumGate = document.getElementById('premiumGate');
      const sharedResultBanner = document.getElementById('sharedResultBanner');
      const relatedWordsFollowupSuggestion = document.getElementById('relatedWordsFollowupSuggestion');
      const HERO_VISIBILITY_KEY = 'gematriaAgentHeroHidden.v1';
      const MEMBER_DASHBOARD_SYNC_KEY = 'memberDashboardUpdate';
      const memberDashboardSyncChannel = typeof window.BroadcastChannel === 'function'
        ? new window.BroadcastChannel('member-dashboard-sync')
        : null;
      let premiumAccess = false;
      const memberSession = {
        authenticated: false,
        membershipLevel: ''
      };
      let pendingRelatedWordsSuggestionTopic = '';
      let lastCalculationContext = null;
      const recentCalculations = [];
      const RECENT_CALCULATIONS_CAP = 10;
      const RECENT_CALCULATIONS_STORAGE_KEY = 'gematriaAgentRecentCalculations.v1';

      function persistRecentCalculations() {
        try {
          window.sessionStorage.setItem(RECENT_CALCULATIONS_STORAGE_KEY, JSON.stringify(recentCalculations));
        } catch {
          // sessionStorage may be unavailable (private mode, quota); recall just stays in-memory.
        }
      }

      function loadRecentCalculations() {
        try {
          const raw = window.sessionStorage.getItem(RECENT_CALCULATIONS_STORAGE_KEY);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) return;
          const sanitized = parsed
            .filter((entry) => entry && typeof entry.target === 'string' && entry.target.length)
            .slice(0, RECENT_CALCULATIONS_CAP);
          recentCalculations.length = 0;
          recentCalculations.push(...sanitized);
        } catch {
          // ignore corrupt payloads
        }
      }

      function rememberRecentCalculation(entry) {
        if (!entry || !entry.target) return;
        const key = String(entry.target).toLowerCase();
        const filtered = recentCalculations.filter((item) => item.target.toLowerCase() !== key);
        filtered.unshift({
          target: entry.target,
          total: entry.total,
          root: entry.root,
          isBaseRoot: entry.isBaseRoot,
          matchCount: Number.isFinite(entry.matchCount) ? entry.matchCount : null
        });
        recentCalculations.length = 0;
        recentCalculations.push(...filtered.slice(0, RECENT_CALCULATIONS_CAP));
        persistRecentCalculations();
      }

      function findRecentCalculation(target) {
        const key = String(target || '').toLowerCase().trim();
        if (!key) return null;
        return recentCalculations.find((entry) => entry.target.toLowerCase() === key) || null;
      }
      const AGENT_LEARNING_KEY = 'gematriaAgentLearnedResponses.v1';
      const DEFAULT_LEARNINGS = {
        entries: []
      };
      const globalLearningsState = {
        loaded: false,
        entries: []
      };
      const WORDNIK_RELATIONSHIP_OPTIONS = [
        { type: 'antonym', label: 'Antonym' },
        { type: 'synonym', label: 'Synonym' },
        { type: 'equivalent', label: 'Equivalent' },
        { type: 'cross-reference', label: 'Cross-reference' },
        { type: 'hypernym', label: 'Hypernym' },
        { type: 'hyponym', label: 'Hyponym' },
        { type: 'variant', label: 'Variant' },
        { type: 'same-context', label: 'Same context' }
      ];

      function setHeroVisibility(isHidden) {
        heroPanel.hidden = Boolean(isHidden);
        compactTitle.hidden = !isHidden;
        toggleHeroButton.textContent = isHidden ? 'Show intro' : 'Hide intro';
        toggleHeroButton.setAttribute('aria-expanded', String(!isHidden));
      }

      function refreshExamplePromptsVisibility() {
        if (!examplePromptsPanel) return;
        examplePromptsPanel.hidden = chatLog.children.length > 0;
      }

      function initializeHeroVisibility() {
        try {
          const savedValue = window.localStorage.getItem(HERO_VISIBILITY_KEY);
          setHeroVisibility(savedValue === '1');
        } catch (error) {
          setHeroVisibility(false);
        }
      }

      toggleHeroButton.addEventListener('click', () => {
        const nextHidden = !heroPanel.hidden;
        setHeroVisibility(nextHidden);
        try {
          window.localStorage.setItem(HERO_VISIBILITY_KEY, nextHidden ? '1' : '0');
        } catch (error) {
          // Ignore localStorage write failures.
        }
      });

      initializeHeroVisibility();

      function notifyDashboardUpdate(kind) {
        const update = {
          kind: String(kind || 'history'),
          at: Date.now(),
        };
        try {
          window.localStorage.setItem(MEMBER_DASHBOARD_SYNC_KEY, JSON.stringify(update));
        } catch {
          // Ignore localStorage write failures; BroadcastChannel covers modern browsers.
        }
        memberDashboardSyncChannel?.postMessage(update);
      }



      function readAgentLearnings() {
        try {
          const parsed = JSON.parse(localStorage.getItem(AGENT_LEARNING_KEY) || 'null');
          if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) return { ...DEFAULT_LEARNINGS };
          const entries = parsed.entries
            .map((entry) => ({
              prompt: normalizeCandidate(entry?.prompt),
              explanation: normalizeCandidate(entry?.explanation)
            }))
            .filter((entry) => entry.prompt && entry.explanation)
            .slice(0, 12);
          return { entries };
        } catch {
          return { ...DEFAULT_LEARNINGS };
        }
      }

      function writeAgentLearnings(learnings) {
        const entries = Array.isArray(learnings?.entries)
          ? learnings.entries
            .map((entry) => ({
              prompt: normalizeCandidate(entry?.prompt),
              explanation: normalizeCandidate(entry?.explanation)
            }))
            .filter((entry) => entry.prompt && entry.explanation)
            .slice(0, 12)
          : [];
        localStorage.setItem(AGENT_LEARNING_KEY, JSON.stringify({ entries }));
      }

      function mergeLearnings(localEntries = [], globalEntries = []) {
        const deduped = new Map();
        [...globalEntries, ...localEntries].forEach((entry) => {
          const prompt = normalizeCandidate(entry?.prompt).toLowerCase();
          const explanation = normalizeCandidate(entry?.explanation);
          if (!prompt || !explanation || deduped.has(prompt)) return;
          deduped.set(prompt, { prompt, explanation });
        });
        return [...deduped.values()];
      }

      function readCombinedLearnings() {
        const localLearnings = readAgentLearnings();
        return {
          entries: mergeLearnings(localLearnings.entries, globalLearningsState.entries)
        };
      }

      async function loadGlobalLearnings() {
        try {
          const response = await fetch('/api/ai-agent-learnings', { credentials: 'same-origin' });
          if (!response.ok) {
            globalLearningsState.loaded = true;
            return;
          }
          const payload = await response.json();
          const entries = Array.isArray(payload?.entries) ? payload.entries : [];
          globalLearningsState.entries = entries
            .map((entry) => ({
              prompt: normalizeCandidate(entry?.prompt).toLowerCase(),
              explanation: normalizeCandidate(entry?.explanation)
            }))
            .filter((entry) => entry.prompt && entry.explanation)
            .slice(0, 200);
          globalLearningsState.loaded = true;
        } catch {
          globalLearningsState.loaded = true;
        }
      }

      async function saveLearnedResponse(prompt, explanation) {
        const normalizedPrompt = normalizeCandidate(prompt).toLowerCase();
        const normalizedExplanation = normalizeCandidate(explanation);
        if (!normalizedPrompt || !normalizedExplanation) return false;

        const learnings = readAgentLearnings();
        const filtered = learnings.entries.filter((entry) => entry.prompt.toLowerCase() !== normalizedPrompt);
        filtered.unshift({ prompt: normalizedPrompt, explanation: normalizedExplanation });
        writeAgentLearnings({ entries: filtered });
        try {
          const response = await fetch('/api/ai-agent-learnings', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ prompt: normalizedPrompt, explanation: normalizedExplanation })
          });
          if (!response.ok) {
            return false;
          }
          const payload = await response.json().catch(() => ({}));
          const entries = Array.isArray(payload?.entries) ? payload.entries : [];
          globalLearningsState.entries = entries
            .map((entry) => ({
              prompt: normalizeCandidate(entry?.prompt).toLowerCase(),
              explanation: normalizeCandidate(entry?.explanation)
            }))
            .filter((entry) => entry.prompt && entry.explanation)
            .slice(0, 200);
          globalLearningsState.loaded = true;
          return true;
        } catch {
          return false;
        }
      }

      function forgetLocalLearning(promptKey) {
        const key = normalizeCandidate(promptKey).toLowerCase();
        if (!key) return false;
        const learnings = readAgentLearnings();
        const filtered = learnings.entries.filter((entry) => entry.prompt.toLowerCase() !== key);
        if (filtered.length === learnings.entries.length) return false;
        writeAgentLearnings({ entries: filtered });
        return true;
      }

      function findLearnedResponse(prompt) {
        const normalizedPrompt = normalizeCandidate(prompt).toLowerCase();
        if (!normalizedPrompt) return null;
        const learnings = readCombinedLearnings();
        if (!learnings.entries.length) return null;

        const substringHit = learnings.entries.find((entry) =>
          normalizedPrompt.includes(entry.prompt) || entry.prompt.includes(normalizedPrompt)
        );
        if (substringHit) return substringHit;

        const promptTokens = tokenizeForLearning(normalizedPrompt);
        if (promptTokens.length < 2) return null;

        let best = null;
        let bestScore = 0;
        for (const entry of learnings.entries) {
          const entryTokens = tokenizeForLearning(entry.prompt);
          if (entryTokens.length < 2) continue;
          const score = scoreLearningOverlap(promptTokens, entryTokens);
          if (score >= 0.4 && score > bestScore) {
            best = entry;
            bestScore = score;
          }
        }
        return best;
      }

      async function submitChatbotFeedback(query, answerText, wasExpected, feedbackText) {
        try {
          await fetch('/api/public-chatbot-feedback', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              query: String(query || '').trim().slice(0, 400),
              answerText: String(answerText || '').trim().slice(0, 2000) || null,
              wasExpected,
              feedbackText: feedbackText ? String(feedbackText).trim().slice(0, 1500) : null,
            }),
          });
        } catch {
          // Silently ignore — feedback submission is non-critical
        }
      }



      function buildComparisonSummary(reports) {
        if (!Array.isArray(reports) || reports.length < 2) return '';

        const sortedByTotal = [...reports].sort((a, b) => b.total - a.total);
        const highest = sortedByTotal[0];
        const lowest = sortedByTotal[sortedByTotal.length - 1];
        const span = highest.total - lowest.total;
        const totalsAllEqual = reports.every((entry) => entry.total === reports[0].total);
        const rootsAllEqual = reports.every((entry) => entry.root === reports[0].root);
        const baseRootCount = reports.filter((entry) => entry.isBaseRoot).length;

        const letterSets = reports.map((entry) => new Set(entry.letters.map((letter) => letter.char)));
        const sharedLetters = [...letterSets[0]].filter((char) => letterSets.every((set) => set.has(char)));

        const tableRows = reports.map((entry) => `
          <tr>
            <td>${escapeHtml(entry.target)}</td>
            <td>${entry.total}</td>
            <td>${entry.root}</td>
            <td>${entry.isBaseRoot ? 'Yes' : 'No'}</td>
            <td>${Number.isFinite(entry.matchCount) ? entry.matchCount : '—'}</td>
          </tr>
        `).join('');

        const highlights = [];
        if (totalsAllEqual) {
          highlights.push(`<li><strong>Exact gematria match</strong> — all ${reports.length} targets equal <strong>${highest.total}</strong>.</li>`);
        } else {
          highlights.push(`<li>Highest: <strong>${escapeHtml(highest.target)}</strong> (${highest.total}). Lowest: <strong>${escapeHtml(lowest.target)}</strong> (${lowest.total}). Span: <strong>${span}</strong>.</li>`);
        }
        if (rootsAllEqual && !totalsAllEqual) {
          highlights.push(`<li>Shared digital root: <strong>${reports[0].root}</strong>.</li>`);
        }
        if (baseRootCount === reports.length) {
          highlights.push(`<li>All targets land on a <strong>base-root</strong> pattern.</li>`);
        } else if (baseRootCount === 0) {
          highlights.push(`<li>None of the targets land on a base-root pattern.</li>`);
        } else {
          highlights.push(`<li>Base-root mix: <strong>${baseRootCount}</strong> of ${reports.length} are base-root.</li>`);
        }
        if (sharedLetters.length) {
          highlights.push(`<li>Letters present in every target: <code>${sharedLetters.join(', ')}</code>.</li>`);
        }
        if (reports.length === 2 && !totalsAllEqual) {
          const [a, b] = reports;
          const diff = Math.abs(a.total - b.total);
          const ratio = Math.min(a.total, b.total) === 0
            ? null
            : Math.max(a.total, b.total) / Math.min(a.total, b.total);
          const ratioText = ratio === null ? 'undefined' : ratio.toFixed(2);
          highlights.push(`<li>Pair gap: difference <strong>${diff}</strong>, ratio <strong>${ratioText}×</strong>.</li>`);
        }

        const payload = reports.map((entry) => ({
          target: entry.target,
          total: entry.total,
          root: entry.root,
          isBaseRoot: entry.isBaseRoot
        }));
        const payloadAttr = escapeHtml(JSON.stringify(payload));

        return `
          <section class="border rounded-3 p-2 mb-3">
            <p class="mb-2"><strong>Comparison summary</strong></p>
            <div class="table-responsive mb-2">
              <table class="table table-sm mb-0">
                <thead><tr><th>Target</th><th>Total</th><th>Root</th><th>Base-root</th><th>Archived</th></tr></thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>
            <ul class="mb-2">${highlights.join('')}</ul>
            <div class="d-flex flex-wrap gap-2">
              <button type="button" class="btn btn-sm btn-outline-success agent-copy-comparison-button" data-comparison="${payloadAttr}">Copy comparison</button>
            </div>
          </section>
        `;
      }

      async function fetchWordsForGematriaValues(values) {
        const buckets = await Promise.all(values.map(async (value) => {
          const words = await fetchWordsByGematriaValue(value);
          return {
            value,
            words: words.map((entry) => String(entry?.word || '').trim()).filter(Boolean)
          };
        }));
        return buckets;
      }

      function extractWordnikLookupWord(prompt) {
        const normalizedPrompt = normalizeCandidate(prompt);
        if (!normalizedPrompt) return '';

        const quotedTargets = extractQuotedTargets(normalizedPrompt);
        if (quotedTargets.length) {
          return quotedTargets[0];
        }

        const keywordMatch = normalizedPrompt.match(/\b(?:synonyms?|antonyms?|equivalents?|cross(?: |-)?references?|hypernyms?|hyponyms?|variants?|same context|definitions?|related words?|wordnik)\b(?:\s+(?:for|of))?\s+([A-Za-z][A-Za-z' -]*)/i);
        if (!keywordMatch) return '';
        const cleaned = normalizeCandidate(keywordMatch[1]).replace(/[?.!,;:]+$/g, '');
        return cleaned;
      }

      function buildRecallReply(entry) {
        return `
          <p class="mb-2"><strong>From this session:</strong> "${escapeHtml(entry.target)}" → total <strong>${entry.total}</strong>, digital root <strong>${entry.root}</strong>, base-root <strong>${entry.isBaseRoot ? 'Yes' : 'No'}</strong>.</p>
          <p class="mb-0">${Number.isFinite(entry.matchCount) ? `Archive density at that time: <strong>${entry.matchCount}</strong> (${describeMatchConfidence(entry.matchCount)}).` : `Archive count was unavailable in the original lookup — ${describeMatchCountError(entry.matchCount)}.`}</p>
        `;
      }

      function buildHypothesisReply(intent) {
        if (intent.kind === 'baseRoot') {
          const total = englishGematria(intent.target);
          const yes = isBaseRootTotal(total);
          const detail = yes
            ? `(${total} − 6) ÷ 54 = ${(total - 6) / 54}, a whole number — so yes, "${escapeHtml(intent.target)}" lands on a base-root.`
            : `(${total} − 6) ÷ 54 is not a whole number, so no, "${escapeHtml(intent.target)}" is not base-root.`;
          return `<p class="mb-0"><strong>${yes ? 'Yes' : 'No'}.</strong> ${detail}</p>`;
        }
        if (intent.kind === 'equal') {
          const totalA = englishGematria(intent.a);
          const totalB = englishGematria(intent.b);
          const same = totalA === totalB;
          return `<p class="mb-0"><strong>${same ? 'Yes' : 'No'}.</strong> "${escapeHtml(intent.a)}" totals <strong>${totalA}</strong>; "${escapeHtml(intent.b)}" totals <strong>${totalB}</strong>.${same ? ' Exact gematria match.' : ` Gap of ${Math.abs(totalA - totalB)}.`}</p>`;
        }
        if (intent.kind === 'compareTotals') {
          const totalA = englishGematria(intent.a);
          const totalB = englishGematria(intent.b);
          const actual = totalA > totalB ? 'greater' : totalA < totalB ? 'less' : 'equal';
          const matched = actual === intent.direction;
          const word = totalA === totalB ? 'equal to' : totalA > totalB ? 'greater than' : 'less than';
          return `<p class="mb-0"><strong>${matched ? 'Yes' : 'No'}.</strong> "${escapeHtml(intent.a)}" (${totalA}) is ${word} "${escapeHtml(intent.b)}" (${totalB}).</p>`;
        }
        return '';
      }

      function buildFollowupReply(context) {
        if (!context) {
          return '<p class="mb-0">No previous calculation to interpret yet. Try calculating a word first (example: <code>calculate jerusalem</code>) or run a reverse lookup (<code>reverse gematria 144</code>).</p>';
        }

        if (context.kind === 'reverseRange') {
          return `
            <p class="mb-2"><strong>About the range scan ${context.min}–${context.max}:</strong></p>
            <p class="mb-2">Swept <strong>${context.valueCount}</strong> valid gematria total${context.valueCount === 1 ? '' : 's'} (multiples of 6) and surfaced <strong>${context.totalMatches}</strong> archived match${context.totalMatches === 1 ? '' : 'es'} across <strong>${context.bucketCount}</strong> bucket${context.bucketCount === 1 ? '' : 's'}. Range scans are useful when a word's exact total feels off-by-a-letter, or when sweeping a thematic neighborhood.</p>
            <p class="mb-0">Drill into a single total with <code>reverse gematria N</code> for the focused view.</p>
          `;
        }

        if (context.kind === 'reverse') {
          const baseRootNote = isBaseRootTotal(context.value)
            ? ' It also lands on a <strong>base-root</strong> pattern (the total minus 6 divides evenly by 54), which often signals a resonant series worth tracking.'
            : '';
          const archiveNote = context.archivedCount === 0
            ? 'No archived words landed on that total in this run.'
            : `${context.archivedCount} archived word${context.archivedCount === 1 ? '' : 's'} share that total — each spells (A=6 … Z=156) to exactly ${context.value}.`;
          return `
            <p class="mb-2"><strong>About reverse lookup ${context.value}:</strong></p>
            <p class="mb-2">${archiveNote} Its digital root is <strong>${digitalRoot(context.value)}</strong>.${baseRootNote}</p>
            <p class="mb-0">For a deeper read, calculate any of the listed words to see letter breakdowns and related terms.</p>
          `;
        }

        if (context.kind === 'comparison') {
          const reports = Array.isArray(context.reports) ? context.reports : [];
          const totals = reports.map((entry) => entry.total);
          const allEqual = totals.length > 0 && totals.every((value) => value === totals[0]);
          const sharedRoot = reports.length > 0 && reports.every((entry) => entry.root === reports[0].root);
          const baseRootCount = reports.filter((entry) => entry.isBaseRoot).length;
          const lines = [];
          lines.push(`You compared ${reports.length} target${reports.length === 1 ? '' : 's'}: ${reports.map((entry) => `<strong>${escapeHtml(entry.target)}</strong> (${entry.total})`).join(', ')}.`);
          if (allEqual) {
            lines.push(`The totals all match at <strong>${totals[0]}</strong> — an exact gematria alignment, which in this system is the strongest numeric link.`);
          } else if (sharedRoot) {
            lines.push(`The totals differ but reduce to the same digital root <strong>${reports[0].root}</strong>, a softer alignment worth weighing alongside thematic context.`);
          } else {
            const span = Math.max(...totals) - Math.min(...totals);
            lines.push(`Totals span <strong>${span}</strong>, with no shared digital root — numerically these read as independent rather than linked.`);
          }
          if (baseRootCount === reports.length) {
            lines.push('Every target lands on a base-root pattern, which strengthens the case for a structural relationship.');
          } else if (baseRootCount > 0) {
            lines.push(`${baseRootCount} of ${reports.length} land on a base-root pattern — partial alignment only.`);
          }
          return `
            <p class="mb-2"><strong>What that comparison means:</strong></p>
            <ul class="mb-0">${lines.map((line) => `<li>${line}</li>`).join('')}</ul>
          `;
        }

        const { topic, total, root, isBaseRoot, matchCount } = context;
        const baseRootLine = isBaseRoot
          ? `It lands on a <strong>base-root</strong> pattern — <code>(${total} − 6) ÷ 54</code> is a whole number, placing it in the resonant series 6, 60, 114, 168, 222, 276 …`
          : `It does <em>not</em> land on a base-root pattern; the total minus 6 is not divisible by 54.`;
        const matchLine = !Number.isFinite(matchCount)
          ? `Archived match count was unavailable for this run — ${describeMatchCountError(matchCount)}.`
          : `Archive density: <strong>${matchCount}</strong> — ${describeMatchConfidence(matchCount)}.`;
        return `
          <p class="mb-2"><strong>Why this matters for "${escapeHtml(topic)}":</strong></p>
          <ul class="mb-2">
            <li>Total <strong>${total}</strong> = sum of letter values (A=6, B=12 … Z=156).</li>
            <li>Digital root <strong>${root}</strong> = repeatedly summing the digits of ${total}.</li>
            <li>${baseRootLine}</li>
            <li>${matchLine}</li>
          </ul>
          <p class="mb-0">Next steps: <code>reverse gematria ${total}</code> to see who else lands there, or <code>compare ${escapeHtml(topic)} and …</code> against a related concept.</p>
        `;
      }

      function extractRelatedWordsCalculationTarget(prompt) {
        const normalizedPrompt = normalizeCandidate(prompt);
        if (!normalizedPrompt) return '';

        const quotedTargets = extractQuotedTargets(normalizedPrompt);
        if (quotedTargets.length) {
          return quotedTargets[0];
        }

        const directTargetMatch = normalizedPrompt.match(
          /\b(?:calculate|show|find|get|lookup|look up|run)\s+(?:the\s+)?(?:related words?|synonyms?|antonyms?|equivalents?|cross(?: |-)?references?|hypernyms?|hyponyms?|variants?|same context)\b(?:\s+(?:for|of))?\s+([A-Za-z][A-Za-z' -]*)/i,
        );
        if (directTargetMatch) {
          return normalizeCandidate(directTargetMatch[1]).replace(/[?.!,;:]+$/g, '');
        }

        const wordnikTarget = extractWordnikLookupWord(normalizedPrompt);
        return wordnikTarget || '';
      }

      async function buildRelatedWordsCalculationReply(word, relationshipType = 'synonym', sourceLabel = '') {
        const relationshipLabel = relationshipType.replace('-', ' ');
        const relatedWords = await fetchRelatedWordsSummary(word, relationshipType);
        const relatedWordsWithTotals = relatedWords.map((entry) => {
          const total = englishGematria(entry);
          return {
            word: entry,
            total,
            root: digitalRoot(total),
            isBaseRoot: isBaseRootTotal(total)
          };
        });

        pendingRelatedWordsSuggestionTopic = '';
        renderRelatedWordsFollowupSuggestion();

        return `
          <p class="mb-2"><strong>${sourceLabel || 'Related words calculation'} for "${escapeHtml(word)}"</strong></p>
          ${relatedWordsWithTotals.length
            ? `
              <p class="mb-2">Here are the ${escapeHtml(relationshipLabel)} results with gematria totals:</p>
              <ul class="mb-2">
                ${relatedWordsWithTotals.map((entry) => `<li><strong>${escapeHtml(entry.word)}</strong> → total ${entry.total}, digital root ${entry.root}, base-root ${entry.isBaseRoot ? 'Yes' : 'No'}</li>`).join('')}
              </ul>
              <p class="mb-0">Click any result for a quick full lookup:</p>
              <div class="d-flex flex-wrap gap-2 mt-2">
                ${relatedWordsWithTotals.map((entry) => `<button type="button" class="btn btn-sm btn-outline-secondary agent-word-lookup-button" data-word="${escapeHtml(entry.word)}">${escapeHtml(entry.word)}</button>`).join('')}
              </div>
            `
            : `<p class="mb-0">I could not find ${escapeHtml(relationshipLabel)} results for <strong>${escapeHtml(word)}</strong> right now. Please try again in a moment.</p>`
          }
        `;
      }

      function buildMemberAccessLinks(normalizedPrompt) {
        const wantsWordnik = /\b(wordnik|synonyms?|antonyms?|equivalents?|cross(?: |-)?references?|hypernyms?|hyponyms?|variants?|same context|definitions?|related words?)\b/i.test(normalizedPrompt);
        const wantsResearch = /\b(premium research|research tools?|premium tools?)\b/i.test(normalizedPrompt);
        const wantsReports = /\b(member reports?|reports?|dashboard|history)\b/i.test(normalizedPrompt);

        if (!wantsWordnik && !wantsResearch && !wantsReports) {
          return '';
        }

        const lookupWord = extractWordnikLookupWord(normalizedPrompt);
        const levelLabel = memberSession.membershipLevel || 'premium';
        const actions = [];

        if (wantsWordnik) {
          actions.push('<li><a href="/premium-research.html" target="_blank" rel="noopener noreferrer">Open Premium Research Wordnik panel</a> for synonym/antonym/equivalent lookups.</li>');
          if (lookupWord) {
            actions.push(`<li><a href="/api/wordnikDefinition?word=${encodeURIComponent(lookupWord)}" data-json-preview="wordnik-definition">Definition lookup for "${escapeHtml(lookupWord)}"</a>.</li>`);
            actions.push(`
              <li>
                Relationship lookups for "${escapeHtml(lookupWord)}":
                <div class="d-flex flex-wrap gap-2 mt-1">
                  ${WORDNIK_RELATIONSHIP_OPTIONS.map((entry) => `
                    <a
                      href="/api/wordnikRelatedWords?word=${encodeURIComponent(lookupWord)}&relationshipType=${encodeURIComponent(entry.type)}&limit=8"
                      data-json-preview="wordnik-related"
                      class="btn btn-sm btn-outline-secondary"
                    >${escapeHtml(entry.label)}</a>
                  `).join('')}
                </div>
              </li>
            `);
          } else {
            actions.push('<li>Add a word after your keyword (example: <code>synonyms for covenant</code>) for direct Wordnik links.</li>');
          }
        }

        if (wantsResearch) {
          actions.push('<li><a href="/premium-research.html" target="_blank" rel="noopener noreferrer">Premium research items</a> (Wordnik relationship mapping, stats, and gematria dataset tools).</li>');
        }

        if (wantsReports) {
          actions.push('<li><a href="/member.html" target="_blank" rel="noopener noreferrer">Membership dashboard</a> for saved AI-agent calculations and account-level history.</li>');
          actions.push('<li><a href="/forum.html" target="_blank" rel="noopener noreferrer">Forum reports view</a> to review moderation reports tied to your member account permissions.</li>');
        }

        return `
          <p class="mb-2"><strong>Quick access (${escapeHtml(levelLabel)} account):</strong></p>
          <ul class="mb-2">
            ${actions.join('')}
          </ul>
        `;
      }

      function buildGeneralChatTopicAnswer(topic) {
        switch (topic) {
          case 'what-is-gematria':
            return `
              <p class="mb-2"><strong>Gematria</strong> assigns a number to each letter and sums them, so words and phrases become totals you can compare. This site uses <strong>English gematria</strong>: A=6, B=12 … Z=156 (each letter's position in the alphabet × 6).</p>
              <p class="mb-2">Start with <a href="/gematria-basics.html">Gematria basics</a>, or read the fuller <a href="/gematria-guide.html">gematria guide</a>. Then try <code>calculate new jerusalem</code> and I'll show the breakdown.</p>
            `;
          case 'how-it-works':
            return `
              <p class="mb-2">English gematria here is base-6 ordinal: <strong>A=6, B=12, C=18 … Z=156</strong>. A word's total is the sum of its letters; spaces, digits, and punctuation are ignored.</p>
              <p class="mb-2">Try <code>calculate jerusalem</code> for a per-letter breakdown, or read <a href="/why-english-gematria.html">why this site uses English gematria</a>.</p>
            `;
          case 'base-root':
            return `
              <p class="mb-2">A <strong>base-root</strong> total is one where <code>(total − 6) ÷ 54</code> is a whole number — the resonant series 6, 60, 114, 168, 222, 276 … Ask <code>is mercy a base-root?</code> and I'll check any word for you.</p>
            `;
          case 'digital-root':
            return `
              <p class="mb-2">A <strong>digital root</strong> reduces a number to a single digit by repeatedly summing its digits — e.g. 144 → 1+4+4 = <strong>9</strong>. I show the digital root on every calculation.</p>
            `;
          case 'reverse-help':
            return `
              <p class="mb-2">A <strong>reverse lookup</strong> finds archived words that share a gematria total. Try <code>reverse gematria 144</code>, a range like <code>words between 120 and 150</code>, or <code>words near 144</code>.</p>
            `;
          case 'capabilities':
            return `
              <p class="mb-2">I'm <strong>GemaBot</strong>. I can:</p>
              <ul class="mb-2">
                <li>Calculate gematria — <code>calculate new jerusalem</code></li>
                <li>Compare words — <code>compare pilot and process</code></li>
                <li>Run reverse lookups — <code>reverse gematria 144</code> or <code>words between 120 and 150</code></li>
                <li>Check patterns — <code>is mercy a base-root?</code></li>
                <li>Pull synonyms &amp; definitions for a word</li>
              </ul>
            `;
          default:
            return '';
        }
      }

      async function buildGeneralChatReply(normalizedPrompt, learnedResponse) {
        const learnedCue = learnedResponse
          ? `<span class="d-none" data-applied-learning="${escapeHtml(learnedResponse.prompt)}"></span>`
          : '';
        const topicAnswer = buildGeneralChatTopicAnswer(classifyGeneralChatTopic(normalizedPrompt));
        const relatedLookupWord = /\b(?:synonyms?|antonyms?|equivalents?|cross(?: |-)?references?|hypernyms?|hyponyms?|variants?|same context|related words?)\b/i.test(normalizedPrompt)
          ? extractWordnikLookupWord(normalizedPrompt)
          : '';
        const relationshipType = extractWordnikRelationshipType(normalizedPrompt);
        const relatedWords = relatedLookupWord ? await fetchRelatedWordsSummary(relatedLookupWord, relationshipType) : [];
        const relationshipTitle = relationshipType.replace('-', ' ');
        const synonymResponseBlock = relatedLookupWord
          ? `
            <p class="mb-2"><strong>${escapeHtml(relationshipTitle)} results for "${escapeHtml(relatedLookupWord)}"</strong></p>
            ${relatedWords.length ? `
              <p class="mb-2">Click any word for a quick GemaBot lookup:</p>
              <div class="d-flex flex-wrap gap-2 mb-2">
                ${relatedWords.map((word) => `
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary agent-word-lookup-button"
                    data-word="${escapeHtml(word)}"
                  >${escapeHtml(word)}</button>
                `).join('')}
              </div>
            ` : `<p class="mb-2">I could not find related ${escapeHtml(relationshipTitle)} results right now. Please try again in a moment.</p>`}
          `
          : '';

        // Only fall back to the generic "how to phrase it" guidance when we have
        // nothing more specific to say (no routed topic and no synonym results).
        const fallbackGuidance = (topicAnswer || synonymResponseBlock)
          ? ''
          : `
            <p class="mb-2">I couldn't spot a word or number to work with. Ask me to <code>calculate &lt;word&gt;</code>, <code>compare A and B</code>, or <code>reverse gematria &lt;number&gt;</code> — or ask things like "what is gematria?" or "what's a base-root?".</p>
            <p class="mb-0">For site-wide search, try <strong>SiteSeeker</strong> in the top menu.</p>
          `;

        return `
          ${learnedCue}
          ${topicAnswer}
          ${synonymResponseBlock}
          ${buildMemberAccessLinks(normalizedPrompt)}
          ${fallbackGuidance}
        `;
      }

      // forum-1.js honours this for its scrolls; the chat did not.
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      function scrollBehavior() {
        return prefersReducedMotion.matches ? 'auto' : 'smooth';
      }

      function scrollChatToBottom() {
        // #chatLog is not a scroll container -- the page scrolls -- so the old
        // scrollTop assignment here did nothing at all.
        chatLog.lastElementChild?.scrollIntoView({ behavior: scrollBehavior(), block: 'end' });
      }

      function scrollMessageToTop(messageElement) {
        if (!messageElement) return;
        messageElement.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      }

      function addMessage(role, contentHtml, options = {}) {
        const pinToTop = Boolean(options.pinToTop);
        const wrapper = document.createElement('article');
        const isAssistant = role === 'assistant';
        wrapper.dataset.role = isAssistant ? 'assistant' : 'user';
        wrapper.setAttribute('aria-label', isAssistant ? 'GemaBot reply' : 'Your message');
        wrapper.className = `p-3 rounded-3 border ${isAssistant ? 'bg-light border-secondary-subtle' : 'bg-white'}`;
        wrapper.innerHTML = `<p class="small text-muted mb-2">${isAssistant ? 'GemaBot' : 'You'}</p><div data-message-content>${contentHtml}</div>`;
        chatLog.append(wrapper);
        refreshExamplePromptsVisibility();
        if (pinToTop) {
          scrollMessageToTop(wrapper);
        } else {
          scrollChatToBottom();
        }
        return wrapper;
      }

      function readChatTranscriptFromDom() {
        const normalizeTranscriptLine = (line) => String(line || '').replace(/[\t\f\v ]+/g, ' ').trim();
        const NOISE_SELECTORS = [
          '.agent-actions-menu',
          '.agent-copy-comparison-button',
          '.agent-copy-reverse-button',
          '.agent-copy-reverse-range-button',
          '.agent-reverse-filter',
          '.agent-reverse-show-all',
          '.agent-reverse-empty',
        ].join(',');

        const flattenTableToLines = (table) => {
          const headers = [...table.querySelectorAll('thead th')]
            .map((cell) => normalizeTranscriptLine(cell.textContent));
          const rows = [...table.querySelectorAll('tbody tr')].map((tr) => {
            const cells = [...tr.querySelectorAll('th,td')]
              .map((cell) => normalizeTranscriptLine(cell.textContent));
            if (headers.length === cells.length) {
              return cells.map((cell, idx) => headers[idx] ? `${headers[idx]} ${cell}` : cell).join(' · ');
            }
            return cells.join(' · ');
          });
          const replacement = table.ownerDocument.createElement('div');
          replacement.textContent = rows.join('\n');
          table.replaceWith(replacement);
        };

        const prepareTranscriptCopy = (sourceElement) => {
          const clone = sourceElement.cloneNode(true);
          clone.querySelectorAll(NOISE_SELECTORS).forEach((node) => node.remove());
          // Collapsed disclosure panels: keep the summary label, drop the hidden body.
          clone.querySelectorAll('details.agent-disclosure:not([open])').forEach((details) => {
            const summary = details.querySelector('summary');
            const summaryText = summary ? summary.textContent : '';
            const replacement = details.ownerDocument.createElement('div');
            replacement.textContent = normalizeTranscriptLine(summaryText);
            details.replaceWith(replacement);
          });
          clone.querySelectorAll('table').forEach(flattenTableToLines);
          return clone;
        };

        const readClonedInnerText = (clone) => {
          const staging = document.createElement('div');
          staging.style.cssText = 'position:absolute;left:-99999px;top:-99999px;width:800px;visibility:hidden;pointer-events:none;';
          staging.appendChild(clone);
          document.body.appendChild(staging);
          const text = clone.innerText || clone.textContent || '';
          staging.remove();
          return text;
        };

        const removeTranscriptUiLines = (text) => String(text || '')
          .replace(/\bSave to (?:my|membership) dashboard\b/gi, '')
          .replace(/\bSave "[^"\n]+" to my dashboard\b/gi, '')
          .replace(/\b(?:Open calculator search for|Calculator search for)\s+"[^"\n]*"/gi, '')
          .replace(/\b(?:Dictionary lookup page for|Dictionary page for)\s+"[^"\n]*"(?:\s+—\s+Preview:[^\n]*)?/gi, '')
          .replace(/\bRun at least 3 semantic neighbors and compare both full totals and digital roots\./gi, '')
          .replace(/\(\s*(singular|rare|uncommon|moderate|common|saturated)\s+—\s+[^)]+\)/gi, '($1)')
          .replace(
            /(Detected calculation targets?:\s*[^\n]+)\s+(For\s+(?:"[^"\n]+"|[^,\n]+),\s+here\s+is\s+the\s+current\s+gematria\s+snapshot:)/gi,
            '$1\n\n$2',
          )
          .replace(/\s+(Total:\s*\d+)/gi, '\n$1')
          .replace(/\s+(Digital root:\s*\d+)/gi, '\n$1')
          .replace(/\s+(Base-root pattern:\s*(?:Yes|No))/gi, '\n$1')
          .replace(/\s+(Current archived matches:\s*[^\n]+)/gi, '\n$1')
          .replace(/\s+(Suggested next lookups)/gi, '\n$1')
          .replace(/\s+(Related words lookup:)/gi, '\n$1');

        return [...chatLog.querySelectorAll('article[data-role]')]
          .map((article) => {
            const role = String(article.dataset.role || '').trim();
            const contentElement = article.querySelector('[data-message-content]') || article;
            const transcriptCopy = prepareTranscriptCopy(contentElement);
            const rawText = String(readClonedInnerText(transcriptCopy) || '')
              .replace(/\r\n?/g, '\n')
              .trim();
            const text = rawText
              .split('\n')
              .map((line) => normalizeTranscriptLine(line))
              .join('\n')
              .replace(/\n{3,}/g, '\n\n')
              .replace(/^\s*$/gm, '')
              .trim();
            const cleanedText = removeTranscriptUiLines(text)
              .replace(/\n{3,}/g, '\n\n')
              .trim();
            if (!cleanedText || (role !== 'assistant' && role !== 'user')) {
              return null;
            }
            return { role, text: cleanedText };
          })
          .filter(Boolean);
      }

      async function saveChatSessionToDashboard() {
        const transcript = readChatTranscriptFromDom();
        if (!transcript.length) {
          throw new Error('No chat messages found. Ask the GemaBot first, then save the session.');
        }

        const firstUserMessage = transcript.find((entry) => entry.role === 'user')?.text || 'GemaBot session';
        const title = firstUserMessage.length > 80 ? `${firstUserMessage.slice(0, 77)}...` : firstUserMessage;
        const response = await fetch('/api/member-chat-sessions', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title,
            topic: firstUserMessage,
            transcript,
            metadata: {
              source: 'ai_agent',
              rounds: null,
            },
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to save this chat session right now.');
        }

        notifyDashboardUpdate('chat');
        return 'Chat session saved to your membership dashboard.';
      }

      function attachResultFeedbackUi(messageElement, originalPrompt, answerText) {
        if (!messageElement || !originalPrompt) return;

        const feedbackContainer = document.createElement('div');
        feedbackContainer.className = 'mt-3 border-top pt-3';
        const detailsId = `feedbackDetails-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        feedbackContainer.innerHTML = `
          <p class="mb-2 small fw-semibold">Were these results what you expected?</p>
          <div class="d-flex flex-wrap gap-2 mb-2">
            <button type="button" class="btn btn-sm btn-outline-success" data-feedback="yes">Yes</button>
            <button type="button" class="btn btn-sm btn-outline-warning" data-feedback="no">No</button>
          </div>
          <div class="feedback-followup" hidden>
            <label class="form-label small" for="${detailsId}">Please explain what you expected so I can learn for similar prompts.</label>
            <textarea id="${detailsId}" class="form-control form-control-sm mb-2" rows="2" placeholder="Example: For prompts about names, start with a short summary before the full breakdown."></textarea>
            <button type="button" class="btn btn-sm btn-primary" data-feedback="save">Save learning</button>
          </div>
          <p class="small mb-0 text-muted feedback-status" hidden></p>
        `;

        const followup = feedbackContainer.querySelector('.feedback-followup');
        const status = feedbackContainer.querySelector('.feedback-status');
        const detailsInput = feedbackContainer.querySelector('textarea');
        const yesButton = feedbackContainer.querySelector('[data-feedback="yes"]');
        const noButton = feedbackContainer.querySelector('[data-feedback="no"]');
        const saveButton = feedbackContainer.querySelector('[data-feedback="save"]');

        yesButton?.addEventListener('click', () => {
          yesButton.disabled = true;
          if (noButton) noButton.disabled = true;
          if (followup) followup.hidden = true;
          if (status) {
            status.hidden = false;
            status.textContent = 'Great — thanks for confirming.';
          }
          submitChatbotFeedback(originalPrompt, answerText, true, null);
        });

        noButton?.addEventListener('click', () => {
          const appliedLearningNode = messageElement.querySelector('[data-applied-learning]');
          const appliedKey = appliedLearningNode?.getAttribute('data-applied-learning') || '';
          const suppressed = appliedKey ? forgetLocalLearning(appliedKey) : false;
          if (followup) followup.hidden = false;
          if (status) {
            status.hidden = false;
            status.textContent = suppressed
              ? 'Thanks. I removed that learned preference for this device. Share what you expected, then save learning.'
              : 'Thanks for the correction. Share what you expected, then save learning.';
          }
        });

        saveButton?.addEventListener('click', async () => {
          const explanation = normalizeCandidate(detailsInput?.value || '');
          if (!explanation) {
            if (status) {
              status.hidden = false;
              status.textContent = 'Please add a short explanation so I can learn from it.';
            }
            return;
          }
          saveButton.disabled = true;
          submitChatbotFeedback(originalPrompt, answerText, false, explanation);
          const savedGlobally = await saveLearnedResponse(originalPrompt, explanation);
          if (status) {
            status.hidden = false;
            status.textContent = savedGlobally
              ? 'Saved globally. I will use this guidance for everyone on similar prompts.'
              : 'Saved on this device. Global sync failed right now, so this guidance is local only for now.';
          }
          if (followup) followup.hidden = true;
          if (yesButton) yesButton.disabled = true;
          if (noButton) noButton.disabled = true;
        });

        messageElement.appendChild(feedbackContainer);
      }

      function getCanonicalOrigin() {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          return window.location.origin;
        }
        return window.location.protocol === 'https:' ? window.location.origin : `https://${window.location.host}`;
      }

      function renderRelatedWordsFollowupSuggestion() {
        if (!relatedWordsFollowupSuggestion) return;
        const topic = normalizeCandidate(pendingRelatedWordsSuggestionTopic);
        if (!topic) {
          relatedWordsFollowupSuggestion.hidden = true;
          relatedWordsFollowupSuggestion.innerHTML = '';
          return;
        }
        relatedWordsFollowupSuggestion.hidden = false;
        relatedWordsFollowupSuggestion.innerHTML = `
          <p class="mb-0"><em>Would you like me to calculate the related words for "${escapeHtml(topic)}"?</em> You can reply with <code>yes</code> or ask directly: <code>calculate the related words for ${escapeHtml(topic)}</code>.</p>
        `;
      }

      function toShareImageAssetUrl(urlCandidate) {
        const source = String(urlCandidate || '').trim();
        if (!source || /^data:image\//i.test(source)) {
          return source;
        }
        const absoluteUrl = new URL(source, getCanonicalOrigin()).toString();
        const encoded = encodeURIComponent(absoluteUrl);
        return `${getCanonicalOrigin()}/.netlify/images?url=${encoded}&w=1200&fm=jpg`;
      }

      function withFileExtension(filename, extension) {
        const rawName = String(filename || 'download').trim() || 'download';
        const normalizedExtension = String(extension || '').trim().replace(/^\./, '');
        if (!normalizedExtension) {
          return rawName;
        }

        return rawName.replace(/\.[a-z0-9]+$/i, `.${normalizedExtension}`);
      }

      function normalizeImageMimeType(blobType) {
        return String(blobType || '').toLowerCase().split(';')[0].trim();
      }

      function fileExtensionFromImageBlob(blob) {
        const normalizedType = normalizeImageMimeType(blob?.type);
        const extensionByType = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/webp': 'webp',
          'image/gif': 'gif',
          'image/svg+xml': 'svg',
          'image/avif': 'avif',
        };
        if (extensionByType[normalizedType]) {
          return extensionByType[normalizedType];
        }
        const subtype = normalizedType.match(/^image\/([a-z0-9.+-]+)$/i)?.[1] || '';
        return subtype.replace(/^svg\+xml$/i, 'svg') || 'img';
      }

      async function downloadShareImage(shareImageUrlCandidate, filename) {
        const response = await fetch(shareImageUrlCandidate, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Unable to download image right now. Please try again.');
        }

        const imageBlob = await response.blob();
        const originalImageType = normalizeImageMimeType(imageBlob?.type);
        if (!(imageBlob instanceof Blob) || !originalImageType.startsWith('image/')) {
          throw new Error('Downloaded file was not a valid image. Please try again.');
        }
        let jpegBlob = originalImageType === 'image/jpeg' ? imageBlob : null;
        if (!jpegBlob) {
          try {
            jpegBlob = await new Promise((resolve, reject) => {
              const imageUrl = URL.createObjectURL(imageBlob);
              const image = new Image();
              image.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth || image.width;
                canvas.height = image.naturalHeight || image.height;
                const context = canvas.getContext('2d');
                if (!context) {
                  URL.revokeObjectURL(imageUrl);
                  reject(new Error('no 2d context'));
                  return;
                }
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((convertedBlob) => {
                  URL.revokeObjectURL(imageUrl);
                  if (convertedBlob) {
                    resolve(convertedBlob);
                    return;
                  }
                  reject(new Error('jpeg conversion failed'));
                }, 'image/jpeg', 0.92);
              };
              image.onerror = () => {
                URL.revokeObjectURL(imageUrl);
                reject(new Error('image decode failed'));
              };
              image.src = imageUrl;
            });
          } catch {
            jpegBlob = null;
          }
        }

        const downloadableBlob = jpegBlob || imageBlob;
        const filenameWithExtension = withFileExtension(
          filename,
          fileExtensionFromImageBlob(downloadableBlob)
        );
        const objectUrl = URL.createObjectURL(downloadableBlob);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = objectUrl;
        downloadAnchor.download = filenameWithExtension;
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        setTimeout(() => {
          downloadAnchor.remove();
          URL.revokeObjectURL(objectUrl);
        }, 1000);
      }

      function buildCalculatorImageUrl({ topic, total, root, isBaseRoot, definitionPreview, perLetterValues }) {
        const imageUrl = new URL('/.netlify/functions/calculator-share-image', getCanonicalOrigin());
        imageUrl.searchParams.set('type', 'word');
        imageUrl.searchParams.set('query', topic);
        imageUrl.searchParams.set('total', String(total));
        imageUrl.searchParams.set('digitalRoot', String(root));
        imageUrl.searchParams.set('isBaseRoot', String(Boolean(isBaseRoot)));
        imageUrl.searchParams.set('definitionPreview', definitionPreview || 'Definition preview unavailable.');
        imageUrl.searchParams.set('perLetterValues', perLetterValues || 'No alphabetical letters detected.');
        return imageUrl.toString();
      }

      function buildAgentShareUrl({ topic, total, root, isBaseRoot, definitionPreview, perLetterValues }) {
        const shareUrl = new URL('/calculator.html', getCanonicalOrigin());
        shareUrl.searchParams.set('query', topic);
        shareUrl.searchParams.set('total', String(total));
        shareUrl.searchParams.set('digitalRoot', String(root));
        shareUrl.searchParams.set('isBaseRoot', String(Boolean(isBaseRoot)));
        if (definitionPreview) {
          shareUrl.searchParams.set('definitionPreview', definitionPreview);
        }
        if (perLetterValues) {
          shareUrl.searchParams.set('perLetterValues', perLetterValues);
        }
        shareUrl.hash = 'gematria-result';
        return shareUrl.toString();
      }

      function buildAgentShareImageUrl({ topic, total, root }) {
        const imageUrl = new URL('/api/ai-agent-share-image', getCanonicalOrigin());
        imageUrl.searchParams.set('topic', topic);
        imageUrl.searchParams.set('total', String(total));
        imageUrl.searchParams.set('root', String(root));
        return imageUrl.toString();
      }


      function reportButtonEvent(action, metadata = {}) {
        const normalizedAction = String(action || '').trim().toLowerCase();
        if (!normalizedAction) {
          return;
        }
        fetch('/api/public-button-report', {
          method: 'POST',
          credentials: 'same-origin',
          keepalive: true,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            route: window.location.pathname,
            action: normalizedAction,
            metadata,
          }),
        }).catch(() => {});
      }

      async function fetchShareImageFile(imageUrl) {
        try {
          const response = await fetch(imageUrl);
          if (!response.ok) return null;
          const blob = await response.blob();
          return new File([blob], 'gematria-lookup.png', { type: 'image/png' });
        } catch {
          return null;
        }
      }

      function showSharePicker(shareUrl, shareText, nativePayload) {
        const existing = document.getElementById('sharePickerOverlay');
        if (existing) existing.remove();

        const encodedUrl = encodeURIComponent(shareUrl);
        const encodedText = encodeURIComponent(shareText);
        const canUseNativeShare = Boolean(nativePayload && typeof navigator.share === 'function');

        const overlay = document.createElement('div');
        overlay.id = 'sharePickerOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:320px;width:90%;text-align:center;font-family:inherit;';
        dialog.innerHTML = `
          <h5 style="margin:0 0 16px;font-size:1.1rem;">Share this lookup</h5>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <a href="https://x.com/intent/tweet?text=${encodedText}&url=${encodedUrl}"
               target="_blank" rel="noopener noreferrer"
               class="btn btn-dark btn-sm fw-semibold" style="text-decoration:none;">
              Share on X
            </a>
            <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}"
               target="_blank" rel="noopener noreferrer"
               class="btn btn-primary btn-sm fw-semibold" style="text-decoration:none;">
              Share on Facebook
            </a>
            <button type="button" class="btn btn-outline-secondary btn-sm fw-semibold" id="sharePickerCopy">
              Copy link
            </button>
            ${canUseNativeShare ? `
              <button type="button" class="btn btn-outline-secondary btn-sm fw-semibold" id="sharePickerNative">
                More apps…
              </button>
            ` : ''}
            <button type="button" class="btn btn-link btn-sm text-muted" id="sharePickerClose">
              Cancel
            </button>
          </div>
        `;
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function(e) {
          if (e.target === overlay) overlay.remove();
        });
        dialog.querySelector('#sharePickerClose').addEventListener('click', function() {
          overlay.remove();
        });
        dialog.querySelector('#sharePickerCopy').addEventListener('click', async function() {
          try {
            await navigator.clipboard.writeText(shareUrl);
            this.textContent = 'Copied!';
            setTimeout(function() { overlay.remove(); }, 1200);
          } catch {
            window.prompt('Copy this link to share:', shareUrl);
            overlay.remove();
          }
        });
        const nativeButton = dialog.querySelector('#sharePickerNative');
        if (nativeButton) {
          nativeButton.addEventListener('click', async function() {
            try {
              await navigator.share(nativePayload);
              overlay.remove();
            } catch (error) {
              if (!error || error.name !== 'AbortError') {
                overlay.remove();
              }
            }
          });
        }
        dialog.querySelectorAll('a[target="_blank"]').forEach((link) => {
          link.addEventListener('click', () => {
            setTimeout(() => overlay.remove(), 150);
          });
        });

        return overlay;
      }

      async function sharePage(payload, fallbackShareUrl) {
        const shareUrl = String(payload.url || fallbackShareUrl || '').trim();
        const shareText = String(payload.text || '').trim();
        const nativePayload = {
          title: payload.title || document.title,
          text: shareText.includes(shareUrl) ? shareText : `${shareText}

View results: ${shareUrl}`.trim(),
          url: shareUrl
        };

        const imageUrl = String(payload.imageUrl || '').trim();
        if (imageUrl) {
          const imageFile = await fetchShareImageFile(imageUrl);
          if (imageFile) {
            if (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [imageFile] })) {
              nativePayload.files = [imageFile];
            }
          }
        }

        showSharePicker(shareUrl, shareText, nativePayload);
        return true;
      }

      async function ensurePremiumAccess() {
        try {
          const response = await fetch('/api/member-session', { credentials: 'include' });
          const payload = await response.json();
          const level = String(payload?.member?.membershipLevel || '').toLowerCase();
          memberSession.authenticated = Boolean(payload?.authenticated);
          memberSession.membershipLevel = level;
          premiumAccess = Boolean(payload?.authenticated) && (level === 'premium' || level === 'lifetime');
        } catch {
          memberSession.authenticated = false;
          memberSession.membershipLevel = '';
          premiumAccess = false;
        }

        if (!premiumAccess) {
          premiumGate.hidden = false;
          premiumGate.innerHTML = 'GemaBot is a <strong>premium member feature</strong>. Please <a href="/member.html" class="alert-link">log in or upgrade your membership</a> to use GemaBot analysis and sharing.';
          form.querySelectorAll('textarea, select, button[type=\"submit\"]').forEach((field) => {
            field.disabled = true;
          });
          // The example chips live outside the form, so the gate never touched
          // them. They called form.requestSubmit(), which the submit handler
          // silently drops when gated -- a click that did nothing at all.
          document.querySelectorAll('.agent-example-prompt').forEach((chip) => {
            chip.disabled = true;
            chip.title = 'GemaBot is a premium member feature.';
          });
          return;
        }

        premiumGate.hidden = true;
      }

      function showSharedResultIfPresent() {
        const params = new URLSearchParams(window.location.search);
        const shared = describeSharedLookup(params.get('sharedTopic'));
        if (!shared) return;

        sharedResultBanner.hidden = false;
        sharedResultBanner.innerHTML = `<strong>Shared gematria lookup:</strong> ${escapeHtml(shared.topic)} → total ${shared.total}, digital root ${shared.root}.`;
      }

      function normalizeDictionaryText(value) {
        return String(value || '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      // Session-scoped cache for /api/searchByGematria. The endpoint returns
      // { count, words } in one payload, so a single request serves both the
      // match-count and reverse-lookup paths. The cached value is the in-flight
      // promise, so concurrent callers for the same total dedupe automatically.
      // Only successful responses are kept; failures are dropped so retries can
      // recover (rate-limit, transient network/server errors).
      const gematriaArchiveCache = new Map();

      async function fetchGematriaArchive(total) {
        const key = String(total);
        const cached = gematriaArchiveCache.get(key);
        if (cached) return cached;

        const request = (async () => {
          let response;
          try {
            response = await fetch(`/api/searchByGematria?gematria=${encodeURIComponent(key)}`);
          } catch {
            return { ok: false, error: 'network' };
          }
          if (!response.ok) {
            if (response.status === 429) return { ok: false, error: 'rate-limit' };
            if (response.status >= 500) return { ok: false, error: 'server' };
            return { ok: false, error: 'unknown' };
          }
          try {
            const payload = await response.json();
            return { ok: true, payload };
          } catch {
            return { ok: false, error: 'unknown' };
          }
        })();

        gematriaArchiveCache.set(key, request);
        const result = await request;
        if (!result.ok) {
          gematriaArchiveCache.delete(key);
        }
        return result;
      }

      async function fetchMatchCount(total) {
        const result = await fetchGematriaArchive(total);
        if (!result.ok) return result.error;
        const count = Number(result.payload?.count);
        return Number.isFinite(count) ? count : 'unknown';
      }

      async function fetchSpellingVariantHits(topic) {
        const lowerTopic = String(topic || '').toLowerCase().trim();
        if (!lowerTopic) return [];
        const candidates = [...new Set(
          buildCloseSpellingVariants(topic)
            .map((variant) => String(variant || '').toLowerCase().trim())
            .filter((variant) => variant && variant !== lowerTopic)
        )].slice(0, 8);
        if (!candidates.length) return [];

        const enriched = await Promise.all(candidates.map(async (variant) => {
          const total = englishGematria(variant);
          const matchCount = await fetchMatchCount(total);
          return {
            variant,
            total,
            root: digitalRoot(total),
            isBaseRoot: isBaseRootTotal(total),
            matchCount
          };
        }));

        return enriched
          .filter((entry) => Number.isFinite(entry.matchCount) && entry.matchCount > 0)
          .sort((a, b) => b.matchCount - a.matchCount)
          .slice(0, 6);
      }

      async function fetchWordsByGematriaValue(gematriaValue) {
        const result = await fetchGematriaArchive(gematriaValue);
        if (!result.ok) return [];
        return Array.isArray(result.payload?.words) ? result.payload.words : [];
      }

      async function fetchWordDatabaseStats() {
        try {
          const response = await fetch('/api/public-word-stats');
          if (!response.ok) return null;
          const payload = await response.json();
          const totalWords = Number(payload?.totalWords);
          return Number.isFinite(totalWords) ? totalWords : null;
        } catch {
          return null;
        }
      }

      async function fetchDefinitionSummary(topic) {
        try {
          const response = await fetch(`/api/wordnikDefinition?word=${encodeURIComponent(topic)}`);
          if (!response.ok) return null;
          const payload = await response.json();
          const firstDefinition = Array.isArray(payload?.definitions) ? payload.definitions[0] : null;
          const definitionText = normalizeDictionaryText(firstDefinition?.text);
          return definitionText || null;
        } catch {
          return null;
        }
      }

      async function fetchDefinitionList(topic, limit = 6) {
        try {
          const response = await fetch(`/api/wordnikDefinition?word=${encodeURIComponent(topic)}`);
          if (!response.ok) return [];
          const payload = await response.json();
          const definitions = Array.isArray(payload?.definitions) ? payload.definitions : [];
          return definitions
            .map((entry) => normalizeDictionaryText(entry?.text))
            .filter(Boolean)
            .slice(0, Math.max(1, Math.min(15, Number(limit) || 6)));
        } catch {
          return [];
        }
      }

      async function fetchRelatedWordsSummary(topic, relationshipType = 'synonym') {
        try {
          const response = await fetch(`/api/wordnikRelatedWords?word=${encodeURIComponent(topic)}&relationshipType=${encodeURIComponent(relationshipType)}&limit=8`);
          if (!response.ok) return [];
          const payload = await response.json();
          const buckets = Array.isArray(payload?.data) ? payload.data : [];
          const words = buckets.flatMap((bucket) => Array.isArray(bucket?.words) ? bucket.words : []);
          return [...new Set(words.map((word) => String(word || '').trim()).filter(Boolean))].slice(0, 6);
        } catch {
          return [];
        }
      }

      async function buildJsonLinkPreviewReply(url, explicitPreviewType = '') {
        const parsedUrl = new URL(url, window.location.origin);
        const previewType = explicitPreviewType || String(parsedUrl.searchParams.get('preview') || '').trim();
        const word = normalizeCandidate(parsedUrl.searchParams.get('word') || '');
        const relationshipType = normalizeCandidate(parsedUrl.searchParams.get('relationshipType') || 'synonym').toLowerCase();

        if (!word) {
          return '<p class="mb-0">I could not determine which word to preview from that JSON link.</p>';
        }

        if (previewType === 'wordnik-definition' || parsedUrl.pathname.includes('/wordnikDefinition')) {
          const definitions = await fetchDefinitionList(word, 6);
          return definitions.length
            ? `
              <p class="mb-2"><strong>Definitions for "${escapeHtml(word)}"</strong></p>
              <ol class="mb-2">
                ${definitions.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}
              </ol>
              <p class="mb-0">Quick lookup: <button type="button" class="btn btn-link p-0 align-baseline agent-word-lookup-button" data-word="${escapeHtml(word)}">${escapeHtml(word)}</button></p>
            `
            : `<p class="mb-0">I could not load readable definitions for <strong>${escapeHtml(word)}</strong> right now.</p>`;
        }

        if (previewType === 'wordnik-related' || parsedUrl.pathname.includes('/wordnikRelatedWords')) {
          const relatedWords = await fetchRelatedWordsSummary(word, relationshipType);
          const relationshipLabel = relationshipType.replace('-', ' ');
          return relatedWords.length
            ? `
              <p class="mb-2"><strong>${escapeHtml(relationshipLabel)} words for "${escapeHtml(word)}"</strong></p>
              <p class="mb-2">Click any word for a quick GemaBot lookup:</p>
              <div class="d-flex flex-wrap gap-2 mb-0">
                ${relatedWords.map((entry) => `
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary agent-word-lookup-button"
                    data-word="${escapeHtml(entry)}"
                  >${escapeHtml(entry)}</button>
                `).join('')}
              </div>
            `
            : `<p class="mb-0">No related words were available for <strong>${escapeHtml(word)}</strong> right now.</p>`;
        }

        return '<p class="mb-0">I can only preview supported Wordnik JSON links right now.</p>';
      }

      function promptForHistoryNote() {
        return new Promise((resolve) => {
          const modalElement = document.getElementById('save-history-note-modal');
          if (!modalElement || !window.bootstrap?.Modal) {
            resolve({ confirmed: true, note: '' });
            return;
          }
          const modal = window.bootstrap.Modal.getOrCreateInstance(modalElement);
          const noteInput = document.getElementById('save-history-note-input');
          const confirmBtn = document.getElementById('save-history-note-confirm');
          if (noteInput) {
            noteInput.value = '';
          }
          let settled = false;
          const handleConfirm = () => {
            if (settled) return;
            settled = true;
            const noteText = noteInput?.value ?? '';
            cleanup();
            modal.hide();
            resolve({ confirmed: true, note: noteText });
          };
          const handleHidden = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve({ confirmed: false, note: '' });
          };
          const cleanup = () => {
            confirmBtn?.removeEventListener('click', handleConfirm);
            modalElement.removeEventListener('hidden.bs.modal', handleHidden);
          };
          confirmBtn?.addEventListener('click', handleConfirm);
          modalElement.addEventListener('hidden.bs.modal', handleHidden);
          modalElement.addEventListener('shown.bs.modal', () => noteInput?.focus(), { once: true });
          modal.show();
        });
      }

      async function saveCalculationToDashboard(meta, noteText = '') {
        const rawTopic = normalizeCandidate(meta?.topic);
        const extractedTargets = extractCalculationTargets(rawTopic);
        const queryText = normalizeCandidate(extractedTargets[0] || rawTopic);
        if (!queryText) {
          throw new Error('A calculation topic is required before saving.');
        }

        const total = Number(meta?.total);
        const root = Number(meta?.root);
        const matches = Number(meta?.matches);
        const rounds = Number(meta?.rounds);
        const payload = {
          queryText,
          queryType: 'word',
          calculatorSource: 'ai_agent',
          gematriaTotal: Number.isFinite(total) ? total : null,
          digitalRoot: Number.isFinite(root) ? root : null,
          isBaseRoot: Number.isFinite(total) ? isBaseRootTotal(total) : null,
          note: String(noteText ?? '').trim(),
          resultPayload: {
            topic: queryText,
            total: Number.isFinite(total) ? total : null,
            digitalRoot: Number.isFinite(root) ? root : null,
            matchCount: Number.isFinite(matches) ? matches : null,
            rounds: Number.isFinite(rounds) ? rounds : null,
            source: 'GemaBot'
          }
        };

        const response = await fetch('/api/member-history', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || 'Unable to save this calculation right now.');
        }

        notifyDashboardUpdate('history');
        return data?.duplicate
          ? 'This calculation is already saved in your membership dashboard.'
          : 'Saved to your membership dashboard history.';
      }

      async function buildAgentReply(prompt) {
        const rawNormalized = normalizeCandidate(prompt);

        if (isCancellationPrompt(rawNormalized)) {
          pendingRelatedWordsSuggestionTopic = '';
          renderRelatedWordsFollowupSuggestion();
          return '<p class="mb-0">Cleared. What would you like to calculate next?</p>';
        }

        if (isFollowupQuestion(rawNormalized)) {
          return buildFollowupReply(lastCalculationContext);
        }

        const normalizedPrompt = normalizeNumericInput(resolvePronouns(rawNormalized, lastCalculationContext));

        const recallTarget = extractRecallTarget(normalizedPrompt);
        if (recallTarget) {
          const remembered = findRecentCalculation(recallTarget);
          if (remembered) {
            return buildRecallReply(remembered);
          }
        }

        const hypothesisIntent = extractHypothesisIntent(normalizedPrompt);
        if (hypothesisIntent) {
          return buildHypothesisReply(hypothesisIntent);
        }

        const learnedResponse = findLearnedResponse(normalizedPrompt);
        const requestedSpellingVariantLookup = /\btry\s+close\s+spelling\s+variants\s+of\b/i.test(normalizedPrompt);
        // Numeric normalization can merge spelled-number range operands across
        // the connecting "and", so retry on the raw prompt where the words survive.
        const reverseRange = extractRangeReverseLookup(normalizedPrompt)
          || extractRangeReverseLookup(rawNormalized);
        const reverseGematriaValue = reverseRange ? null : extractReverseGematriaValue(normalizedPrompt);
        const relationshipType = extractWordnikRelationshipType(normalizedPrompt);
        const explicitRelatedWordsTarget = extractRelatedWordsCalculationTarget(normalizedPrompt);
        const affirmativeFollowup = isAffirmativePrompt(normalizedPrompt);

        if (explicitRelatedWordsTarget && /\b(?:related words?|synonyms?|antonyms?|equivalents?|cross(?: |-)?references?|hypernyms?|hyponyms?|variants?|same context)\b/i.test(normalizedPrompt)) {
          return buildRelatedWordsCalculationReply(explicitRelatedWordsTarget, relationshipType);
        }

        if (affirmativeFollowup && pendingRelatedWordsSuggestionTopic) {
          return buildRelatedWordsCalculationReply(
            pendingRelatedWordsSuggestionTopic,
            'synonym',
            'Great — running that now'
          );
        }


        if (/\b(?:how many|number of|count|total)\b.*\bwords?\b.*\b(?:database|dataset|archive)\b/i.test(normalizedPrompt)) {
          const totalWords = await fetchWordDatabaseStats();
          if (Number.isFinite(totalWords)) {
            return `<p class="mb-0">The current database has <strong>${totalWords.toLocaleString()}</strong> tracked word${totalWords === 1 ? '' : 's'}.</p>`;
          }
          return '<p class="mb-0">I could not load the live word count right now. Please try again in a moment.</p>';
        }

        if (reverseRange && reverseRange.values.length) {
          const buckets = await fetchWordsForGematriaValues(reverseRange.values);
          const populated = buckets.filter((bucket) => bucket.words.length > 0);
          const totalMatches = populated.reduce((sum, bucket) => sum + bucket.words.length, 0);

          lastCalculationContext = {
            kind: 'reverseRange',
            min: reverseRange.min,
            max: reverseRange.max,
            valueCount: reverseRange.values.length,
            bucketCount: populated.length,
            totalMatches
          };

          const headerNote = reverseRange.truncated
            ? ` (capped at the first ${reverseRange.values.length} multiples; requested span ${reverseRange.requestedMin}–${reverseRange.requestedMax} was wider)`
            : '';
          const bucketsHtml = populated.length
            ? populated.map((bucket) => `
                <section class="border rounded-3 p-2 mb-2">
                  <p class="mb-1"><strong>${bucket.value}</strong> — ${bucket.words.length} match${bucket.words.length === 1 ? '' : 'es'}</p>
                  <div class="d-flex flex-wrap gap-2">
                    ${bucket.words.map((word) => `<button type="button" class="btn btn-sm btn-outline-secondary agent-word-lookup-button" data-word="${escapeHtml(word)}">${escapeHtml(word)}</button>`).join('')}
                  </div>
                </section>
              `).join('')
            : '<p class="mb-0">No archived words landed on any total in this range.</p>';

          const rangePayloadAttr = escapeHtml(JSON.stringify({
            min: reverseRange.min,
            max: reverseRange.max,
            buckets: populated
          }));
          return `
            <p class="mb-2"><strong>Reverse gematria range ${reverseRange.min} → ${reverseRange.max}</strong>${headerNote}</p>
            <p class="mb-2">Scanned <strong>${reverseRange.values.length}</strong> valid total${reverseRange.values.length === 1 ? '' : 's'} (multiples of 6). Found <strong>${totalMatches}</strong> archived match${totalMatches === 1 ? '' : 'es'} across <strong>${populated.length}</strong> bucket${populated.length === 1 ? '' : 's'}.</p>
            ${bucketsHtml}
            <div class="d-flex flex-wrap gap-2 mt-2">
              <button type="button" class="btn btn-sm btn-outline-success agent-copy-reverse-range-button" data-reverse-range="${rangePayloadAttr}">Copy lookup</button>
            </div>
          `;
        }

        if (Number.isFinite(reverseGematriaValue)) {
          const gematriaValue = reverseGematriaValue;
          if (gematriaValue <= 0) {
            return '<p class="mb-0">Please provide a positive gematria number so I can search the word database.</p>';
          }

          if (gematriaValue % 6 !== 0) {
            const lower = Math.floor(gematriaValue / 6) * 6;
            const upper = lower + 6;
            const suggestions = [lower, upper].filter((value) => value > 0);
            const suggestionButtons = suggestions
              .map((value) => `<button type="button" class="btn btn-sm btn-outline-secondary agent-reverse-lookup-button" data-gematria-value="${value}">${value}</button>`)
              .join(' ');
            return `
              <p class="mb-2">English gematria values are multiples of 6 (A=6, B=12 ... Z=156), so <strong>${gematriaValue}</strong> is not a valid base-6 total.</p>
              <p class="mb-0">Try the nearest valid totals: ${suggestionButtons}</p>
            `;
          }

          const words = await fetchWordsByGematriaValue(gematriaValue);
          if (!words.length) {
            const lower = gematriaValue - 6;
            const upper = gematriaValue + 6;
            const neighborButtons = [lower, upper]
              .filter((value) => value > 0)
              .map((value) => `<button type="button" class="btn btn-sm btn-outline-secondary agent-reverse-lookup-button" data-gematria-value="${value}">${value}</button>`)
              .join(' ');
            return `
              <p class="mb-2">No archived words match gematria value <strong>${gematriaValue}</strong> yet.</p>
              <p class="mb-0">Try the neighbors: ${neighborButtons}</p>
            `;
          }

          const wordsList = words
            .map((entry) => String(entry?.word || '').trim())
            .filter(Boolean);

          lastCalculationContext = { kind: 'reverse', value: gematriaValue, archivedCount: wordsList.length };

          const reversePayloadAttr = escapeHtml(JSON.stringify({
            value: gematriaValue,
            words: wordsList
          }));
          const REVERSE_PREVIEW_LIMIT = 30;
          const hasOverflow = wordsList.length > REVERSE_PREVIEW_LIMIT;
          const hiddenCount = Math.max(0, wordsList.length - REVERSE_PREVIEW_LIMIT);
          const useMultiColumn = wordsList.length > 12;
          return `
            <div class="agent-reverse-lookup" data-total="${wordsList.length}" data-preview-limit="${REVERSE_PREVIEW_LIMIT}">
              <div class="d-flex justify-content-between align-items-start flex-wrap agent-reverse-header mb-2">
                <div>
                  <p class="mb-1"><strong>Reverse gematria lookup for ${gematriaValue}</strong></p>
                  <p class="small text-muted mb-0">${wordsList.length} archived match${wordsList.length === 1 ? '' : 'es'} · click any word to look it up.</p>
                </div>
                <div class="d-flex gap-2 flex-shrink-0">
                  <button type="button" class="btn btn-sm btn-outline-success agent-copy-reverse-button" data-reverse="${reversePayloadAttr}">Copy</button>
                </div>
              </div>
              ${wordsList.length > 8 ? `
                <input
                  type="search"
                  class="form-control form-control-sm agent-reverse-filter mb-2"
                  placeholder="Filter ${wordsList.length} words…"
                  aria-label="Filter words"
                />
              ` : ''}
              <p class="agent-reverse-empty mb-2" aria-live="polite">No words match that filter.</p>
              <ul class="mb-2 agent-reverse-list ${useMultiColumn ? 'agent-multi-column-list' : ''}" data-show-all="false">
                ${wordsList.map((word, idx) => `
                  <li data-filter-text="${escapeHtml(word.toLowerCase())}"${idx >= REVERSE_PREVIEW_LIMIT ? ' data-tail-item="true" hidden' : ''}>
                    <button
                      type="button"
                      class="btn btn-link p-0 align-baseline agent-word-lookup-button"
                      data-word="${escapeHtml(word)}"
                    >${escapeHtml(word)}</button>
                  </li>
                `).join('')}
              </ul>
              ${hasOverflow ? `
                <button
                  type="button"
                  class="btn btn-link btn-sm p-0 agent-reverse-show-all"
                  data-total="${wordsList.length}"
                  data-hidden-count="${hiddenCount}"
                >Show all ${wordsList.length} (${hiddenCount} more)</button>
              ` : ''}
            </div>
          `;
        }

        const rawCalculationTargets = extractCalculationTargets(normalizedPrompt);
        if (!rawCalculationTargets.length) {
          const strayNumberMatch = normalizedPrompt.match(/\b(\d{1,6})\b/);
          if (strayNumberMatch) {
            const strayValue = Number(strayNumberMatch[1]);
            return `<p class="mb-0">Did not see a word or phrase to calculate. To run a reverse gematria lookup for <strong>${strayValue}</strong>, try <code>reverse gematria ${strayValue}</code> or <code>what words equal ${strayValue}</code>.</p>`;
          }
          return buildGeneralChatReply(normalizedPrompt, learnedResponse);
        }

        const calculationTargets = rawCalculationTargets.filter((target) => gematriaLetterBreakdown(target).length > 0);
        if (!calculationTargets.length) {
          return `<p class="mb-0">I couldn't find any A–Z letters in ${escapeHtml(rawCalculationTargets.join(', '))}. English gematria covers A=6 through Z=156 only — other systems (Hebrew, Greek) aren't supported here yet.</p>`;
        }

        const topic = calculationTargets[0] || '';
        pendingRelatedWordsSuggestionTopic = topic;
        if (!topic) {
          return '<p class="mb-0">Please share a word, phrase, or name so I can calculate and discuss it.</p>';
        }

        const total = englishGematria(topic);
        const root = digitalRoot(total);
        const isBaseRoot = isBaseRootTotal(total);
        const allWordReports = await Promise.all(calculationTargets.map(async (targetValue) => {
          const reportTotal = englishGematria(targetValue);
          const reportMatches = await fetchMatchCount(reportTotal);
          return {
            target: targetValue,
            total: reportTotal,
            root: digitalRoot(reportTotal),
            isBaseRoot: isBaseRootTotal(reportTotal),
            matchCount: reportMatches,
            letters: gematriaLetterBreakdown(targetValue)
          };
        }));

        allWordReports.forEach((report) => rememberRecentCalculation(report));

        const primaryWordReport = allWordReports.find((entry) => entry.target === topic) || allWordReports[0];
        const matchCount = primaryWordReport?.matchCount ?? null;

        // Secondary lookups (definitions, related words, spelling variants) run in parallel
        // with the headline render. The finalize closure awaits them and appends to the cards.
        const perTargetLookupsPromise = Promise.all(allWordReports.map(async (entry) => {
          const [definitionSummary, relatedWords] = await Promise.all([
            fetchDefinitionSummary(entry.target),
            fetchRelatedWordsSummary(entry.target),
          ]);
          return { target: entry.target, definitionSummary, relatedWords };
        }));

        const autoSpellingVariantHitsPromise = (allWordReports.length === 1 && primaryWordReport?.matchCount === 0)
          ? fetchSpellingVariantHits(topic)
          : Promise.resolve([]);

        const iterations = 2;
        const memoryContext = '';

        function refineAnalysis(previousStep, round) {
          const nuance = !Number.isFinite(matchCount)
            ? `${describeMatchCountError(matchCount)}; prioritize manual grouping checks this round.`
            : matchCount === 0
              ? 'No archived matches yet; this could be a new lead, so validate with spelling variants and adjacent concepts.'
              : `There ${matchCount === 1 ? 'is' : 'are'} ${matchCount} archived ${matchCount === 1 ? 'match' : 'matches'}; inspect semantic quality, not only numeric overlap.`;

          const confidence = isBaseRoot
            ? 'Moderate: base-root alignment can signal structure, but context still decides meaning.'
            : 'Provisional: no base-root alignment, so require stronger thematic evidence.';

          return {
            round,
            focus: round === 1
              ? 'Establish numeric baseline.'
              : `Improve round ${round} by stress-testing the previous interpretation for bias and missing context.`,
            critique: `Prior step recap: ${previousStep.focus} ${previousStep.critique || ''}`.trim(),
            upgrade: `${nuance} ${confidence} ${memoryContext}`.trim(),
            nextAction: round % 2 === 0
              ? 'Run at least 3 semantic neighbors and compare both full totals and digital roots.'
              : 'Run spelling/title variants and document non-matches equally with matches.'
          };
        }

        const recursiveSteps = [];
        let currentStep = {
          round: 0,
          focus: 'Starting point from your prompt.',
          critique: 'No prior critique yet.',
          upgrade: 'Will improve recursively.',
          nextAction: 'Generate baseline.'
        };

        for (let round = 1; round <= iterations; round += 1) {
          currentStep = refineAnalysis(currentStep, round);
          recursiveSteps.push(currentStep);
        }

        const closeSpellingVariants = buildCloseSpellingVariants(topic).map((variant) => {
          const total = englishGematria(variant);
          return {
            variant,
            total,
            root: digitalRoot(total),
            isBaseRoot: isBaseRootTotal(total)
          };
        });

        const comparisonRequested = isComparisonRequest(normalizedPrompt) && allWordReports.length >= 2;
        const comparisonSummary = comparisonRequested ? buildComparisonSummary(allWordReports) : '';

        lastCalculationContext = comparisonRequested
          ? {
              kind: 'comparison',
              reports: allWordReports.map((entry) => ({
                target: entry.target,
                total: entry.total,
                root: entry.root,
                isBaseRoot: entry.isBaseRoot
              }))
            }
          : { kind: 'calculation', topic, total, root, isBaseRoot, matchCount };

        const letterBreakdownText = (entry) => entry.letters.length
          ? entry.letters.map((letter) => `${letter.char}=${letter.value}`).join(', ')
          : 'No alphabetical letters detected.';

        const initialHtml = `
          ${learnedResponse ? `<span class="d-none" data-applied-learning="${escapeHtml(learnedResponse.prompt)}"></span>` : ''}
          ${comparisonSummary}
          <div class="d-flex flex-column gap-2 mb-2" data-agent-cards>
            ${allWordReports.map((entry) => {
              const archiveCountLabel = Number.isFinite(entry.matchCount)
                ? `${entry.matchCount} (${describeMatchConfidence(entry.matchCount)})`
                : describeMatchCountError(entry.matchCount);
              const perLetterValues = letterBreakdownText(entry);
              return `
                <section class="agent-result-card border rounded-3 p-3" data-target-index="${allWordReports.indexOf(entry)}">
                  <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
                    <p class="mb-0 fw-bold">${escapeHtml(entry.target)}</p>
                    <details class="agent-actions-menu">
                      <summary aria-label="Actions for ${escapeHtml(entry.target)}">Actions ⋯</summary>
                      <div class="agent-actions-popover">
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-success agent-save-history-button"
                          data-topic="${escapeHtml(entry.target)}"
                          data-total="${entry.total}"
                          data-root="${entry.root}"
                          data-matches="${Number.isFinite(entry.matchCount) ? entry.matchCount : ''}"
                          data-rounds="${iterations}"
                        >Save to dashboard</button>
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-warning agent-save-image-button"
                          data-topic="${escapeHtml(entry.target)}"
                          data-total="${entry.total}"
                          data-root="${entry.root}"
                          data-base-root="${entry.isBaseRoot ? 'true' : 'false'}"
                          data-definition-preview=""
                          data-per-letter-values="${escapeHtml(perLetterValues)}"
                        >Save image</button>
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-info agent-share-image-button"
                          data-topic="${escapeHtml(entry.target)}"
                          data-total="${entry.total}"
                          data-root="${entry.root}"
                          data-base-root="${entry.isBaseRoot ? 'true' : 'false'}"
                          data-definition-preview=""
                          data-per-letter-values="${escapeHtml(perLetterValues)}"
                        >Share</button>
                      </div>
                    </details>
                  </div>
                  <p class="agent-stat-row small mb-0">Total <strong>${entry.total}</strong> · Root <strong>${entry.root}</strong> · ${entry.isBaseRoot ? 'Base-root' : 'Not base-root'} · Archived: ${archiveCountLabel}</p>
                  <div data-secondary-slot></div>
                </section>
              `;
            }).join('')}
          </div>
          ${requestedSpellingVariantLookup ? `
            <p class="mt-3 mb-2"><strong>Close spelling-variant lookup for "${escapeHtml(topic)}"</strong></p>
            ${closeSpellingVariants.length ? `
              <ul class="mb-0">
                ${closeSpellingVariants.map((entry) => `<li>${escapeHtml(entry.variant)} → total ${entry.total}, digital root ${entry.root}, base-root ${entry.isBaseRoot ? 'Yes' : 'No'}</li>`).join('')}
              </ul>
            ` : '<p class="mb-0">No close spelling variants were generated from this input. Try a single-word topic for variant lookups.</p>'}
          ` : ''}
        `;

        function renderRelatedWordsButtons(words) {
          if (!words.length) return '<span class="small text-muted">No related terms were found right now.</span>';
          const withTotals = words.map((word) => {
            const total = englishGematria(word);
            return {
              word,
              total,
              isBaseRoot: isBaseRootTotal(total),
            };
          });
          return `
            <div class="d-flex flex-wrap gap-2 mt-1">
              ${withTotals.map((relatedEntry) => `<button type="button" class="btn btn-sm btn-outline-secondary agent-word-lookup-button" data-word="${escapeHtml(relatedEntry.word)}">${escapeHtml(relatedEntry.word)} (${relatedEntry.isBaseRoot ? 'base-root' : 'not base-root'})</button>`).join('')}
            </div>
          `;
        }

        function renderCardSecondaryHtml(entry, definitionSummary, relatedWords, spellingHitsForCard) {
          const perLetterValues = letterBreakdownText(entry);
          const inlineDefinition = definitionSummary
            ? `<p class="small fst-italic text-secondary-emphasis mb-1 mt-2">${escapeHtml(definitionSummary.slice(0, 200))}${definitionSummary.length > 200 ? '…' : ''}</p>`
            : '';
          const closeSpellingBlock = spellingHitsForCard.length
            ? `
              <details class="agent-disclosure mt-2" open>
                <summary>Close spelling variants with archive hits</summary>
                <div class="agent-disclosure-body">
                  <p class="small text-muted mb-2">No archived words land on ${entry.total} yet. These near-spellings do appear in the archive — click to deep-look-up.</p>
                  <div class="d-flex flex-wrap gap-2">
                    ${spellingHitsForCard.map((hit) => `<button type="button" class="btn btn-sm btn-outline-secondary agent-word-lookup-button" data-word="${escapeHtml(hit.variant)}">${escapeHtml(hit.variant)} (${hit.total}, ${hit.matchCount} match${hit.matchCount === 1 ? '' : 'es'})</button>`).join('')}
                  </div>
                </div>
              </details>
            `
            : '';
          return `
            ${inlineDefinition}
            <details class="agent-disclosure mt-2">
              <summary>Letter breakdown</summary>
              <div class="agent-disclosure-body small">${escapeHtml(perLetterValues)}</div>
            </details>
            ${closeSpellingBlock}
            <details class="agent-disclosure mt-1">
              <summary>Suggested next lookups</summary>
              <div class="agent-disclosure-body">
                <ul class="small mb-1">
                  ${definitionSummary ? `<li><a href="/definition?word=${encodeURIComponent(entry.target)}" target="_blank" rel="noopener noreferrer">Dictionary page for "${escapeHtml(entry.target)}"</a></li>` : ''}
                  <li><a href="/calculator.html?query=${encodeURIComponent(entry.target)}" target="_blank" rel="noopener noreferrer">Calculator search for "${escapeHtml(entry.target)}"</a></li>
                </ul>
                <p class="small mb-1">Related words:</p>
                ${renderRelatedWordsButtons(relatedWords || [])}
              </div>
            </details>
          `;
        }

        return {
          initialHtml,
          finalize: async (messageElement) => {
            const [perTargetLookups, autoSpellingVariantHits] = await Promise.all([
              perTargetLookupsPromise,
              autoSpellingVariantHitsPromise,
            ]);
            const cards = messageElement.querySelectorAll('.agent-result-card');
            allWordReports.forEach((entry, idx) => {
              const card = cards[idx];
              if (!card) return;
              const lookup = perTargetLookups[idx] || { definitionSummary: '', relatedWords: [] };
              const showSpellingHits = (allWordReports.length === 1 && entry.matchCount === 0 && autoSpellingVariantHits.length)
                ? autoSpellingVariantHits
                : [];
              const slot = card.querySelector('[data-secondary-slot]');
              if (slot) {
                slot.innerHTML = renderCardSecondaryHtml(entry, lookup.definitionSummary, lookup.relatedWords, showSpellingHits);
              }
              const preview = lookup.definitionSummary || '';
              card.querySelectorAll('.agent-save-image-button, .agent-share-image-button').forEach((btn) => {
                btn.dataset.definitionPreview = preview;
              });
            });
          },
        };
      }

      function setComposerWaitingState(isWaiting) {
        const waiting = Boolean(isWaiting);
        form.classList.toggle('is-waiting-for-response', waiting);
        form.setAttribute('aria-busy', waiting ? 'true' : 'false');
        if (relatedWordsFollowupSuggestion) {
          if (waiting) {
            relatedWordsFollowupSuggestion.hidden = true;
          } else {
            renderRelatedWordsFollowupSuggestion();
          }
        }
        if (waitingIndicator) {
          waitingIndicator.hidden = !waiting;
        }
      }

      async function renderAgentReply(prompt) {
        const reply = await buildAgentReply(prompt);
        const isStreaming = reply && typeof reply === 'object' && 'initialHtml' in reply;
        const initialHtml = isStreaming ? reply.initialHtml : reply;
        const assistantMessage = addMessage('assistant', initialHtml);
        // finalize() fetches definitions and related words, which can take
        // seconds. If the reader scrolled during that time, scrolling them back
        // to the bottom afterwards yanks the page out from under them.
        let readerScrolled = false;
        const noteScroll = () => { readerScrolled = true; };
        window.addEventListener('wheel', noteScroll, { passive: true, once: true });
        window.addEventListener('touchmove', noteScroll, { passive: true, once: true });
        window.addEventListener('keydown', noteScroll, { once: true });

        if (isStreaming && typeof reply.finalize === 'function') {
          try {
            await reply.finalize(assistantMessage);
          } catch (error) {
            // Secondary content failed; the headline is still useful.
          }
        }
        const contentNode = assistantMessage.querySelector('[data-message-content]');
        const finalAnswerHtml = contentNode ? contentNode.innerHTML : initialHtml;
        attachResultFeedbackUi(assistantMessage, prompt, finalAnswerHtml);

        window.removeEventListener('wheel', noteScroll);
        window.removeEventListener('touchmove', noteScroll);
        window.removeEventListener('keydown', noteScroll);
        if (!readerScrolled) {
          scrollChatToBottom();
        }
        return assistantMessage;
      }

      let hasAutoCollapsedHero = false;
      function autoCollapseHeroOnFirstUse() {
        if (hasAutoCollapsedHero) return;
        hasAutoCollapsedHero = true;
        if (heroPanel && !heroPanel.hidden) {
          setHeroVisibility(true);
        }
      }

      let isAgentRequestInFlight = false;

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (isAgentRequestInFlight) return;
        if (!premiumAccess) return;
        const prompt = promptInput.value.trim();
        if (!prompt) return;
        isAgentRequestInFlight = true;
        addMessage('user', `<p class="mb-0">${escapeHtml(prompt)}</p>`, { pinToTop: true });
        autoCollapseHeroOnFirstUse();
        promptInput.value = '';

        const originalAskButtonText = askAgentButton?.textContent || 'Ask GemaBot';
        if (askAgentButton) {
          askAgentButton.textContent = 'Working...';
          askAgentButton.disabled = true;
        }

        setComposerWaitingState(true);
        window.showWorkingOverlay?.();
        try {
          await renderAgentReply(prompt);
        } finally {
          window.hideWorkingOverlay?.();
          setComposerWaitingState(false);
          if (askAgentButton) {
            askAgentButton.textContent = originalAskButtonText;
            askAgentButton.disabled = false;
          }
          isAgentRequestInFlight = false;
          promptInput.focus();
        }
      });

      promptInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.shiftKey) return;
        if (isAgentRequestInFlight) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        form.requestSubmit();
      });

      clearConversationButton.addEventListener('click', () => {
        const hasTurns = chatLog.querySelector('article[data-role]');
        if (hasTurns && !window.confirm('Clear this conversation? Saved chats on your dashboard are not affected.')) {
          return;
        }
        chatLog.innerHTML = '';
        pendingRelatedWordsSuggestionTopic = '';
        lastCalculationContext = null;
        recentCalculations.length = 0;
        persistRecentCalculations();
        renderRelatedWordsFollowupSuggestion();
        refreshExamplePromptsVisibility();
        promptInput.focus();
      });

      examplePromptsPanel?.addEventListener('click', (event) => {
        const chip = event.target.closest('.agent-example-prompt');
        if (!chip) return;
        const prompt = String(chip.dataset.prompt || '').trim();
        if (!prompt) return;
        promptInput.value = prompt;
        form.requestSubmit();
      });

      refreshExamplePromptsVisibility();

      document.addEventListener('click', (event) => {
        const openMenu = document.querySelector('details.agent-actions-menu[open]');
        if (!openMenu) return;
        if (openMenu.contains(event.target)) return;
        openMenu.open = false;
      });

      saveConversationButton.addEventListener('click', async () => {
        saveConversationButton.disabled = true;
        const originalText = saveConversationButton.textContent;
        saveConversationButton.textContent = 'Saving...';
        try {
          const message = await saveChatSessionToDashboard();
          // A blocking native dialog for a routine save, on a site that has a
          // toast primitive everything else uses.
          window.showToast?.(message, 'success') ?? window.alert(message);
        } catch (error) {
          const failure = error.message || 'Unable to save chat session.';
          window.showToast?.(failure, 'danger') ?? window.alert(failure);
        } finally {
          saveConversationButton.disabled = false;
          saveConversationButton.textContent = originalText;
        }
      });


      function applyReverseListState(container) {
        if (!container) return;
        const list = container.querySelector('.agent-reverse-list');
        if (!list) return;
        const filterInput = container.querySelector('.agent-reverse-filter');
        const showAllBtn = container.querySelector('.agent-reverse-show-all');
        const emptyMsg = container.querySelector('.agent-reverse-empty');
        const filterValue = String(filterInput?.value || '').trim().toLowerCase();
        const filtering = filterValue.length > 0;
        const showAll = list.dataset.showAll === 'true';
        let visibleCount = 0;
        list.querySelectorAll('li[data-filter-text]').forEach((li) => {
          const inTail = li.getAttribute('data-tail-item') === 'true';
          const matches = !filtering || li.dataset.filterText.includes(filterValue);
          const visible = matches && (showAll || filtering || !inTail);
          li.hidden = !visible;
          if (visible) visibleCount += 1;
        });
        if (emptyMsg) {
          emptyMsg.dataset.visible = (filtering && visibleCount === 0) ? 'true' : 'false';
        }
        if (showAllBtn) {
          showAllBtn.hidden = showAll || filtering;
        }
      }

      chatLog.addEventListener('input', (event) => {
        const filterInput = event.target.closest('.agent-reverse-filter');
        if (!filterInput) return;
        const container = filterInput.closest('.agent-reverse-lookup');
        const list = container?.querySelector('.agent-reverse-list');
        if (list && String(filterInput.value || '').trim().length === 0) {
          list.dataset.showAll = 'false';
        }
        applyReverseListState(container);
      });

      chatLog.addEventListener('click', async (event) => {
        const showAllBtn = event.target.closest('.agent-reverse-show-all');
        if (showAllBtn) {
          const container = showAllBtn.closest('.agent-reverse-lookup');
          const list = container?.querySelector('.agent-reverse-list');
          if (list) {
            list.dataset.showAll = 'true';
            applyReverseListState(container);
          }
          return;
        }

        const jsonPreviewLink = event.target.closest('a[data-json-preview]');
        if (jsonPreviewLink) {
          event.preventDefault();
          const href = jsonPreviewLink.getAttribute('href') || '';
          if (!href) return;
          const previewType = String(jsonPreviewLink.dataset.jsonPreview || '').trim();
          addMessage('user', `<p class="mb-0">${escapeHtml(jsonPreviewLink.textContent || 'Preview JSON link')}</p>`, { pinToTop: true });
          autoCollapseHeroOnFirstUse();
          window.showWorkingOverlay?.();
          const replyHtml = await buildJsonLinkPreviewReply(href, previewType);
          window.hideWorkingOverlay?.();
          const assistantMessage = addMessage('assistant', replyHtml);
          attachResultFeedbackUi(assistantMessage, href, replyHtml);
          return;
        }

        const copyComparisonButton = event.target.closest('.agent-copy-comparison-button');
        if (copyComparisonButton) {
          let reports = [];
          try {
            reports = JSON.parse(copyComparisonButton.dataset.comparison || '[]');
          } catch {
            reports = [];
          }
          const text = formatComparisonText(reports);
          if (!text) return;
          try {
            await navigator.clipboard.writeText(text);
            copyComparisonButton.textContent = 'Copied!';
            setTimeout(() => { copyComparisonButton.textContent = 'Copy comparison'; }, 1500);
          } catch {
            window.alert(text);
          }
          return;
        }

        const copyReverseButton = event.target.closest('.agent-copy-reverse-button');
        if (copyReverseButton) {
          let payload = null;
          try {
            payload = JSON.parse(copyReverseButton.dataset.reverse || 'null');
          } catch {
            payload = null;
          }
          const text = payload ? formatReverseLookupText(payload) : '';
          if (!text) return;
          try {
            await navigator.clipboard.writeText(text);
            copyReverseButton.textContent = 'Copied!';
            setTimeout(() => { copyReverseButton.textContent = 'Copy'; }, 1500);
          } catch {
            window.alert(text);
          }
          return;
        }

        const copyReverseRangeButton = event.target.closest('.agent-copy-reverse-range-button');
        if (copyReverseRangeButton) {
          let payload = null;
          try {
            payload = JSON.parse(copyReverseRangeButton.dataset.reverseRange || 'null');
          } catch {
            payload = null;
          }
          const text = payload ? formatReverseRangeText(payload) : '';
          if (!text) return;
          try {
            await navigator.clipboard.writeText(text);
            copyReverseRangeButton.textContent = 'Copied!';
            setTimeout(() => { copyReverseRangeButton.textContent = 'Copy lookup'; }, 1500);
          } catch {
            window.alert(text);
          }
          return;
        }

        const reverseLookupButton = event.target.closest('.agent-reverse-lookup-button');
        if (reverseLookupButton) {
          const gematriaValue = Number(reverseLookupButton.dataset.gematriaValue);
          if (!Number.isFinite(gematriaValue) || gematriaValue <= 0) return;
          const promptText = `reverse gematria ${gematriaValue}`;
          addMessage('user', `<p class="mb-0">${escapeHtml(promptText)}</p>`, { pinToTop: true });
          autoCollapseHeroOnFirstUse();
          setComposerWaitingState(true);
          window.showWorkingOverlay?.();
          try {
            await renderAgentReply(promptText);
          } finally {
            window.hideWorkingOverlay?.();
            setComposerWaitingState(false);
          }
          return;
        }

        const wordLookupButton = event.target.closest('.agent-word-lookup-button');
        if (wordLookupButton) {
          const selectedWord = String(wordLookupButton.dataset.word || '').trim();
          if (!selectedWord) return;
          addMessage('user', `<p class="mb-0">${escapeHtml(selectedWord)}</p>`, { pinToTop: true });
          autoCollapseHeroOnFirstUse();
          setComposerWaitingState(true);
          window.showWorkingOverlay?.();
          try {
            await renderAgentReply(`"${selectedWord}"`);
          } finally {
            window.hideWorkingOverlay?.();
            setComposerWaitingState(false);
          }
          return;
        }

        const actionButton = event.target.closest('.agent-save-history-button');
        const saveImageButton = event.target.closest('.agent-save-image-button');
        const shareImageButton = event.target.closest('.agent-share-image-button');
        if (!actionButton && !saveImageButton && !shareImageButton) return;

        if (saveImageButton || shareImageButton) {
          const imageActionButton = saveImageButton || shareImageButton;
          const topic = String(imageActionButton.dataset.topic || '').trim();
          const total = Number(imageActionButton.dataset.total);
          const root = Number(imageActionButton.dataset.root);
          if (!topic || !Number.isFinite(total) || !Number.isFinite(root)) {
            window.alert('Unable to prepare the image for this result right now.');
            return;
          }

          const sanitizedWord = topic.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'lookup';
          const definitionPreview = String(imageActionButton.dataset.definitionPreview || '').trim();
          const perLetterValues = String(imageActionButton.dataset.perLetterValues || '').trim();
          const isBaseRoot = String(imageActionButton.dataset.baseRoot || '').trim() === 'true';

          imageActionButton.disabled = true;
          const originalText = imageActionButton.textContent;
          imageActionButton.textContent = saveImageButton ? 'Saving...' : 'Sharing...';
          try {
            const shareImageUrl = buildCalculatorImageUrl({
              topic,
              total,
              root,
              isBaseRoot,
              definitionPreview,
              perLetterValues
            });
            if (saveImageButton) {
              reportButtonEvent('image_download', { source: 'ai_agent_lookup' });
              await downloadShareImage(toShareImageAssetUrl(shareImageUrl), `gematria-${sanitizedWord}.jpg`);
              window.alert('Image downloaded.');
            } else {
              reportButtonEvent('share_button_click', { source: 'ai_agent_lookup' });
              const agentShareUrl = buildAgentShareUrl({ topic, total, root, isBaseRoot, definitionPreview, perLetterValues });
              const shareText = `Gematria for "${topic}": total ${total}, digital root ${root}.`;
              await sharePage({
                title: `Gematria for ${topic}`,
                text: shareText,
                url: agentShareUrl,
                imageUrl: shareImageUrl
              }, agentShareUrl);
            }
          } catch (error) {
            window.alert(error?.message || (saveImageButton ? 'Unable to download image right now.' : 'Unable to share image right now.'));
          } finally {
            imageActionButton.disabled = false;
            imageActionButton.textContent = originalText;
          }
          return;
        }

        const meta = {
          topic: String(actionButton.dataset.topic || '').trim(),
          total: String(actionButton.dataset.total || '').trim(),
          root: String(actionButton.dataset.root || '').trim(),
          matches: String(actionButton.dataset.matches || '').trim(),
          rounds: String(actionButton.dataset.rounds || '').trim()
        };

        if (actionButton.classList.contains('agent-save-history-button')) {
          const { confirmed, note } = await promptForHistoryNote();
          if (!confirmed) {
            return;
          }
          actionButton.disabled = true;
          const originalText = actionButton.textContent;
          actionButton.textContent = 'Saving...';
          let savedSuccessfully = false;
          try {
            const savedMessage = await saveCalculationToDashboard(meta, note);
            window.alert(savedMessage);
            savedSuccessfully = true;
          } catch (error) {
            window.alert(error.message || 'Unable to save to membership dashboard.');
          } finally {
            if (savedSuccessfully) {
              actionButton.textContent = 'Saved';
              actionButton.disabled = true;
            } else {
              actionButton.textContent = originalText;
              actionButton.disabled = false;
            }
          }
          return;
        }

      });

      loadGlobalLearnings();
      loadRecentCalculations();
      ensurePremiumAccess();
      showSharedResultIfPresent();
