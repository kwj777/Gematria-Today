(function installGlobalLoadingFeedback() {
  if (typeof window === 'undefined' || window.__globalLoadingFeedbackInstalled || typeof window.fetch !== 'function') {
    return;
  }

  window.__globalLoadingFeedbackInstalled = true;

  function normalizeTrackValue(value, maxLength = 160) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  function reportSitewideElementClick(event) {
    if (window.endTimesTracking?.track) {
      return;
    }

    const target = event.target instanceof Element ? event.target.closest('a, button') : null;
    if (!target) {
      return;
    }

    const source = normalizeTrackValue(
      target.getAttribute('data-track-source')
      || target.getAttribute('aria-label')
      || target.textContent
      || target.id
      || target.className
      || 'unknown'
    );
    const href = target instanceof HTMLAnchorElement ? normalizeTrackValue(target.getAttribute('href')) : '';

    const payload = {
      route: window.location.pathname,
      action: target.getAttribute('data-track-action') || 'sitewide_element_click',
      metadata: {
        source,
        href,
        elementType: target.tagName.toLowerCase(),
        pagePath: window.location.pathname,
      },
    };
    const requestBody = JSON.stringify(payload);

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const sent = navigator.sendBeacon('/api/public-button-report', new Blob([requestBody], { type: 'application/json' }));
        if (sent) {
          return;
        }
      }
    } catch {
      // Fall back to fetch when sendBeacon is unavailable.
    }

    fetch('/api/public-button-report', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: requestBody,
    }).catch(() => {});
  }

  window.document.addEventListener('click', reportSitewideElementClick, { capture: true });

  const workingOverlayAllowedPages = new Set(['/calculator.html', '/namecalculator.html']);
  const currentPath = (window.location && window.location.pathname ? window.location.pathname : '').toLowerCase();
  const isWorkingOverlayPage = workingOverlayAllowedPages.has(currentPath);

  if (!isWorkingOverlayPage) {
    window.showWorkingOverlay = function showWorkingOverlay() {};
    window.hideWorkingOverlay = function hideWorkingOverlay() {};
    return;
  }

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

(function addFooterHomeLink() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  function isHomePage() {
    const path = String(window.location.pathname || '').split('?')[0].split('#')[0];
    return path === '/' || path === '' || path === '/index.html' || path === '/index';
  }

  function apply() {
    if (isHomePage()) {
      return;
    }
    const footer = document.querySelector('footer.site-footer');
    if (!footer) {
      return;
    }
    if (footer.querySelector('[data-footer-home-link]')) {
      return;
    }
    const topRow = footer.querySelector('.d-flex.justify-content-between')
      || footer.querySelector('.container > div:first-child');
    if (!topRow) {
      return;
    }
    const link = document.createElement('a');
    link.href = '/index.html';
    link.textContent = 'Back to home ↑';
    link.className = 'text-decoration-none footer-home-link';
    link.setAttribute('data-footer-home-link', 'true');
    topRow.appendChild(link);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }
})();

(function installPasswordVisibilityToggle() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  function handleClick(event) {
    const button = event.target instanceof Element ? event.target.closest('[data-password-toggle]') : null;
    if (!button) {
      return;
    }
    const targetId = button.getAttribute('data-password-toggle');
    const input = targetId ? document.getElementById(targetId) : null;
    if (!input) {
      return;
    }
    const isHidden = input.getAttribute('type') === 'password';
    input.setAttribute('type', isHidden ? 'text' : 'password');
    button.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
    button.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    button.textContent = isHidden ? 'Hide' : 'Show';
  }

  document.addEventListener('click', handleClick);
})();

(function highlightActiveNavLink() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  function normalize(pathname) {
    if (!pathname) {
      return '/index.html';
    }
    let path = String(pathname).split('?')[0].split('#')[0];
    if (path === '/' || path === '') {
      return '/index.html';
    }
    if (path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    if (!path.includes('.') && !path.endsWith('.html')) {
      path = `${path}.html`;
    }
    return path;
  }

  function apply() {
    const current = normalize(window.location.pathname);
    const links = document.querySelectorAll(
      '.navbar .nav-link[href], .navbar .dropdown-item[href]',
    );
    links.forEach((link) => {
      const href = link.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
        return;
      }
      const target = normalize(href);
      const isActive = target === current;
      link.classList.toggle('active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else if (link.getAttribute('aria-current') === 'page') {
        link.removeAttribute('aria-current');
      }
    });

    document.querySelectorAll('.navbar .dropdown-toggle').forEach((toggle) => {
      const dropdown = toggle.closest('.dropdown');
      const hasActiveChild = Boolean(dropdown && dropdown.querySelector('.dropdown-item.active'));
      toggle.classList.toggle('active', hasActiveChild);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }
})();

(function autoCloseMobileNavOnLinkTap() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const LG_BREAKPOINT = 992;

  function wire() {
    const collapse = document.querySelector('.navbar .navbar-collapse');
    if (!collapse) {
      return;
    }
    collapse.addEventListener('click', (event) => {
      if (window.innerWidth >= LG_BREAKPOINT) {
        return;
      }
      const link = event.target.closest('a.nav-link, a.dropdown-item');
      if (!link || !collapse.classList.contains('show')) {
        return;
      }
      const toggler = document.querySelector('.navbar .navbar-toggler');
      if (toggler) {
        toggler.click();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once: true });
  } else {
    wire();
  }
})();

(function installBackToTopButton() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  if (window.__backToTopInstalled) {
    return;
  }
  window.__backToTopInstalled = true;

  const SHOW_THRESHOLD_PX = 600;

  function create() {
    if (document.querySelector('.back-to-top-button')) {
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'back-to-top-button';
    btn.setAttribute('aria-label', 'Back to top');
    btn.hidden = true;
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="18 15 12 9 6 15"></polyline></svg>';
    btn.addEventListener('click', () => {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
    });
    document.body.appendChild(btn);

    let ticking = false;
    function syncVisibility() {
      const shouldShow = window.scrollY > SHOW_THRESHOLD_PX;
      if (shouldShow === !btn.hidden) {
        ticking = false;
        return;
      }
      btn.hidden = !shouldShow;
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(syncVisibility);
    }, { passive: true });
    syncVisibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', create, { once: true });
  } else {
    create();
  }
})();
