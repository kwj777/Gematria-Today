      const state = { reports: null, windowQuery: 'days=30', windowLabel: 'last 30 days', user: null };
      const adminReportsLoadingOverlay = document.getElementById('adminReportsLoadingOverlay');
      let reportsBootstrapped = false;

      function hideAdminReportsLoadingOverlay() {
        if (adminReportsLoadingOverlay) {
          adminReportsLoadingOverlay.classList.add('d-none');
        }
      }

      function showError(message) {
        const target = document.getElementById('errorMessage');
        target.textContent = message;
        target.classList.remove('d-none');
      }

      function clearError() {
        const target = document.getElementById('errorMessage');
        target.textContent = '';
        target.classList.add('d-none');
      }

      // The report query fans out across the database, so allow a slow window,
      // but never an open-ended one: the loading overlay covers the page until
      // a request settles, and a hung fetch left it there with no way out.
      const REQUEST_TIMEOUT_MS = 20000;

      function isTimeoutError(error) {
        return error?.name === 'TimeoutError' || error?.name === 'AbortError';
      }

      async function request(url) {
        // AbortController rather than AbortSignal.timeout: the browser gate in
        // early-bootstrap.js admits anything with fetch, and Safari before 16
        // has one but not the other.
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timeoutId = controller ? window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
        try {
          const response = await fetch(url, {
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            signal: controller ? controller.signal : undefined,
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload.error || 'Request failed');
          }
          return payload;
        } finally {
          if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
          }
        }
      }

      function formatNumber(value) {
        return new Intl.NumberFormat('en-US').format(Number(value || 0));
      }

      function renderBars(targetId, rows, valueField, labelField) {
        const target = document.getElementById(targetId);
        if (!rows || !rows.length) {
          target.innerHTML = '<p class="on-light-muted small mb-0">No data available for this window.</p>';
          return;
        }
        const maxValue = Math.max(...rows.map((row) => Number(row[valueField] || 0)), 1);
        target.innerHTML = rows.map((row, index) => {
          const value = Number(row[valueField] || 0);
          const percent = Math.max(2, Math.round((value / maxValue) * 100));
          return `
            <div>
              <div class="d-flex justify-content-between small mb-1">
                <span>${row[labelField]}</span>
                <span>${formatNumber(value)}</span>
              </div>
              <div class="progress report-bar" role="img" aria-label="${row[labelField]} ${value}">
                <div class="progress-bar" style="width: ${percent}%"></div>
              </div>
            </div>`;
        }).join('');
      }

      const OVERVIEW_CARD_META = {
        newMembers: { label: 'New members', valuePath: 'newMembers' },
        activePremiumMembers: { label: 'Active premium', valuePath: 'activePremiumMembers' },
        expiringPremiumMembers: { label: 'Premium expiring in 30d', valuePath: 'expiringPremiumMembers' },
        totalWords: { label: 'Total words in DB', valuePath: 'totalWords' },
      };

      const OVERVIEW_DETAIL_COLUMNS = {
        newMembers: [['ID', 'id'], ['Username', 'username'], ['Email', 'email'], ['Level', 'membershipLevel'], ['Status', 'status'], ['Created', 'createdAt'], ['Expires', 'membershipExpiresAt']],
        activePremiumMembers: [['ID', 'id'], ['Username', 'username'], ['Email', 'email'], ['Level', 'membershipLevel'], ['Status', 'status'], ['Created', 'createdAt'], ['Expires', 'membershipExpiresAt']],
        expiringPremiumMembers: [['ID', 'id'], ['Username', 'username'], ['Email', 'email'], ['Level', 'membershipLevel'], ['Status', 'status'], ['Expires', 'membershipExpiresAt']],
        totalWords: [['Word', 'word'], ['Gematria', 'gematriaValue'], ['Digital root', 'digitalRoot'], ['Searches', 'searchCount'], ['Updated', 'updatedAt']],
      };

      // Date fields are named createdAt, membershipExpiresAt, dueDate, ...
      // Match the camelCase suffix: a substring test for "at" also caught
      // gematriaValue, and new Date(312) rendered the value as a 1969 timestamp.
      const DATE_FIELD_PATTERN = /(?:At|Date)$/;

      function formatCellValue(key, value) {
        if (value === null || value === undefined || value === '') {
          return '—';
        }
        if (DATE_FIELD_PATTERN.test(String(key)) || key === 'created' || key === 'published') {
          const parsed = new Date(value);
          if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleString();
          }
        }
        return String(value);
      }

      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function openOverviewDetail(key) {
        const reports = state.reports;
        if (!reports) return;
        const rows = reports.detailRows?.[key] || [];
        const cardMeta = OVERVIEW_CARD_META[key] || { label: 'Details' };
        const columns = OVERVIEW_DETAIL_COLUMNS[key] || [];

        document.getElementById('overviewDetailTitle').textContent = `${cardMeta.label} details`;
        document.getElementById('overviewDetailMeta').textContent = `Showing ${formatNumber(rows.length)} records (latest first, up to 50).`;
        document.getElementById('overviewDetailHead').innerHTML = `<tr>${columns.map(([header]) => `<th scope="col">${escapeHtml(header)}</th>`).join('')}</tr>`;
        document.getElementById('overviewDetailBody').innerHTML = rows.length
          ? rows.map((row) => `<tr>${columns.map(([, field]) => `<td>${escapeHtml(formatCellValue(field, row[field]))}</td>`).join('')}</tr>`).join('')
          : `<tr><td colspan="${columns.length || 1}" class="on-dark-muted">No detail rows available.</td></tr>`;

        const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('overviewDetailModal'));
        modal.show();
      }

      function renderOverviewCards(overview) {
        const cards = [
          ['newMembers', OVERVIEW_CARD_META.newMembers.label, overview.newMembers],
          ['activePremiumMembers', OVERVIEW_CARD_META.activePremiumMembers.label, overview.activePremiumMembers],
          ['expiringPremiumMembers', OVERVIEW_CARD_META.expiringPremiumMembers.label, overview.expiringPremiumMembers],
          ['totalWords', OVERVIEW_CARD_META.totalWords.label, overview.totalWords],
        ];
        const target = document.getElementById('overviewGrid');
        target.innerHTML = cards.map(([key, label, value]) => `
          <button type="button" class="report-card report-card-button" data-overview-key="${key}" aria-label="Open ${label} details">
            <p class="muted-label mb-2">${label}</p>
            <div class="h3 mb-0">${formatNumber(value)}</div>
          </button>
        `).join('');
        target.querySelectorAll('[data-overview-key]').forEach((element) => {
          element.addEventListener('click', () => openOverviewDetail(element.getAttribute('data-overview-key')));
        });
      }

      function renderSecurityEvents(rows) {
        const target = document.getElementById('securityEvents');
        const visibleRows = rows.filter((event) => event.action !== 'rate_limit');
        if (!visibleRows.length) {
          target.innerHTML = '<p class="text-success small mb-0">No security problems in this reporting window.</p>';
          return;
        }
        target.innerHTML = visibleRows.map((event) => `
          <article class="border rounded p-2">
            <p class="small mb-1"><strong>${event.route}</strong> · ${event.action}</p>
            <p class="small on-light-muted mb-0">${new Date(event.createdAt).toLocaleString()} · ${event.outcome}</p>
          </article>
        `).join('');
      }

      function renderPublicPageViews(rows, summary) {
        const target = document.getElementById('publicPageViews');
        const summaryTarget = document.getElementById('publicTrafficSummary');
        const uniqueVisitors = Number(summary?.uniqueVisitors || 0);
        const totalRequests = Number(summary?.totalRequests || 0);
        summaryTarget.innerHTML = `
          <div class="report-card">
            <p class="mb-0">Unique visitors to site: <strong>${formatNumber(uniqueVisitors)}</strong> · Total public requests: <strong>${formatNumber(totalRequests)}</strong></p>
          </div>
        `;

        if (!rows || !rows.length) {
          target.innerHTML = '<p class="on-light-muted small mb-0">No public page-view data available for this window.</p>';
          return;
        }

        const maxUnique = Math.max(...rows.map((row) => Number(row.uniquePageViews || 0)), 1);
        target.innerHTML = rows.map((row, rowIndex) => {
          const pagePath = String(row.pagePath || row.route || '/unknown');
          const sourceRoute = String(row.route || pagePath);
          const uniqueViews = Number(row.uniquePageViews || 0);
          const rowTotalRequests = Number(row.totalRequests || 0);
          const barWidth = Math.max(2, Math.round((uniqueViews / maxUnique) * 100));
          const topCountries = Array.isArray(row.topCountries) ? row.topCountries : [];
          const detailPanelId = `pageViewDetail-${rowIndex}`;
          const routeShare = totalRequests > 0 ? ((rowTotalRequests / totalRequests) * 100).toFixed(1) : '0.0';
          const uniqueShare = uniqueVisitors > 0 ? ((uniqueViews / uniqueVisitors) * 100).toFixed(1) : '0.0';
          const countrySummary = topCountries.length
            ? topCountries.map((countryRow) => `${escapeHtml(countryRow.country)} (${formatNumber(countryRow.uniqueVisitors)})`).join(' · ')
            : 'Unknown';
          const detailReport = topCountries.length
            ? `
              <div id="${detailPanelId}" class="detail-report mt-2 p-2 d-none" role="region" aria-label="Detailed page-view report for ${escapeHtml(pagePath)}">
                <p class="small mb-2"><strong>Detailed page-view report</strong></p>
                <div class="d-grid gap-1">
                  ${topCountries.map((countryRow, countryIndex) => {
                    const countryUnique = Number(countryRow.uniqueVisitors || 0);
                    const countryRequests = Number(countryRow.totalRequests || 0);
                    const countryShare = uniqueViews > 0 ? ((countryUnique / uniqueViews) * 100).toFixed(1) : '0.0';
                    const topLocations = Array.isArray(countryRow.topLocations) ? countryRow.topLocations : [];
                    return `
                      <article class="detail-report-item pt-1">
                        <p class="small mb-1"><strong>#${countryIndex + 1}</strong> ${escapeHtml(countryRow.country)}</p>
                        <p class="small on-light-muted mb-1">Unique visitors: <strong>${formatNumber(countryUnique)}</strong> · Requests: <strong>${formatNumber(countryRequests)}</strong> · Share of route unique views: <strong>${countryShare}%</strong></p>
                        <p class="small on-light-muted mb-0">Top locations: ${
                          topLocations.length
                            ? topLocations.map((locationRow) => `${escapeHtml(locationRow.location)} (${formatNumber(locationRow.uniqueVisitors)})`).join(' · ')
                            : 'No location breakdown available.'
                        }</p>
                      </article>
                    `;
                  }).join('')}
                </div>
              </div>
            `
            : '';

          return `
            <article class="border rounded p-2">
              <div class="d-flex justify-content-between flex-wrap gap-2 mb-1">
                <p class="mb-0"><strong>${escapeHtml(pagePath)}</strong></p>
                <p class="mb-0 small">Unique views: <strong>${formatNumber(uniqueViews)}</strong> · Requests: <strong>${formatNumber(rowTotalRequests)}</strong></p>
              </div>
              <div class="progress report-bar" role="img" aria-label="${escapeHtml(pagePath)} unique views ${uniqueViews}">
                <div class="progress-bar bg-info" style="width: ${barWidth}%"></div>
              </div>
              ${sourceRoute !== pagePath ? `<p class="small on-light-muted mb-1 mt-2">Primary route source: <code>${escapeHtml(sourceRoute)}</code></p>` : '<div class="mt-2"></div>'}
              <p class="small on-light-muted mb-1 mt-2">Top visitor countries: ${countrySummary}</p>
              <p class="small on-light-muted mb-1">Share of total traffic: <strong>${routeShare}%</strong> requests · <strong>${uniqueShare}%</strong> unique visitors</p>
              ${topCountries.length ? `<button class="detail-toggle mb-2" type="button" data-pageview-toggle="${detailPanelId}" aria-expanded="false">Show full page-view details ▾</button>` : ''}
              ${detailReport}
            </article>
          `;
        }).join('');

        target.querySelectorAll('[data-pageview-toggle]').forEach((button) => {
          button.addEventListener('click', () => {
            const panelId = button.getAttribute('data-pageview-toggle');
            if (!panelId) return;
            const panel = target.querySelector(`#${CSS.escape(panelId)}`);
            if (!panel) return;
            const isHidden = panel.classList.contains('d-none');
            panel.classList.toggle('d-none', !isHidden);
            button.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
            button.textContent = isHidden ? 'Hide full page-view details ▴' : 'Show full page-view details ▾';
          });
        });
      }

      function renderButtonStats(rows) {
        const target = document.getElementById('buttonStats');
        if (!rows || !rows.length) {
          target.innerHTML = '<p class="on-light-muted small mb-0">No button/action click stats available for this window.</p>';
          return;
        }

        const maxClicks = Math.max(...rows.map((row) => Number(row.clicks || 0)), 1);
        target.innerHTML = rows.map((row, index) => {
          const clicks = Number(row.clicks || 0);
          const uniqueVisitors = Number(row.uniqueVisitors || 0);
          const barWidth = Math.max(2, Math.round((clicks / maxClicks) * 100));
          const label = `${row.route} · ${row.action}`;
          const lastClicked = row.lastClickedAt ? new Date(row.lastClickedAt).toLocaleString() : 'Unknown';
          const topDetails = Array.isArray(row.topDetails) ? row.topDetails.filter((detailRow) => detailRow?.detail) : [];
          const detailPanelId = `detailReport-${index}`;
          const hasDetails = topDetails.length > 0;
          const detailSummary = topDetails.length
            ? topDetails.map((detailRow) => `${escapeHtml(detailRow.detail)} (${formatNumber(detailRow.clicks)})`).join(' · ')
            : 'No link/detail metadata captured yet.';
          const detailReport = hasDetails
            ? `
              <div id="${detailPanelId}" class="detail-report mt-2 p-2 d-none" role="region" aria-label="Detailed click report for ${escapeHtml(label)}">
                <p class="small mb-2"><strong>Detailed click report</strong></p>
                <div class="d-grid gap-1">
                  ${topDetails.map((detailRow, detailIndex) => {
                    const detailClicks = Number(detailRow.clicks || 0);
                    const detailShare = clicks > 0 ? ((detailClicks / clicks) * 100).toFixed(1) : '0.0';
                    return `
                      <article class="detail-report-item pt-1">
                        <p class="small mb-1"><strong>#${detailIndex + 1}</strong> ${escapeHtml(detailRow.detail)}</p>
                        <p class="small on-light-muted mb-0">Clicks: <strong>${formatNumber(detailClicks)}</strong> · Share of this action: <strong>${detailShare}%</strong></p>
                      </article>
                    `;
                  }).join('')}
                </div>
              </div>
            `
            : '';
          return `
            <article class="border rounded p-2">
              <div class="d-flex justify-content-between flex-wrap gap-2 mb-1">
                <p class="mb-0"><strong>${escapeHtml(label)}</strong></p>
                <p class="mb-0 small">Clicks: <strong>${formatNumber(clicks)}</strong> · Unique visitors: <strong>${formatNumber(uniqueVisitors)}</strong></p>
              </div>
              <div class="progress report-bar mb-1" role="img" aria-label="${escapeHtml(label)} clicks ${clicks}">
                <div class="progress-bar bg-warning text-dark" style="width: ${barWidth}%"></div>
              </div>
              <p class="small on-light-muted mb-1">Top clicked detail: ${detailSummary}</p>
              ${hasDetails ? `<button class="detail-toggle mb-2" type="button" data-detail-toggle="${detailPanelId}" aria-expanded="false">Show full click details ▾</button>` : ''}
              ${detailReport}
              <p class="small on-light-muted mb-0">Last clicked: ${escapeHtml(lastClicked)}</p>
            </article>
          `;
        }).join('');

        target.querySelectorAll('[data-detail-toggle]').forEach((button) => {
          button.addEventListener('click', () => {
            const panelId = button.getAttribute('data-detail-toggle');
            if (!panelId) return;
            const panel = target.querySelector(`#${CSS.escape(panelId)}`);
            if (!panel) return;
            const isHidden = panel.classList.contains('d-none');
            panel.classList.toggle('d-none', !isHidden);
            button.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
            button.textContent = isHidden ? 'Hide full click details ▴' : 'Show full click details ▾';
          });
        });
      }

      function renderVerificationEmailHealth(stats) {
        const target = document.getElementById('verificationEmailHealth');
        if (!target) return;
        if (!stats || !Number(stats.attempted)) {
          target.innerHTML = '<p class="on-light-muted small mb-0">No registration attempts in this window.</p>';
          return;
        }

        const attempted = Number(stats.attempted || 0);
        const sent = Number(stats.sent || 0);
        const undelivered = Number(stats.undelivered || 0);
        const rate = stats.deliveryRate === null ? null : Number(stats.deliveryRate);
        const healthy = undelivered === 0;

        const rows = Object.entries(stats.byOutcome || {})
          .map(([outcome, total]) => `<li><code>${escapeHtml(outcome)}</code>: ${Number(total)}</li>`)
          .join('');

        // The counts say delivery is broken; the reason says what to fix. It is
        // the interpreted SendGrid error -- unverified sender, rejected key,
        // rate limit -- recorded at the moment the send failed.
        const failure = stats.lastFailure && stats.lastFailure.reason
          ? `<p class="small mb-0 mt-2">Most recent failure${stats.lastFailure.at ? ` (${escapeHtml(new Date(stats.lastFailure.at).toLocaleString())})` : ''}: ${escapeHtml(stats.lastFailure.reason)}</p>`
          : '';

        target.innerHTML = `
          <div class="alert ${healthy ? 'alert-success' : 'alert-danger'} mb-0" role="status">
            <strong>${sent} of ${attempted}</strong> verification email(s) sent${rate === null ? '' : ` (${rate}%)`}.
            ${healthy
              ? 'Delivery is healthy.'
              : `<strong>${undelivered} registration(s) never received a verification email</strong> and cannot sign in until delivery is fixed. Those accounts are kept, not pruned, so fixing the SendGrid API key and sender address in admin settings and resending still recovers them.`}
            ${failure}
          </div>
          <ul class="small mb-0">${rows}</ul>
        `;
      }

      function renderConversionFunnel(funnel) {
        const target = document.getElementById('conversionFunnel');
        if (!funnel) {
          target.innerHTML = '<p class="on-light-muted small mb-0">No conversion funnel data available.</p>';
          return;
        }

        const visitors = Number(funnel.uniqueVisitors || 0);
        const freeMembers = Number(funnel.freeMemberships || 0);
        const premiumMembers = Number(funnel.premiumConversions || 0);
        const visitorBase = Math.max(visitors, 1);
        const freeBase = Math.max(freeMembers, 1);
        const visitorsToFreeRate = Number(funnel.visitorsToFreeRate || 0);
        const freeToPremiumRate = Number(funnel.freeToPremiumRate || 0);

        const stepWidth = (value, base) => Math.max(8, Math.round((Math.max(value, 0) / Math.max(base, 1)) * 100));

        target.innerHTML = `
          <p class="small on-light-muted mb-0">Window: <strong>${escapeHtml(funnel.windowLabel || state.windowLabel)}</strong></p>
          <div class="row g-3 align-items-stretch">
            <div class="col-lg-4">
              <article class="funnel-card funnel-stage p-3 h-100">
                <p class="muted-label mb-1">Step 1</p>
                <h3 class="h6 mb-2">Unique visitors</h3>
                <p class="h4 mb-2">${formatNumber(visitors)}</p>
                <div class="progress report-bar" role="img" aria-label="Unique visitors ${visitors}">
                  <div class="progress-bar" style="width: ${stepWidth(visitors, visitorBase)}%"></div>
                </div>
              </article>
            </div>
            <div class="col-lg-1 d-none d-lg-flex funnel-arrow">→</div>
            <div class="col-lg-3">
              <article class="funnel-card funnel-stage p-3 h-100">
                <p class="muted-label mb-1">Step 2</p>
                <h3 class="h6 mb-2">Converted to free membership</h3>
                <p class="h4 mb-2">${formatNumber(freeMembers)}</p>
                <div class="progress report-bar mb-2" role="img" aria-label="Free memberships ${freeMembers}">
                  <div class="progress-bar bg-success" style="width: ${stepWidth(freeMembers, visitorBase)}%"></div>
                </div>
                <p class="funnel-rate mb-0">Visitor → Free: <strong>${visitorsToFreeRate.toFixed(2)}%</strong></p>
              </article>
            </div>
            <div class="col-lg-1 d-none d-lg-flex funnel-arrow">→</div>
            <div class="col-lg-3">
              <article class="funnel-card funnel-stage p-3 h-100">
                <p class="muted-label mb-1">Step 3</p>
                <h3 class="h6 mb-2">Free members converted to premium</h3>
                <p class="h4 mb-2">${formatNumber(premiumMembers)}</p>
                <div class="progress report-bar mb-2" role="img" aria-label="Premium conversions ${premiumMembers}">
                  <div class="progress-bar bg-warning text-dark" style="width: ${stepWidth(premiumMembers, freeBase)}%"></div>
                </div>
                <p class="funnel-rate mb-0">Free → Premium: <strong>${freeToPremiumRate.toFixed(2)}%</strong></p>
              </article>
            </div>
          </div>
        `;
      }

      function renderReports(reports) {
        renderOverviewCards(reports.overview);
        renderBars('signupTrend', reports.memberSignupsTrend.map((row) => ({ ...row, day: row.day.slice(0, 10) })), 'total', 'day');
        renderBars('postTrend', reports.publishedPostsTrend.map((row) => ({ ...row, day: row.day.slice(0, 10) })), 'total', 'day');
        renderConversionFunnel(reports.conversionFunnel);
        renderVerificationEmailHealth(reports.verificationEmail);
        renderPublicPageViews(reports.publicPageViews, reports.publicTrafficSummary);
        renderButtonStats(reports.buttonStats);
        renderSecurityEvents(reports.securityEvents);

        const generated = new Date(reports.generatedAt).toLocaleString();
        // Traffic and security rows are pruned after the audit-log retention
        // period, so a longer window cannot cover them; say which figures are cut.
        const auditWindow = reports.auditWindow || {};
        const auditNotice = auditWindow.clamped
          ? ` Traffic, conversion and security figures cover the ${String(auditWindow.label || '').toLowerCase()} only: request logs are kept for ${formatNumber(auditWindow.retentionDays)} days.`
          : '';
        document.getElementById('metaLine').textContent = `Signed in as ${reports.user.username}. Window: ${reports.windowLabel || state.windowLabel}.${auditNotice} Last refresh: ${generated}.`;
      }

      function parseWindowSelection(rawValue) {
        const value = String(rawValue || '').trim().toLowerCase();
        if (value === '1h') {
          return { query: 'hours=1', label: 'last 1 hour' };
        }
        const days = Number.parseInt(value, 10) || 30;
        return {
          query: `days=${days}`,
          label: days === 1 ? 'last 24 hours' : `last ${days} days`,
        };
      }

      async function loadReports() {
        try {
          clearError();
          const select = document.getElementById('windowSelect');
          const selectedWindow = parseWindowSelection(select.value);
          state.windowQuery = selectedWindow.query;
          state.windowLabel = selectedWindow.label;

          await request('/api/admin-session');
          const reports = await request(`/api/admin-reports?${selectedWindow.query}`);
          state.reports = reports;
          state.user = reports.user;
          renderReports(reports);
        } catch (error) {
          const errorTarget = document.getElementById('errorMessage');
          if (window.adminSession?.handleAuthError?.(error, { redirect: false, target: errorTarget })) {
            errorTarget.classList.remove('d-none');
            document.getElementById('metaLine').textContent = 'Not authenticated or unable to load report data.';
          } else if (isTimeoutError(error)) {
            showError('Report data took too long to load. Check your connection, then use Refresh to try again.');
            document.getElementById('metaLine').textContent = 'Report data timed out. Use Refresh to try again.';
          } else {
            showError(`${error.message}. Visit Admin to sign in, then return here.`);
            document.getElementById('metaLine').textContent = 'Not authenticated or unable to load report data.';
          }
        } finally {
          // Always release the overlay, including on an unexpected failure
          // above: while it is up it covers the whole dashboard.
          if (!reportsBootstrapped) {
            hideAdminReportsLoadingOverlay();
            reportsBootstrapped = true;
          }
        }
      }

      document.getElementById('refreshButton').addEventListener('click', loadReports);
      document.getElementById('windowSelect').addEventListener('change', loadReports);
      loadReports();
