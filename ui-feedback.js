(function installGlobalLoadingFeedback() {
  if (typeof window === 'undefined' || window.__globalLoadingFeedbackInstalled || typeof window.fetch !== 'function') {
    return;
  }

  window.__globalLoadingFeedbackInstalled = true;

  function normalizeTrackValue(value, maxLength = 160) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  function reportSitewideElementClick(event) {
    if (window.gematriaTracking?.track) {
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
      // Tapping a dropdown toggle (Tools, Learn) should expand its submenu,
      // not collapse the entire mobile nav. Skip those clicks.
      if (link.classList.contains('dropdown-toggle') ||
          link.getAttribute('data-bs-toggle') === 'dropdown') {
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

(function installToastPrimitive() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  if (window.__toastPrimitiveInstalled) {
    return;
  }
  window.__toastPrimitiveInstalled = true;

  const AUTO_DISMISS_MS = 6000;
  const TONES = new Set(['success', 'danger', 'warning', 'info']);
  let container = null;
  let stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) {
      return;
    }
    stylesInjected = true;
    const style = document.createElement('style');
    style.setAttribute('data-toast-primitive', 'true');
    style.textContent = [
      '.ui-toast-container{position:fixed;top:1rem;right:1rem;z-index:1080;display:flex;flex-direction:column;gap:0.5rem;max-width:min(22rem,calc(100vw - 2rem));pointer-events:none;}',
      '.ui-toast{pointer-events:auto;background:var(--bs-body-bg,#fff);color:var(--bs-body-color,#212529);border:1px solid rgba(0,0,0,0.1);border-left:4px solid var(--bs-info,#0dcaf0);border-radius:0.375rem;box-shadow:0 0.5rem 1rem rgba(0,0,0,0.15);padding:0.75rem 0.75rem 0.75rem 1rem;display:flex;align-items:flex-start;gap:0.5rem;animation:ui-toast-in 160ms ease-out;}',
      '.ui-toast--success{border-left-color:var(--bs-success,#198754);}',
      '.ui-toast--danger{border-left-color:var(--bs-danger,#dc3545);}',
      '.ui-toast--warning{border-left-color:var(--bs-warning,#ffc107);}',
      '.ui-toast--info{border-left-color:var(--bs-info,#0dcaf0);}',
      '.ui-toast__message{flex:1;font-size:0.9rem;line-height:1.35;}',
      '.ui-toast__close{background:transparent;border:0;font-size:1.25rem;line-height:1;padding:0 0.25rem;color:inherit;opacity:0.6;cursor:pointer;}',
      '.ui-toast__close:hover,.ui-toast__close:focus{opacity:1;}',
      '.ui-toast--leaving{animation:ui-toast-out 160ms ease-in forwards;}',
      '@keyframes ui-toast-in{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:translateY(0);}}',
      '@keyframes ui-toast-out{from{opacity:1;transform:translateY(0);}to{opacity:0;transform:translateY(-8px);}}',
      '@media (prefers-reduced-motion: reduce){.ui-toast,.ui-toast--leaving{animation:none;}}',
    ].join('');
    document.head.appendChild(style);
  }

  function ensureContainer() {
    if (container && document.body.contains(container)) {
      return container;
    }
    container = document.createElement('div');
    container.className = 'ui-toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(container);
    return container;
  }

  function dismiss(toast) {
    if (!toast || toast.dataset.leaving === 'true') {
      return;
    }
    toast.dataset.leaving = 'true';
    toast.classList.add('ui-toast--leaving');
    const cleanup = () => toast.remove();
    toast.addEventListener('animationend', cleanup, { once: true });
    window.setTimeout(cleanup, 240);
  }

  function show(message, tone = 'info', options = {}) {
    const text = String(message == null ? '' : message).trim();
    if (!text) {
      return null;
    }
    const safeTone = TONES.has(tone) ? tone : 'info';

    injectStyles();
    const host = ensureContainer();

    const toast = document.createElement('div');
    toast.className = `ui-toast ui-toast--${safeTone}`;
    toast.setAttribute('role', safeTone === 'danger' ? 'alert' : 'status');
    toast.setAttribute('aria-live', safeTone === 'danger' ? 'assertive' : 'polite');

    const msgEl = document.createElement('div');
    msgEl.className = 'ui-toast__message';
    msgEl.textContent = text;
    toast.appendChild(msgEl);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ui-toast__close';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => dismiss(toast));
    toast.appendChild(closeBtn);

    host.appendChild(toast);

    const explicitMs = typeof options.autoDismiss === 'number' ? options.autoDismiss : null;
    const shouldAutoDismiss = options.autoDismiss !== false
      && (explicitMs !== null ? explicitMs > 0 : safeTone !== 'danger');
    if (shouldAutoDismiss) {
      window.setTimeout(() => dismiss(toast), explicitMs !== null ? explicitMs : AUTO_DISMISS_MS);
    }

    return toast;
  }

  window.showToast = show;
  window.dismissToast = dismiss;
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
