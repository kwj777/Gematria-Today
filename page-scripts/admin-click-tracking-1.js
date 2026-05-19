      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function formatNumber(value) {
        return new Intl.NumberFormat('en-US').format(Number(value || 0));
      }

      function parseWindowSelection(rawValue) {
        const value = String(rawValue || '').trim().toLowerCase();
        if (value.endsWith('h')) {
          return { query: `hours=${Number.parseInt(value, 10) || 1}` };
        }
        return { query: `days=${Number.parseInt(value, 10) || 30}` };
      }

      async function request(url) {
        const response = await fetch(url, { credentials: 'same-origin', headers: { 'content-type': 'application/json' } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || `Request failed (HTTP ${response.status})`);
        }
        return payload;
      }

      const tableBody = document.getElementById('clickTrackingBody');
      const mostClickedBody = document.getElementById('mostClickedBody');
      const neverClickedBody = document.getElementById('neverClickedBody');
      const countEl = document.getElementById('clickTrackingCount');
      const filterInput = document.getElementById('clickTrackingFilter');
      const sortSelect = document.getElementById('clickTrackingSort');
      const mostClickedAudienceFilter = document.getElementById('mostClickedAudienceFilter');
      const mostClickedActionFilter = document.getElementById('mostClickedActionFilter');
      const mostClickedPageFilter = document.getElementById('mostClickedPageFilter');
      let currentRows = [];
      let currentNeverClickedElements = [];

      function normalizeAudienceType(rawAudienceType) {
        const normalized = String(rawAudienceType || '').trim().toLowerCase();
        if (normalized === 'member') return 'member';
        if (normalized === 'visitor' || normalized === 'non-member' || normalized === 'nonmember') return 'visitor';
        return 'other';
      }

      function updateMostClickedFilterOptions(rows) {
        const actionCounts = new Map();
        const pageCounts = new Map();
        rows.forEach((row) => {
          const action = String(row.action || '').trim() || '—';
          const page = String(row.pagePath || '').trim() || '—';
          actionCounts.set(action, (actionCounts.get(action) || 0) + 1);
          pageCounts.set(page, (pageCounts.get(page) || 0) + 1);
        });

        const previousAction = String(mostClickedActionFilter.value || 'all');
        const previousPage = String(mostClickedPageFilter.value || 'all');
        const actionOptions = Array.from(actionCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        const pageOptions = Array.from(pageCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

        mostClickedActionFilter.innerHTML = '<option value="all">All actions</option>' + actionOptions.map(([value, count]) => (
          '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + ' (' + formatNumber(count) + ')</option>'
        )).join('');
        mostClickedPageFilter.innerHTML = '<option value="all">All pages</option>' + pageOptions.map(([value, count]) => (
          '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + ' (' + formatNumber(count) + ')</option>'
        )).join('');

        mostClickedActionFilter.value = Array.from(mostClickedActionFilter.options).some((option) => option.value === previousAction) ? previousAction : 'all';
        mostClickedPageFilter.value = Array.from(mostClickedPageFilter.options).some((option) => option.value === previousPage) ? previousPage : 'all';
      }

      function buildMostClickedRows(rows) {
        const grouped = new Map();
        rows.forEach((row) => {
          const selectorHint = row.elementId ? `#${row.elementId}` : row.elementSelector;
          const elementLabel = selectorHint ? `${row.elementType || 'element'} (${selectorHint})` : (row.elementType || 'element');
          const key = JSON.stringify([
            row.action || '',
            row.source || '',
            row.destination || '',
            elementLabel,
          ]);
          const existing = grouped.get(key);
          if (existing) {
            existing.clicks += 1;
            return;
          }
          grouped.set(key, {
            action: row.action || '',
            source: row.source || '',
            destination: row.destination || '',
            elementLabel,
            pagePath: row.pagePath || '',
            referrer: row.referrer || '',
            elementLink: row.elementLink || row.pageUrl || '',
            clicks: 1,
          });
        });

        return Array.from(grouped.values()).sort((a, b) => (
          b.clicks - a.clicks
          || String(a.action).localeCompare(String(b.action))
          || String(a.source).localeCompare(String(b.source))
        ));
      }

      function renderReportCards(rows) {
        const memberClicks = rows.filter((row) => normalizeAudienceType(row.audienceType) === 'member').length;
        const visitorClicks = rows.length - memberClicks;
        document.getElementById('reportTotalClicks').textContent = formatNumber(rows.length);
        document.getElementById('reportMemberClicks').textContent = formatNumber(memberClicks);
        document.getElementById('reportVisitorClicks').textContent = formatNumber(visitorClicks);
        document.getElementById('reportNeverClickedElements').textContent = formatNumber(currentNeverClickedElements.length);
      }

      function renderNeverClickedTable() {
        const rows = Array.isArray(currentNeverClickedElements) ? currentNeverClickedElements : [];
        neverClickedBody.innerHTML = rows.slice(0, 200).map((row) => (
          '<tr>'
          + '<td><code>' + escapeHtml(row.elementType || '—') + '</code></td>'
          + '<td class="small">' + escapeHtml(row.pagePath || '—') + '</td>'
          + '<td class="small" title="' + escapeHtml(row.label || '—') + '">' + escapeHtml(row.label || '—') + '</td>'
          + '<td class="small">' + (row.destination ? ('<code>' + escapeHtml(row.destination) + '</code>') : '<span class="text-muted">—</span>') + '</td>'
          + '</tr>'
        )).join('') || '<tr><td colspan="4" class="small text-muted">No never-clicked links or buttons found for this timeframe.</td></tr>';
      }

      function renderMostClickedTable(rows) {
        const audienceFilter = String(mostClickedAudienceFilter.value || 'all').toLowerCase();
        const actionFilter = String(mostClickedActionFilter.value || 'all');
        const pageFilter = String(mostClickedPageFilter.value || 'all');

        const mostClickedRows = buildMostClickedRows(rows.filter((row) => {
          if (audienceFilter !== 'all' && normalizeAudienceType(row.audienceType) !== audienceFilter) return false;
          if (actionFilter !== 'all' && String(row.action || '').trim() !== actionFilter) return false;
          if (pageFilter !== 'all' && String(row.pagePath || '').trim() !== pageFilter) return false;
          return true;
        }));
        mostClickedBody.innerHTML = mostClickedRows.slice(0, 100).map((row) => {
          const link = row.elementLink || '';
          return '<tr>'
            + '<td class="fw-semibold">' + formatNumber(row.clicks) + '</td>'
            + '<td><code>' + escapeHtml(row.action || '—') + '</code></td>'
            + '<td class="small" title="' + escapeHtml(row.source || '—') + '">' + escapeHtml(row.source || '—') + '</td>'
            + '<td class="small" title="' + escapeHtml(row.destination || '—') + '">' + escapeHtml(row.destination || '—') + '</td>'
            + '<td class="small" title="' + escapeHtml(row.elementLabel || 'element') + '">' + escapeHtml(row.elementLabel || 'element') + '</td>'
            + '<td class="small">' + escapeHtml(row.pagePath || '—') + '</td>'
            + '<td class="small" title="' + escapeHtml(row.referrer || '—') + '">' + escapeHtml(row.referrer || '—') + '</td>'
            + '<td class="small">' + (link ? ('<a href="' + escapeHtml(link) + '" target="_blank" rel="noopener noreferrer">Open element</a>') : '<span class="text-muted">—</span>') + '</td>'
            + '</tr>';
        }).join('') || '<tr><td colspan="8" class="small text-muted">No grouped click rows for the selected filters.</td></tr>';
      }

      function compareRows(a, b, sortMode) {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (sortMode === 'oldest') return aTime - bTime;
        if (sortMode === 'action') {
          const actionCompare = String(a.action || '').localeCompare(String(b.action || ''));
          if (actionCompare !== 0) return actionCompare;
        }
        return bTime - aTime;
      }

      function renderGroupedRows() {
        const sortMode = String(sortSelect.value || 'recent').toLowerCase();
        const filtered = getSearchFilteredRows().sort((a, b) => compareRows(a, b, sortMode));

        const groups = [
          { key: 'member', label: 'Members' },
          { key: 'visitor', label: 'Non-members' },
        ];

        const groupRows = groups.map((group, groupIndex) => {
          const groupItems = filtered.filter((row) => normalizeAudienceType(row.audienceType) === group.key);
          const groupId = `group-${group.key}`;
          const groupContent = groupItems.map((row) => {
            const time = row.createdAt ? new Date(row.createdAt).toLocaleString() : '—';
            const dest = row.destination || '—';
            const source = row.source || '—';
            const ref = row.referrer || '—';
            return '<tr class="click-group-row click-group-' + group.key + ' click-group-collapsed">'
              + '<td class="small text-nowrap">' + escapeHtml(time) + '</td>'
              + '<td><code>' + escapeHtml(row.action || '—') + '</code></td>'
              + '<td class="small" title="' + escapeHtml(source) + '">' + escapeHtml(source.length > 50 ? source.slice(0, 47) + '…' : source) + '</td>'
              + '<td class="small" title="' + escapeHtml(dest) + '">' + escapeHtml(dest.length > 60 ? dest.slice(0, 57) + '…' : dest) + '</td>'
              + '<td class="small"><code>' + escapeHtml(row.elementType || '—') + '</code></td>'
              + '<td class="small">' + escapeHtml(row.pagePath || '—') + '</td>'
              + '<td class="small" title="' + escapeHtml(ref) + '">' + escapeHtml(ref.length > 40 ? ref.slice(0, 37) + '…' : ref) + '</td>'
              + '<td class="small">' + (row.elementLink ? ('<a href="' + escapeHtml(row.elementLink) + '" target="_blank" rel="noopener noreferrer">Open</a>') : '<span class="text-muted">—</span>') + '</td>'
              + '</tr>';
          }).join('');

          return '<tr class="table-secondary">'
            + '<td colspan="8">'
            + '<button type="button" class="group-toggle" data-group-toggle="' + groupId + '" aria-expanded="false">'
            + '▸ ' + escapeHtml(group.label) + ' (' + formatNumber(groupItems.length) + ')'
            + '</button>'
            + '</td>'
            + '</tr>'
            + (groupContent || '<tr class="click-group-row click-group-' + group.key + ' click-group-collapsed"><td colspan="8" class="small text-muted">No events in this group.</td></tr>');
        }).join('');

        tableBody.innerHTML = groupRows || '<tr><td colspan="8" class="small text-muted">No click tracking data available for this timeframe.</td></tr>';
        countEl.textContent = `Showing ${formatNumber(filtered.length)} click events in timeframe.`;
        renderReportCards(filtered);
        renderNeverClickedTable();
        updateMostClickedFilterOptions(filtered);
        renderMostClickedTable(filtered);

        document.querySelectorAll('[data-group-toggle]').forEach((button) => {
          button.addEventListener('click', () => {
            const label = button.getAttribute('data-group-toggle') || '';
            const groupKey = label.replace('group-', '');
            const groupRowEls = tableBody.querySelectorAll(`.click-group-${CSS.escape(groupKey)}`);
            const expanded = button.getAttribute('aria-expanded') === 'true';
            groupRowEls.forEach((row) => row.classList.toggle('click-group-collapsed', expanded));
            button.setAttribute('aria-expanded', expanded ? 'false' : 'true');
            button.textContent = `${expanded ? '▸' : '▾'} ${button.textContent.replace(/^[▸▾]\s+/, '')}`;
          });
        });
      }

      function getSearchFilteredRows() {
        const lowerFilter = String(filterInput.value || '').toLowerCase();
        return currentRows.filter((row) => {
          if (!lowerFilter) return true;
          return (row.action || '').toLowerCase().includes(lowerFilter)
            || (row.source || '').toLowerCase().includes(lowerFilter)
            || (row.destination || '').toLowerCase().includes(lowerFilter)
            || (row.pagePath || '').toLowerCase().includes(lowerFilter)
            || (row.elementType || '').toLowerCase().includes(lowerFilter)
            || (row.referrer || '').toLowerCase().includes(lowerFilter)
            || (row.audienceType || '').toLowerCase().includes(lowerFilter);
        });
      }

      async function loadClickTracking() {
        const selected = parseWindowSelection(document.getElementById('windowSelect').value);
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.classList.add('d-none');
        try {
          const session = await request('/api/admin-session');
          if (!session.authenticated) {
            throw new Error('Not authenticated');
          }
          const payload = await request(`/api/admin-click-tracking?${selected.query}`);
          currentRows = Array.isArray(payload.clickTrackingDetails) ? payload.clickTrackingDetails : [];
          currentNeverClickedElements = Array.isArray(payload.neverClickedElements) ? payload.neverClickedElements : [];
          document.getElementById('metaLine').textContent = `Signed in as ${payload.user.username}. Window: ${payload.windowLabel}. Last refresh: ${new Date(payload.generatedAt).toLocaleString()}.`;
          renderGroupedRows();
        } catch (error) {
          errorMessage.textContent = `${error.message}. Visit Admin to sign in, then return here.`;
          errorMessage.classList.remove('d-none');
          document.getElementById('metaLine').textContent = 'Not authenticated or unable to load click tracking data.';
          tableBody.innerHTML = '<tr><td colspan="8" class="small text-muted">No click tracking data loaded.</td></tr>';
          mostClickedBody.innerHTML = '<tr><td colspan="8" class="small text-muted">No grouped click rows loaded.</td></tr>';
          neverClickedBody.innerHTML = '<tr><td colspan="4" class="small text-muted">No never-clicked rows loaded.</td></tr>';
          currentNeverClickedElements = [];
          countEl.textContent = '';
          renderReportCards([]);
        }
      }

      document.getElementById('refreshButton').addEventListener('click', loadClickTracking);
      document.getElementById('windowSelect').addEventListener('change', loadClickTracking);
      filterInput.addEventListener('input', renderGroupedRows);
      sortSelect.addEventListener('change', renderGroupedRows);
      mostClickedAudienceFilter.addEventListener('change', () => renderMostClickedTable(getSearchFilteredRows()));
      mostClickedActionFilter.addEventListener('change', () => renderMostClickedTable(getSearchFilteredRows()));
      mostClickedPageFilter.addEventListener('change', () => renderMostClickedTable(getSearchFilteredRows()));
      loadClickTracking();
