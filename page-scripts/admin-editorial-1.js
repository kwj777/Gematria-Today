      const state = { proposals: [], statusFilter: 'all' };
      const saveMessage = document.getElementById('saveMessage');
      const errorMessage = document.getElementById('errorMessage');

      function showMessage(el, message) {
        if (!el) return;
        el.textContent = message;
        el.classList.remove('d-none');
      }

      function clearMessage(el) {
        if (!el) return;
        el.textContent = '';
        el.classList.add('d-none');
      }

      async function request(url, options = {}) {
        const response = await fetch(url, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
          ...options
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Request failed');
        }
        return payload;
      }

      function escapeHtml(value) {
        return String(value || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function renderBlogProposals() {
        const pendingCount = state.proposals.filter((proposal) => proposal.status === 'pending').length;
        document.getElementById('proposalPendingBadge').textContent = `${pendingCount} pending`;
        const filteredProposals = state.statusFilter === 'all'
          ? state.proposals
          : state.proposals.filter((proposal) => (proposal.status || 'pending') === state.statusFilter);
        const list = document.getElementById('proposalList');
        list.removeAttribute('aria-busy');
        list.innerHTML = filteredProposals.length ? filteredProposals.map((proposal) => `
          <article class="admin-item-card editorial-proposal-card mb-3 p-3">
            <div class="d-flex justify-content-between gap-3">
              <div>
                <div class="d-flex flex-wrap gap-2 mb-2">
                  <span class="badge ${proposal.status === 'pending' ? 'text-bg-danger' : 'text-bg-secondary'}">${escapeHtml(proposal.status || 'pending')}</span>
                  <span class="badge editorial-proposal-card__meta-badge">${escapeHtml(new Date(proposal.createdAt).toLocaleString())}</span>
                  ${proposal.attributionUsername ? `<span class="badge text-bg-info">@${escapeHtml(proposal.attributionUsername)}</span>` : ''}
                </div>
                <h2 class="h5 mb-2">${escapeHtml(proposal.title || 'Untitled proposal')}</h2>
                <p class="small mb-2">${escapeHtml(proposal.summary || '')}</p>
                <p class="small text-muted mb-2">Suggested tags: ${escapeHtml(proposal.suggestedTags || 'none')}</p>
                ${proposal.proposedImageUrl ? `<p class="small text-muted mb-2">Suggested image URL: <span class="text-break">${escapeHtml(proposal.proposedImageUrl)}</span></p>` : ''}
                <details>
                  <summary class="small">View draft content</summary>
                  <pre class="small mt-2 mb-0 text-wrap" style="white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(proposal.body || '')}</pre>
                </details>
              </div>
              <div class="d-flex flex-column gap-2" style="min-width: 220px;">
                <a class="btn btn-sm btn-outline-primary" href="/admin-posts.html?loadProposal=${encodeURIComponent(proposal.id)}">Load into publishing workspace</a>
                <button class="btn btn-sm btn-outline-success" type="button" data-mark-proposal-accepted="${escapeHtml(proposal.id)}">Mark accepted</button>
                <button class="btn btn-sm btn-outline-primary" type="button" data-mark-proposal-reviewed="${escapeHtml(proposal.id)}">Mark reviewed</button>
                <button class="btn btn-sm btn-outline-secondary" type="button" data-mark-proposal-pending="${escapeHtml(proposal.id)}">Set pending</button>
                <button class="btn btn-sm btn-outline-danger" type="button" data-reject-proposal="${escapeHtml(proposal.id)}">Reject post</button>
                <button class="btn btn-sm btn-danger" type="button" data-delete-proposal="${escapeHtml(proposal.id)}">Delete submission</button>
              </div>
            </div>
            <div class="mt-3 d-none" data-reject-panel="${escapeHtml(proposal.id)}">
              <label class="form-label small fw-semibold" for="rejectReason-${escapeHtml(proposal.id)}">Rejection explanation (shown to the member)</label>
              <textarea id="rejectReason-${escapeHtml(proposal.id)}" class="form-control mb-2" rows="3" data-reject-reason="${escapeHtml(proposal.id)}" placeholder="Explain what would need to change for this to be accepted."></textarea>
              <div class="d-flex flex-wrap gap-2">
                <button class="btn btn-sm btn-danger" type="button" data-confirm-reject="${escapeHtml(proposal.id)}">Send rejection</button>
                <button class="btn btn-sm btn-outline-secondary" type="button" data-cancel-reject="${escapeHtml(proposal.id)}">Cancel</button>
              </div>
            </div>
            ${proposal.status === 'rejected' && proposal.rejectionExplanation ? `
              <div class="alert alert-warning small mt-3 mb-0">
                <strong>Rejection explanation:</strong> ${escapeHtml(proposal.rejectionExplanation)}
              </div>
            ` : proposal.status === 'approved' && proposal.rejectionExplanation ? `
              <div class="alert alert-success small mt-3 mb-0">
                <strong>Acceptance message:</strong> ${escapeHtml(proposal.rejectionExplanation)}
              </div>
            ` : ''}
          </article>`).join('') : '<p class="text-muted small mb-0">No proposals match the selected status.</p>';
      }

      async function refreshProposals() {
        const proposals = await request('/api/admin-blog-proposals');
        state.proposals = proposals.items || [];
        renderBlogProposals();
      }

      async function init() {
        try {
          await request('/api/admin-session');
          await refreshProposals();
        } catch (error) {
          window.location.href = window.adminSession?.signInUrl?.() || '/admin.html';
        }
      }

      // Cancel / send for the inline rejection panel.
      document.addEventListener('click', (event) => {
        const cancelId = event.target.dataset.cancelReject;
        if (!cancelId) return;
        const panel = document.querySelector(`[data-reject-panel="${cancelId}"]`);
        panel?.classList.add('d-none');
      });

      document.addEventListener('click', async (event) => {
        const confirmId = event.target.dataset.confirmReject;
        if (!confirmId) return;
        const reason = document.querySelector(`[data-reject-reason="${confirmId}"]`)?.value.trim();
        if (!reason) {
          showMessage(errorMessage, 'Rejection explanation is required.');
          return;
        }
        clearMessage(errorMessage);
        try {
          await request('/api/admin-blog-proposals', {
            method: 'PATCH',
            body: JSON.stringify({ id: confirmId, status: 'rejected', rejectionExplanation: reason }),
          });
          showMessage(saveMessage, 'Proposal rejected and the explanation sent to the member.');
          await refreshProposals();
        } catch (error) {
          showMessage(errorMessage, error.message);
        }
      });

      document.addEventListener('click', async (event) => {
        const proposalId = event.target.dataset.markProposalAccepted
          || event.target.dataset.markProposalReviewed
          || event.target.dataset.markProposalPending
          || event.target.dataset.rejectProposal
          || event.target.dataset.deleteProposal;
        if (!proposalId) return;
        if (event.target.dataset.deleteProposal) {
          const confirmed = window.confirm('Delete this submission permanently? This action cannot be undone.');
          if (!confirmed) return;
          clearMessage(errorMessage);
          try {
            await request('/api/admin-blog-proposals', {
              method: 'DELETE',
              body: JSON.stringify({ id: proposalId })
            });
            showMessage(saveMessage, 'Submission deleted.');
            await refreshProposals();
          } catch (error) {
            showMessage(errorMessage, error.message);
          }
          return;
        }
        const nextStatus = event.target.dataset.markProposalAccepted
          ? 'approved'
          : event.target.dataset.markProposalReviewed
            ? 'reviewed'
            : event.target.dataset.markProposalPending
              ? 'pending'
              : 'rejected';
        let rejectionExplanation = null;
        if (nextStatus === 'rejected') {
          // A single-line window.prompt is a poor place to compose a message
          // that goes to a member: no multi-line editing, no review, and
          // Cancel silently discarded the draft.
          const panel = document.querySelector(`[data-reject-panel="${proposalId}"]`);
          if (panel) {
            panel.classList.remove('d-none');
            panel.querySelector('[data-reject-reason]')?.focus();
            return;
          }
        }
        clearMessage(errorMessage);
        try {
          await request('/api/admin-blog-proposals', {
            method: 'PATCH',
            body: JSON.stringify({ id: proposalId, status: nextStatus, rejectionExplanation })
          });
          showMessage(saveMessage, `Proposal status updated to ${nextStatus}.`);
          await refreshProposals();
        } catch (error) {
          showMessage(errorMessage, error.message);
        }
      });

      document.getElementById('proposalStatusFilter').addEventListener('change', (event) => {
        state.statusFilter = event.target.value || 'all';
        renderBlogProposals();
      });

      init();
