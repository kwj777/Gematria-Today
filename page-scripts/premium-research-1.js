      const premiumAlert = document.getElementById('premiumAlert');
      const wordnikResults = document.getElementById('wordnikResults');
      const gematriaResults = document.getElementById('gematriaResults');
      const statsCards = document.getElementById('statsCards');
      const startupOverlay = document.getElementById('startupOverlay');

      function showAlert(message, tone = 'danger') {
        premiumAlert.textContent = message;
        premiumAlert.className = `alert alert-${tone}`;
      }

      function clearAlert() {
        premiumAlert.textContent = '';
        premiumAlert.className = 'alert d-none';
      }

      let startupOverlayTimeout = null;

      function showStartupOverlay() {
        startupOverlay?.classList.remove('d-none');
        const actions = document.getElementById('startupOverlayActions');
        actions?.classList.add('d-none');
        if (startupOverlayTimeout) window.clearTimeout(startupOverlayTimeout);
        startupOverlayTimeout = window.setTimeout(() => {
          const msg = document.getElementById('startupOverlayMessage');
          if (msg) msg.textContent = 'Still loading — this is taking longer than usual.';
          actions?.classList.remove('d-none');
        }, 8000);
      }

      function hideStartupOverlay() {
        if (startupOverlayTimeout) {
          window.clearTimeout(startupOverlayTimeout);
          startupOverlayTimeout = null;
        }
        startupOverlay?.classList.add('d-none');
      }

      document.getElementById('startupOverlayRetry')?.addEventListener('click', () => {
        window.location.reload();
      });
      document.getElementById('startupOverlayCancel')?.addEventListener('click', () => {
        window.location.assign('/member.html');
      });

      async function request(url, options = {}) {
        const { globalLoading = false } = options;
        const response = await fetch(url, { credentials: 'same-origin', globalLoading });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Request failed');
        }
        return payload;
      }


      async function ensurePremiumSession() {
        const session = await request('/api/member-session');
        const level = session?.member?.membershipLevel;
        if (!(level === 'premium' || level === 'lifetime')) {
          throw new Error('This page is for premium members only. Upgrade in the membership dashboard to unlock access.');
        }
      }

      function renderWordnik(payload) {
        const words = Array.isArray(payload.results) ? payload.results : [];
        if (!words.length) {
          wordnikResults.innerHTML = '<p class="mb-0 text-muted">No related words found for that request.</p>';
          return;
        }

        wordnikResults.innerHTML = `
          <p class="mb-2"><strong>${escapeHtml(payload.count)}</strong> ${escapeHtml(payload.relationshipType)} results for <strong>${escapeHtml(payload.word)}</strong>:</p>
          <div class="d-flex flex-wrap gap-2">${words.map((word) => `<a class="badge text-bg-light border text-decoration-none" href="/calculator.html?query=${encodeURIComponent(word)}" aria-label="Open calculator for ${escapeHtml(word)}">${escapeHtml(word)}</a>`).join('')}</div>
        `;
      }

      function escapeHtml(value = '') {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function renderGematria(payload) {
        if (!Array.isArray(payload.words) || !payload.words.length) {
          gematriaResults.innerHTML = `<p class="mb-0">No entries currently match gematria value <strong>${escapeHtml(payload.gematria)}</strong>.</p>`;
          return;
        }

        const resultId = `gematria-result-${Date.now()}`;
        const visibleWordsLimit = 30;
        const hasHiddenWords = payload.words.length > visibleWordsLimit;
        const cards = payload.words.slice(0, visibleWordsLimit).map((row) => {
          const safeWord = escapeHtml(row.word);
          const calcUrl = `/calculator.html?query=${encodeURIComponent(row.word)}`;
          const researchUrl = `https://www.wordnik.com/words/${encodeURIComponent(row.word)}`;
          return `
            <article class="border rounded p-3 h-100 bg-body-tertiary">
              <h3 class="h6 mb-2"><a class="text-decoration-none" href="${calcUrl}" target="_blank" rel="noopener noreferrer">${safeWord}</a></h3>
              <p class="small text-muted mb-2">DR ${row.digitalRoot} · ${row.isBaseRoot ? 'Base Root' : 'Not Base Root'} · ${row.searchCount} searches</p>
              <div class="d-flex gap-2 flex-wrap">
                <a class="btn btn-sm btn-outline-primary" href="${calcUrl}" target="_blank" rel="noopener noreferrer">Calculate</a>
                <a class="btn btn-sm btn-outline-secondary" href="${researchUrl}" target="_blank" rel="noopener noreferrer">Research</a>
              </div>
            </article>
          `;
        }).join('');
        const allCards = payload.words.map((row) => {
          const safeWord = escapeHtml(row.word);
          const calcUrl = `/calculator.html?query=${encodeURIComponent(row.word)}`;
          const researchUrl = `https://www.wordnik.com/words/${encodeURIComponent(row.word)}`;
          return `
            <article class="border rounded p-3 h-100 bg-body-tertiary">
              <h3 class="h6 mb-2"><a class="text-decoration-none" href="${calcUrl}" target="_blank" rel="noopener noreferrer">${safeWord}</a></h3>
              <p class="small text-muted mb-2">DR ${row.digitalRoot} · ${row.isBaseRoot ? 'Base Root' : 'Not Base Root'} · ${row.searchCount} searches</p>
              <div class="d-flex gap-2 flex-wrap">
                <a class="btn btn-sm btn-outline-primary" href="${calcUrl}" target="_blank" rel="noopener noreferrer">Calculate</a>
                <a class="btn btn-sm btn-outline-secondary" href="${researchUrl}" target="_blank" rel="noopener noreferrer">Research</a>
              </div>
            </article>
          `;
        }).join('');

        gematriaResults.innerHTML = `
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <p class="mb-0"><strong>${escapeHtml(payload.count)}</strong> words found for gematria <strong>${escapeHtml(payload.gematria)}</strong>.</p>
          </div>
          <div id="${resultId}" class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3">${cards}</div>
          <div class="d-flex gap-2 flex-wrap mt-3">
            ${hasHiddenWords ? '<button id="gematriaShowAllButton" class="btn btn-sm btn-primary" type="button">Show all results</button>' : ''}
            <button id="gematriaClearButton" class="btn btn-sm btn-outline-secondary" type="button">Clear search</button>
            <button id="gematriaToggleButton" class="btn btn-sm btn-outline-secondary" type="button" aria-controls="${resultId}" aria-expanded="true">Collapse results</button>
          </div>
        `;

        const showAllButton = document.getElementById('gematriaShowAllButton');
        const clearButton = document.getElementById('gematriaClearButton');
        const toggleButton = document.getElementById('gematriaToggleButton');
        const resultPanel = document.getElementById(resultId);
        let isShowingAllResults = !hasHiddenWords;

        showAllButton?.addEventListener('click', () => {
          resultPanel.innerHTML = allCards;
          isShowingAllResults = true;
          showAllButton.remove();
        });

        clearButton?.addEventListener('click', () => {
          document.getElementById('gematriaValue').value = '';
          gematriaResults.innerHTML = '<p class="mb-0 text-muted">Search cleared. Enter a gematria number to run a new lookup.</p>';
        });

        toggleButton?.addEventListener('click', () => {
          const isHidden = resultPanel.classList.toggle('d-none');
          toggleButton.textContent = isHidden ? 'Show results' : 'Collapse results';
          toggleButton.setAttribute('aria-expanded', String(!isHidden));
          if (!isHidden && !isShowingAllResults && showAllButton) {
            showAllButton.hidden = false;
          }
        });
      }

      function toMetricCard(label, value, meta = '') {
        return `
          <div class="col-md-6 col-xl-3">
            <article class="stat-card p-3 h-100">
              <div class="section-kicker mb-2">${label}</div>
              <div class="metric-value">${value}</div>
              <div class="small text-muted mt-1">${meta}</div>
            </article>
          </div>`;
      }

      function renderStats(payload) {
        const totals = payload.totals || {};
        statsCards.innerHTML = [
          toMetricCard('Total words', totals.totalWords || 0, 'Indexed in Gematria.Today database.'),
          toMetricCard('Base-root words', totals.baseRootCount || 0, `${totals.baseRootPercentage || 0}% of all words.`),
          toMetricCard('Digital root 6', totals.digitalRootSixCount || 0, `${totals.digitalRootSixPercentage || 0}% of all words.`),
        ].join('');
      }

      async function loadStats(options = {}) {
        const response = await request('/api/member-premium-research?action=stats', options);
        renderStats(response.payload || {});
      }

      document.getElementById('wordnikForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        clearAlert();
        wordnikResults.textContent = 'Loading Wordnik results…';

        try {
          const word = document.getElementById('wordnikWord').value.trim();
          const relationshipType = document.getElementById('relationshipType').value;
          const limit = document.getElementById('wordnikLimit').value;
          const response = await request(`/api/member-premium-research?action=wordnik&word=${encodeURIComponent(word)}&relationshipType=${encodeURIComponent(relationshipType)}&limit=${encodeURIComponent(limit)}`);
          renderWordnik(response.payload || {});
        } catch (error) {
          showAlert(error.message || 'Unable to run Wordnik lookup.');
          wordnikResults.textContent = 'Wordnik lookup failed.';
        }
      });

      document.getElementById('gematriaForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        clearAlert();
        gematriaResults.textContent = 'Searching Gematria.Today database…';

        try {
          const gematria = document.getElementById('gematriaValue').value;
          const response = await request(`/api/member-premium-research?action=gematria&gematria=${encodeURIComponent(gematria)}`);
          renderGematria(response.payload || {});
        } catch (error) {
          showAlert(error.message || 'Unable to run gematria lookup.');
          gematriaResults.textContent = 'Gematria lookup failed.';
        }
      });

      document.getElementById('refreshStatsButton').addEventListener('click', async () => {
        clearAlert();
        try {
          await loadStats({ globalLoading: true });
          showAlert('Stats refreshed.', 'success');
        } catch (error) {
          showAlert(error.message || 'Unable to refresh stats.');
        }
      });

      window.addEventListener('DOMContentLoaded', async () => {
        showStartupOverlay();
        try {
          await ensurePremiumSession();
          await loadStats();
        } catch (error) {
          showAlert(error.message || 'Premium access check failed.', 'warning');
          window.setTimeout(() => {
            window.location.assign('/member.html');
          }, 1800);
        } finally {
          hideStartupOverlay();
        }
      });
