      const state = {
        feedbackItems: [],
        statusFilter: 'new',
        stats: { expected: 0, unexpected: 0 }
      };
      const statusMessage = document.getElementById('statusMessage');
      const chatbotFeedbackPendingBadge = document.getElementById('chatbotFeedbackPendingBadge');
      const chatbotFeedbackUnexpectedBadge = document.getElementById('chatbotFeedbackUnexpectedBadge');
      const chatbotFeedbackExpectedBadge = document.getElementById('chatbotFeedbackExpectedBadge');
      const chatbotFeedbackList = document.getElementById('chatbotFeedbackList');

      function escapeHtml(value) {
        return String(value || '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      async function request(url, options = {}) {
        const response = await fetch(url, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
          },
          ...options
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Request failed');
        }
        return payload;
      }

      function setStatusMessage(message, tone = 'success') {
        statusMessage.className = `alert alert-${tone}`;
        statusMessage.textContent = message;
      }

      function renderFeedback() {
        const newCount = state.feedbackItems.filter((item) => (item.status || 'new') === 'new').length;
        chatbotFeedbackPendingBadge.textContent = `${newCount} new`;
        chatbotFeedbackUnexpectedBadge.textContent = `${state.stats.unexpected} unexpected`;
        chatbotFeedbackExpectedBadge.textContent = `${state.stats.expected} expected`;

        const filteredItems = state.statusFilter === 'all'
          ? state.feedbackItems
          : state.feedbackItems.filter((item) => (item.status || 'new') === state.statusFilter);

        chatbotFeedbackList.removeAttribute('aria-busy');
        chatbotFeedbackList.innerHTML = filteredItems.length ? filteredItems.map((item) => `
          <article class="admin-item-card mb-3 p-3">
            <div class="d-flex flex-wrap gap-2 mb-2">
              <span class="badge ${(item.status || 'new') === 'new' ? 'text-bg-danger' : 'text-bg-secondary'}">${escapeHtml(item.status || 'new')}</span>
              <span class="badge text-bg-light">${escapeHtml(new Date(item.createdAt).toLocaleString())}</span>
              ${typeof item.wasExpected === 'boolean' ? `<span class="badge ${item.wasExpected ? 'text-bg-success' : 'text-bg-warning'}">${item.wasExpected ? 'expected' : 'unexpected'}</span>` : ''}
            </div>
            <p class="small mb-1"><strong>Query:</strong> ${escapeHtml(item.query || '')}</p>
            ${item.feedbackText ? `<p class="small mb-1"><strong>Member feedback:</strong> ${escapeHtml(item.feedbackText)}</p>` : '<p class="small text-muted mb-1">No free-text notes were provided.</p>'}
            ${item.adminReply ? `<p class="small mb-1"><strong>Current admin reply:</strong> ${escapeHtml(item.adminReply)}</p>` : ''}
            <label class="form-label form-label-sm mt-2" for="feedbackReply-${escapeHtml(item.id)}">Reply for member dashboard</label>
            <textarea id="feedbackReply-${escapeHtml(item.id)}" class="form-control form-control-sm mb-2" rows="2" maxlength="2000" placeholder="Write a response that the member will see in their dashboard.">${escapeHtml(item.adminReply || '')}</textarea>
            <div class="d-flex gap-2 flex-wrap">
              <button class="btn btn-sm btn-primary" type="button" data-submit-feedback-reply="${escapeHtml(item.id)}">Send reply</button>
              <button class="btn btn-sm btn-outline-secondary" type="button" data-mark-feedback-reviewed="${escapeHtml(item.id)}">Mark reviewed</button>
              <button class="btn btn-sm btn-outline-dark" type="button" data-mark-feedback-closed="${escapeHtml(item.id)}">Close</button>
              ${item.feedbackText ? `<button class="btn btn-sm btn-success" type="button" data-train-from-feedback="${escapeHtml(item.id)}" title="Use this query + feedback as a GemaBot learned response">Train from this</button>` : ''}
            </div>
          </article>
        `).join('') : '<p class="text-muted small mb-0">No feedback entries match the selected status.</p>';
      }

      async function refreshFeedback() {
        const payload = await request('/api/admin-chatbot-feedback');
        state.feedbackItems = payload.items || [];
        state.stats = {
          expected: Number(payload?.stats?.expected || 0),
          unexpected: Number(payload?.stats?.unexpected || 0)
        };
        renderFeedback();
      }

      function removeFeedbackFromCurrentScreen(feedbackId) {
        const targetId = String(feedbackId || '');
        if (!targetId) {
          return;
        }
        state.feedbackItems = state.feedbackItems.filter((item) => String(item.id || '') !== targetId);
        renderFeedback();
      }

      async function loadSession() {
        const payload = await request('/api/admin-session', { method: 'GET' });
        setStatusMessage(`Signed in as ${payload.user?.username || 'admin'}.`, 'success');
      }

      document.addEventListener('click', async (event) => {
        const submitFeedbackReply = event.target.closest('[data-submit-feedback-reply]')?.dataset?.submitFeedbackReply;
        const markFeedbackReviewed = event.target.closest('[data-mark-feedback-reviewed]')?.dataset?.markFeedbackReviewed;
        const markFeedbackClosed = event.target.closest('[data-mark-feedback-closed]')?.dataset?.markFeedbackClosed;
        const trainFromFeedback = event.target.closest('[data-train-from-feedback]')?.dataset?.trainFromFeedback;

        if (!submitFeedbackReply && !markFeedbackReviewed && !markFeedbackClosed && !trainFromFeedback) return;

        try {
          if (trainFromFeedback) {
            const btn = event.target.closest('[data-train-from-feedback]');
            btn.disabled = true;
            btn.textContent = 'Training…';
            const result = await request('/api/admin-chatbot-feedback', {
              method: 'PATCH',
              body: JSON.stringify({ id: trainFromFeedback, action: 'train' })
            });
            setStatusMessage(`Trained. GemaBot now has ${result.entriesCount} learned response(s).`, 'success');
            removeFeedbackFromCurrentScreen(trainFromFeedback);
          } else if (submitFeedbackReply) {
            const replyBtn = event.target.closest('[data-submit-feedback-reply]');
            const replyField = document.getElementById(`feedbackReply-${submitFeedbackReply}`);
            const adminReply = String(replyField?.value || '').trim();
            if (!adminReply) {
              throw new Error('Please add a reply before sending.');
            }
            if (replyBtn) { replyBtn.disabled = true; replyBtn.textContent = 'Sending…'; }
            await request('/api/admin-chatbot-feedback', {
              method: 'PATCH',
              body: JSON.stringify({ id: submitFeedbackReply, adminReply })
            });
            if (replyBtn) { replyBtn.textContent = 'Sent'; }
            setStatusMessage('Reply sent.', 'success');
          } else {
            const feedbackId = markFeedbackReviewed || markFeedbackClosed;
            const status = markFeedbackReviewed ? 'reviewed' : 'closed';
            await request('/api/admin-chatbot-feedback', {
              method: 'PATCH',
              body: JSON.stringify({ id: feedbackId, status })
            });
            setStatusMessage(`Feedback marked as ${status}.`, 'success');
            removeFeedbackFromCurrentScreen(feedbackId);
          }
          if (submitFeedbackReply) {
            await refreshFeedback();
          }
        } catch (error) {
          const trainBtn = event.target.closest('[data-train-from-feedback]');
          const replyBtn = event.target.closest('[data-submit-feedback-reply]');
          if (trainBtn) { trainBtn.disabled = false; trainBtn.textContent = 'Train from this'; }
          if (replyBtn && replyBtn.textContent !== 'Sent') { replyBtn.disabled = false; replyBtn.textContent = 'Send reply'; }
          setStatusMessage(error.message || 'Unable to update feedback right now.', 'danger');
        }
      });

      document.getElementById('chatbotFeedbackStatusFilter').addEventListener('change', (event) => {
        state.statusFilter = event.target.value || 'new';
        renderFeedback();
      });

      (async () => {
        try {
          await loadSession();
          await refreshFeedback();
        } catch (error) {
          setStatusMessage(error.message || 'Admin access is required.', 'danger');
        }
      })();
