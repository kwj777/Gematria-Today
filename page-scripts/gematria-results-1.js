const titleNode = document.querySelector('#page-title');
      const metaNode = document.querySelector('#page-meta');
      const returnLink = document.querySelector('#return-link');
      const clearSearchButtons = [
        document.querySelector('#clear-search-top'),
        document.querySelector('#clear-search-bottom')
      ];
      const collapseButtons = [
        document.querySelector('#collapse-results-top'),
        document.querySelector('#collapse-results-bottom')
      ];
      const statusNode = document.querySelector('#status');
      const searchNode = document.querySelector('#word-search');
      const listNode = document.querySelector('#word-list');
      const emptyNode = document.querySelector('#empty');
      const params = new URLSearchParams(window.location.search);
      const gematria = String(params.get('gematria') || '').trim();
      const returnTo = String(params.get('returnTo') || '').trim();
      let allWords = [];
      let isCollapsed = false;
      let visibleCount = 0;

      function getSafeInternalReturnPath(path) {
        if (!path || !path.startsWith('/')) {
          return '';
        }

        try {
          const parsed = new URL(path, window.location.origin);
          if (parsed.origin !== window.location.origin) {
            return '';
          }
          const normalizedPath = parsed.pathname === '/calculator' ? '/calculator.html' : parsed.pathname;
          return `${normalizedPath}${parsed.search}${parsed.hash}`;
        } catch {
          return '';
        }
      }

      function escapeHtml(value) {
        return String(value ?? '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function createMembershipLimitMessageFragment(message) {
        const fragment = document.createDocumentFragment();
        const normalizedMessage = String(message || '');

        if (!/out of memory/i.test(normalizedMessage)) {
          fragment.append(normalizedMessage || 'Unable to load results.');
          return fragment;
        }

        fragment.append('Non-member guests have limits on searches. Try again in a few minutes or sign up for a ');
        const membershipLink = document.createElement('a');
        membershipLink.href = '/member.html#registerForm';
        membershipLink.textContent = 'free membership';
        membershipLink.addEventListener('click', () => {
          window.location.assign('/member.html#registerForm');
        });
        fragment.append(membershipLink, '.');
        return fragment;
      }

      function setStatusMessage(node, message) {
        node.replaceChildren(createMembershipLimitMessageFragment(message));
      }

      async function requestWordsByGematria(total) {
        const response = await fetch(`/.netlify/functions/searchByGematria?gematria=${encodeURIComponent(total)}`);
        const rawBody = await response.text();
        let payload;

        try {
          payload = JSON.parse(rawBody);
        } catch {
          payload = { error: rawBody || 'Non-JSON response from server.' };
        }

        if (!response.ok) {
          throw new Error(payload.error || payload.message || `HTTP ${response.status}`);
        }

        return payload;
      }

      function createWordItem(entry) {
        const item = document.createElement('li');
        item.className = 'word-item';
        const isDigitalRootSix = Number(entry.gematria?.digitalRoot) === 6;
        const definitionHref = `/definition?${new URLSearchParams({ word: entry.word, returnTo: returnTo || `${window.location.pathname}${window.location.search}` }).toString()}`;
        item.innerHTML = `
          <a class="word-link" href="/calculator.html?query=${encodeURIComponent(entry.word)}">${escapeHtml(entry.word)}</a>
          <div class="word-actions">
            <span class="${isDigitalRootSix ? 'meta-highlight' : ''}">Root ${escapeHtml(String(entry.gematria.digitalRoot))}</span>
            <a class="definition-link" href="${definitionHref}" hidden>(definition)</a>
          </div>
        `;
        const definitionLinkNode = item.querySelector('.definition-link');
        hasDefinition(entry.word).then((exists) => {
          if (exists && definitionLinkNode) definitionLinkNode.hidden = false;
        });
        return item;
      }

      async function hasDefinition(word) {
        const normalizedWord = String(word || '').trim();
        if (!normalizedWord) return false;
        try {
          const response = await fetch(
            `/.netlify/functions/wordnikDefinition?word=${encodeURIComponent(normalizedWord)}`,
            { headers: { accept: 'application/json' } }
          );
          if (!response.ok) return false;
          const payload = await response.json();
          const definitions = Array.isArray(payload?.definitions)
            ? payload.definitions
            : Array.isArray(payload)
              ? payload
              : [];
          return definitions.some((definition) =>
            String(definition?.text || definition?.definition || definition?.display || definition?.gloss || '').trim()
          );
        } catch {
          return false;
        }
      }

      function renderList(words) {
        const loadingShellNode = document.querySelector("#resultsLoadingShell");
        if (loadingShellNode) {
          loadingShellNode.remove();
        }
        visibleCount = words.length;
        listNode.innerHTML = '';

        if (!words.length) {
          isCollapsed = false;
          listNode.hidden = true;
          emptyNode.hidden = false;
          const emptyMessageNode = document.querySelector('#empty-message');
          if (emptyMessageNode) {
            emptyMessageNode.textContent = allWords.length
              ? 'No words match your filter. Try clearing the search above.'
              : `No words found with gematria value ${gematria}. Try a different number.`;
          }
          statusNode.textContent = '';
          collapseButtons.forEach((button) => {
            button.hidden = true;
            button.textContent = 'Collapse results';
          });
          return;
        }

        emptyNode.hidden = true;
        collapseButtons.forEach((button) => {
          button.hidden = false;
          button.textContent = isCollapsed ? 'Expand results' : 'Collapse results';
        });
        listNode.hidden = isCollapsed;
        statusNode.textContent = isCollapsed
          ? `${words.length} word${words.length === 1 ? '' : 's'} available (collapsed)`
          : `${words.length} word${words.length === 1 ? '' : 's'} shown`;
        words.forEach((entry) => listNode.appendChild(createWordItem(entry)));
      }

      function toggleCollapseResults() {
        if (!visibleCount) return;
        isCollapsed = !isCollapsed;
        listNode.hidden = isCollapsed;
        collapseButtons.forEach((button) => {
          button.textContent = isCollapsed ? 'Expand results' : 'Collapse results';
        });
        statusNode.textContent = isCollapsed
          ? `${visibleCount} word${visibleCount === 1 ? '' : 's'} available (collapsed)`
          : `${visibleCount} word${visibleCount === 1 ? '' : 's'} shown`;
      }

      function clearSearch() {
        if (!searchNode.value) return;
        searchNode.value = '';
        isCollapsed = false;
        applySearch();
      }

      function applySearch() {
        const query = searchNode.value.trim().toLowerCase();
        const filteredWords = !query
          ? allWords
          : allWords.filter((entry) => entry.word.toLowerCase().includes(query));
        renderList(filteredWords);
      }

      async function init() {
        const safeReturnPath = getSafeInternalReturnPath(returnTo);
        if (safeReturnPath) {
          returnLink.href = safeReturnPath;
          returnLink.textContent = '← Back to previous calculator';
        }

        if (!gematria) {
          titleNode.textContent = 'Gematria matches';
          statusNode.textContent = 'Missing gematria value in the page URL.';
          searchNode.disabled = true;
          return;
        }

        titleNode.textContent = `Gematria ${gematria} matches`;
        document.title = `Gematria ${gematria} Matches`;

        try {
          const payload = await requestWordsByGematria(gematria);
          allWords = Array.isArray(payload.words) ? payload.words : [];
          metaNode.textContent = `${payload.count || allWords.length} total word${(payload.count || allWords.length) === 1 ? '' : 's'} with gematria ${gematria}.`;
          statusNode.textContent = '';
          applySearch();
        } catch (error) {
          const loadingShellNode = document.querySelector('#resultsLoadingShell');
          if (loadingShellNode) {
            loadingShellNode.remove();
          }
          setStatusMessage(statusNode, error.message || 'Unable to load matching words.');
          searchNode.disabled = true;
        }
      }

      searchNode.addEventListener('input', applySearch);
      clearSearchButtons.forEach((button) => button.addEventListener('click', clearSearch));
      collapseButtons.forEach((button) => button.addEventListener('click', toggleCollapseResults));
      window.addEventListener('DOMContentLoaded', init);
