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
      let latestSearchPayload = null;

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

      chatForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const query = chatQuestion.value.trim();
        if (!query) return;

        statusMessage.className = 'alert alert-info';
        statusMessage.textContent = 'Searching published site content…';

        try {
          const response = await fetch('/api/public-site-chatbot', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query })
          });

          const payload = await response.json();
          if (!response.ok) throw new Error(payload?.error || 'Search request failed');

          const highlightQuery = String(payload.query || query || '').trim();
          answerText.textContent = payload.answer || 'No response generated.';
          renderSources(payload.sources || [], highlightQuery);
          chatResult.classList.remove('d-none');
          latestSearchPayload = payload;
          feedbackNoForm.classList.add('d-none');
          feedbackText.value = '';
          feedbackStatus.className = 'small text-muted mt-2 mb-0';
          feedbackStatus.textContent = 'Please confirm whether these were the expected results.';
          resultFeedbackPanel.classList.remove('d-none');
          followUpPanel?.classList.remove('d-none');

          statusMessage.className = 'alert alert-success';
          statusMessage.textContent = `Search complete. Indexed entries: ${Number(payload.corpusSize || 0)}. Ask another question whenever you're ready.`;
        } catch (error) {
          statusMessage.className = 'alert alert-danger';
          statusMessage.textContent = error.message || 'Unable to search site content right now.';
        }
      });

      clearResultsButton?.addEventListener('click', () => {
        chatQuestion.value = '';
        sourceList.innerHTML = '';
        answerText.textContent = '';
        latestSearchPayload = null;
        feedbackText.value = '';
        feedbackNoForm.classList.add('d-none');
        resultFeedbackPanel.classList.add('d-none');
        followUpPanel?.classList.add('d-none');
        feedbackStatus.className = 'small text-muted mt-2 mb-0';
        feedbackStatus.textContent = '';
        chatResult.classList.add('d-none');
        statusMessage.className = 'alert alert-success';
        statusMessage.textContent = 'Ready for the next search.';
      });

      askAnotherButton?.addEventListener('click', () => {
        chatQuestion.value = '';
        sourceList.innerHTML = '';
        answerText.textContent = '';
        latestSearchPayload = null;
        feedbackText.value = '';
        feedbackNoForm.classList.add('d-none');
        resultFeedbackPanel.classList.add('d-none');
        followUpPanel?.classList.add('d-none');
        feedbackStatus.className = 'small text-muted mt-2 mb-0';
        feedbackStatus.textContent = '';
        chatResult.classList.add('d-none');
        statusMessage.className = 'alert alert-info';
        statusMessage.textContent = 'KnowBot is ready for your next question.';
        focusChatQuestion();
      });

      refineQueryButton?.addEventListener('click', () => {
        statusMessage.className = 'alert alert-info';
        statusMessage.textContent = 'Adjust your question and search again.';
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
