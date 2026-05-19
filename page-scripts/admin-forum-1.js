      const alertEl = document.getElementById('alert');
      const reportsListEl = document.getElementById('reportsList');
      const categoriesListEl = document.getElementById('categoriesList');
      const summaryCardsEl = document.getElementById('summaryCards');
      const topReasonsEl = document.getElementById('topReasons');
      const topReportersEl = document.getElementById('topReporters');
      const auditTrailEl = document.getElementById('auditTrail');
      let selectedReports = new Set();
      const cannedReplies = {
        policy_warning: 'Your content violated forum policy. Please review the community guidelines before posting again.',
        no_violation: 'After review, we found no policy violation and closed this report.',
        content_removed: 'This content was removed due to policy violations.',
      };
      const suggestedIcons = [
        { value: '', label: 'No icon' },
        { value: 'megaphone', label: '📢 Megaphone' },
        { value: 'chat', label: '💬 Chat' },
        { value: 'book-open', label: '📖 Study' },
        { value: 'heart-handshake', label: '🤝 Fellowship' },
        { value: 'shield-check', label: '🛡️ Moderated' },
        { value: 'lightbulb', label: '💡 Ideas' },
        { value: 'sparkles', label: '✨ Highlights' },
        { value: 'praying-hands', label: '🙏 Prayer' },
      ];

      function showAlert(message, type = 'danger') { alertEl.className = `alert alert-${type}`; alertEl.textContent = message; alertEl.classList.remove('d-none'); }
      function hideAlert() { alertEl.classList.add('d-none'); }
      function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString(); }
      function esc(value) { return String(value || '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char])); }
      function isHexColor(value) { return /^#[0-9a-f]{6}$/i.test(String(value || '').trim()); }
      function sanitizeColor(value, fallback = '#563d7c') { return isHexColor(value) ? String(value).trim() : fallback; }
      function iconOptionsMarkup(selectedIcon = '') {
        const selected = String(selectedIcon || '').trim();
        const iconSet = new Set(suggestedIcons.map((icon) => icon.value));
        const options = [...suggestedIcons];
        if (selected && !iconSet.has(selected)) options.push({ value: selected, label: `⭐ Custom (${selected})` });
        return options.map((icon) => `<option value="${esc(icon.value)}" ${icon.value === selected ? 'selected' : ''}>${esc(icon.label)}</option>`).join('');
      }
      function wireColorInputPair(textInput, colorInput) {
        if (!textInput || !colorInput) return;
        colorInput.value = sanitizeColor(textInput.value, colorInput.value || '#563d7c');
        textInput.addEventListener('input', () => {
          if (!isHexColor(textInput.value)) return;
          colorInput.value = sanitizeColor(textInput.value, colorInput.value || '#563d7c');
        });
        colorInput.addEventListener('input', () => { textInput.value = colorInput.value; });
      }
      function wireColorInputPairs(scope = document) {
        scope.querySelectorAll('[data-color-pair]').forEach((group) => {
          wireColorInputPair(group.querySelector('[data-color-text]'), group.querySelector('[data-color-picker]'));
        });
      }

      function normalizeNetlifyFunctionPath(url) {
        return url.startsWith('/api/') ? `/.netlify/functions/${url.slice('/api/'.length)}` : url;
      }

      async function request(url, options = {}) {
        const requestOptions = {
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', ...(options.headers || {}) },
          ...options
        };

        const response = await fetch(url, requestOptions);
        if ((response.status === 404 || response.status === 405) && url.startsWith('/api/')) {
          const fallbackResponse = await fetch(normalizeNetlifyFunctionPath(url), requestOptions);
          const fallbackPayload = await fallbackResponse.json().catch(() => ({}));
          if (!fallbackResponse.ok) throw new Error(fallbackPayload.error || 'Request failed');
          return fallbackPayload;
        }

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Request failed');
        return payload;
      }

      function queryFromFilters() {
        const params = new URLSearchParams();
        const pairs = [
          ['reason', document.getElementById('filterReason').value],
          ['category', document.getElementById('filterCategory').value],
          ['status', document.getElementById('filterStatus').value],
          ['assignee', document.getElementById('filterAssignee').value],
          ['search', document.getElementById('filterSearch').value],
          ['dateFrom', document.getElementById('filterFrom').value],
          ['dateTo', document.getElementById('filterTo').value],
          ['onlyUnresolved', document.getElementById('filterUnresolved').checked ? 'true' : 'false'],
        ];
        pairs.forEach(([key, value]) => { if (value) params.set(key, value); });
        return params.toString();
      }

      function renderSummary(summary = {}) {
        const cards = [
          ['Total reports', summary.total_reports || 0],
          ['Unresolved', summary.unresolved_reports || 0],
          ['Actioned', summary.actioned_reports || 0],
          ['Dismissed', summary.dismissed_reports || 0],
          ['Last 7 days', summary.reports_last_7_days || 0],
          ['Avg age (hours)', summary.avgReportAgeHours || 0],
        ];
        summaryCardsEl.innerHTML = cards.map(([label, value]) => `<div class="col-sm-6 col-lg-4"><article class="border rounded p-3"><p class="small text-muted mb-1">${label}</p><p class="h4 mb-0">${value}</p></article></div>`).join('');
      }

      function renderAbuseSignals(signals = {}) {
        const reasons = signals.topReasons || [];
        const reporters = signals.topReporters || [];
        topReasonsEl.innerHTML = reasons.length ? `<ul class="mb-0">${reasons.map((row) => `<li>${esc(row.reason)}: ${row.total}</li>`).join('')}</ul>` : '<p class="text-muted mb-0">No reason spikes.</p>';
        topReportersEl.innerHTML = reporters.length ? `<ul class="mb-0">${reporters.map((row) => `<li>${esc(row.username)}: ${row.total}</li>`).join('')}</ul>` : '<p class="text-muted mb-0">No reporter concentration.</p>';
      }

      function reportActionButtons(reportId) {
        return [
          ['In review', 'in_review', 'none', 'btn-outline-secondary'],
          ['Resolve', 'resolved', 'resolve', 'btn-outline-success'],
          ['Dismiss', 'dismissed', 'dismiss', 'btn-outline-secondary'],
          ['Remove post', 'actioned', 'remove_post', 'btn-outline-danger'],
          ['Hide thread', 'actioned', 'hide_thread', 'btn-outline-warning'],
          ['Warn user', 'actioned', 'warn_user', 'btn-outline-warning'],
          ['Suspend', 'actioned', 'suspend_user', 'btn-outline-danger'],
          ['Escalate', 'in_review', 'escalate', 'btn-outline-warning'],
        ].map(([label, status, action, variant]) => `<button class="btn ${variant} btn-sm" data-report-action="${reportId}" data-status="${status}" data-action="${action}" type="button">${label}</button>`).join('');
      }

      async function updateReports(payload, successMessage) {
        await request('/api/admin-forum', { method: 'PUT', body: JSON.stringify(payload) });
        await load();
        showAlert(successMessage, 'success');
      }

      function renderReports(reports) {
        if (!reports.length) { reportsListEl.innerHTML = '<p class="text-muted mb-0">No reports match this filter.</p>'; return; }

        reportsListEl.innerHTML = reports.map((report) => `
          <article class="report-card border rounded p-3 mb-3 bg-white" data-report-id="${report.id}">
            <div class="d-flex justify-content-between align-items-start gap-3">
              <div class="w-100">
                <div class="d-flex gap-2 align-items-center mb-1">
                  <input type="checkbox" class="form-check-input" data-select-report="${report.id}" aria-label="Select report ${esc(report.reason || report.id)} for bulk action" ${selectedReports.has(report.id) ? 'checked' : ''} />
                  <p class="mb-0"><strong>${esc(report.reason)}</strong> · by ${esc(report.reporterUsername)} · ${formatDate(report.createdAt)}</p>
                </div>
                <p class="report-meta text-muted mb-1">
                  <span class="badge badge-soft rounded-pill me-1">Status: ${esc(report.status)}</span>
                  <span class="badge badge-soft rounded-pill me-1">Action: ${esc(report.actionTaken || 'none')}</span>
                  <span class="badge badge-soft rounded-pill">Assignee: ${esc(report.assignedModeratorUsername || 'unassigned')}</span>
                </p>
                <p class="small text-muted mb-1">Category: ${esc(report.categoryName || 'Unknown')} · Thread: ${esc(report.threadTitle || report.threadId || 'Unknown')} · Reply: ${esc(report.postId || 'n/a')}</p>
                <p class="mb-2">${esc((report.details || report.reportedBodyPreview || 'No details').slice(0, 260))}</p>
                <div class="row g-2 mb-2">
                  <div class="col-md-6 col-lg-3"><input class="form-control form-control-sm" placeholder="Assign moderator" aria-label="Assign moderator" data-assign-input="${report.id}" value="${esc(report.assignedModeratorUsername || '')}" /></div>
                  <div class="col-md-6 col-lg-3"><select class="form-select form-select-sm" aria-label="Canned reply template" data-canned-template="${report.id}"><option value="">Canned reply</option><option value="policy_warning">Policy warning</option><option value="no_violation">No violation</option><option value="content_removed">Content removed</option></select></div>
                  <div class="col-md-6 col-lg-3"><input class="form-control form-control-sm" placeholder="Moderator note" aria-label="Moderator note (visible to reporter)" data-moderator-note="${report.id}" value="${esc(report.moderatorNote || '')}" /></div>
                  <div class="col-md-6 col-lg-3"><input class="form-control form-control-sm" placeholder="Internal note" aria-label="Internal note (moderators only)" data-internal-note="${report.id}" value="${esc(report.internalNote || '')}" /></div>
                </div>
                <div class="d-flex flex-wrap gap-2">${reportActionButtons(report.id)}</div>
              </div>
            </div>
          </article>
        `).join('');

        reportsListEl.querySelectorAll('[data-select-report]').forEach((check) => {
          check.addEventListener('change', () => {
            if (check.checked) selectedReports.add(check.dataset.selectReport); else selectedReports.delete(check.dataset.selectReport);
          });
        });

        reportsListEl.querySelectorAll('[data-canned-template]').forEach((select) => {
          select.addEventListener('change', () => {
            const reportId = select.dataset.cannedTemplate;
            const canned = cannedReplies[select.value] || '';
            if (canned) {
              const target = reportsListEl.querySelector(`[data-moderator-note="${reportId}"]`);
              if (target) target.value = canned;
            }
          });
        });

        reportsListEl.querySelectorAll('[data-report-action]').forEach((button) => {
          button.addEventListener('click', async () => {
            try {
              hideAlert();
              const reportId = button.dataset.reportAction;
              await updateReports({
                id: reportId,
                status: button.dataset.status,
                actionTaken: button.dataset.action,
                assignTo: reportsListEl.querySelector(`[data-assign-input="${reportId}"]`)?.value || '',
                moderatorNote: reportsListEl.querySelector(`[data-moderator-note="${reportId}"]`)?.value || '',
                internalNote: reportsListEl.querySelector(`[data-internal-note="${reportId}"]`)?.value || '',
              }, 'Report updated.');
            } catch (error) { showAlert(error.message); }
          });
        });
      }

      function renderCategories(categories) {
        if (!categories.length) { categoriesListEl.innerHTML = '<p class="text-muted mb-0">No categories found.</p>'; return; }
        categoriesListEl.innerHTML = categories.map((category) => `
          <form class="border rounded p-3 mb-3" data-category-form="${category.id}">
            <input type="hidden" name="id" value="${category.id}" />
            <div class="row g-2 align-items-end">
              <div class="col-md-2"><label class="form-label small">Name</label><input class="form-control" name="name" value="${esc(category.name)}" required /></div>
              <div class="col-md-2"><label class="form-label small">Slug</label><input class="form-control" name="slug" value="${esc(category.slug)}" required /></div>
              <div class="col-md-2"><label class="form-label small">Access</label><select class="form-select" name="accessTier"><option value="free" ${category.accessTier === 'free' ? 'selected' : ''}>Free</option><option value="premium" ${category.accessTier === 'premium' ? 'selected' : ''}>Premium</option></select></div>
              <div class="col-md-2"><label class="form-label small">Sort</label><input class="form-control" name="sortOrder" type="number" value="${category.sortOrder}" /></div>
              <div class="col-md-2"><label class="form-label small">Post mode</label><select class="form-select" name="postMode"><option value="members" ${category.postMode === 'members' ? 'selected' : ''}>Members</option><option value="moderators" ${category.postMode === 'moderators' ? 'selected' : ''}>Moderators</option></select></div>
              <div class="col-md-2"><label class="form-label small">Default sort</label><select class="form-select" name="defaultSortMode"><option value="newest" ${category.defaultSortMode === 'newest' ? 'selected' : ''}>Newest</option><option value="popular" ${category.defaultSortMode === 'popular' ? 'selected' : ''}>Popular</option></select></div>
              <div class="col-md-2">
                <label class="form-label small">Color badge</label>
                <div class="input-group" data-color-pair>
                  <input class="form-control" name="colorBadge" data-color-text value="${esc(category.colorBadge || '')}" />
                  <input class="form-control form-control-color" type="color" data-color-picker value="${esc(sanitizeColor(category.colorBadge || ''))}" title="Pick badge color" />
                </div>
              </div>
              <div class="col-md-2"><label class="form-label small">Icon</label><select class="form-select" name="iconName">${iconOptionsMarkup(category.iconName || '')}</select></div>
              <div class="col-md-3"><label class="form-label small">Description</label><input class="form-control" name="description" value="${esc(category.description || '')}" /></div>
              <div class="col-md-5"><label class="form-label small">Guidelines</label><input class="form-control" name="guidelines" value="${esc(category.guidelines || '')}" /></div>
              <div class="col-md-12"><label class="form-label small">Thread template prompt</label><input class="form-control" name="threadTemplatePrompt" value="${esc(category.threadTemplatePrompt || '')}" /></div>
              <div class="col-12 d-flex flex-wrap gap-3 mt-2">
                <label class="form-check"><input class="form-check-input" type="checkbox" name="isArchived" ${category.isArchived ? 'checked' : ''}><span class="form-check-label">Archived</span></label>
                <label class="form-check"><input class="form-check-input" type="checkbox" name="isLocked" ${category.isLocked ? 'checked' : ''}><span class="form-check-label">Locked</span></label>
                <label class="form-check"><input class="form-check-input" type="checkbox" name="requireApproval" ${category.requireApproval ? 'checked' : ''}><span class="form-check-label">Require approval</span></label>
              </div>
              <div class="col-12 d-flex justify-content-end gap-2 mt-2"><button class="btn btn-outline-primary btn-sm" type="submit">Save</button><button class="btn btn-outline-danger btn-sm" type="button" data-delete-category="${category.id}">Delete</button></div>
            </div>
          </form>
        `).join('');

        categoriesListEl.querySelectorAll('[data-category-form]').forEach((form) => {
          form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(form);
            ['isArchived', 'isLocked', 'requireApproval'].forEach((name) => formData.set(name, form.querySelector(`[name="${name}"]`).checked ? 'true' : 'false'));
            try { hideAlert(); await request('/api/admin-forum', { method: 'PATCH', body: JSON.stringify(Object.fromEntries(formData.entries())) }); await load(); showAlert('Category updated.', 'success'); window.showToast?.('Category changes saved successfully.', 'success'); }
            catch (error) { showAlert(error.message); }
          });
        });

        categoriesListEl.querySelectorAll('[data-delete-category]').forEach((button) => {
          button.addEventListener('click', async () => {
            const categoryName = button.closest('form')?.querySelector('[name="name"]')?.value?.trim() || 'this category';
            if (!window.confirm(`Warning: you are about to permanently delete ${categoryName}. This only works when no active threads exist in it.`)) return;
            try { hideAlert(); await request(`/api/admin-forum?id=${encodeURIComponent(button.dataset.deleteCategory)}`, { method: 'DELETE' }); await load(); showAlert('Category deleted.', 'success'); }
            catch (error) { showAlert(error.message); }
          });
        });
        wireColorInputPairs(categoriesListEl);
      }

      function renderAuditTrail(entries) {
        if (!entries?.length) { auditTrailEl.innerHTML = '<p class="text-muted mb-0">No admin actions logged yet.</p>'; return; }
        auditTrailEl.innerHTML = `<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr><th>When</th><th>Action</th><th>Target</th><th>Actor</th></tr></thead><tbody>${entries.map((entry) => `<tr><td>${formatDate(entry.created_at)}</td><td>${esc(entry.action)}</td><td>${esc(entry.target_type)}:${esc(entry.target_id)}</td><td>${esc(entry.actor_user_id)}</td></tr>`).join('')}</tbody></table></div>`;
      }

      function clearSectionPlaceholders(errored = false) {
        const sections = [
          [summaryCardsEl, 'No moderation summary available.'],
          [reportsListEl, 'No reports to display.'],
          [topReasonsEl, 'No reason data.'],
          [topReportersEl, 'No reporter data.'],
          [categoriesListEl, 'No categories to display.'],
          [auditTrailEl, 'No audit entries to display.'],
        ];
        sections.forEach(([el, fallbackText]) => {
          if (!el) return;
          el.removeAttribute('aria-busy');
          if (errored && el.querySelector('.placeholder-glow')) {
            el.innerHTML = `<p class="text-muted small mb-0">${fallbackText}</p>`;
          }
        });
      }

      async function load() {
        const query = queryFromFilters();
        try {
          const payload = await request(`/api/admin-forum${query ? `?${query}` : ''}`);
          renderSummary(payload.moderationSummary || {});
          renderReports(payload.reports || []);
          renderCategories(payload.categories || []);
          renderAbuseSignals(payload.abuseSignals || {});
          renderAuditTrail(payload.auditTrail || []);
          clearSectionPlaceholders(false);
        } catch (error) {
          clearSectionPlaceholders(true);
          throw error;
        }
      }

      document.getElementById('reportFilters').addEventListener('submit', (event) => { event.preventDefault(); load().catch((error) => showAlert(error.message)); });
      document.getElementById('resetFiltersButton').addEventListener('click', () => {
        document.getElementById('reportFilters').reset();
        document.getElementById('filterUnresolved').checked = true;
        load().catch((error) => showAlert(error.message));
      });
      document.getElementById('refreshButton').addEventListener('click', () => load().catch((error) => showAlert(error.message)));
      document.getElementById('bulkReviewButton').addEventListener('click', async () => {
        if (!selectedReports.size) return showAlert('Select reports first.', 'warning');
        try { hideAlert(); await updateReports({ ids: [...selectedReports], status: 'in_review', actionTaken: 'none' }, 'Selected reports moved to in review.'); selectedReports = new Set(); }
        catch (error) { showAlert(error.message); }
      });
      document.getElementById('bulkResolveButton').addEventListener('click', async () => {
        if (!selectedReports.size) return showAlert('Select reports first.', 'warning');
        try { hideAlert(); await updateReports({ ids: [...selectedReports], status: 'resolved', actionTaken: 'resolve' }, 'Selected reports resolved.'); selectedReports = new Set(); }
        catch (error) { showAlert(error.message); }
      });
      document.getElementById('createIconName').innerHTML = iconOptionsMarkup('');
      wireColorInputPair(document.getElementById('createColorBadge'), document.getElementById('createColorBadgePicker'));

      document.getElementById('createCategoryForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          hideAlert();
          await request('/api/admin-forum', { method: 'POST', body: JSON.stringify({
            name: document.getElementById('createName').value,
            slug: document.getElementById('createSlug').value,
            accessTier: document.getElementById('createTier').value,
            sortOrder: document.getElementById('createSort').value,
            postMode: document.getElementById('createPostMode').value,
            defaultSortMode: document.getElementById('createDefaultSortMode').value,
            colorBadge: document.getElementById('createColorBadge').value,
            iconName: document.getElementById('createIconName').value,
            description: document.getElementById('createDescription').value,
            guidelines: document.getElementById('createGuidelines').value,
            threadTemplatePrompt: document.getElementById('createThreadTemplatePrompt').value,
            isArchived: document.getElementById('createArchived').checked ? 'true' : 'false',
            isLocked: document.getElementById('createLocked').checked ? 'true' : 'false',
            requireApproval: document.getElementById('createRequireApproval').checked ? 'true' : 'false',
          }) });
          event.target.reset();
          await load();
          showAlert('Category created.', 'success');
        } catch (error) { showAlert(error.message); }
      });

      load().catch((error) => {
        const message = String(error?.message || '').toLowerCase();
        if (message.includes('unauthorized') || message.includes('authentication')) return showAlert('Sign in to the admin dashboard first.', 'warning');
        showAlert(error.message);
      });
