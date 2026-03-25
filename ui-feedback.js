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

(function installAdminNavVisibility() {
  if (typeof window === 'undefined' || window.__adminNavVisibilityInstalled || typeof document === 'undefined') {
    return;
  }

  window.__adminNavVisibilityInstalled = true;

  const ADMIN_CHECK_PATH = '/api/admin-session';

  function getNavMenu() {
    return document.querySelector('#siteNav .navbar-nav');
  }

  function hasAdminLink(navMenu) {
    return Boolean(navMenu && navMenu.querySelector('a[href="/admin.html"]'));
  }

  function appendAdminLink() {
    const navMenu = getNavMenu();
    if (!navMenu || hasAdminLink(navMenu)) {
      return;
    }

    const item = document.createElement('li');
    item.className = 'nav-item';

    const link = document.createElement('a');
    link.className = 'nav-link';
    link.href = '/admin.html';
    link.textContent = 'Admin';

    item.appendChild(link);
    navMenu.appendChild(item);
  }

  async function revealAdminLinkWhenAuthenticated() {
    if (window.location.pathname === '/admin.html') {
      return;
    }

    try {
      const response = await window.fetch(ADMIN_CHECK_PATH, {
        method: 'GET',
        credentials: 'same-origin',
        globalLoading: false,
      });

      if (!response.ok) {
        return;
      }

      appendAdminLink();
    } catch (_error) {
      // Ignore connectivity/auth check errors to keep public nav rendering stable.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', revealAdminLinkWhenAuthenticated, { once: true });
    return;
  }

  revealAdminLinkWhenAuthenticated();
})();
