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
        const definitionHref = `/definition?${new URLSearchParams({ word: entry.word, returnTo: returnTo || `${window.location.pathname}${window.location.search}` }).toString()}`;
        item.innerHTML = `
          <a class="word-link" href="/calculator.html?query=${encodeURIComponent(entry.word)}">${escapeHtml(entry.word)}</a>
          <a class="definition-link" href="${definitionHref}" hidden>(def)</a>
        `;
        const definitionLinkNode = item.querySelector('.definition-link');
        observeForDefinitionProbe(item, entry.word, definitionLinkNode);
        return item;
      }

      // Probing every rendered word was self-defeating: wordnikDefinition rate
      // limits anonymous callers at 20/min and then blocks them for ten
      // minutes, so a value with more than twenty matches locked the visitor
      // out of the very lookups the probe exists to advertise -- and burned one
      // function invocation per word per page view. Only cards that actually
      // reach the viewport are probed, at a pace that stays under the server's
      // limit. A word that is never probed simply keeps its "(def)" link
      // hidden, which is the same outcome a failed probe already produced.
      const PROBE_MAX_CONCURRENT = 4;
      const PROBE_MAX_PER_MINUTE = 15;
      const probeQueue = [];
      const probeTimestamps = [];
      let probesInFlight = 0;
      let probeDrainHandle = null;

      function drainProbeQueue() {
        const now = Date.now();
        while (probeTimestamps.length && now - probeTimestamps[0] > 60_000) {
          probeTimestamps.shift();
        }

        while (
          probeQueue.length
          && probesInFlight < PROBE_MAX_CONCURRENT
          && probeTimestamps.length < PROBE_MAX_PER_MINUTE
        ) {
          const job = probeQueue.shift();
          probesInFlight += 1;
          probeTimestamps.push(Date.now());
          job().finally(() => {
            probesInFlight -= 1;
            scheduleProbeDrain(0);
          });
        }

        if (probeQueue.length && probeTimestamps.length >= PROBE_MAX_PER_MINUTE) {
          // Wait until the oldest request ages out of the rolling window.
          scheduleProbeDrain(Math.max(250, 60_000 - (Date.now() - probeTimestamps[0])));
        }
      }

      function scheduleProbeDrain(delay) {
        if (probeDrainHandle) return;
        probeDrainHandle = window.setTimeout(() => {
          probeDrainHandle = null;
          drainProbeQueue();
        }, delay);
      }

      function queueDefinitionProbe(word, linkNode) {
        probeQueue.push(() => hasDefinition(word).then((exists) => {
          if (exists && linkNode) linkNode.hidden = false;
        }));
        scheduleProbeDrain(0);
      }

      const definitionObserver = typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries, observer) => {
          entries.forEach((observed) => {
            if (!observed.isIntersecting) return;
            observer.unobserve(observed.target);
            const { probeWord } = observed.target.dataset;
            const linkNode = observed.target.querySelector('.definition-link');
            if (probeWord) queueDefinitionProbe(probeWord, linkNode);
          });
        }, { rootMargin: '200px 0px' })
        : null;

      function observeForDefinitionProbe(item, word, linkNode) {
        if (!definitionObserver) {
          queueDefinitionProbe(word, linkNode);
          return;
        }
        item.dataset.probeWord = word;
        definitionObserver.observe(item);
      }

      // One lookup per word, ever. Every rendered card fires one of these, and
      // the filter re-renders the whole list on each keystroke -- so a value
      // with 200 matches cost 200 requests on load and 200 more per character
      // typed. The cache holds the in-flight promise, so duplicate cards for
      // the same word share a single request too.
      const definitionCache = new Map();

      function hasDefinition(word) {
        const normalizedWord = String(word || '').trim().toLowerCase();
        if (!normalizedWord) return Promise.resolve(false);
        if (!definitionCache.has(normalizedWord)) {
          definitionCache.set(normalizedWord, fetchHasDefinition(normalizedWord));
        }
        return definitionCache.get(normalizedWord);
      }

      async function fetchHasDefinition(word) {
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
        // Filtering rebuilds the list, so stop watching the nodes about to be
        // discarded before their replacements are observed.
        definitionObserver?.disconnect();
        listNode.innerHTML = '';

        if (!words.length) {
          isCollapsed = false;
          listNode.hidden = true;
          emptyNode.classList.remove('d-none');
          emptyNode.classList.add('d-flex');
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

        emptyNode.classList.add('d-none');
        emptyNode.classList.remove('d-flex');
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
          // The bare /gematria-results.html URL is the one in the sitemap and the
          // page's own canonical, so this is the version search engines index --
          // and it used to shimmer an aria-busy skeleton forever under a line of
          // developer copy about a missing URL parameter.
          const loadingShellNode = document.querySelector('#resultsLoadingShell');
          if (loadingShellNode) {
            loadingShellNode.remove();
          }
          titleNode.textContent = 'Gematria matches';
          setStatusMessage(
            statusNode,
            'Pick a value first — enter a word or a number in the calculator and open its matches from there.',
          );
          returnLink.textContent = '← Open the calculator';
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

      // Re-rendering the full list on every keystroke made typing in the filter
      // rebuild hundreds of DOM nodes per character.
      let searchDebounceHandle = null;
      searchNode.addEventListener('input', () => {
        if (searchDebounceHandle) window.clearTimeout(searchDebounceHandle);
        searchDebounceHandle = window.setTimeout(() => {
          searchDebounceHandle = null;
          applySearch();
        }, 150);
      });
      clearSearchButtons.forEach((button) => button.addEventListener('click', clearSearch));
      collapseButtons.forEach((button) => button.addEventListener('click', toggleCollapseResults));
      window.addEventListener('DOMContentLoaded', init);
