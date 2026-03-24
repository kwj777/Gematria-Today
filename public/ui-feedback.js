(function installGlobalLoadingFeedback() {
  if (typeof window === 'undefined' || window.__globalLoadingFeedbackInstalled || typeof window.fetch !== 'function') {
    return;
  }

  window.__globalLoadingFeedbackInstalled = true;

  const SHOW_DELAY_MS = 200;
  let pendingRequests = 0;
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
    if (pendingRequests > 0) {
      return;
    }

    window.clearTimeout(showTimer);
    showTimer = null;
    hideOverlay();
  }

  const nativeFetch = window.fetch.bind(window);

  window.fetch = function trackedFetch(input, init = {}) {
    const shouldSkip = Boolean(init && init.globalLoading === false);
    if (shouldSkip) {
      return nativeFetch(input, init);
    }

    startLoading();
    return nativeFetch(input, init).finally(stopLoading);
  };
})();
