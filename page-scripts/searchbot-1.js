      const statusMessage = document.getElementById('statusMessage');
      const chatForm = document.getElementById('chatForm');
      const chatQuestion = document.getElementById('chatQuestion');
      const chatResult = document.getElementById('chatResult');
      const answerText = document.getElementById('answerText');
      const sourceList = document.getElementById('sourceList');
      const clearResultsButton = document.getElementById('clearResults');
      const resultFeedbackPanel = document.getElementById('resultFeedbackPanel');
      const feedbackYesButton = document.getElementById('feedbackYesButton');
      const feedbackNoButton = document.getElementById('feedbackNoButton');
      const feedbackNoForm = document.getElementById('feedbackNoForm');
      const feedbackText = document.getElementById('feedbackText');
      const submitFeedbackButton = document.getElementById('submitFeedbackButton');
      const feedbackStatus = document.getElementById('feedbackStatus');
      const followUpPanel = document.getElementById('followUpPanel');
      const askAnotherButton = document.getElementById('askAnotherButton');
      const refineQueryButton = document.getElementById('refineQueryButton');
      const exampleQuestionsPanel = document.getElementById('exampleQuestionsPanel');
      const conversationThread = document.getElementById('conversationThread');
      const conversationThreadBody = document.getElementById('conversationThreadBody');
      const startOverButton = document.getElementById('startOverButton');
      const contextToggleWrap = document.getElementById('contextToggleWrap');
      const useContextToggle = document.getElementById('useContextToggle');
      const emptyStatePanel = document.getElementById('emptyStatePanel');
      const emptyStateMessage = document.getElementById('emptyStateMessage');

      const MAX_CONVERSATION_TURNS = 6;
      let latestSearchPayload = null;
      const conversationHistory = [];

      function focusChatQuestion() {
        if (!chatQuestion) return;
        chatQuestion.focus();
        try {
          chatQuestion.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (_error) {
          chatQuestion.scrollIntoView();
        }
      }

      function escapeHtml(value) {
        return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
      }

      function highlightTerm(value, term) {
        const sourceText = String(value || '');
        const normalizedTerm = String(term || '').trim();
        if (!normalizedTerm) return escapeHtml(sourceText);

        const escapedTerm = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedTerm, 'ig');
        const matches = Array.from(sourceText.matchAll(regex));
        if (!matches.length) return escapeHtml(sourceText);

        let cursor = 0;
        let html = '';
        for (const match of matches) {
          const index = Number(match.index || 0);
          const nextCursor = index + match[0].length;
          html += escapeHtml(sourceText.slice(cursor, index));
          html += `<mark>${escapeHtml(sourceText.slice(index, nextCursor))}</mark>`;
          cursor = nextCursor;
        }
        html += escapeHtml(sourceText.slice(cursor));
        return html;
      }

      function renderSources(sources, queryTerm = '') {
        if (!Array.isArray(sources) || !sources.length) {
          sourceList.innerHTML = '<li class="list-group-item text-muted">No matching source links found.</li>';
          return;
        }

        sourceList.innerHTML = sources.map((source) => {
          const safeTitle = highlightTerm(source.title || 'Source', queryTerm);
          const safeUrl = escapeHtml(source.url || '/');
          const safeSnippet = highlightTerm(source.snippet || '', queryTerm);
          return `<li class="list-group-item"><div class="fw-semibold">${safeTitle}</div><a href="${safeUrl}" class="small" target="_blank" rel="noopener">${safeUrl}</a><p class="small text-muted mb-0 mt-2">${safeSnippet}</p></li>`;
        }).join('');
      }

      function renderConversationThread() {
        if (!conversationThread || !conversationThreadBody) return;
        if (!conversationHistory.length) {
          conversationThread.classList.add('d-none');
          conversationThreadBody.innerHTML = '';
          return;
        }
        conversationThreadBody.innerHTML = conversationHistory.map((turn, index) => {
          const safeQuestion = escapeHtml(turn.question);
          const safeAnswer = escapeHtml(turn.answer);
          const turnNumber = index + 1;
          return `<article class="conversation-turn border rounded p-3 mb-2"><p class="small text-muted mb-1">Q${turnNumber}</p><p class="fw-semibold mb-2">${safeQuestion}</p><p class="small mb-0">${safeAnswer}</p></article>`;
        }).join('');
        conversationThread.classList.remove('d-none');
      }

      function archiveCurrentTurn() {
        if (!latestSearchPayload) return;
        const question = String(latestSearchPayload.userQuestion || latestSearchPayload.query || '').trim();
        const answer = String(latestSearchPayload.answer || '').trim();
        if (!question) return;
        conversationHistory.push({
          question,
          answer,
          searchQuery: String(latestSearchPayload.query || question).trim(),
        });
        while (conversationHistory.length > MAX_CONVERSATION_TURNS) {
          conversationHistory.shift();
        }
        renderConversationThread();
      }

      function resetConversation() {
        conversationHistory.length = 0;
        latestSearchPayload = null;
        chatQuestion.value = '';
        sourceList.innerHTML = '';
        answerText.textContent = '';
        feedbackText.value = '';
        feedbackNoForm.classList.add('d-none');
        resultFeedbackPanel.classList.add('d-none');
        followUpPanel?.classList.add('d-none');
        emptyStatePanel?.classList.add('d-none');
        feedbackStatus.className = 'small text-muted mt-2 mb-0';
        feedbackStatus.textContent = '';
        chatResult.classList.add('d-none');
        contextToggleWrap?.classList.add('d-none');
        if (useContextToggle) useContextToggle.checked = true;
        exampleQuestionsPanel?.classList.remove('d-none');
        renderConversationThread();
        statusMessage.className = 'alert alert-info d-none';
        statusMessage.textContent = '';
      }

      function buildSearchPayloadQuery(userQuery) {
        const trimmed = String(userQuery || '').trim();
        if (!trimmed) return trimmed;
        const wantsContext = Boolean(useContextToggle?.checked);
        if (!wantsContext || !conversationHistory.length) return trimmed;
        const priorTerms = conversationHistory
          .map((turn) => String(turn.searchQuery || turn.question || '').trim())
          .filter(Boolean)
          .join(' ');
        if (!priorTerms) return trimmed;
        const combined = `${priorTerms} ${trimmed}`.replace(/\s+/g, ' ').trim();
        return combined.length > 400 ? combined.slice(0, 400) : combined;
      }

      function showEmptyState(userQuery) {
        if (!emptyStatePanel) return;
        const safeQuery = escapeHtml(String(userQuery || '').trim());
        if (emptyStateMessage) {
          emptyStateMessage.innerHTML = safeQuery
            ? `SiteSeeker did not find published site content matching <strong>"${safeQuery}"</strong>.`
            : 'SiteSeeker did not find published site content matching your question.';
        }
        emptyStatePanel.classList.remove('d-none');
      }

      async function submitFeedback(wasExpected) {
        if (!latestSearchPayload?.query) return;
        const message = String(feedbackText?.value || '').trim();
        if (wasExpected === false && !message) {
          feedbackStatus.className = 'small text-danger mt-2 mb-0';
          feedbackStatus.textContent = 'Please share what you expected so admins get actionable feedback.';
          return;
        }

        feedbackStatus.className = 'small text-muted mt-2 mb-0';
        feedbackStatus.textContent = 'Sending feedback…';

        try {
          const response = await fetch('/api/public-chatbot-feedback', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              query: latestSearchPayload.query,
              cleanedQuery: latestSearchPayload.query,
              answerText: latestSearchPayload.answer || '',
              sources: latestSearchPayload.sources || [],
              wasExpected,
              feedbackText: wasExpected ? '' : message,
            }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload?.error || 'Unable to send feedback.');

          feedbackStatus.className = 'small text-success mt-2 mb-0';
          feedbackStatus.textContent = wasExpected
            ? 'Thanks for confirming these results were expected.'
            : 'Thank you. Your feedback was sent to the admin review queue.';
          if (wasExpected === false) feedbackNoForm.classList.add('d-none');
        } catch (error) {
          feedbackStatus.className = 'small text-danger mt-2 mb-0';
          feedbackStatus.textContent = error.message || 'Unable to send feedback right now.';
        }
      }

      async function runSearch(userQuery) {
        const trimmed = String(userQuery || '').trim();
        if (!trimmed) return;

        exampleQuestionsPanel?.classList.add('d-none');
        emptyStatePanel?.classList.add('d-none');
        statusMessage.className = 'alert alert-info';
        statusMessage.textContent = conversationHistory.length
          ? 'Searching with your earlier questions as context…'
          : 'Searching published site content…';

        const searchQuery = buildSearchPayloadQuery(trimmed);

        try {
          const chatFormEl = document.getElementById('chatForm');
          const response = await fetch('/api/public-site-chatbot', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              query: searchQuery,
              ...(window.GematriaAntiBot?.honeypotPayload?.(chatFormEl) || {}),
            })
          });

          const payload = await response.json();
          if (!response.ok) throw new Error(payload?.error || 'Search request failed');

          const highlightQuery = String(payload.query || trimmed || '').trim();
          const sources = Array.isArray(payload.sources) ? payload.sources : [];
          answerText.textContent = payload.answer || 'No response generated.';
          renderSources(sources, highlightQuery);
          latestSearchPayload = { ...payload, userQuestion: trimmed };
          feedbackNoForm.classList.add('d-none');
          feedbackText.value = '';
          feedbackStatus.className = 'small text-muted mt-2 mb-0';
          feedbackStatus.textContent = 'Please confirm whether these were the expected results.';

          if (sources.length === 0) {
            chatResult.classList.add('d-none');
            resultFeedbackPanel.classList.add('d-none');
            followUpPanel?.classList.remove('d-none');
            showEmptyState(trimmed);
            statusMessage.className = 'alert alert-warning';
            statusMessage.textContent = 'No confident match found. Try a related question or rephrase.';
          } else {
            chatResult.classList.remove('d-none');
            resultFeedbackPanel.classList.remove('d-none');
            followUpPanel?.classList.remove('d-none');
            statusMessage.className = 'alert alert-success';
            statusMessage.textContent = `Search complete. Indexed entries: ${Number(payload.corpusSize || 0)}. Ask another question whenever you're ready.`;
          }
        } catch (error) {
          statusMessage.className = 'alert alert-danger';
          statusMessage.textContent = error.message || 'Unable to search site content right now.';
        }
      }

      chatForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        runSearch(chatQuestion.value.trim());
      });

      clearResultsButton?.addEventListener('click', () => {
        chatQuestion.value = '';
        focusChatQuestion();
      });

      askAnotherButton?.addEventListener('click', () => {
        archiveCurrentTurn();
        chatQuestion.value = '';
        sourceList.innerHTML = '';
        answerText.textContent = '';
        latestSearchPayload = null;
        feedbackText.value = '';
        feedbackNoForm.classList.add('d-none');
        resultFeedbackPanel.classList.add('d-none');
        followUpPanel?.classList.add('d-none');
        emptyStatePanel?.classList.add('d-none');
        feedbackStatus.className = 'small text-muted mt-2 mb-0';
        feedbackStatus.textContent = '';
        chatResult.classList.add('d-none');
        contextToggleWrap?.classList.remove('d-none');
        statusMessage.className = 'alert alert-info d-none';
        statusMessage.textContent = '';
        focusChatQuestion();
      });

      refineQueryButton?.addEventListener('click', () => {
        statusMessage.className = 'alert alert-info';
        statusMessage.textContent = 'Adjust your question and search again.';
        focusChatQuestion();
      });

      startOverButton?.addEventListener('click', () => {
        resetConversation();
        focusChatQuestion();
      });

      feedbackYesButton?.addEventListener('click', () => submitFeedback(true));
      feedbackNoButton?.addEventListener('click', () => {
        feedbackNoForm.classList.remove('d-none');
        feedbackStatus.className = 'small text-muted mt-2 mb-0';
        feedbackStatus.textContent = 'Tell us what you expected, then send feedback.';
        feedbackText.focus();
      });
      submitFeedbackButton?.addEventListener('click', () => submitFeedback(false));

      document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const exampleButton = target.closest('.example-question');
        if (!exampleButton) return;
        const question = exampleButton.getAttribute('data-question') || exampleButton.textContent || '';
        const trimmed = String(question).trim();
        if (!trimmed) return;
        chatQuestion.value = trimmed;
        runSearch(trimmed);
      });
