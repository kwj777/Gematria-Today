const lookupForm = document.querySelector('#lookup-form');
      const lookupInput = document.querySelector('#lookup-input');
      const DEFAULT_RELATED_WORD_LIMIT = 100;
      const AUTHENTICATED_RELATED_WORD_LIMIT = 250;
      const clearSearchButton = document.querySelector('#clear-search-button');
      const lookupSubmitButton = document.querySelector('#lookup-submit-button');
      const lookupStatus = document.querySelector('#lookup-status');
      const gematriaResult = document.querySelector('#gematria-result');
      const relatedWordsResult = document.querySelector('#related-words-result');
      const learningPathReturnNode = document.querySelector('#learning-path-return');
      const learningPathReturnLink = document.querySelector('#learning-path-return-link');
      let learningPathReturnHref = '';
      let shareStatusTimeout = null;
      let lastSearchTerm = '';
      const calculatorError = document.querySelector('#calculator-error');
      const calculatorErrorMessage = document.querySelector('#calculator-error-message');
      const calculatorRetryButton = document.querySelector('#calculator-retry-button');
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
      }

      calculatorRetryButton.addEventListener('click', () => {
        hideCalculatorError();
        lookupInput.value = lastSearchTerm;
        lookupForm.requestSubmit();
      });

      function configureLearningPathReturn() {
        const getLearningPathLevel = (pathname) => {
          const normalizedPath = String(pathname || '').toLowerCase();
          if (normalizedPath === '/gematria-name-analysis.html') {
            return 3;
          }
          if (normalizedPath === '/gematria-pattern-grouping.html') {
            return 2;
          }
          if (normalizedPath === '/gematria-basics.html') {
            return 1;
          }
          return null;
        };

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
          learningPathReturnHref = `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
          learningPathReturnLink.href = learningPathReturnHref;
          const level = getLearningPathLevel(returnUrl.pathname);
          learningPathReturnLink.textContent = level
            ? `Nice! Back to Level ${level}`
            : 'Nice! Back to lesson';
        } catch {
          // Ignore invalid return URL values.
        }
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
          await navigator.clipboard.writeText(sharePayload.url);
          setShareStatus('Share link copied to your clipboard.');
          return;
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
        callout.className = 'alert alert-info mt-2';

        const title = document.createElement('strong');
        title.textContent = 'Related word search is a free-member feature.';
        const details = document.createElement('p');
        details.className = 'mb-2';
        details.textContent = term
          ? `You calculated "${term}". Join as a free member to save this search and unlock related words.`
          : 'Join as a free member to save searches and unlock related word searching.';
        const cta = document.createElement('a');
        cta.className = 'btn btn-sm btn-primary';
        cta.href = '/member.html#registerForm';
        cta.textContent = 'Get Free Membership';

        callout.append(title, document.createElement('br'), details, cta);
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
      const FREE_MEMBERSHIP_SAVE_LIMIT = 3;
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
          if (memberSaveShell) {
            memberSaveShell.hidden = false;
          }
          if (memberLink) {
            memberLink.href = '/member.html#authSection';
            memberLink.textContent = 'Join for free';
            memberLink.classList.remove('btn-outline-primary');
            memberLink.classList.add('btn-primary');
          }
          saveHistoryButton.disabled = false;
          saveHistoryButton.textContent = 'Sign up to save';
          saveHistoryButton.classList.add('member-save-button--guest');
          createMembersOnlyPopover();
          memberSaveMeta.textContent = currentSearchPayload
            ? 'Join for free to save this result and see related words.'
            : 'Join for free to save searches and see related words.';
          if (lookupSubmitLabelNode) lookupSubmitLabelNode.textContent = 'Calculate';
          updateNextStepsState();
          syncSaveHistoryHint();
          return;
        }

        if (memberSaveShell) {
          memberSaveShell.hidden = false;
        }
        if (memberLink) {
          memberLink.href = '/member.html';
          memberLink.textContent = 'Go to My Dashboard';
          memberLink.classList.remove('btn-primary');
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

      async function requestGematria(word) {
        const searchParams = new URLSearchParams({ word });
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

      function createDefinitionLink(word, { trailingSeparator = '' } = {}) {
        const wrapper = document.createElement('span');
        wrapper.hidden = true;
        const definitionLink = document.createElement('a');
        definitionLink.className = 'definition-link';
        const returnTo = `${window.location.pathname}${window.location.search}`;
        const definitionParams = new URLSearchParams({ word, returnTo });
        definitionLink.href = `/definition?${definitionParams.toString()}`;
        definitionLink.target = '_blank';
        definitionLink.rel = 'noopener noreferrer';
        definitionLink.textContent = '(definition)';
        definitionLink.setAttribute('aria-label', `Definition for ${word}`);
        wrapper.appendChild(definitionLink);
        if (trailingSeparator) wrapper.appendChild(document.createTextNode(trailingSeparator));
        hasDefinition(word).then((exists) => {
          if (exists) wrapper.hidden = false;
        });
        return wrapper;
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

      async function enrichRelationshipWords(relationships, searchTotal) {
        return Promise.all(
          relationships.map(async (relationship) => {
            const words = Array.isArray(relationship.words) ? relationship.words : [];

            const wordsWithGematria = await Promise.all(
              words.map(async (word) => {
                try {
                  const gematria = await requestGematria(word);
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

      function runSearch(term, { refreshPage = false } = {}) {
        const normalizedTerm = String(term || '').trim();

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

      function createReverseLookupShareUrl(gematriaValue) {
        const shareUrl = new URL('/calculator.html', getCanonicalShareOrigin());
        shareUrl.searchParams.set('query', String(gematriaValue));
        shareUrl.hash = 'gematria-result';
        return shareUrl.toString();
      }

      function appendReverseLookupShareButton(payload) {
        const shareButton = document.createElement('button');
        shareButton.type = 'button';
        shareButton.className = 'btn btn-warning btn-sm fw-semibold share-action-button';
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
          disclaimer.textContent = '*  Gematria value matches are limited to the words currently in our database.';
          wrapper.appendChild(disclaimer);

          if (payload.count === 0) {
            const emptyState = document.createElement('p');
            emptyState.textContent = 'No words in the database currently match this gematria value.';
            wrapper.appendChild(emptyState);
          } else {
            const grid = document.createElement('div');
            grid.className = 'results-grid related-words-grid';
            payload.words.forEach((wordResult) => {
              grid.appendChild(createWordCard({ word: wordResult.word, gematria: wordResult }, payload.gematria));
            });
            wrapper.appendChild(grid);
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

      function createWordCard(wordResult, searchTotal) {
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

        header.append(wordLabel, createDefinitionLink(wordResult.word));
        card.appendChild(header);

        if (wordResult.gematria) {
          const payload = wordResult.gematria;
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

          const metaLine = document.createElement('div');
          metaLine.className = 'related-word-card-meta small text-muted';
          metaLine.append(
            createDigitalRootValueNode(payload.gematria.digitalRoot, 'Digital Root '),
            ' · ',
            createBaseRootStatusNode(payload.isBaseRoot),
            ' · ',
            formatSearchCount(payload.searchCount),
          );
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
        if (!isBaseRoot) return link;
        const wrapper = document.createElement('span');
        wrapper.className = 'meta-highlight';
        wrapper.appendChild(link);
        return wrapper;
      }

      function formatSearchCount(count) {
        const value = Number(count) || 0;
        return `${value} ${value === 1 ? 'search' : 'searches'}`;
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

      function getPerLetterValues(input) {
        return Array.from(String(input || '').toUpperCase())
          .filter((char) => char >= 'A' && char <= 'Z')
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

      function createPerLetterDetails(input) {
        const details = document.createElement('details');
        details.className = 'per-letter-details';
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

        const endpoints = [
          `/api/wordnikDefinition?word=${encodeURIComponent(normalizedWord)}`,
          `/.netlify/functions/wordnikDefinition?word=${encodeURIComponent(normalizedWord)}`,
        ];

        try {
          for (const endpoint of endpoints) {
            const response = await fetch(endpoint, {
              headers: { accept: 'application/json' },
            });

            if (!response.ok) {
              continue;
            }

            const payload = await response.json();
            const definitions = getDefinitionList(payload);
            const firstDefinition = definitions.find((definition) => extractDefinitionText(definition));
            const preview = stripHtmlTags(extractDefinitionText(firstDefinition));
            if (preview) {
              return preview;
            }
          }
        } catch (error) {
          return '';
        }

        return '';
      }

      async function createWordShareImageUrl(searchGematria) {
        const shareImageUrl = new URL('/.netlify/functions/calculator-share-image', getCanonicalShareOrigin());
        const query = String(searchGematria.word || '').trim();
        const definitionPreview = await fetchDefinitionPreview(query);

        shareImageUrl.searchParams.set('type', 'word');
        shareImageUrl.searchParams.set('query', query);
        shareImageUrl.searchParams.set('total', String(searchGematria.gematria?.total ?? ''));
        shareImageUrl.searchParams.set('digitalRoot', String(searchGematria.gematria?.digitalRoot ?? ''));
        shareImageUrl.searchParams.set('isBaseRoot', String(Boolean(searchGematria.isBaseRoot)));
        shareImageUrl.searchParams.set('definitionPreview', definitionPreview || 'Definition preview unavailable.');
        shareImageUrl.searchParams.set('perLetterValues', getPerLetterValuesLabel(query));

        return shareImageUrl;
      }

      function renderSearchGematriaSummary(searchGematria) {
        const shareButton = document.createElement('button');
        shareButton.type = 'button';
        shareButton.className = 'btn btn-warning btn-sm mt-2 fw-semibold share-action-button';
        shareButton.textContent = 'Share this lookup';
        shareButton.addEventListener('click', async () => {
          reportButtonEvent('share_button_click', { source: 'calculator_lookup' });
          const shareImageUrl = await createWordShareImageUrl(searchGematria);
          const shareUrl = createLookupShareUrl(searchGematria, shareImageUrl);
          await sharePage({
            title: `Gematria lookup for ${searchGematria.word}`,
            text: formatCalculationSharePreview(searchGematria.word, searchGematria.gematria.total),
            url: shareUrl,
            imageUrl: toShareImageAssetUrl(shareImageUrl.toString()),
          });
        });
        shareButton.classList.remove('mt-2');
        const downloadImageButton = document.createElement('button');
        downloadImageButton.type = 'button';
        downloadImageButton.className = 'btn btn-outline-warning btn-sm fw-semibold share-action-button';
        downloadImageButton.textContent = 'Download image';
        downloadImageButton.addEventListener('click', async () => {
          reportButtonEvent('image_download', { source: 'calculator_lookup' });
          try {
            const shareImageUrl = await createWordShareImageUrl(searchGematria);
            const sanitizedWord = String(searchGematria.word || 'lookup').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'lookup';
            await downloadShareImage(toShareImageAssetUrl(shareImageUrl.toString()), `gematria-${sanitizedWord}.jpg`);
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
        shareActions.append(shareButton, downloadImageButton);

        gematriaResult.append(
          promptLine,
          totalLine,
          metaLine,
          createPerLetterDetails(searchGematria.word),
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

        const term = lookupInput.value.trim();
        lastSearchTerm = term;
        hideCalculatorError();
        window.gematriaTracking?.track('calculator_usage_start', {
          source: 'calculator_lookup_form',
          queryLength: term.length,
        });
        if (!term) {
          lookupStatus.textContent = 'Please enter a word or phrase.';
          gematriaResult.textContent = '';
          relatedWordsResult.innerHTML = '';
          return;
        }

        if (/^\d+$/.test(term)) {
          const numericValue = Number(term);
          if (numericValue <= 0 || numericValue % 6 !== 0) {
            lookupStatus.textContent = '';
            showCalculatorError('Gematria values must be positive multiples of 6. Try a number like 6, 12, 18, 24, …');
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
          const searchGematria = await requestGematria(term);
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

      ['mouseenter', 'focus'].forEach((eventName) => {
        saveHistoryButton.addEventListener(eventName, () => {
          if (!memberSession?.authenticated) {
            showMembersOnlySaveMessage();
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
        }
      }

      saveHistoryButton.addEventListener('click', (event) => {
        if (!memberSession?.authenticated) {
          event.preventDefault();
          showMembersOnlySaveMessage();
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
            await runSearch(query);
          }
        } finally {
          hideCalculatorLoadingOverlay();
        }
      });
