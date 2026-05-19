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

      function escapeHtml(value) {
        return String(value || '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function englishGematria(text) {
        let total = 0;
        for (const char of String(text || '').toUpperCase()) {
          const code = char.charCodeAt(0);
          if (code >= 65 && code <= 90) {
            total += (code - 64) * 6;
          }
        }
        return total;
      }

      function gematriaLetterBreakdown(text) {
        return [...String(text || '').toUpperCase()]
          .filter((char) => char >= 'A' && char <= 'Z')
          .map((char) => {
            const value = (char.charCodeAt(0) - 64) * 6;
            return { char, value };
          });
      }

      function digitalRoot(numberValue) {
        let root = Math.abs(Math.trunc(Number(numberValue) || 0));
        while (root >= 10) {
          root = String(root).split('').reduce((sum, digit) => sum + Number(digit), 0);
        }
        return root;
      }

      function isBaseRootTotal(total) {
        return total >= 6 && (total - 6) % 54 === 0;
      }

      function normalizeCandidate(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
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

      function findLearnedResponse(prompt) {
        const normalizedPrompt = normalizeCandidate(prompt).toLowerCase();
        if (!normalizedPrompt) return null;
        const learnings = readCombinedLearnings();
        return learnings.entries.find((entry) => normalizedPrompt.includes(entry.prompt) || entry.prompt.includes(normalizedPrompt)) || null;
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



      function extractQuotedTargets(prompt) {
        const rawPrompt = normalizeCandidate(prompt);
        if (!rawPrompt) return [];

        return [...rawPrompt.matchAll(/"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’/g)]
          .flatMap((match) => normalizeCandidate(match[1] || match[2] || match[3] || match[4])
            .split(',')
            .map((target) => normalizeCandidate(target))
          )
          .filter(Boolean);
      }

      function extractCalculationTargets(prompt) {
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
          /\b(?:calculate|calculation|calculate\s+for|gematria|value|values|number|numbers|math|snapshot|lookup|analyze|analysis|compare|comparison|contrast|contrasting)\b[^A-Za-z0-9]+(?:for|of|on|about|between)?\s*([A-Za-z][A-Za-z' -]*(?:\s*(?:,|and|&|vs\.?|versus)\s*[A-Za-z][A-Za-z' -]*)*)/i
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
            if (/^(?:please|provide|give|show|calculate|calculation|gematria|value|values|number|numbers|for|of|and|vs|versus)$/i.test(target)) return false;
            return true;
          });

        return [...new Set(splitTargets)].slice(0, 6);
      }

      function isComparisonRequest(prompt) {
        const normalized = normalizeCandidate(prompt);
        if (!normalized) return false;
        return /\b(?:compare|comparison|comparing|contrast|contrasting|difference\s+between|side[\s-]?by[\s-]?side|vs\.?|versus|v\.)\b/i.test(normalized);
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

        return `
          <section class="border rounded-3 p-2 mb-3">
            <p class="mb-2"><strong>Comparison summary</strong></p>
            <div class="table-responsive mb-2">
              <table class="table table-sm mb-0">
                <thead><tr><th>Target</th><th>Total</th><th>Root</th><th>Base-root</th><th>Archived</th></tr></thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>
            <ul class="mb-0">${highlights.join('')}</ul>
          </section>
        `;
      }

      function extractReverseGematriaValue(prompt) {
        const normalized = normalizeCandidate(prompt);
        if (!normalized) return null;

        const bareNumeric = normalized.match(/^\s*(\d{1,6})\s*[?.!]*\s*$/);
        if (bareNumeric) return Number(bareNumeric[1]);

        const reverseKeyword = /\breverse(?:\s+(?:gematria|lookup|search))?\b/i.test(normalized);
        const wordListIntent = /\b(?:show|list|find|get|give|which|what|any|search|look(?:\s*up)?)\b[\s\S]*\b(?:words?|matches?|results?|hits?|entries?|terms?)\b/i.test(normalized);
        const gematriaContext = /\b(?:gematria|equal|equals|matching|matches|match|total|totals|totaling|sum|sums|summing|value|values|number|numbers|calculation)\b/i.test(normalized);

        const labeledNumberMatch = normalized.match(
          /\b(?:gematria(?:\s+value)?|value|number|calculation|total|sum|equals?|matches?|matching|reverse)\s*(?:of|for|is|to|at|=)?\s*(\d{1,6})\b/i
        );
        const trailingLabeledMatch = normalized.match(
          /\b(\d{1,6})\s*(?:gematria|value|total|sum|matches?)\b/i
        );
        const numberMatch = labeledNumberMatch || trailingLabeledMatch || normalized.match(/\b(\d{1,6})\b/);

        if (numberMatch && (reverseKeyword || (wordListIntent && gematriaContext))) {
          return Number(numberMatch[1]);
        }

        return null;
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

      function extractWordnikRelationshipType(prompt) {
        const normalizedPrompt = normalizeCandidate(prompt).toLowerCase();
        if (!normalizedPrompt) return 'synonym';
        if (/\bantonyms?\b/.test(normalizedPrompt)) return 'antonym';
        if (/\bsynonyms?\b/.test(normalizedPrompt)) return 'synonym';
        if (/\bequivalents?\b/.test(normalizedPrompt)) return 'equivalent';
        if (/\bcross(?: |-)?references?\b/.test(normalizedPrompt)) return 'cross-reference';
        if (/\bhypernyms?\b/.test(normalizedPrompt)) return 'hypernym';
        if (/\bhyponyms?\b/.test(normalizedPrompt)) return 'hyponym';
        if (/\bvariants?\b/.test(normalizedPrompt)) return 'variant';
        if (/\bsame context\b/.test(normalizedPrompt)) return 'same-context';
        if (/\brelated words?\b/.test(normalizedPrompt)) return 'synonym';
        return 'synonym';
      }

      function isAffirmativePrompt(prompt) {
        const normalizedPrompt = normalizeCandidate(prompt).toLowerCase();
        if (!normalizedPrompt) return false;
        return /^(?:yes|yep|yeah|sure|ok|okay|please do|go ahead|do it|sounds good|that works|absolutely|affirmative)\b/.test(normalizedPrompt);
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

      async function buildGeneralChatReply(normalizedPrompt, learnedResponse) {
        const learnedCue = learnedResponse
          ? `<p class="mb-2"><strong>Applied learned preference:</strong> ${escapeHtml(learnedResponse.explanation)}</p>`
          : '';
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

        return `
          ${learnedCue}
          <p class="mb-2">I switched to general chat mode because I could not identify a clear calculation target.</p>
          <p class="mb-2">For gematria math, ask naturally (example: <code>calculate new jerusalem</code> or <code>calculate pilot and process</code>). Quotes still work if you prefer them.</p>
          ${buildMemberAccessLinks(normalizedPrompt)}
          ${synonymResponseBlock}
          <p class="mb-0">General response: ${escapeHtml(normalizedPrompt || 'Share a question and I can help.')}</p>
        `;
      }

      function buildCloseSpellingVariants(word) {
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

      function scrollChatToBottom() {
        chatLog.scrollTop = chatLog.scrollHeight;
        chatLog.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }

      function scrollMessageToTop(messageElement) {
        if (!messageElement) return;
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      function addMessage(role, contentHtml, options = {}) {
        const pinToTop = Boolean(options.pinToTop);
        const wrapper = document.createElement('article');
        wrapper.dataset.role = role === 'assistant' ? 'assistant' : 'user';
        wrapper.className = `p-3 rounded-3 border ${role === 'assistant' ? 'bg-light border-secondary-subtle' : 'bg-white'}`;
        wrapper.innerHTML = `<p class="small text-muted mb-2">${role === 'assistant' ? 'GemaBot' : 'You'}</p><div data-message-content>${contentHtml}</div>`;
        chatLog.append(wrapper);
        if (pinToTop) {
          scrollMessageToTop(wrapper);
        } else {
          scrollChatToBottom();
        }
        return wrapper;
      }

      function readChatTranscriptFromDom() {
        const normalizeTranscriptLine = (line) => String(line || '').replace(/[\t\f\v ]+/g, ' ').trim();
        const removeTranscriptUiLines = (text) => String(text || '')
          .replace(/\bSave to (?:my|membership) dashboard\b/gi, '')
          .replace(/\bSave "[^"\n]+" to my dashboard\b/gi, '')
          .replace(/\b(?:Open calculator search for|Calculator search for)\s+"[^"\n]*"/gi, '')
          .replace(/\b(?:Dictionary lookup page for|Dictionary page for)\s+"[^"\n]*"(?:\s+—\s+Preview:[^\n]*)?/gi, '')
          .replace(/\bRun at least 3 semantic neighbors and compare both full totals and digital roots\./gi, '')
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
            const rawText = String(contentElement.innerText || '')
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
          if (followup) followup.hidden = false;
          if (status) {
            status.hidden = false;
            status.textContent = 'Thanks for the correction. Share what you expected, then save learning.';
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

      function buildAgentShareUrl({ topic, total, root }) {
        const shareUrl = new URL('/api/ai-agent-share', getCanonicalOrigin());
        shareUrl.searchParams.set('topic', topic);
        shareUrl.searchParams.set('total', String(total));
        shareUrl.searchParams.set('root', String(root));
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

      function showSharePicker(shareUrl, shareText) {
        const existing = document.getElementById('sharePickerOverlay');
        if (existing) existing.remove();

        const encodedUrl = encodeURIComponent(shareUrl);
        const encodedText = encodeURIComponent(shareText);

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

        return overlay;
      }

      async function sharePage(payload, fallbackShareUrl) {
        const shareUrl = String(payload.url || '').trim();
        const shareText = String(payload.text || '').trim();
        const sharePayload = {
          title: payload.title || document.title,
          text: shareText.includes(shareUrl) ? shareText : `${shareText}

View results: ${shareUrl}`.trim(),
          url: shareUrl
        };

        const imageUrl = String(payload.imageUrl || '').trim();
        if (imageUrl) {
          const imageFile = await fetchShareImageFile(imageUrl);
          if (imageFile) {
            const filePayload = { ...sharePayload, files: [imageFile] };
            if (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [imageFile] })) {
              Object.assign(sharePayload, filePayload);
            }
          }
        }

        if (navigator.share) {
          try {
            await navigator.share(sharePayload);
            return true;
          } catch (error) {
            if (error && error.name === 'AbortError') {
              return false;
            }
          }
        }

        showSharePicker(shareUrl, shareText);
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
          return;
        }

        premiumGate.hidden = true;
      }

      function showSharedResultIfPresent() {
        const params = new URLSearchParams(window.location.search);
        const topic = String(params.get('sharedTopic') || '').trim();
        const total = String(params.get('sharedTotal') || '').trim();
        const root = String(params.get('sharedRoot') || '').trim();
        if (!topic || !total) return;

        sharedResultBanner.hidden = false;
        sharedResultBanner.innerHTML = `<strong>Shared gematria lookup:</strong> ${escapeHtml(topic)} → total ${escapeHtml(total)}, digital root ${escapeHtml(root || '?')}.`;
      }

      function normalizeDictionaryText(value) {
        return String(value || '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      async function fetchMatchCount(total) {
        try {
          const response = await fetch(`/api/searchByGematria?gematria=${encodeURIComponent(String(total))}`);
          if (!response.ok) return null;
          const payload = await response.json();
          return Number(payload?.count);
        } catch {
          return null;
        }
      }

      async function fetchWordsByGematriaValue(gematriaValue) {
        try {
          const response = await fetch(`/api/searchByGematria?gematria=${encodeURIComponent(String(gematriaValue))}`);
          if (!response.ok) return [];
          const payload = await response.json();
          return Array.isArray(payload?.words) ? payload.words : [];
        } catch {
          return [];
        }
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
        const normalizedPrompt = normalizeCandidate(prompt);
        const learnedResponse = findLearnedResponse(normalizedPrompt);
        const requestedSpellingVariantLookup = /\btry\s+close\s+spelling\s+variants\s+of\b/i.test(normalizedPrompt);
        const reverseGematriaValue = extractReverseGematriaValue(normalizedPrompt);
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

          return `
            <p class="mb-2"><strong>Reverse gematria lookup for ${gematriaValue}</strong></p>
            <p class="mb-2">Found ${wordsList.length} archived match${wordsList.length === 1 ? '' : 'es'}. Click any word to run a full GemaBot lookup for it.</p>
            <ul class="mb-0 ${wordsList.length > 30 ? 'agent-multi-column-list' : ''}">
              ${wordsList.map((word) => `
                <li>
                  <button
                    type="button"
                    class="btn btn-link p-0 align-baseline agent-word-lookup-button"
                    data-word="${escapeHtml(word)}"
                  >${escapeHtml(word)}</button>
                </li>
              `).join('')}
            </ul>
          `;
        }

        const calculationTargets = extractCalculationTargets(normalizedPrompt);
        if (!calculationTargets.length) {
          const strayNumberMatch = normalizedPrompt.match(/\b(\d{1,6})\b/);
          if (strayNumberMatch) {
            const strayValue = Number(strayNumberMatch[1]);
            return `<p class="mb-0">Did not see a word or phrase to calculate. To run a reverse gematria lookup for <strong>${strayValue}</strong>, try <code>reverse gematria ${strayValue}</code> or <code>what words equal ${strayValue}</code>.</p>`;
          }
          return '<p class="mb-0">Did not see a word or phrase to calculate. Maybe you want to try the KnowBot? (on top menu)</p>';
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

        const primaryWordReport = allWordReports.find((entry) => entry.target === topic) || allWordReports[0];
        const matchCount = primaryWordReport?.matchCount ?? null;

        const lookupDetailsByTarget = new Map(await Promise.all(
          allWordReports.map(async (entry) => {
            const [definitionSummary, relatedWords] = await Promise.all([
              fetchDefinitionSummary(entry.target),
              fetchRelatedWordsSummary(entry.target)
            ]);
            return [entry.target, { definitionSummary, relatedWords }];
          })
        ));

        const topicLookupDetails = lookupDetailsByTarget.get(topic) || { definitionSummary: '', relatedWords: [] };
        const definitionSummary = topicLookupDetails.definitionSummary;
        const relatedWords = topicLookupDetails.relatedWords;

        const iterations = 2;
        const memoryContext = '';

        function refineAnalysis(previousStep, round) {
          const nuance = matchCount === null
            ? 'Archive count is temporarily unavailable, so prioritize manual grouping checks this round.'
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
        const relatedWordsWithTotals = relatedWords.map((word) => {
          const total = englishGematria(word);
          return {
            word,
            total,
            root: digitalRoot(total),
            isBaseRoot: isBaseRootTotal(total)
          };
        });

        const comparisonRequested = isComparisonRequest(normalizedPrompt) && allWordReports.length >= 2;
        const comparisonSummary = comparisonRequested ? buildComparisonSummary(allWordReports) : '';

        return `
          ${learnedResponse ? `<p class="mb-2"><strong>Applied learned preference:</strong> ${escapeHtml(learnedResponse.explanation)}</p>` : ''}
          <p class="mb-2"><strong>Detected calculation target${calculationTargets.length === 1 ? '' : 's'}:</strong> ${escapeHtml(calculationTargets.join(', '))}</p>
          ${comparisonSummary}
          ${allWordReports.length ? `
            <p class="mb-2"><strong>Full calculation report for each detected word</strong></p>
            <div class="d-flex flex-column gap-2 mb-3">
              ${allWordReports.map((entry) => {
                const lookupDetails = lookupDetailsByTarget.get(entry.target) || { definitionSummary: '', relatedWords: [] };
                const perWordDefinitionSummary = lookupDetails.definitionSummary;
                const perWordRelatedWordsWithTotals = (lookupDetails.relatedWords || []).map((word) => {
                  const total = englishGematria(word);
                  return {
                    word,
                    total,
                    root: digitalRoot(total),
                    isBaseRoot: isBaseRootTotal(total)
                  };
                });

                return `
                <section class="border rounded-3 p-2">
                  <p class="mb-1"><strong>${escapeHtml(entry.target)}</strong></p>
                  <ul class="mb-2">
                    <li><strong>Total:</strong> ${entry.total}</li>
                    <li><strong>Digital root:</strong> ${entry.root}</li>
                    <li><strong>Base-root pattern:</strong> ${entry.isBaseRoot ? 'Yes' : 'No'}</li>
                    <li><strong>Current archived matches:</strong> ${Number.isFinite(entry.matchCount) ? entry.matchCount : 'Unavailable right now'}</li>
                    <li><strong>Letter breakdown:</strong> ${entry.letters.length ? entry.letters.map((letter) => `${letter.char}=${letter.value}`).join(', ') : 'No alphabetical letters detected.'}</li>
                  </ul>
                  ${allWordReports.length > 1 ? `
                    <p class="mb-2"><strong>Suggested next lookups for "${escapeHtml(entry.target)}"</strong></p>
                    <ul class="mb-2">
                      ${perWordDefinitionSummary ? `<li><a href="/definition?word=${encodeURIComponent(entry.target)}" target="_blank" rel="noopener noreferrer">Dictionary page for "${escapeHtml(entry.target)}"</a> — Preview: ${escapeHtml(perWordDefinitionSummary.slice(0, 180))}${perWordDefinitionSummary.length > 180 ? '…' : ''}</li>` : ''}
                      <li><a href="/calculator.html?query=${encodeURIComponent(entry.target)}" target="_blank" rel="noopener noreferrer">Calculator search for "${escapeHtml(entry.target)}"</a></li>
                      <li>
                        Related words lookup:
                        ${perWordRelatedWordsWithTotals.length ? `
                          <div class="d-flex flex-wrap gap-2 mt-2">
                            ${perWordRelatedWordsWithTotals.map((relatedEntry) => `<button type="button" class="btn btn-sm btn-outline-secondary agent-word-lookup-button" data-word="${escapeHtml(relatedEntry.word)}">${escapeHtml(relatedEntry.word)} (${relatedEntry.isBaseRoot ? 'base-root' : 'not base-root'})</button>`).join('')}
                          </div>
                        ` : '<span> No related terms were found right now.</span>'}
                      </li>
                    </ul>
                  ` : ''}
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-success agent-save-history-button"
                    data-topic="${escapeHtml(entry.target)}"
                    data-total="${entry.total}"
                    data-root="${entry.root}"
                    data-matches="${Number.isFinite(entry.matchCount) ? entry.matchCount : ''}"
                    data-rounds="${iterations}"
                  >
                    Save "${escapeHtml(entry.target)}" to my dashboard
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-warning agent-save-image-button ms-2"
                    data-topic="${escapeHtml(entry.target)}"
                    data-total="${entry.total}"
                    data-root="${entry.root}"
                    data-base-root="${entry.isBaseRoot ? 'true' : 'false'}"
                    data-definition-preview="${escapeHtml(perWordDefinitionSummary || '')}"
                    data-per-letter-values="${escapeHtml(entry.letters.length ? entry.letters.map((letter) => `${letter.char}=${letter.value}`).join(', ') : 'No alphabetical letters detected.')}"
                  >
                    Save image
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-info agent-share-image-button ms-2"
                    data-topic="${escapeHtml(entry.target)}"
                    data-total="${entry.total}"
                    data-root="${entry.root}"
                    data-base-root="${entry.isBaseRoot ? 'true' : 'false'}"
                    data-definition-preview="${escapeHtml(perWordDefinitionSummary || '')}"
                    data-per-letter-values="${escapeHtml(entry.letters.length ? entry.letters.map((letter) => `${letter.char}=${letter.value}`).join(', ') : 'No alphabetical letters detected.')}"
                  >
                    Share
                  </button>
                </section>
              `;
              }).join('')}
            </div>
          ` : ''}
          ${requestedSpellingVariantLookup ? `
            <p class="mt-3 mb-2"><strong>Close spelling-variant lookup for "${escapeHtml(topic)}"</strong></p>
            ${closeSpellingVariants.length ? `
              <ul class="mb-0">
                ${closeSpellingVariants.map((entry) => `<li>${escapeHtml(entry.variant)} → total ${entry.total}, digital root ${entry.root}, base-root ${entry.isBaseRoot ? 'Yes' : 'No'}</li>`).join('')}
              </ul>
            ` : '<p class="mb-0">No close spelling variants were generated from this input. Try a single-word topic for variant lookups.</p>'}
          ` : ''}
          ${allWordReports.length === 1 ? `
            <hr />
            <p class="mb-2"><strong>Suggested next lookups</strong></p>
            <ul class="mb-0">
              ${definitionSummary ? `<li><a href="/definition?word=${encodeURIComponent(topic)}" target="_blank" rel="noopener noreferrer">Dictionary page for "${escapeHtml(topic)}"</a> — Preview: ${escapeHtml(definitionSummary.slice(0, 180))}${definitionSummary.length > 180 ? '…' : ''}</li>` : ''}
              <li><a href="/calculator.html?query=${encodeURIComponent(topic)}" target="_blank" rel="noopener noreferrer">Calculator search for "${escapeHtml(topic)}"</a></li>
              <li>
                Related words lookup:
                ${relatedWordsWithTotals.length ? `
                  <div class="d-flex flex-wrap gap-2 mt-2">
                    ${relatedWordsWithTotals.map((entry) => `<button type="button" class="btn btn-sm btn-outline-secondary agent-word-lookup-button" data-word="${escapeHtml(entry.word)}">${escapeHtml(entry.word)} (${entry.isBaseRoot ? 'base-root' : 'not base-root'})</button>`).join('')}
                  </div>
                ` : '<span> No related terms were found right now.</span>'}
              </li>
            </ul>
          ` : ''}
        `;
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

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!premiumAccess) return;
        const prompt = promptInput.value.trim();
        if (!prompt) return;
        addMessage('user', `<p class="mb-0">${escapeHtml(prompt)}</p>`, { pinToTop: true });
        promptInput.value = '';

        const originalAskButtonText = askAgentButton?.textContent || 'Ask GemaBot';
        if (askAgentButton) {
          askAgentButton.textContent = 'Working...';
          askAgentButton.disabled = true;
        }

        setComposerWaitingState(true);
        window.showWorkingOverlay?.();
        try {
          const replyHtml = await buildAgentReply(prompt);
          const assistantMessage = addMessage('assistant', replyHtml);
          attachResultFeedbackUi(assistantMessage, prompt, replyHtml);
        } finally {
          window.hideWorkingOverlay?.();
          setComposerWaitingState(false);
          if (askAgentButton) {
            askAgentButton.textContent = originalAskButtonText;
            askAgentButton.disabled = false;
          }
          promptInput.focus();
        }
      });

      promptInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.shiftKey) return;
        event.preventDefault();
        form.requestSubmit();
      });

      clearConversationButton.addEventListener('click', () => {
        chatLog.innerHTML = '';
        pendingRelatedWordsSuggestionTopic = '';
        renderRelatedWordsFollowupSuggestion();
        promptInput.focus();
      });

      saveConversationButton.addEventListener('click', async () => {
        saveConversationButton.disabled = true;
        const originalText = saveConversationButton.textContent;
        saveConversationButton.textContent = 'Saving...';
        try {
          const message = await saveChatSessionToDashboard();
          window.alert(message);
        } catch (error) {
          window.alert(error.message || 'Unable to save chat session.');
        } finally {
          saveConversationButton.disabled = false;
          saveConversationButton.textContent = originalText;
        }
      });


      chatLog.addEventListener('click', async (event) => {
        const jsonPreviewLink = event.target.closest('a[data-json-preview]');
        if (jsonPreviewLink) {
          event.preventDefault();
          const href = jsonPreviewLink.getAttribute('href') || '';
          if (!href) return;
          const previewType = String(jsonPreviewLink.dataset.jsonPreview || '').trim();
          addMessage('user', `<p class="mb-0">${escapeHtml(jsonPreviewLink.textContent || 'Preview JSON link')}</p>`, { pinToTop: true });
          window.showWorkingOverlay?.();
          const replyHtml = await buildJsonLinkPreviewReply(href, previewType);
          window.hideWorkingOverlay?.();
          const assistantMessage = addMessage('assistant', replyHtml);
          attachResultFeedbackUi(assistantMessage, href, replyHtml);
          return;
        }

        const reverseLookupButton = event.target.closest('.agent-reverse-lookup-button');
        if (reverseLookupButton) {
          const gematriaValue = Number(reverseLookupButton.dataset.gematriaValue);
          if (!Number.isFinite(gematriaValue) || gematriaValue <= 0) return;
          const promptText = `reverse gematria ${gematriaValue}`;
          addMessage('user', `<p class="mb-0">${escapeHtml(promptText)}</p>`, { pinToTop: true });
          setComposerWaitingState(true);
          window.showWorkingOverlay?.();
          try {
            const replyHtml = await buildAgentReply(promptText);
            const assistantMessage = addMessage('assistant', replyHtml);
            attachResultFeedbackUi(assistantMessage, promptText, replyHtml);
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
          setComposerWaitingState(true);
          window.showWorkingOverlay?.();
          try {
            const replyHtml = await buildAgentReply(`"${selectedWord}"`);
            const assistantMessage = addMessage('assistant', replyHtml);
            attachResultFeedbackUi(assistantMessage, selectedWord, replyHtml);
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
              const agentShareUrl = buildAgentShareUrl({ topic, total, root });
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
      ensurePremiumAccess();
      showSharedResultIfPresent();
