(function installGlobalLoadingFeedback() {
  if (typeof window === 'undefined' || window.__globalLoadingFeedbackInstalled || typeof window.fetch !== 'function') {
    return;
  }

  window.__globalLoadingFeedbackInstalled = true;

  const SHOW_DELAY_MS = 200;
  let pendingRequests = 0;
  let manualRequests = 0;
  let showTimer = null;

  function ensureOverlay() {
    let overlay = document.getElementById('globalLoadingOverlay');
    if (overlay) {
      return overlay;
    }

    overlay = document.createElement('div');
    overlay.id = 'globalLoadingOverlay';
    overlay.className = 'global-loading-overlay';
    overlay.setAttribute('aria-live', 'polite');
    overlay.setAttribute('aria-busy', 'true');
    overlay.innerHTML = [
      '<div class="global-loading-overlay__card" role="status" aria-label="Loading">',
      '  <div class="global-loading-overlay__spinner" aria-hidden="true"></div>',
      '  <p class="global-loading-overlay__text">Working… Please wait.</p>',
      '</div>',
    ].join('');

    document.body.appendChild(overlay);
    return overlay;
  }

  function showOverlay() {
    const overlay = ensureOverlay();
    overlay.classList.add('global-loading-overlay--visible');
  }

  function hideOverlay() {
    const overlay = document.getElementById('globalLoadingOverlay');
    if (!overlay) {
      return;
    }
    overlay.classList.remove('global-loading-overlay--visible');
  }

  function hasPendingWork() {
    return pendingRequests + manualRequests > 0;
  }

  function startLoading() {
    pendingRequests += 1;
    if (pendingRequests === 1) {
      showTimer = window.setTimeout(() => {
        if (pendingRequests > 0) {
          showOverlay();
        }
      }, SHOW_DELAY_MS);
    }
  }

  function stopLoading() {
    pendingRequests = Math.max(0, pendingRequests - 1);
    if (hasPendingWork()) {
      return;
    }

    window.clearTimeout(showTimer);
    showTimer = null;
    hideOverlay();
  }

  window.showWorkingOverlay = function showWorkingOverlay() {
    manualRequests += 1;
    showOverlay();
  };

  window.hideWorkingOverlay = function hideWorkingOverlay() {
    manualRequests = Math.max(0, manualRequests - 1);
    if (!hasPendingWork()) {
      hideOverlay();
    }
  };

  const nativeFetch = window.fetch.bind(window);

  window.fetch = function trackedFetch(input, init = {}) {
    const explicitLoadingSetting = init && typeof init.globalLoading === 'boolean' ? init.globalLoading : null;
    const requestMethod = (init && init.method ? init.method : 'GET').toUpperCase();
    const shouldTrack = explicitLoadingSetting !== null ? explicitLoadingSetting : requestMethod !== 'GET';
    const shouldSkip = !shouldTrack;
    if (shouldSkip) {
      return nativeFetch(input, init);
    }

    startLoading();
    return nativeFetch(input, init).finally(stopLoading);
  };
})();
