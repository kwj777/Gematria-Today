const form = document.querySelector('#name-form');
      const statusNode = document.querySelector('#status');
      const mobileNoteNode = document.querySelector('#mobile-note');
      const resultsShell = document.querySelector('#results-shell');
      const resultsGrid = document.querySelector('#results-grid');
      const resultsActions = document.querySelector('#results-actions');
      const clearNamesButton = document.querySelector('#clear-names');
      const saveHistoryButton = document.querySelector('#save-history-button');
      const memberSaveMeta = document.querySelector('#member-save-meta');
      const saveHistoryHint = document.getElementById('save-history-hint');
      const nameSubmitButton = document.getElementById('name-submit-button');
      const nameSubmitSpinner = nameSubmitButton?.querySelector('[data-name-submit-spinner]');
      const nameSubmitLabelNode = nameSubmitButton?.querySelector('[data-name-submit-label]');
      let saveHistoryPopover = null;

      function setNameSubmitBusy(isBusy) {
        if (!nameSubmitButton) return;
        if (isBusy) {
          nameSubmitButton.dataset.previousLabel = nameSubmitLabelNode?.textContent || '';
          nameSubmitButton.disabled = true;
          nameSubmitButton.setAttribute('aria-busy', 'true');
          if (nameSubmitLabelNode) nameSubmitLabelNode.textContent = 'Calculating…';
          nameSubmitSpinner?.classList.remove('d-none');
        } else {
          nameSubmitButton.disabled = false;
          nameSubmitButton.removeAttribute('aria-busy');
          const previous = nameSubmitButton.dataset.previousLabel;
          if (nameSubmitLabelNode && previous) nameSubmitLabelNode.textContent = previous;
          delete nameSubmitButton.dataset.previousLabel;
          nameSubmitSpinner?.classList.add('d-none');
        }
      }

      function syncSaveHistoryHint() {
        if (!saveHistoryHint) return;
        const needsCalc = saveHistoryButton.disabled && saveHistoryButton.textContent === 'Save results';
        saveHistoryHint.hidden = !needsCalc;
      }

      function createMembersOnlyPopover() {
        if (!saveHistoryButton || saveHistoryPopover) {
          return;
        }
        saveHistoryPopover = window.createMembersOnlySavePopover?.(saveHistoryButton) || null;
      }

      function destroyMembersOnlyPopover() {
        if (!saveHistoryPopover) {
          return;
        }
        saveHistoryPopover.dispose();
        saveHistoryPopover = null;
      }
      const learningPathReturnNode = document.querySelector('#learning-path-return');
      const learningPathReturnLink = document.querySelector('#learning-path-return-link');
      let shouldShowLearningPathReturn = false;
      const nameCalcError = document.querySelector('#name-calculator-error');
      const nameCalcErrorMessage = document.querySelector('#name-calculator-error-message');
      const nameCalcRetryButton = document.querySelector('#name-calculator-retry-button');
      const MOBILE_QUERY = '(max-width: 820px), (pointer: coarse)';
      const DISPLAY_RELATED_WORD_LIMIT = 10;
      const FULL_RELATED_WORD_LIMIT = 100;
      const AUTHENTICATED_RELATED_WORD_LIMIT = 250;
      let currentSearchPayload = null;
      let lastSavedSearchPayload = null;
      let memberSession = null;
      const MEMBER_DASHBOARD_SYNC_KEY = 'memberDashboardUpdate';
      const memberDashboardSyncChannel = typeof window.BroadcastChannel === 'function'
        ? new window.BroadcastChannel('member-dashboard-sync')
        : null;

      function showCalculatorLoadingOverlay() {
        window.showWorkingOverlay?.();
      }

      function hideCalculatorLoadingOverlay() {
        window.hideWorkingOverlay?.();
      }

      function showNameError(message) {
        const msg = String(message || 'Something went wrong. Please try again.');
        if (/failed to fetch|networkerror|network request failed/i.test(msg)) {
          nameCalcErrorMessage.textContent = 'Network error — please check your connection and try again.';
        } else {
          nameCalcErrorMessage.textContent = msg;
        }
        nameCalcError.hidden = false;
        if (!nameCalcError.hasAttribute('tabindex')) {
          nameCalcError.setAttribute('tabindex', '-1');
        }
        try {
          nameCalcError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (_) {
          nameCalcError.scrollIntoView();
        }
        nameCalcError.focus({ preventScroll: true });
      }

      function hideNameError() {
        nameCalcError.hidden = true;
        nameCalcErrorMessage.textContent = '';
      }

      nameCalcRetryButton.addEventListener('click', () => {
        hideNameError();
        form.requestSubmit();
      });

      function getFullRelatedWordLimit() {
        return memberSession?.authenticated ? AUTHENTICATED_RELATED_WORD_LIMIT : FULL_RELATED_WORD_LIMIT;
      }

      function isMobileDevice() {
        return window.matchMedia(MOBILE_QUERY).matches;
      }

      function getNamesFromForm() {
        const formData = new FormData(form);
        return ['name1', 'name2', 'name3']
          .map((key) => String(formData.get(key) || '').trim())
          .filter(Boolean);
      }

      async function requestMemberSession() {
        const response = await fetch('/api/member-session', { credentials: 'same-origin' });
        if (!response.ok) {
          memberSession = null;
          return null;
        }

        memberSession = await response.json();
        return memberSession;
      }

      async function saveCurrentSearch(noteText = '') {
        if (!currentSearchPayload) {
          memberSaveMeta.textContent = 'Run a name calculation before saving history.';
          return;
        }

        if (!memberSession?.authenticated) {
          memberSaveMeta.textContent = 'Sign in on the membership page before saving history.';
          return;
        }

        saveHistoryButton.disabled = true;
        memberSaveMeta.textContent = 'Saving name calculator results to your account...';

        const requestBody = {
          ...currentSearchPayload,
          note: String(noteText ?? '').trim(),
        };

        const response = await fetch('/api/member-history', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          saveHistoryButton.disabled = !currentSearchPayload;
          throw new Error(payload.error || 'Unable to save name calculator results.');
        }

        memberSaveMeta.textContent = 'Saved to your account history.';
        notifyDashboardUpdate('history');
        lastSavedSearchPayload = currentSearchPayload;
        saveHistoryButton.textContent = 'Saved';
        saveHistoryButton.disabled = true;
        syncSaveHistoryHint();
      }

      function notifyDashboardUpdate(kind) {
        const update = {
          kind: String(kind || 'history'),
          at: Date.now(),
        };
        try {
          window.localStorage.setItem(MEMBER_DASHBOARD_SYNC_KEY, JSON.stringify(update));
        } catch {
          // Ignore localStorage write failures in private mode or quota exhaustion.
        }
        memberDashboardSyncChannel?.postMessage(update);
      }

      function updateMemberSaveState() {
        if (!memberSession?.authenticated) {
          saveHistoryButton.disabled = false;
          saveHistoryButton.textContent = 'Save results';
          saveHistoryButton.classList.add('member-save-button--guest');
          saveHistoryButton.setAttribute('aria-disabled', 'true');
          createMembersOnlyPopover();
          memberSaveMeta.textContent = currentSearchPayload
            ? 'Sign in to save these name calculator results to your account.'
            : 'Sign in to save your name calculator results to your account.';
          syncSaveHistoryHint();
          return;
        }

        destroyMembersOnlyPopover();
        saveHistoryButton.classList.remove('member-save-button--guest');
        saveHistoryButton.removeAttribute('aria-disabled');
        if (currentSearchPayload && currentSearchPayload === lastSavedSearchPayload) {
          saveHistoryButton.textContent = 'Saved';
          saveHistoryButton.disabled = true;
        } else {
          saveHistoryButton.textContent = 'Save results';
          saveHistoryButton.disabled = !currentSearchPayload;
        }
        memberSaveMeta.textContent = currentSearchPayload
          ? `Signed in as ${memberSession.member.displayName || memberSession.member.username}. Save these results to history.`
          : `Signed in as ${memberSession.member.displayName || memberSession.member.username}. Run a name calculation to save it.`;
        syncSaveHistoryHint();
      }

      async function requestJson(endpoint, searchParams) {
        const response = await fetch(`${endpoint}?${searchParams.toString()}`, { globalLoading: true });
        const rawBody = await response.text();

        let payload;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          throw new Error('Unexpected non-JSON response from server. Please retry in a moment.');
        }

        if (!response.ok || payload?.error) {
          throw new Error(payload?.error || payload?.message || `HTTP ${response.status}`);
        }

        return payload;
      }

      function requestGematria(word) {
        return requestJson('/.netlify/functions/englishGematria', new URLSearchParams({ word }));
      }

      function requestRelatedWords(word, limit = getFullRelatedWordLimit()) {
        return requestJson('/.netlify/functions/wordnikRelatedWords', new URLSearchParams({ word, limit: String(limit) }));
      }

      function requestWordsByGematria(total) {
        return requestJson('/.netlify/functions/searchByGematria', new URLSearchParams({ gematria: String(total) }));
      }

      function createTextNode(text) {
        return document.createTextNode(text);
      }

      function isHighlightedDigitalRoot(value) {
        return Number(value) === 6;
      }

      function createDigitalRootNode(value, prefix = '') {
        const node = document.createElement('span');
        node.className = isHighlightedDigitalRoot(value) ? 'meta-highlight' : '';
        node.textContent = `${prefix}${value}`;
        return node;
      }

      function getDefaultMobileNote() {
        return isMobileDevice()
          ? 'On smaller screens, results appear below in a single column for easier scrolling.'
          : 'Results appear below in a three-column grid.';
      }

      function focusNameFormFromHash() {
        if (window.location.hash !== '#name-form') {
          return;
        }

        form?.scrollIntoView({ block: 'center' });
        const firstInput = document.querySelector('#name-1');
        firstInput?.focus({ preventScroll: true });
      }

      function resetResultsView() {
        resultsGrid.innerHTML = '';
        resultsActions.innerHTML = '';
        resultsShell.hidden = true;
        currentSearchPayload = null;
        updateMemberSaveState();
      }

      function escapeHtml(value) {
        return String(value ?? '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('\"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function createGematriaButton(total) {
        const link = document.createElement('a');
        link.className = 'inline-button';
        const destination = new URL('/', window.location.origin);
        destination.searchParams.set('gematria', String(total));
        destination.searchParams.set('returnTo', `${window.location.pathname}${window.location.search}${window.location.hash}`);
        link.href = `${destination.pathname}${destination.search}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = String(total);
        link.setAttribute('aria-label', `Open words with gematria ${total}`);
        return link;
      }

      function createBaseRootLink() {
        const link = document.createElement('a');
        link.href = 'https://gematria.today/blog.html?post=base-rooted-words#base-rooted-words';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Base Rooted:';
        return link;
      }

      function getPerLetterValues(input) {
        return Array.from(String(input || '').toUpperCase())
          .filter((char) => char >= 'A' && char <= 'Z')
          .map((char) => ({ letter: char, value: (char.charCodeAt(0) - 64) * 6 }));
      }

      function formatPerLetterValuesText(input) {
        const letterValues = getPerLetterValues(input);
        return letterValues.length
          ? letterValues.map(({ letter, value }) => `${letter}=${value}`).join(', ')
          : 'n/a';
      }

      function createPerLetterValuesNode(input) {
        return createTextNode(`Per-letter values: ${formatPerLetterValuesText(input)}`);
      }

      function createDefinitionLink(word) {
        const link = document.createElement('a');
        link.className = 'definition-link ms-2';
        const returnTo = `${window.location.pathname}${window.location.search}`;
        const params = new URLSearchParams({ word, returnTo });
        link.href = `/definition?${params.toString()}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = '(definition)';
        link.setAttribute('aria-label', `Definition for ${word}`);
        link.hidden = true;
        return link;
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

      function createRelatedWordButton(word) {
        const link = document.createElement('a');
        link.className = 'word-button';
        link.href = getEnglishGematriaSearchUrl(word);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = word;
        link.setAttribute('aria-label', `Open English Gematria results for ${word}`);
        return link;
      }

      function createRelatedWordsMembershipNotice(name) {
        const notice = document.createElement('div');
        notice.className = 'alert alert-info mt-2 mb-0';

        const title = document.createElement('strong');
        title.textContent = 'Related word search is a member feature.';
        const details = document.createElement('p');
        details.className = 'mb-2';
        details.textContent = `Join with a free or premium membership to view related words for ${name}.`;
        const cta = document.createElement('a');
        cta.className = 'btn btn-sm btn-primary';
        cta.href = '/member.html#authSection';
        cta.textContent = 'Unlock with Free or Premium Membership';

        notice.append(title, document.createElement('br'), details, cta);
        return notice;
      }

      function dedupeRelatedWords(name, relationships) {
        const seen = new Set();
        return relationships
          .map((entry) => ({
            relationshipType: entry.relationshipType || 'Related words',
            words: (Array.isArray(entry.words) ? entry.words : []).filter((word) => {
              const normalized = String(word || '').trim().toLowerCase();
              if (!normalized || normalized === name.toLowerCase() || seen.has(normalized)) {
                return false;
              }
              seen.add(normalized);
              return true;
            }),
          }))
          .filter((entry) => entry.words.length > 0);
      }

      function getEnglishGematriaSearchUrl(word) {
        return `/calculator.html?query=${encodeURIComponent(String(word || '').trim())}`;
      }

      function getCanonicalShareOrigin() {
        const host = window.location.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1') {
          return window.location.origin;
        }

        return window.location.protocol === 'https:'
          ? window.location.origin
          : `https://${window.location.host}`;
      }

      function toCanonicalShareUrl(urlCandidate) {
        const source = String(urlCandidate || '').trim() || window.location.href;
        const parsed = new URL(source, window.location.origin);
        return `${getCanonicalShareOrigin()}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }

      function createNameShareUrl(names = [], totals = []) {
        const url = new URL('/name-calculator.html', getCanonicalShareOrigin());
        names.filter(Boolean).slice(0, 3).forEach((name, index) => {
          url.searchParams.set(`name${index + 1}`, String(name).trim());
        });
        const normalizedTotals = totals.map((value) => String(value || '').trim()).filter(Boolean);
        if (normalizedTotals.length) {
          url.searchParams.set('totals', normalizedTotals.join(','));
        }
        url.hash = 'name-form';
        return url.toString();
      }

      function createNameShareImageUrl(names = [], totals = []) {
        const imageUrl = new URL('/.netlify/functions/calculator-share-image', getCanonicalShareOrigin());
        imageUrl.searchParams.set('type', 'name');
        names.filter(Boolean).slice(0, 3).forEach((name, index) => {
          imageUrl.searchParams.set(`name${index + 1}`, String(name).trim());
        });
        const normalizedTotals = totals.map((value) => String(value || '').trim()).filter(Boolean);
        if (normalizedTotals.length) {
          imageUrl.searchParams.set('totals', normalizedTotals.join(','));
        }
        return imageUrl;
      }

      function toShareImageAssetUrl(urlCandidate) {
        const source = String(urlCandidate || '').trim();
        if (!source || /^data:image\//i.test(source)) {
          return source;
        }
        const absoluteUrl = toCanonicalShareUrl(source);
        const encoded = encodeURIComponent(absoluteUrl);
        return `${getCanonicalShareOrigin()}/.netlify/images?url=${encoded}&w=1200&fm=jpg`;
      }


      function reportButtonEvent(action, metadata = {}) {
        const normalizedAction = String(action || '').trim().toLowerCase();
        if (!normalizedAction) {
          return;
        }
        fetch('/api/public-button-report', {
          method: 'POST',
          credentials: 'same-origin',
          keepalive: true,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            route: window.location.pathname,
            action: normalizedAction,
            metadata,
          }),
        }).catch(() => {});
      }

      function withFileExtension(filename, extension) {
        const rawName = String(filename || 'download').trim() || 'download';
        const normalizedExtension = String(extension || '').trim().replace(/^\./, '');
        if (!normalizedExtension) {
          return rawName;
        }

        return rawName.replace(/\.[a-z0-9]+$/i, `.${normalizedExtension}`);
      }

      function normalizeImageMimeType(blobType) {
        return String(blobType || '').toLowerCase().split(';')[0].trim();
      }

      function fileExtensionFromImageBlob(blob) {
        const normalizedType = normalizeImageMimeType(blob?.type);
        const extensionByType = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/webp': 'webp',
          'image/gif': 'gif',
          'image/svg+xml': 'svg',
          'image/avif': 'avif',
        };
        if (extensionByType[normalizedType]) {
          return extensionByType[normalizedType];
        }
        const subtype = normalizedType.match(/^image\/([a-z0-9.+-]+)$/i)?.[1] || '';
        return subtype.replace(/^svg\+xml$/i, 'svg') || 'img';
      }

      async function downloadShareImage(shareImageUrlCandidate, filename) {
        const shareImageUrl = toCanonicalShareUrl(shareImageUrlCandidate);
        const response = await fetch(shareImageUrl, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Unable to download image right now. Please try again.');
        }

        const imageBlob = await response.blob();
        const originalImageType = normalizeImageMimeType(imageBlob?.type);
        if (!(imageBlob instanceof Blob) || !originalImageType.startsWith('image/')) {
          throw new Error('Downloaded file was not a valid image. Please try again.');
        }
        let jpegBlob = originalImageType === 'image/jpeg' ? imageBlob : null;
        if (!jpegBlob) {
          try {
            jpegBlob = await new Promise((resolve, reject) => {
              const imageUrl = URL.createObjectURL(imageBlob);
              const image = new Image();
              image.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth || image.width;
                canvas.height = image.naturalHeight || image.height;
                const context = canvas.getContext('2d');
                if (!context) {
                  URL.revokeObjectURL(imageUrl);
                  reject(new Error('no 2d context'));
                  return;
                }
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((convertedBlob) => {
                  URL.revokeObjectURL(imageUrl);
                  if (convertedBlob) {
                    resolve(convertedBlob);
                    return;
                  }
                  reject(new Error('jpeg conversion failed'));
                }, 'image/jpeg', 0.92);
              };
              image.onerror = () => {
                URL.revokeObjectURL(imageUrl);
                reject(new Error('image decode failed'));
              };
              image.src = imageUrl;
            });
          } catch {
            jpegBlob = null;
          }
        }

        const downloadableBlob = jpegBlob || imageBlob;
        const filenameWithExtension = withFileExtension(
          filename,
          fileExtensionFromImageBlob(downloadableBlob)
        );
        const objectUrl = URL.createObjectURL(downloadableBlob);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = objectUrl;
        downloadAnchor.download = filenameWithExtension;
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        setTimeout(() => {
          downloadAnchor.remove();
          URL.revokeObjectURL(objectUrl);
        }, 1000);
      }

      async function shareUrl(payload) {
        const shareUrl = toCanonicalShareUrl(payload.url || window.location.href);
        const shareText = payload.text || '';
        const sharePayload = {
          title: payload.title || document.title,
          text: shareText.includes(shareUrl) ? shareText : `${shareText}

View results: ${shareUrl}`.trim(),
          url: shareUrl,
        };

        if (navigator.share) {
          try {
            await navigator.share(sharePayload);
            return;
          } catch (error) {
            if (error?.name === 'AbortError') {
              return;
            }
          }
        }

        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(sharePayload.url);
          statusNode.textContent = 'Share link copied to clipboard.';
          return;
        }

        window.prompt('Copy this link to share:', sharePayload.url);
      }

      function openFullRelatedWordsWindow(name, result, relationships) {
        const popup = window.open('', '_blank');
        if (!popup) {
          return;
        }

        const sections = relationships.map((entry) => `
          <section>
            <h2>${escapeHtml(entry.relationshipType)}</h2>
            <ul>${entry.words.map((word) => `<li><a href="${escapeHtml(getEnglishGematriaSearchUrl(word))}">${escapeHtml(word)}</a></li>`).join('')}</ul>
          </section>
        `).join('');

        popup.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Full related words for ${escapeHtml(name)}</title>
    <style>
      body { font-family: Helvetica, Arial, sans-serif; margin: 0; padding: 2rem; color: #1f2328; background: #f6f8fa; }
      main { max-width: 900px; margin: 0 auto; background: #fff; border: 1px solid #d0d7de; border-radius: 16px; padding: 1.5rem; }
      h1, h2, p { margin-top: 0; }
      .meta { color: #57606a; margin-bottom: 1.5rem; }
      .meta-highlight { display: inline-block; padding: .2rem .55rem; border-radius: 999px; background: rgba(255, 193, 7, .22); color: #7a4e00; font-weight: 600; }
      section + section { margin-top: 1.5rem; }
      ul { padding-left: 1.2rem; }
      li + li { margin-top: 0.35rem; }
      a { color: #0969da; text-decoration: underline; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(name)}</h1>
      <p class="meta">Original word: ${escapeHtml(result.related?.query || name)} | Gematria: ${escapeHtml(String(result.gematria.gematria.total))} | ${isHighlightedDigitalRoot(result.gematria.gematria.digitalRoot) ? `<span class="meta-highlight">Digital Root: ${escapeHtml(String(result.gematria.gematria.digitalRoot))}</span>` : `Digital Root: ${escapeHtml(String(result.gematria.gematria.digitalRoot))}`} | <a href="https://gematria.today/blog.html?post=base-rooted-words#base-rooted-words" target="_blank" rel="noopener noreferrer">Base Rooted:</a> ${escapeHtml(result.gematria.isBaseRoot ? 'Yes' : 'No')} | Searches: ${escapeHtml(String(result.gematria.searchCount))}<br />Per-letter values: ${escapeHtml(formatPerLetterValuesText(name))}</p>
      <p class="meta">Click any related word below to open an English Gematria search for that word.</p>
      ${sections || '<p>No related words found.</p>'}
    </main>
  </body>
</html>`);
        popup.document.close();
        popup.focus();
      }

      function createResultCard(name, result, options = {}) {
        const highlightBaseRootMatch = options.highlightBaseRootMatch === true;
        const isBaseRoot = result.gematria.isBaseRoot === true;
        const article = document.createElement('article');
        article.className = 'result-card';

        const title = document.createElement('h3');
        title.textContent = name;
        const definitionLink = createDefinitionLink(name);
        title.appendChild(document.createTextNode(' '));
        title.appendChild(definitionLink);
        article.appendChild(title);

        hasDefinition(name).then((exists) => {
          if (exists) definitionLink.hidden = false;
        });

        if (result.error) {
          const error = document.createElement('p');
          error.className = 'error';
          error.textContent = result.error;
          article.appendChild(error);
          return article;
        }

        const meta = document.createElement('div');
        meta.className = 'meta';
        const shouldHighlightBaseRoot = highlightBaseRootMatch || isBaseRoot;
        const baseRootSummary = document.createElement('span');
        baseRootSummary.className = shouldHighlightBaseRoot ? 'meta-highlight' : '';
        baseRootSummary.append(
          createBaseRootLink(),
          createTextNode(` ${isBaseRoot ? 'Yes' : 'No'}`)
        );

        meta.append(
          createTextNode('Original word: '),
          createTextNode(result.related?.query || name),
          createTextNode(' | Gematria: '),
          createGematriaButton(result.gematria.gematria.total),
          createTextNode(' | '),
          createDigitalRootNode(result.gematria.gematria.digitalRoot, 'Digital Root: '),
          createTextNode(' | '),
          baseRootSummary,
          createTextNode(` | Searches: ${result.gematria.searchCount}`),
          document.createElement('br'),
          createPerLetterValuesNode(name)
        );
        article.appendChild(meta);

        const relationships = dedupeRelatedWords(name, Array.isArray(result.related?.data) ? result.related.data : []);
        const relatedSection = document.createElement('section');
        relatedSection.className = 'section';
        const relatedHeading = document.createElement('h4');
        relatedHeading.textContent = 'Related words';
        relatedSection.appendChild(relatedHeading);

        if (result.relatedLocked) {
          relatedSection.appendChild(createRelatedWordsMembershipNotice(name));
        } else if (!relationships.length) {
          const empty = document.createElement('p');
          empty.className = 'empty';
          empty.textContent = 'No related words found.';
          relatedSection.appendChild(empty);
        } else {
          relationships.forEach((entry) => {
            const relationshipHeading = document.createElement('h5');
            relationshipHeading.textContent = entry.relationshipType;
            relatedSection.appendChild(relationshipHeading);

            const list = document.createElement('ul');
            list.className = 'word-list';
            entry.words.slice(0, DISPLAY_RELATED_WORD_LIMIT).forEach((word) => {
              const item = document.createElement('li');
              item.appendChild(createRelatedWordButton(word));
              list.appendChild(item);
            });
            relatedSection.appendChild(list);

            relatedSection.appendChild(document.createElement('br'));

            const fullListLink = document.createElement('a');
            fullListLink.href = '#';
            fullListLink.textContent = 'See Full List in a New Window';
            fullListLink.addEventListener('click', (event) => {
              event.preventDefault();
              openFullRelatedWordsWindow(name, result, relationships);
            });
            relatedSection.appendChild(fullListLink);
          });
        }

        article.appendChild(relatedSection);
        return article;
      }

      async function fetchNameResult(name) {
        try {
          const gematria = await requestGematria(name);

          if (!memberSession?.authenticated) {
            return { gematria, related: null, relatedLocked: true };
          }

          try {
            const related = await requestRelatedWords(name.toLowerCase(), getFullRelatedWordLimit());
            return { gematria, related };
          } catch (error) {
            return {
              gematria,
              related: { data: [] },
            };
          }
        } catch (error) {
          return { error: error.message || 'Unable to load this name.' };
        }
      }


      function populateNamesFromSearchParams() {
        const searchParams = new URLSearchParams(window.location.search);
        const names = ['name1', 'name2', 'name3'].map((key, index) => {
          const value = String(searchParams.get(key) || '').trim();
          const input = document.getElementById(`name-${index + 1}`);
          if (input) {
            input.value = value;
          }
          return value;
        }).filter(Boolean);

        return names;
      }

      function configureLearningPathReturn() {
        const searchParams = new URLSearchParams(window.location.search);
        const source = String(searchParams.get('source') || '').trim();
        const returnTo = String(searchParams.get('returnTo') || '').trim();
        if (source !== 'learning-path' || !returnTo || !learningPathReturnNode || !learningPathReturnLink) {
          return;
        }

        try {
          const returnUrl = new URL(returnTo, window.location.origin);
          if (returnUrl.origin !== window.location.origin) {
            return;
          }
          learningPathReturnLink.href = `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
          const level = window.gematriaLearningPath?.getLevel?.(returnUrl.pathname) ?? null;
          learningPathReturnLink.textContent = level
            ? `Nice! Back to Level ${level}`
            : 'Nice! Back to lesson';
          shouldShowLearningPathReturn = true;
        } catch {
          // Ignore invalid return URL values.
        }
      }

      async function renderResults(names) {
        statusNode.textContent = 'Calculating names...';
        resultsShell.hidden = false;
        resultsGrid.innerHTML = '';
        currentSearchPayload = null;
        updateMemberSaveState();

        const results = await Promise.all(names.map((name) => fetchNameResult(name)));
        resultsActions.innerHTML = '';
        if (names.length) {
          const successfulTotals = results
            .filter((result) => !result.error && result.gematria?.gematria?.total != null)
            .map((result) => result.gematria.gematria.total);
          const shareAllButton = document.createElement('button');
          shareAllButton.type = 'button';
          shareAllButton.className = 'btn btn-sm btn-warning fw-semibold share-action-button';
          shareAllButton.textContent = 'Share comparison';
          shareAllButton.setAttribute('aria-label', 'Share this comparison');
          shareAllButton.addEventListener('click', async () => {
            reportButtonEvent('share_button_click', { source: 'name_calculator_comparison' });
            await shareUrl({
              title: `Name calculator comparison: ${names.join(', ')}`,
              text: 'Compare these gematria name results.',
              url: createNameShareUrl(names, successfulTotals),
            });
          });
          resultsActions.appendChild(shareAllButton);
          const downloadImageButton = document.createElement('button');
          downloadImageButton.type = 'button';
          downloadImageButton.className = 'btn btn-sm btn-outline-warning fw-semibold share-action-button ms-2';
          downloadImageButton.textContent = 'Download image';
          downloadImageButton.setAttribute('aria-label', 'Download the share image for this comparison');
          downloadImageButton.addEventListener('click', async () => {
            reportButtonEvent('image_download', { source: 'name_calculator_comparison' });
            try {
              const shareImageUrl = createNameShareImageUrl(names, successfulTotals);
              await downloadShareImage(toShareImageAssetUrl(shareImageUrl.toString()), 'name-calculator-comparison.jpg');
              statusNode.textContent = 'Comparison image downloaded.';
            } catch (error) {
              statusNode.textContent = error?.message || 'Unable to download image right now.';
            }
          });
          resultsActions.appendChild(downloadImageButton);
        }
        const highlightBaseRootMatch = names.length === 3 && results.every((result) => !result.error && result.gematria?.isBaseRoot === true);
        results.forEach((result, index) => {
          resultsGrid.appendChild(createResultCard(names[index], result, { highlightBaseRootMatch }));
        });

        const successfulResults = results.filter((result) => !result.error && result.gematria);
        if (successfulResults.length) {
          if (shouldShowLearningPathReturn && learningPathReturnNode) {
            learningPathReturnNode.hidden = false;
          }
          currentSearchPayload = {
            queryText: names.join(', '),
            queryType: 'names',
            calculatorSource: 'name-calculator',
            gematriaTotal: successfulResults[0]?.gematria?.gematria?.total ?? null,
            digitalRoot: successfulResults[0]?.gematria?.gematria?.digitalRoot ?? null,
            isBaseRoot: typeof successfulResults[0]?.gematria?.isBaseRoot === 'boolean' ? successfulResults[0].gematria.isBaseRoot : null,
            resultPayload: {
              names,
              results,
            },
          };
        }

        statusNode.textContent = '';
        updateMemberSaveState();
      }

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        mobileNoteNode.textContent = '';
        hideNameError();

        const names = getNamesFromForm();
        if (!names.length) {
          statusNode.textContent = 'Please enter at least one name.';
          resetResultsView();
          return;
        }
        showCalculatorLoadingOverlay();
        setNameSubmitBusy(true);

        try {
          await renderResults(names);
        } catch (error) {
          statusNode.textContent = '';
          showNameError(error?.message || 'Unable to calculate names right now. Please try again.');
        } finally {
          hideCalculatorLoadingOverlay();
          setNameSubmitBusy(false);
        }
      });

      clearNamesButton.addEventListener('click', () => {
        form.reset();
        statusNode.textContent = '';
        mobileNoteNode.textContent = getDefaultMobileNote();
        hideNameError();
        document.title = 'Name Calculator | Gematria.Today';
        resetResultsView();
      });

      let saveHistoryNoteModal = null;
      let saveHistoryNoteModalShownBound = false;

      function getSaveHistoryNoteModal() {
        const modalElement = document.getElementById('save-history-note-modal');
        if (!modalElement || !window.bootstrap?.Modal) {
          return null;
        }
        if (!saveHistoryNoteModal) {
          saveHistoryNoteModal = window.bootstrap.Modal.getOrCreateInstance(modalElement);
        }
        if (!saveHistoryNoteModalShownBound) {
          modalElement.addEventListener('shown.bs.modal', () => {
            document.getElementById('save-history-note-input')?.focus();
          });
          saveHistoryNoteModalShownBound = true;
        }
        return saveHistoryNoteModal;
      }

      async function performSaveWithNote(noteText) {
        try {
          await saveCurrentSearch(noteText);
        } catch (error) {
          memberSaveMeta.textContent = error.message || 'Unable to save name calculator history.';
        }
      }

      saveHistoryButton.addEventListener('click', () => {
        if (!memberSession?.authenticated) {
          memberSaveMeta.textContent = 'Sign in on the membership page before saving history.';
          return;
        }

        if (!currentSearchPayload) {
          memberSaveMeta.textContent = 'Run a name calculation before saving history.';
          return;
        }

        const modal = getSaveHistoryNoteModal();
        const noteInput = document.getElementById('save-history-note-input');
        if (noteInput) {
          noteInput.value = '';
        }
        if (modal) {
          modal.show();
        } else {
          performSaveWithNote('');
        }
      });

      document.addEventListener('click', async (event) => {
        const target = event.target.closest('#save-history-note-confirm');
        if (!target) {
          return;
        }
        const noteInput = document.getElementById('save-history-note-input');
        const noteText = noteInput?.value ?? '';
        getSaveHistoryNoteModal()?.hide();
        await performSaveWithNote(noteText);
      });

      window.addEventListener('DOMContentLoaded', async () => {
        showCalculatorLoadingOverlay();
        try {
          focusNameFormFromHash();
          mobileNoteNode.textContent = getDefaultMobileNote();
          configureLearningPathReturn();
          await requestMemberSession().catch(() => null);
          updateMemberSaveState();

          const namesFromQuery = populateNamesFromSearchParams();
          if (namesFromQuery.length) {
            await renderResults(namesFromQuery);
          }
        } finally {
          hideCalculatorLoadingOverlay();
        }
      });
