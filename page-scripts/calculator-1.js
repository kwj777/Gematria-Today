const lookupForm = document.querySelector('#lookup-form');
      const lookupInput = document.querySelector('#lookup-input');
      const DEFAULT_RELATED_WORD_LIMIT = 100;
      const AUTHENTICATED_RELATED_WORD_LIMIT = 250;
      // Same words as the 400 from netlify/functions/englishGematria.mjs.
      const NO_COUNTABLE_LETTERS_MESSAGE = 'This calculator counts English letters A-Z only. Enter a word or phrase with at least one of them.';
      const clearSearchButton = document.querySelector('#clear-search-button');
      const lookupSubmitButton = document.querySelector('#lookup-submit-button');
      const lookupStatus = document.querySelector('#lookup-status');
      const gematriaResult = document.querySelector('#gematria-result');
      const relatedWordsResult = document.querySelector('#related-words-result');
      const learningPathReturnNode = document.querySelector('#learning-path-return-sticky');
      const learningPathReturnLink = document.querySelector('#learning-path-return-sticky-link');
      let learningPathReturnHref = '';
      let shareStatusTimeout = null;
      let lastSearchTerm = '';
      const calculatorError = document.querySelector('#calculator-error');
      const calculatorErrorMessage = document.querySelector('#calculator-error-message');
      const calculatorRetryButton = document.querySelector('#calculator-retry-button');
      const lookupInputError = document.querySelector('#lookup-input-error');
      const lookupSubmitSpinner = lookupSubmitButton.querySelector('[data-lookup-submit-spinner]');
      const lookupSubmitLabelNode = lookupSubmitButton.querySelector('[data-lookup-submit-label]');

      function setLookupSubmitBusy(isBusy) {
        if (!lookupSubmitButton) return;
        if (isBusy) {
          lookupSubmitButton.dataset.previousLabel = lookupSubmitLabelNode?.textContent || '';
          lookupSubmitButton.disabled = true;
          lookupSubmitButton.setAttribute('aria-busy', 'true');
          if (lookupSubmitLabelNode) lookupSubmitLabelNode.textContent = 'Calculating…';
          lookupSubmitSpinner?.classList.remove('d-none');
        } else {
          lookupSubmitButton.disabled = false;
          lookupSubmitButton.removeAttribute('aria-busy');
          const previous = lookupSubmitButton.dataset.previousLabel;
          if (lookupSubmitLabelNode && previous) lookupSubmitLabelNode.textContent = previous;
          delete lookupSubmitButton.dataset.previousLabel;
          lookupSubmitSpinner?.classList.add('d-none');
        }
      }

      function showCalculatorLoadingOverlay() {
        window.showWorkingOverlay?.();
      }

      function hideCalculatorLoadingOverlay() {
        window.hideWorkingOverlay?.();
      }

      function showCalculatorError(message) {
        const msg = String(message || 'Something went wrong. Please try again.');
        if (/failed to fetch|networkerror|network request failed/i.test(msg)) {
          calculatorErrorMessage.textContent = 'Network error — please check your connection and try again.';
        } else if (/out of memory/i.test(msg)) {
          calculatorErrorMessage.replaceChildren('Guest search limit reached. Try again in a few minutes or sign up for a ');
          const link = document.createElement('a');
          link.href = '/member.html#authSection';
          link.className = 'alert-link';
          link.textContent = 'free membership';
          calculatorErrorMessage.append(link, '.');
        } else {
          calculatorErrorMessage.textContent = msg;
        }
        calculatorError.hidden = false;
        lookupInput.setAttribute('aria-invalid', 'true');
        if (!calculatorError.hasAttribute('tabindex')) {
          calculatorError.setAttribute('tabindex', '-1');
        }
        try {
          calculatorError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (_) {
          calculatorError.scrollIntoView();
        }
        calculatorError.focus({ preventScroll: true });
      }

      function hideCalculatorError() {
        calculatorError.hidden = true;
        calculatorErrorMessage.textContent = '';
        lookupInput.removeAttribute('aria-invalid');
      }

      function showLookupInputError(message) {
        if (!lookupInputError) return;
        lookupInputError.textContent = String(message || '');
        lookupInputError.hidden = false;
        lookupInput.setAttribute('aria-invalid', 'true');
        lookupInput.focus({ preventScroll: true });
      }

      function clearLookupInputError() {
        if (lookupInputError && !lookupInputError.hidden) {
          lookupInputError.textContent = '';
          lookupInputError.hidden = true;
        }
        if (lookupInput.getAttribute('aria-invalid') === 'true' && (!calculatorError || calculatorError.hidden)) {
          lookupInput.removeAttribute('aria-invalid');
        }
      }

      lookupInput.addEventListener('input', clearLookupInputError);

      calculatorRetryButton.addEventListener('click', () => {
        hideCalculatorError();
        lookupInput.value = lastSearchTerm;
        lookupForm.requestSubmit();
      });

      function configureLearningPathReturn() {
        const searchParams = new URLSearchParams(window.location.search);
        const source = String(searchParams.get('source') || '').trim();
        const returnTo = String(searchParams.get('returnTo') || '').trim();
        if (source !== 'learning-path' || !returnTo || !learningPathReturnNode || !learningPathReturnLink) {
          return;
        }

        // A same-origin test alone let '/.//evil.example' through as the
        // off-site link '//evil.example'. See page-scripts/safe-return-path.js.
        const safeReturnPath = window.gematriaSafePath?.toSafeInternalPath(returnTo) || '';
        if (!safeReturnPath) {
          return;
        }
        learningPathReturnHref = safeReturnPath;
        learningPathReturnLink.href = learningPathReturnHref;
        const level = window.gematriaLearningPath?.getLevel?.(new URL(safeReturnPath, window.location.origin).pathname) ?? null;
        learningPathReturnLink.textContent = level
          ? `Nice! Back to Level ${level}`
          : 'Nice! Back to lesson';
      }

      function revealLearningPathReturnButton() {
        if (!learningPathReturnHref || !learningPathReturnNode) {
          return;
        }

        learningPathReturnNode.hidden = false;
      }

      function setShareStatus(message) {
        if (shareStatusTimeout) {
          window.clearTimeout(shareStatusTimeout);
        }
        lookupStatus.textContent = message;
        shareStatusTimeout = window.setTimeout(() => {
          if (lookupStatus.textContent === message) {
            lookupStatus.textContent = '';
          }
        }, 3000);
      }

      function formatCalculationSharePreview(word, result) {
        return `Look at what I found on Gematria.Today :) Searched: "${word}" | Result: ${result}`;
      }

      function formatResultClipboardText(searchGematria) {
        const word = String(searchGematria?.word || '').trim();
        const total = searchGematria?.gematria?.total;
        const digitalRoot = searchGematria?.gematria?.digitalRoot;
        const parts = [`"${word}" = ${total ?? ''}`];
        if (digitalRoot !== null && digitalRoot !== undefined && digitalRoot !== '') {
          parts.push(`Digital Root ${digitalRoot}`);
        }
        parts.push('Base-6 English Gematria');
        return `${parts.join(' · ')} — Gematria.Today`;
      }

      async function copyResultSummary(searchGematria) {
        const text = formatResultClipboardText(searchGematria);
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          setShareStatus('Result copied to your clipboard.');
          return;
        }
        window.prompt('Copy this result:', text);
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
        // Analytics: skipped unless the visitor allows it (cookie-consent.js).
        if (!normalizedAction || window.gematriaCookieConsent?.analyticsAllowed?.() !== true) {
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

      function createLookupShareUrl(searchGematria, shareImageCandidate = null) {
        const shareUrl = new URL('/calculator.html', getCanonicalShareOrigin());
        shareUrl.searchParams.set('query', String(searchGematria.word || '').trim());
        shareUrl.searchParams.set('total', String(searchGematria.gematria?.total ?? ''));
        shareUrl.searchParams.set('digitalRoot', String(searchGematria.gematria?.digitalRoot ?? ''));
        shareUrl.searchParams.set('isBaseRoot', String(Boolean(searchGematria.isBaseRoot)));

        const shareImageUrl = shareImageCandidate
          ? new URL(String(shareImageCandidate), getCanonicalShareOrigin())
          : null;
        const definitionPreview = String(shareImageUrl?.searchParams.get('definitionPreview') || '').trim();
        const perLetterValues = String(shareImageUrl?.searchParams.get('perLetterValues') || '').trim();
        if (definitionPreview) {
          shareUrl.searchParams.set('definitionPreview', definitionPreview);
        }
        if (perLetterValues) {
          shareUrl.searchParams.set('perLetterValues', perLetterValues);
        }

        shareUrl.hash = 'gematria-result';
        return shareUrl.toString();
      }

      function focusLookupAreaFromHash() {
        if (window.location.hash === '#gematria-result') {
          gematriaResult?.scrollIntoView({ block: 'center' });
          return;
        }
        if (window.location.hash === '#lookup-form') {
          lookupForm?.scrollIntoView({ block: 'center' });
          lookupInput?.focus({ preventScroll: true });
        }
      }

      async function sharePage(payload) {
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
          window.gematriaTracking?.track('calculator_usage_error', {
            source: 'calculator_lookup_form',
            errorMessage: error?.message || 'unknown_error',
          });
            if (error?.name === 'AbortError') {
              return;
            }
          }
        }

        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(sharePayload.url);
            setShareStatus('Share link copied to your clipboard.');
            return;
          } catch {
            // Safari refuses the write once the tap's user activation is gone
            // (a refused share above can use it up). This used to reject out
            // of the click handler, so the tap did nothing; the prompt below
            // still lets the visitor copy the link.
          }
        }

        window.prompt('Copy this link to share:', sharePayload.url);
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
        membershipLink.href = '/member.html#authSection';
        membershipLink.textContent = 'free membership';
        membershipLink.addEventListener('click', () => {
          window.location.assign('/member.html#authSection');
        });
        fragment.append(membershipLink, '.');
        return fragment;
      }

      function setStatusMessage(node, message) {
        node.replaceChildren(createMembershipLimitMessageFragment(message));
      }

      function renderRelatedWordsMembershipCallout(term = '') {
        relatedWordsResult.innerHTML = '';
        const callout = document.createElement('div');
        callout.className = 'alert alert-info mt-2 related-words-teaser';

        const title = document.createElement('strong');
        title.textContent = term
          ? `Related words for "${term}" are a free-member feature.`
          : 'Related word search is a free-member feature.';

        const details = document.createElement('p');
        details.className = 'mb-2';
        details.textContent = term
          ? 'Free members can see synonyms, antonyms, and matching-gematria words. Here’s a preview:'
          : 'Free members see synonyms, antonyms, and matching-gematria words for any lookup.';

        callout.append(title, document.createElement('br'), details);

        const sampleGroups = [
          { heading: 'Synonyms', words: ['illumination', 'glow', 'radiance'] },
          { heading: 'Matching gematria', words: ['truth', 'wisdom', 'spirit'] },
        ];
        const preview = document.createElement('div');
        preview.className = 'related-words-teaser-preview';
        preview.setAttribute('aria-hidden', 'true');
        sampleGroups.forEach((group) => {
          const groupNode = document.createElement('div');
          groupNode.className = 'related-words-teaser-group';
          const groupHeading = document.createElement('span');
          groupHeading.className = 'related-words-teaser-heading';
          groupHeading.textContent = `${group.heading}:`;
          const wordList = document.createElement('span');
          wordList.className = 'related-words-teaser-words';
          wordList.textContent = group.words.join(', ');
          groupNode.append(groupHeading, ' ', wordList);
          preview.appendChild(groupNode);
        });
        callout.appendChild(preview);

        const cta = document.createElement('a');
        cta.className = 'btn btn-sm btn-outline-warning mt-2';
        cta.href = '/member.html#registerForm';
        cta.textContent = 'Join for free';
        callout.appendChild(cta);

        relatedWordsResult.appendChild(callout);
      }
      const memberSaveShell = document.querySelector('#member-save-shell');
      const saveHistoryButton = document.querySelector('#save-history-button');
      const memberSaveMeta = document.querySelector('#member-save-meta');
      const memberLink = document.querySelector('#member-link');
      let saveHistoryPopover = null;
      const MEMBER_DASHBOARD_SYNC_KEY = 'memberDashboardUpdate';
      const memberDashboardSyncChannel = typeof window.BroadcastChannel === 'function'
        ? new window.BroadcastChannel('member-dashboard-sync')
        : null;
      const FREE_MEMBERSHIP_SAVE_LIMIT = 7;
      let currentSearchPayload = null;
      let lastSavedSearchPayload = null;
      let memberSession = null;

      async function requestJson(endpoint, searchParams) {
        const response = await fetch(`${endpoint}?${searchParams.toString()}`, { globalLoading: true });
        const rawBody = await response.text();

        let payload = null;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          throw new Error('Unexpected non-JSON response from server. Please retry in a moment.');
        }

        if (!response.ok || payload?.error) {
          const message = payload?.error || payload?.message || payload?.errorMessage || `HTTP ${response.status}`;
          throw new Error(message);
        }

        return payload;
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

      function showMembersOnlySaveMessage() {
        memberSaveMeta.textContent = '';
        memberSaveMeta.append('Only registered members can save searches. ');
        const joinLink = document.createElement('a');
        joinLink.href = '/member.html#authSection';
        joinLink.textContent = 'Join';
        memberSaveMeta.append(joinLink, '.');
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

      function notifyDashboardUpdate(kind) {
        const update = {
          kind: String(kind || 'history'),
          at: Date.now(),
        };
        try {
          window.localStorage.setItem(MEMBER_DASHBOARD_SYNC_KEY, JSON.stringify(update));
        } catch {
          // Ignore localStorage quota/privacy failures; BroadcastChannel still handles live tabs when available.
        }
        memberDashboardSyncChannel?.postMessage(update);
      }

      async function saveCurrentSearch(noteText = '') {
        if (!currentSearchPayload) {
          memberSaveMeta.textContent = 'Run a lookup before saving history.';
          return;
        }

        if (!memberSession?.authenticated) {
          memberSaveMeta.textContent = 'Sign in on the membership page before saving history.';
          return;
        }

        saveHistoryButton.disabled = true;
        memberSaveMeta.textContent = 'Saving search to your account...';

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
          throw new Error(payload.error || 'Unable to save search history.');
        }

        memberSaveMeta.textContent = memberSession?.member?.membershipLevel === 'free'
          ? `Saved to your account history. Free memberships can store up to ${FREE_MEMBERSHIP_SAVE_LIMIT} saved searches.`
          : 'Saved to your account history.';
        notifyDashboardUpdate('history');
        lastSavedSearchPayload = currentSearchPayload;
        saveHistoryButton.textContent = 'Saved';
        saveHistoryButton.disabled = true;
        syncSaveHistoryHint();
      }

      const saveHistoryHintRow = document.getElementById('save-history-hint-row');
      function syncSaveHistoryHint() {
        if (!saveHistoryHintRow) return;
        const needsCalc = saveHistoryButton.disabled && saveHistoryButton.textContent === 'Save result';
        saveHistoryHintRow.hidden = !needsCalc;
      }

      function updateMemberSaveState() {
        if (!memberSession?.authenticated) {
          // The shell holds the "Join free" call to action, and this branch used
          // to hide it -- from guests, the only people it is addressed to. It
          // also shipped visible and vanished once the session check resolved,
          // so the one audience that saw it saw it flash. The shell now starts
          // hidden in the markup and stays up for guests, matching the
          // multi-cipher calculator: the Save button is live and explains
          // itself through the members-only popover instead of disappearing.
          if (memberSaveShell) {
            memberSaveShell.classList.remove('d-none');
          }
          saveHistoryButton.classList.remove('d-none');
          saveHistoryButton.disabled = false;
          saveHistoryButton.textContent = 'Save result';
          saveHistoryButton.classList.add('member-save-button--guest');
          if (memberLink) {
            memberLink.href = '/member.html#registerForm';
            memberLink.textContent = 'Join free';
            memberLink.classList.add('btn-outline-warning');
            memberLink.classList.remove('btn-outline-primary');
          }
          if (memberSaveMeta) {
            memberSaveMeta.textContent = 'Join free to save searches and see related words.';
          }
          createMembersOnlyPopover();
          syncSaveHistoryHint();
          if (lookupSubmitLabelNode) lookupSubmitLabelNode.textContent = 'Calculate';
          updateNextStepsState();
          return;
        }

        saveHistoryButton.classList.remove('d-none');
        if (memberSaveShell) {
          memberSaveShell.classList.remove('d-none');
        }
        if (memberLink) {
          memberLink.href = '/member.html';
          memberLink.textContent = 'Go to My Dashboard';
          memberLink.classList.remove('btn-outline-warning');
          memberLink.classList.add('btn-outline-primary');
        }
        destroyMembersOnlyPopover();
        saveHistoryButton.classList.remove('member-save-button--guest');
        saveHistoryButton.removeAttribute('aria-disabled');
        saveHistoryButton.removeAttribute('title');
        if (currentSearchPayload && currentSearchPayload === lastSavedSearchPayload) {
          saveHistoryButton.textContent = 'Saved';
          saveHistoryButton.disabled = true;
        } else {
          saveHistoryButton.textContent = 'Save result';
          saveHistoryButton.disabled = !currentSearchPayload;
        }
        const memberName = memberSession.member.displayName || memberSession.member.username;
        const freeTierSuffix = memberSession.member.membershipLevel === 'free'
          ? ` Free memberships can save up to ${FREE_MEMBERSHIP_SAVE_LIMIT} searches.`
          : '';
        memberSaveMeta.textContent = currentSearchPayload
          ? `Signed in as ${memberName}. Save this result to history.${freeTierSuffix}`
          : `Signed in as ${memberName}. Run a lookup to save it.${freeTierSuffix}`;
        if (lookupSubmitLabelNode) lookupSubmitLabelNode.textContent = 'Calculate';
        updateNextStepsState();
        syncSaveHistoryHint();
      }

      function updateNextStepsState() {
        const nextStepsShell = document.querySelector('#next-steps-shell');
        if (!nextStepsShell) {
          return;
        }

        const nextStepLinks = Array.from(nextStepsShell.querySelectorAll('[data-cta-ladder-step]'));
        const showAllSteps = !memberSession?.authenticated;
        const showOnlyPremiumStep = memberSession?.authenticated && memberSession?.member?.membershipLevel === 'free';

        nextStepLinks.forEach((link) => {
          const step = link.dataset.ctaLadderStep;
          const shouldShow = showAllSteps || (showOnlyPremiumStep && step === 'premium-research');
          link.hidden = !shouldShow;
        });

        const hasVisibleStep = nextStepLinks.some((link) => !link.hidden);
        nextStepsShell.hidden = !hasVisibleStep;
      }


      function getRelatedWordLimit() {
        return memberSession?.authenticated ? AUTHENTICATED_RELATED_WORD_LIMIT : DEFAULT_RELATED_WORD_LIMIT;
      }

      // countAsSearch: false sends intent=view, which returns the value without
      // recording demand for the word. Use it for anything the page decided to
      // look up on its own -- a ?query= prefill, or the related-word fan-out --
      // because search_count is what decides whether a word gets published as
      // an indexable /w/ page, and only a person typing a word should move it.
      async function requestGematria(word, { countAsSearch = true } = {}) {
        const searchParams = new URLSearchParams({ word });
        if (!countAsSearch) searchParams.set('intent', 'view');
        return requestJson('/.netlify/functions/englishGematria', searchParams);
      }

      async function requestRelatedWords(term, limit = getRelatedWordLimit()) {
        const normalizedTerm = String(term || '').toLowerCase();
        const searchParams = new URLSearchParams({ word: normalizedTerm, limit: String(limit) });
        return requestJson('/.netlify/functions/wordnikRelatedWords', searchParams);
      }

      async function requestWordsByGematria(gematriaValue) {
        const searchParams = new URLSearchParams({ gematria: String(gematriaValue) });
        return requestJson('/.netlify/functions/searchByGematria', searchParams);
      }

      // Real anchors to the indexable /w/ and /v/ pages. The word buttons in
      // result cards re-run the search in place, which is good UX but leaves the
      // generated pages reachable only from the sitemap. These give crawlers --
      // and readers who want a shareable URL -- a path in from the calculator.
      function createWordPermalink(word, { label = 'Permalink' } = {}) {
        const link = document.createElement('a');
        link.className = 'word-permalink definition-pill';
        link.href = `/w/${encodeURIComponent(String(word))}`;
        link.textContent = label;
        link.title = `Permanent page for “${word}”`;
        return link;
      }

      function createValuePermalink(value, { label = 'Permalink' } = {}) {
        const link = document.createElement('a');
        link.className = 'value-permalink definition-pill';
        link.href = `/v/${encodeURIComponent(String(value))}`;
        link.textContent = label;
        link.title = `Permanent page for gematria value ${value}`;
        return link;
      }

      function createDefinitionLink(word, { trailingSeparator = '' } = {}) {
        const wrapper = document.createElement('span');
        wrapper.hidden = true;
        const definitionLink = document.createElement('a');
        definitionLink.className = 'definition-link definition-pill';
        const returnTo = `${window.location.pathname}${window.location.search}`;
        const definitionParams = new URLSearchParams({ word, returnTo });
        definitionLink.href = `/definition?${definitionParams.toString()}`;
        definitionLink.target = '_blank';
        definitionLink.rel = 'noopener noreferrer';
        definitionLink.textContent = 'Definition';
        definitionLink.title = `View definition for "${word}"`;
        definitionLink.setAttribute('aria-label', `Definition for ${word}`);
        wrapper.appendChild(definitionLink);
        if (trailingSeparator) wrapper.appendChild(document.createTextNode(trailingSeparator));
        hasDefinition(word).then((exists) => {
          if (exists) wrapper.hidden = false;
        });
        return wrapper;
      }

      // One definition request per word per page view. hasDefinition (which
      // decides whether the Definition pill shows) and the share card's
      // preview read the same payload, and the preview is fetched as soon as a
      // result renders (see renderSearchGematriaSummary), so without this every
      // lookup would spend two requests of the guest definition rate limit.
      const definitionPayloadRequests = new Map();

      function requestDefinitionPayload(word) {
        const normalizedWord = String(word || '').trim();
        if (!normalizedWord) return Promise.resolve(null);
        if (!definitionPayloadRequests.has(normalizedWord)) {
          const request = fetch(
            `/.netlify/functions/wordnikDefinition?word=${encodeURIComponent(normalizedWord)}`,
            { headers: { accept: 'application/json' } }
          )
            .then((response) => (response.ok ? response.json() : null))
            .catch(() => null)
            .then((payload) => {
              // A failure (rate limit, network) is not remembered, so the next
              // ask for this word tries again.
              if (!payload) definitionPayloadRequests.delete(normalizedWord);
              return payload;
            });
          definitionPayloadRequests.set(normalizedWord, request);
        }
        return definitionPayloadRequests.get(normalizedWord);
      }

      async function hasDefinition(word) {
        const payload = await requestDefinitionPayload(word);
        const definitions = Array.isArray(payload?.definitions)
          ? payload.definitions
          : Array.isArray(payload)
            ? payload
            : [];
        return definitions.some((definition) =>
          String(definition?.text || definition?.definition || definition?.display || definition?.gloss || '').trim()
        );
      }

      async function enrichRelationshipWords(relationships, searchTotal) {
        return Promise.all(
          relationships.map(async (relationship) => {
            const words = Array.isArray(relationship.words) ? relationship.words : [];

            const wordsWithGematria = await Promise.all(
              words.map(async (word) => {
                try {
                  // The visitor searched one word; these came back from
                  // Wordnik. Counting them registers a dozen searches nobody
                  // made and publishes a page for each.
                  const gematria = await requestGematria(word, { countAsSearch: false });
                  return { word, gematria };
                } catch (error) {
          window.gematriaTracking?.track('calculator_usage_error', {
            source: 'calculator_lookup_form',
            errorMessage: error?.message || 'unknown_error',
          });
                  return { word, gematriaError: error.message || 'Unable to calculate gematria.' };
                }
              })
            );

            const tierOf = (entry) => {
              if (!entry.gematria) return 3;
              const isRoot6 = Number(entry.gematria.gematria.digitalRoot) === 6;
              if (!isRoot6) return 3;
              return entry.gematria.isBaseRoot ? 1 : 2;
            };

            const sortedWords = [...wordsWithGematria].sort((left, right) => {
              const leftTier = tierOf(left);
              const rightTier = tierOf(right);
              if (leftTier !== rightTier) return leftTier - rightTier;

              const leftMatches = Boolean(left.gematria) && left.gematria.gematria.total === searchTotal;
              const rightMatches = Boolean(right.gematria) && right.gematria.gematria.total === searchTotal;
              if (leftMatches !== rightMatches) return leftMatches ? -1 : 1;

              return left.word.localeCompare(right.word);
            });

            return {
              relationshipType: relationship.relationshipType === 'synonym' ? 'Related Words (per Wordnik)' : (relationship.relationshipType || 'Related words'),
              words: sortedWords,
            };
          })
        );
      }

      // Set for the one search the page runs itself from ?query= on load, and
      // read back by the submit handler on entry. runSearch cannot pass this
      // through directly: it hands off via requestSubmit(), so the value has to
      // survive the hop and then be cleared so a later real search counts.
      let pendingSearchIsPagePrefill = false;

      function runSearch(term, { refreshPage = false, pagePrefill = false } = {}) {
        const normalizedTerm = String(term || '').trim();
        pendingSearchIsPagePrefill = pagePrefill;

        if (refreshPage) {
          const searchParams = new URLSearchParams();

          if (normalizedTerm) {
            searchParams.set('query', normalizedTerm);
          }

          window.location.search = searchParams.toString();
          return;
        }

        lookupInput.value = normalizedTerm;
        lookupForm.requestSubmit();
      }

      function clearSearch() {
        lookupInput.value = '';
        lookupStatus.textContent = '';
        gematriaResult.textContent = '';
        relatedWordsResult.innerHTML = '';
        hideCalculatorError();
        clearLookupInputError();
        const url = new URL(window.location.href);
        url.search = '';
        window.history.replaceState({}, '', url);
      }

      function computeDigitalRoot(value) {
        let root = Math.abs(Math.trunc(Number(value) || 0));
        while (root >= 10) {
          root = String(root).split('').reduce((sum, digit) => sum + Number(digit), 0);
        }
        return root;
      }

      const STEM_SUFFIXES = [
        'ational', 'ization', 'iveness', 'fulness', 'ousness',
        'ation', 'ness', 'tion', 'sion', 'ment', 'able', 'ible', 'ance', 'ence',
        'ize', 'ise', 'ous', 'ive', 'ity', 'ful', 'ies', 'ied',
        'ing', 'est', 'ors', 'ers', 'ed', 'ly', 'or', 'er', 'es', 's',
      ];

      function stripOneSuffix(word) {
        for (const suffix of STEM_SUFFIXES) {
          if (word.length - suffix.length >= 3 && word.endsWith(suffix)) {
            const trimmed = word.slice(0, -suffix.length);
            if (suffix === 'ies' || suffix === 'ied') return `${trimmed}y`;
            return trimmed;
          }
        }
        return word;
      }

      function stemToken(token) {
        let w = String(token || '').toLowerCase().replace(/[^a-z]+/g, '');
        if (w.length <= 3) return w;
        const afterFirst = stripOneSuffix(w);
        if (afterFirst !== w) {
          w = afterFirst;
          const afterSecond = stripOneSuffix(w);
          if (afterSecond !== w && afterSecond.length >= 3) w = afterSecond;
        }
        if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
        if (w.length > 3 && w.endsWith('i')) w = `${w.slice(0, -1)}y`;
        if (w.length >= 4 && w[w.length - 1] === w[w.length - 2] && !'aeiou'.includes(w[w.length - 1])) {
          w = w.slice(0, -1);
        }
        return w;
      }

      function stemPhraseKey(phrase) {
        const tokens = String(phrase || '').toLowerCase().split(/\s+/).filter(Boolean);
        if (tokens.length === 0) return '';
        return tokens.map(stemToken).filter(Boolean).join(' ');
      }

      function groupWordsByStem(words) {
        const stemMap = new Map();
        words.forEach((entry) => {
          const stem = stemPhraseKey(entry.word) || String(entry.word || '').toLowerCase();
          if (!stemMap.has(stem)) stemMap.set(stem, []);
          stemMap.get(stem).push(entry);
        });
        const groups = [];
        const singletons = [];
        stemMap.forEach((entries, stem) => {
          if (entries.length >= 2) {
            entries.sort((a, b) => a.word.length - b.word.length || a.word.localeCompare(b.word));
            groups.push({ stem, entries, root: entries[0].word });
          } else {
            singletons.push(entries[0]);
          }
        });
        groups.sort((a, b) => b.entries.length - a.entries.length || a.root.localeCompare(b.root));
        singletons.sort((a, b) => String(a.word).localeCompare(String(b.word)));
        return { groups, singletons };
      }

      function createReverseLookupShareUrl(gematriaValue) {
        const shareUrl = new URL('/calculator.html', getCanonicalShareOrigin());
        shareUrl.searchParams.set('query', String(gematriaValue));
        shareUrl.hash = 'gematria-result';
        return shareUrl.toString();
      }

      function appendReverseLookupShareButton(payload) {
        const shareButton = document.createElement('button');
        shareButton.type = 'button';
        shareButton.className = 'btn btn-outline-primary btn-sm fw-semibold share-action-button';
        shareButton.textContent = 'Share this lookup';
        shareButton.addEventListener('click', async () => {
          reportButtonEvent('share_button_click', { source: 'calculator_reverse_lookup' });
          const shareUrl = createReverseLookupShareUrl(payload.gematria);
          await sharePage({
            title: `Words with gematria ${payload.gematria}`,
            text: `Look at what I found on Gematria.Today :) ${payload.count} word${payload.count === 1 ? '' : 's'} in our database with gematria value ${payload.gematria}.`,
            url: shareUrl,
          });
        });

        const shareActions = document.createElement('div');
        shareActions.className = 'd-flex flex-column flex-sm-row gap-2 mt-2';
        shareActions.appendChild(shareButton);
        gematriaResult.append(document.createElement('br'), shareActions);
      }

      async function renderGematriaMatches(gematriaValue) {
        lookupStatus.textContent = `Searching for words with gematria ${gematriaValue}...`;
        gematriaResult.textContent = '';
        relatedWordsResult.innerHTML = '';
        currentSearchPayload = null;
        updateMemberSaveState();

        try {
          const payload = await requestWordsByGematria(gematriaValue);
          lookupStatus.textContent = '';
          gematriaResult.textContent = `Words in the database with gematria ${payload.gematria}: ${payload.count}`;

          appendReverseLookupShareButton(payload);

          const wrapper = document.createElement('section');
          const heading = document.createElement('h3');
          heading.textContent = `Words matching gematria ${payload.gematria}`;
          wrapper.appendChild(heading);

          const disclaimer = document.createElement('p');
          disclaimer.className = 'muted disclaimer';
          disclaimer.textContent = '*  Gematria value matches are limited to the words currently in our database. Words sharing the same root form are grouped together below.';
          wrapper.appendChild(disclaimer);

          const permalinkLine = document.createElement('p');
          permalinkLine.className = 'small text-muted';
          permalinkLine.append(
            'Shareable page for this value: ',
            createValuePermalink(payload.gematria, { label: `/v/${payload.gematria}` }),
          );
          wrapper.appendChild(permalinkLine);

          if (payload.count > 0) {
            const sharedDigitalRoot = computeDigitalRoot(Number(payload.gematria));
            const sharedIsBaseRoot = (Number(payload.gematria) - 6) % 54 === 0;
            const summary = document.createElement('p');
            summary.className = 'related-word-card-meta small text-muted shared-facts-summary';
            summary.append(
              `Every match below shares these traits — `,
              createDigitalRootValueNode(sharedDigitalRoot, 'Digital Root '),
              ' · ',
              createBaseRootStatusNode(sharedIsBaseRoot),
            );
            wrapper.appendChild(summary);
          }

          if (payload.count === 0) {
            const emptyState = document.createElement('p');
            emptyState.textContent = 'No words in the database currently match this gematria value.';
            wrapper.appendChild(emptyState);
          } else {
            const { groups, singletons } = groupWordsByStem(payload.words);

            groups.forEach((group) => {
              const groupSection = document.createElement('section');
              groupSection.className = 'related-word-group';

              const groupHeading = document.createElement('h4');
              groupHeading.className = 'related-word-group-heading';
              groupHeading.textContent = `Variants of “${group.root}” (${group.entries.length})`;
              groupSection.appendChild(groupHeading);

              const grid = document.createElement('div');
              grid.className = 'results-grid related-words-grid';
              group.entries.forEach((entry) => {
                grid.appendChild(createWordCard({ word: entry.word, gematria: entry }, payload.gematria, { suppressSharedConstants: true }));
              });
              groupSection.appendChild(grid);
              wrapper.appendChild(groupSection);
            });

            if (singletons.length > 0) {
              const standaloneSection = document.createElement('section');
              standaloneSection.className = 'related-word-group related-word-group-standalone';

              if (groups.length > 0) {
                const standaloneHeading = document.createElement('h4');
                standaloneHeading.className = 'related-word-group-heading';
                standaloneHeading.textContent = `Other matches (${singletons.length})`;
                standaloneSection.appendChild(standaloneHeading);
              }

              const grid = document.createElement('div');
              grid.className = 'results-grid related-words-grid';
              singletons.forEach((entry) => {
                grid.appendChild(createWordCard({ word: entry.word, gematria: entry }, payload.gematria, { suppressSharedConstants: true }));
              });
              standaloneSection.appendChild(grid);
              wrapper.appendChild(standaloneSection);
            }
          }

          relatedWordsResult.appendChild(wrapper);

          const numericTotal = Number(payload.gematria);
          currentSearchPayload = {
            queryText: String(payload.gematria),
            queryType: 'gematria',
            calculatorSource: 'calculator',
            gematriaTotal: numericTotal,
            digitalRoot: computeDigitalRoot(numericTotal),
            isBaseRoot: (numericTotal - 6) % 54 === 0,
            resultPayload: { reverseLookup: payload },
          };
          updateMemberSaveState();
        } catch (error) {
          window.gematriaTracking?.track('calculator_usage_error', {
            source: 'calculator_lookup_form',
            errorMessage: error?.message || 'unknown_error',
          });
          setStatusMessage(lookupStatus, error.message || 'Unable to search by gematria value.');
          currentSearchPayload = null;
          updateMemberSaveState();
        }
      }

      function createWordCard(wordResult, searchTotal, options = {}) {
        const suppressSharedConstants = Boolean(options.suppressSharedConstants);
        const card = document.createElement('article');
        card.className = 'related-word-card';

        const header = document.createElement('div');
        header.className = 'related-word-card-header';

        const wordLabel = document.createElement('button');
        const hasMatchingGematria = Boolean(wordResult.gematria) && wordResult.gematria.gematria.total === searchTotal;
        wordLabel.type = 'button';
        wordLabel.className = hasMatchingGematria ? 'related-word matching-word word-link' : 'related-word word-link';
        wordLabel.textContent = wordResult.word;
        wordLabel.addEventListener('click', () => {
          runSearch(wordResult.word, { refreshPage: true });
        });

        header.append(wordLabel, createDefinitionLink(wordResult.word), createWordPermalink(wordResult.word));
        card.appendChild(header);

        if (wordResult.gematria) {
          const payload = wordResult.gematria;

          if (!suppressSharedConstants) {
            const gematriaRow = document.createElement('div');
            gematriaRow.className = 'related-word-card-gematria';
            const matchPrefix = hasMatchingGematria ? 'Gematria match! ' : '';
            const detailPrefix = document.createTextNode(`${matchPrefix}Gematria `);
            const gematriaButton = document.createElement('button');
            gematriaButton.type = 'button';
            gematriaButton.className = 'inline-button';
            gematriaButton.textContent = payload.gematria.total;
            gematriaButton.addEventListener('click', () => {
              renderGematriaMatches(payload.gematria.total);
            });
            gematriaRow.append(detailPrefix, gematriaButton);
            card.appendChild(gematriaRow);
          }

          const metaLine = document.createElement('div');
          metaLine.className = 'related-word-card-meta small text-muted';
          if (suppressSharedConstants) {
            metaLine.append(formatSearchCount(payload.searchCount));
          } else {
            metaLine.append(
              createDigitalRootValueNode(payload.gematria.digitalRoot, 'Digital Root '),
              ' · ',
              createBaseRootStatusNode(payload.isBaseRoot),
              ' · ',
              formatSearchCount(payload.searchCount),
            );
          }
          card.appendChild(metaLine);

          card.appendChild(createPerLetterDetails(wordResult.word));
        } else {
          const errorRow = document.createElement('div');
          errorRow.className = 'related-word-card-gematria text-muted';
          errorRow.textContent = wordResult.gematriaError || 'Unable to calculate gematria.';
          card.appendChild(errorRow);
        }

        return card;
      }

      function dedupeRelatedWords(relationships, searchTerm) {
        const seenWords = new Set();
        const normalizedSearchTerm = String(searchTerm || '')
          .trim()
          .toLowerCase();

        return relationships.map((relationship) => ({
          ...relationship,
          words: relationship.words.filter((wordResult) => {
            const normalizedWord = String(wordResult.word || '')
              .trim()
              .toLowerCase();

            if (!normalizedWord || normalizedWord === normalizedSearchTerm || seenWords.has(normalizedWord)) {
              return false;
            }

            seenWords.add(normalizedWord);
            return true;
          }),
        }));
      }

      function createGematriaSearchButton(gematriaValue) {
        const gematriaButton = document.createElement('button');
        gematriaButton.type = 'button';
        gematriaButton.className = 'inline-button';
        gematriaButton.textContent = gematriaValue;
        gematriaButton.addEventListener('click', () => {
          renderGematriaMatches(gematriaValue);
        });
        return gematriaButton;
      }

      function createBaseRootLink() {
        const link = document.createElement('a');
        link.href = 'https://gematria.today/blog.html?post=base-rooted-words#base-rooted-words';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Base Rooted:';
        return link;
      }

      function createBaseRootStatusNode(isBaseRoot) {
        const link = document.createElement('a');
        link.href = 'https://gematria.today/blog.html?post=base-rooted-words#base-rooted-words';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = isBaseRoot ? 'Base rooted' : 'Not base rooted';
        // Every total in this cipher is a multiple of 6, so that cannot be the
        // rule. Base rooted means 6 more than a multiple of 54 -- the same test
        // as isBaseRootValue() in netlify/functions/englishGematria.mjs.
        link.title = isBaseRoot
          ? 'This total is on the 54-step ladder 6, 60, 114, 168, 222 … (6 plus a multiple of 54). Learn more.'
          : 'This total is not on the 54-step ladder 6, 60, 114, 168, 222 … (6 plus a multiple of 54). Learn more.';
        if (!isBaseRoot) return link;
        const wrapper = document.createElement('span');
        wrapper.className = 'meta-highlight';
        wrapper.appendChild(link);
        return wrapper;
      }

      function formatSearchCount(count) {
        const value = Number(count) || 0;
        const node = document.createElement('span');
        node.textContent = value === 1 ? 'Searched 1 time' : `Searched ${value} times`;
        node.title = 'How many times this word has been looked up on Gematria Today.';
        return node;
      }

      function formatBaseRootLabel(isBaseRoot) {
        return isBaseRoot ? 'Yes' : 'No';
      }

      function isHighlightedDigitalRoot(value) {
        return Number(value) === 6;
      }

      function createDigitalRootValueNode(value, prefix = '') {
        const link = document.createElement('a');
        link.href = 'https://gematria.today/blog/digital-roots-in-gematria?post=digital-roots-in-gematria';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `${prefix}${value}`;
        if (!isHighlightedDigitalRoot(value)) return link;
        const wrapper = document.createElement('span');
        wrapper.className = 'meta-highlight';
        wrapper.appendChild(link);
        return wrapper;
      }

      function createBaseRootValueNode(isBaseRoot) {
        return Object.assign(document.createElement('span'), {
          className: isBaseRoot ? 'meta-highlight' : '',
          textContent: formatBaseRootLabel(isBaseRoot),
        });
      }

      // Same normalization as englishGematria() on the server, so the letters
      // shown always add up to the total returned for them.
      function getPerLetterValues(input) {
        return Array.from(String(input || '').normalize('NFKC').replace(/[^A-Za-z]/g, '').toUpperCase())
          .map((char) => ({ letter: char, value: (char.charCodeAt(0) - 64) * 6 }));
      }

      function createPerLetterValuesNode(input, { includePrefix = true } = {}) {
        const letterValues = getPerLetterValues(input);
        const node = document.createElement('span');
        node.className = 'small text-muted';
        const prefix = includePrefix ? 'Per-letter values: ' : '';
        node.textContent = letterValues.length
          ? `${prefix}${letterValues.map(({ letter, value }) => `${letter}=${value}`).join(', ')}`
          : `${prefix}n/a`;
        return node;
      }

      function createPerLetterDetails(input, { open = false } = {}) {
        const details = document.createElement('details');
        details.className = 'per-letter-details';
        if (open) details.open = true;
        const summary = document.createElement('summary');
        summary.className = 'small text-muted';
        summary.textContent = 'Per-letter values';
        details.append(summary, createPerLetterValuesNode(input, { includePrefix: false }));
        return details;
      }

      function getPerLetterValuesLabel(input) {
        const letterValues = getPerLetterValues(input);
        return letterValues.length
          ? letterValues.map(({ letter, value }) => `${letter}=${value}`).join(', ')
          : 'n/a';
      }

      function stripHtmlTags(value) {
        return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }

      async function fetchDefinitionPreview(word) {
        const normalizedWord = String(word || '').trim();
        if (!normalizedWord) {
          return '';
        }

        const getDefinitionList = (payload) => {
          if (Array.isArray(payload)) {
            return payload;
          }

          if (Array.isArray(payload?.definitions)) {
            return payload.definitions;
          }

          if (Array.isArray(payload?.data?.definitions)) {
            return payload.data.definitions;
          }

          return [];
        };

        const extractDefinitionText = (definition) => String(
          definition?.text
          || definition?.definition
          || definition?.display
          || definition?.gloss
          || ''
        ).trim();

        const payload = await requestDefinitionPayload(normalizedWord);
        const definitions = getDefinitionList(payload);
        const firstDefinition = definitions.find((definition) => extractDefinitionText(definition));
        return stripHtmlTags(extractDefinitionText(firstDefinition));
      }

      function buildWordShareImageUrl(searchGematria, definitionPreview = '') {
        const shareImageUrl = new URL('/.netlify/functions/calculator-share-image', getCanonicalShareOrigin());
        const query = String(searchGematria.word || '').trim();

        shareImageUrl.searchParams.set('type', 'word');
        shareImageUrl.searchParams.set('query', query);
        shareImageUrl.searchParams.set('total', String(searchGematria.gematria?.total ?? ''));
        shareImageUrl.searchParams.set('digitalRoot', String(searchGematria.gematria?.digitalRoot ?? ''));
        shareImageUrl.searchParams.set('isBaseRoot', String(Boolean(searchGematria.isBaseRoot)));
        shareImageUrl.searchParams.set('definitionPreview', definitionPreview || 'Definition preview unavailable.');
        shareImageUrl.searchParams.set('perLetterValues', getPerLetterValuesLabel(query));

        return shareImageUrl;
      }

      async function createWordShareImageUrl(searchGematria) {
        const definitionPreview = await fetchDefinitionPreview(String(searchGematria.word || '').trim());
        return buildWordShareImageUrl(searchGematria, definitionPreview);
      }

      function renderSearchGematriaSummary(searchGematria) {
        // navigator.share and clipboard writes need the tap's user activation,
        // and iOS Safari lets it lapse while a network request is in flight.
        // The share card's definition preview used to be fetched inside the
        // click handler, so on a slow connection Share did nothing at all. It
        // is fetched now, while the result renders, and the click only reads
        // whatever has arrived -- nothing is awaited before navigator.share.
        let shareImageUrl = buildWordShareImageUrl(searchGematria);
        const shareImageUrlReady = createWordShareImageUrl(searchGematria)
          .then((url) => {
            shareImageUrl = url;
            return url;
          })
          .catch(() => shareImageUrl);
        const shareButton = document.createElement('button');
        shareButton.type = 'button';
        shareButton.className = 'btn btn-outline-primary btn-sm mt-2 fw-semibold share-action-button';
        shareButton.textContent = 'Share this lookup';
        shareButton.addEventListener('click', async () => {
          reportButtonEvent('share_button_click', { source: 'calculator_lookup' });
          const shareUrl = createLookupShareUrl(searchGematria, shareImageUrl);
          await sharePage({
            title: `Gematria lookup for ${searchGematria.word}`,
            text: formatCalculationSharePreview(searchGematria.word, searchGematria.gematria.total),
            url: shareUrl,
            imageUrl: toShareImageAssetUrl(shareImageUrl.toString()),
          });
        });
        shareButton.classList.remove('mt-2');
        const copyResultButton = document.createElement('button');
        copyResultButton.type = 'button';
        copyResultButton.className = 'btn btn-outline-secondary btn-sm fw-semibold share-action-button';
        copyResultButton.textContent = 'Copy result';
        copyResultButton.addEventListener('click', async () => {
          reportButtonEvent('copy_result', { source: 'calculator_lookup' });
          try {
            await copyResultSummary(searchGematria);
          } catch (error) {
            setShareStatus(error?.message || 'Unable to copy right now.');
          }
        });

        const downloadImageButton = document.createElement('button');
        downloadImageButton.type = 'button';
        downloadImageButton.className = 'btn btn-outline-secondary btn-sm fw-semibold share-action-button';
        downloadImageButton.textContent = 'Download image';
        downloadImageButton.addEventListener('click', async () => {
          reportButtonEvent('image_download', { source: 'calculator_lookup' });
          try {
            const readyShareImageUrl = await shareImageUrlReady;
            const sanitizedWord = String(searchGematria.word || 'lookup').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'lookup';
            await downloadShareImage(toShareImageAssetUrl(readyShareImageUrl.toString()), `gematria-${sanitizedWord}.jpg`);
            setShareStatus('Image downloaded.');
          } catch (error) {
            setShareStatus(error?.message || 'Unable to download image right now.');
          }
        });

        gematriaResult.textContent = '';

        const promptLine = document.createElement('div');
        promptLine.className = 'gematria-prompt small text-muted';
        promptLine.append(
          `Base-6 English Gematria for "${searchGematria.word}" `,
          createDefinitionLink(searchGematria.word),
          createWordPermalink(searchGematria.word, { label: 'Word page' }),
          createValuePermalink(searchGematria.gematria.total, { label: `All words = ${searchGematria.gematria.total}` }),
        );

        const totalLine = document.createElement('div');
        totalLine.className = 'gematria-total';
        totalLine.append(createGematriaSearchButton(searchGematria.gematria.total));

        const metaLine = document.createElement('div');
        metaLine.className = 'gematria-meta small text-muted';
        metaLine.append(
          createDigitalRootValueNode(searchGematria.gematria.digitalRoot, 'Digital Root '),
          ' · ',
          createBaseRootStatusNode(searchGematria.isBaseRoot),
          ' · ',
          formatSearchCount(searchGematria.searchCount),
        );

        const shareActions = document.createElement('div');
        shareActions.className = 'd-flex flex-column flex-sm-row gap-2 mt-3';
        shareActions.append(shareButton, copyResultButton, downloadImageButton);

        gematriaResult.append(
          promptLine,
          totalLine,
          metaLine,
          createPerLetterDetails(searchGematria.word, { open: true }),
          shareActions,
        );
      }

      function renderRelatedWordsError(message) {
        relatedWordsResult.innerHTML = '';
        const errorState = document.createElement('p');
        errorState.className = 'small text-muted mt-2';
        errorState.textContent = message;
        relatedWordsResult.appendChild(errorState);
      }

      function renderRelatedWords(payload, relationships, searchGematria) {
        relatedWordsResult.innerHTML = '';

        const dedupedRelationships = dedupeRelatedWords(relationships, payload.query);
        const totalWords = dedupedRelationships.reduce((count, relationship) => count + relationship.words.length, 0);

        const meta = document.createElement('div');
        meta.className = 'result-meta';

        const resultsLabel = document.createElement('strong');
        resultsLabel.textContent = 'Results for:';
        const limitLabel = document.createElement('strong');
        limitLabel.textContent = 'Limit used:';
        const searchGematriaLabel = document.createElement('strong');
        searchGematriaLabel.textContent = 'Search gematria:';

        meta.append(
          resultsLabel,
          ` ${payload.query} `,
          createDefinitionLink(payload.query),
          document.createElement('br'),
          limitLabel,
          ` ${payload.limit}`,
          document.createElement('br'),
          searchGematriaLabel,
          ' ',
          createGematriaSearchButton(searchGematria.gematria.total)
        );

        relatedWordsResult.appendChild(meta);

        const disclaimer = document.createElement('p');
        disclaimer.className = 'muted disclaimer';
        disclaimer.textContent = '*  Gematria value matches are limited to the words currently in our database.';
        relatedWordsResult.appendChild(disclaimer);

        if (totalWords === 0) {
          const emptyState = document.createElement('p');
          emptyState.textContent = 'There are no related words found.';
          relatedWordsResult.appendChild(emptyState);
          return;
        }

        dedupedRelationships.forEach((relationship) => {
          const section = document.createElement('section');
          const heading = document.createElement('h3');
          heading.textContent = relationship.relationshipType;
          section.appendChild(heading);

          if (relationship.words.length === 0) {
            const emptyWords = document.createElement('p');
            emptyWords.textContent = 'No words returned for this relationship.';
            section.appendChild(emptyWords);
          } else {
            const grid = document.createElement('div');
            grid.className = 'results-grid related-words-grid';
            relationship.words.forEach((wordResult) => {
              grid.appendChild(createWordCard(wordResult, searchGematria.gematria.total));
            });
            section.appendChild(grid);
          }

          relatedWordsResult.appendChild(section);
        });

        if (payload.hasMore && memberSession?.authenticated && memberSession?.member?.membershipLevel === 'free') {
          const upgradeCallout = document.createElement('div');
          upgradeCallout.className = 'alert alert-info mt-3 related-words-upgrade-callout';
          const upgradeMessage = document.createElement('p');
          upgradeMessage.className = 'mb-2';
          upgradeMessage.textContent = `Showing the first ${payload.limit} related words. More are available — upgrade to premium to see up to ${AUTHENTICATED_RELATED_WORD_LIMIT} per lookup.`;
          const upgradeLink = document.createElement('a');
          upgradeLink.className = 'btn btn-sm btn-primary';
          upgradeLink.href = '/member.html#membershipUpgradeSection';
          upgradeLink.textContent = 'Upgrade to premium';
          upgradeCallout.append(upgradeMessage, upgradeLink);
          relatedWordsResult.appendChild(upgradeCallout);
        }
      }

      document.querySelectorAll('[data-cta-ladder-step]').forEach((link) => {
        link.addEventListener('click', () => {
          window.gematriaTracking?.track('cta_ladder_click', {
            step: link.dataset.ctaLadderStep,
            location: 'calculator_page',
            destination: link.getAttribute('href') || '',
          });
        });
      });

      document.getElementById('member-link')?.addEventListener('click', () => {
        window.gematriaTracking?.track('sign_up_start', {
          source: 'calculator_member_history_banner',
        });
      });

      lookupForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        // Read and clear synchronously, before the first await, so exactly one
        // search consumes the flag.
        const isPagePrefill = pendingSearchIsPagePrefill;
        pendingSearchIsPagePrefill = false;

        const term = lookupInput.value.trim();
        lastSearchTerm = term;
        hideCalculatorError();
        clearLookupInputError();
        window.gematriaTracking?.track('calculator_usage_start', {
          source: 'calculator_lookup_form',
          queryLength: term.length,
        });
        if (!term) {
          lookupStatus.textContent = '';
          showLookupInputError('Please enter a word or phrase.');
          gematriaResult.textContent = '';
          relatedWordsResult.innerHTML = '';
          return;
        }

        if (/^\d+$/.test(term)) {
          const numericValue = Number(term);
          if (numericValue <= 0 || numericValue % 6 !== 0) {
            lookupStatus.textContent = '';
            showLookupInputError('Gematria values must be positive multiples of 6 — try 6, 12, 18, 24, …');
            gematriaResult.textContent = '';
            relatedWordsResult.innerHTML = '';
            currentSearchPayload = null;
            updateMemberSaveState();
            return;
          }
          showCalculatorLoadingOverlay();
          setLookupSubmitBusy(true);
          try {
            await renderGematriaMatches(numericValue);
            revealLearningPathReturnButton();
          } finally {
            focusLookupAreaFromHash();
            hideCalculatorLoadingOverlay();
            setLookupSubmitBusy(false);
            if (window.location.hash !== '#gematria-result') {
              lookupInput.focus();
            }
          }
          return;
        }

        // Only A-Z count, so a Hebrew or Greek word, an emoji or bare
        // punctuation used to come back as a result of 0 -- with share and
        // permalink buttons -- as if 0 were its gematria value.
        if (!getPerLetterValues(term).length) {
          lookupStatus.textContent = '';
          showLookupInputError(NO_COUNTABLE_LETTERS_MESSAGE);
          gematriaResult.textContent = '';
          relatedWordsResult.innerHTML = '';
          currentSearchPayload = null;
          updateMemberSaveState();
          return;
        }

        showCalculatorLoadingOverlay();
        setLookupSubmitBusy(true);

        lookupStatus.textContent = memberSession?.authenticated
          ? 'Searching for gematria and related words...'
          : 'Calculating gematria...';
        gematriaResult.textContent = '';
        relatedWordsResult.innerHTML = '';
        currentSearchPayload = null;
        updateMemberSaveState();

        try {
          const searchGematria = await requestGematria(term, { countAsSearch: !isPagePrefill });
          window.gematriaTracking?.track('calculator_usage_complete', {
            source: 'calculator_lookup_form',
            gematriaTotal: searchGematria?.gematria?.total ?? null,
            authenticated: Boolean(memberSession?.authenticated),
          });
          renderSearchGematriaSummary(searchGematria);
          revealLearningPathReturnButton();

          if (!memberSession?.authenticated) {
            lookupStatus.textContent = '';
            renderRelatedWordsMembershipCallout(term);
            currentSearchPayload = {
              queryText: term,
              queryType: 'word',
              calculatorSource: 'calculator',
              gematriaTotal: searchGematria.gematria.total,
              digitalRoot: searchGematria.gematria.digitalRoot,
              isBaseRoot: searchGematria.isBaseRoot,
              resultPayload: { searchGematria, relatedWordsPayload: null, relationships: [] },
            };
            updateMemberSaveState();
          } else {
            try {
              const relatedWordsPayload = await requestRelatedWords(term, getRelatedWordLimit());
              const relationships = Array.isArray(relatedWordsPayload.data) ? relatedWordsPayload.data : [];
              const enrichedRelationships = await enrichRelationshipWords(relationships, searchGematria.gematria.total);
              lookupStatus.textContent = '';
              renderRelatedWords(relatedWordsPayload, enrichedRelationships, searchGematria);
              currentSearchPayload = {
                queryText: term,
                queryType: 'word',
                calculatorSource: 'calculator',
                gematriaTotal: searchGematria.gematria.total,
                digitalRoot: searchGematria.gematria.digitalRoot,
                isBaseRoot: searchGematria.isBaseRoot,
                resultPayload: { searchGematria, relatedWordsPayload, relationships: enrichedRelationships },
              };
              updateMemberSaveState();
            } catch (error) {
          window.gematriaTracking?.track('calculator_usage_error', {
            source: 'calculator_lookup_form',
            errorMessage: error?.message || 'unknown_error',
          });
              const relatedWordsErrorMessage = error.message === "Wordnik's search came up empty."
                ? 'Wordnik did not find any related words.'
                : (error.message || 'Unable to load related words.');
              lookupStatus.textContent = '';
              renderRelatedWordsError(relatedWordsErrorMessage);
              currentSearchPayload = {
                queryText: term,
                queryType: 'word',
                calculatorSource: 'calculator',
                gematriaTotal: searchGematria.gematria.total,
                digitalRoot: searchGematria.gematria.digitalRoot,
                isBaseRoot: searchGematria.isBaseRoot,
                resultPayload: { searchGematria, relatedWordsPayload: null, relationships: [] },
              };
              updateMemberSaveState();
            }
          }
        } catch (error) {
          window.gematriaTracking?.track('calculator_usage_error', {
            source: 'calculator_lookup_form',
            errorMessage: error?.message || 'unknown_error',
          });
          lookupStatus.textContent = '';
          showCalculatorError(error.message || 'Unable to load gematria and related words.');
          gematriaResult.textContent = '';
          relatedWordsResult.innerHTML = '';
          currentSearchPayload = null;
          updateMemberSaveState();
        } finally {
          focusLookupAreaFromHash();
          hideCalculatorLoadingOverlay();
          setLookupSubmitBusy(false);
          if (window.location.hash !== '#gematria-result') {
            lookupInput.focus();
          }
        }
      });

      clearSearchButton.addEventListener('click', () => {
        clearSearch();
        currentSearchPayload = null;
        updateMemberSaveState();
      });

      // On touch-only devices, the synthetic mouseenter on first tap shows the
      // popover and iOS withholds the click event until a second tap. Only bind
      // mouseenter when the device actually has hover.
      const hasHover = !!(window.matchMedia && window.matchMedia('(hover: hover)').matches);
      const previewEvents = hasHover ? ['mouseenter', 'focus'] : ['focus'];
      previewEvents.forEach((eventName) => {
        saveHistoryButton.addEventListener(eventName, () => {
          if (!memberSession?.authenticated) {
            showMembersOnlySaveMessage();
            createMembersOnlyPopover();
            saveHistoryPopover?.show();
          }
        });
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
          window.gematriaTracking?.track('calculator_save_history_complete', {
            source: 'calculator_page',
          });
        } catch (error) {
          window.gematriaTracking?.track('calculator_usage_error', {
            source: 'calculator_lookup_form',
            errorMessage: error?.message || 'unknown_error',
          });
          memberSaveMeta.textContent = error.message || 'Unable to save search history.';
          // The member box sits under the results, so keep the failure in view.
          memberSaveShell?.scrollIntoView({ block: 'nearest' });
        }
      }

      saveHistoryButton.addEventListener('click', (event) => {
        if (!memberSession?.authenticated) {
          event.preventDefault();
          showMembersOnlySaveMessage();
          createMembersOnlyPopover();
          saveHistoryPopover?.show();
          window.gematriaTracking?.track('sign_up_start', { source: 'calculator_save_button' });
          return;
        }

        if (!currentSearchPayload) {
          memberSaveMeta.textContent = 'Run a lookup before saving history.';
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
          focusLookupAreaFromHash();
          await requestMemberSession().catch(() => null);
          configureLearningPathReturn();
          updateMemberSaveState();
          const searchParams = new URLSearchParams(window.location.search);
          const query = searchParams.get('query') || '';
          if (query) {
            // Nobody typed this. The home page builds /calculator.html?query=
            // links for the Wordnik word of the day, and definition pages build
            // one for every long word in the definition body, so counting this
            // as a search let a crawl publish a page for each of them.
            await runSearch(query, { pagePrefill: true });
          }
        } finally {
          hideCalculatorLoadingOverlay();
        }
      });
