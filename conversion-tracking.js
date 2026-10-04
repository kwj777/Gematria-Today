(function installConversionTracking() {
  if (typeof window === 'undefined' || window.__gematriaConversionTrackingInstalled) {
    return;
  }

  // The admin session cookie is HttpOnly, so it is invisible here; the server
  // sets the readable gematria_admin_flag alongside it for this check.
  function isAdminSession() {
    try {
      return document.cookie.split(';').some(function (c) {
        return c.trim().startsWith('gematria_admin_flag=');
      });
    } catch {
      return false;
    }
  }

  if (isAdminSession()) {
    return;
  }

  // cookie-consent.js (earlier in site-bundle.js) owns the consent rules. This
  // used to compare the stored value with the legacy 'accepted' string, which
  // the banner stopped writing when consent became a JSON object.
  function hasTrackingConsent() {
    try {
      return window.gematriaCookieConsent?.analyticsAllowed?.() === true;
    } catch {
      return false;
    }
  }

  if (!hasTrackingConsent()) {
    if (!window.__gematriaConversionTrackingPending) {
      window.__gematriaConversionTrackingPending = true;
      // Not `once`: a Decline must not use up the listener, or allowing
      // analytics later from Cookie settings would never start tracking.
      window.addEventListener('gematria:cookie-consent', function onConsentEvent(e) {
        if (!e.detail || !e.detail.analytics) {
          return;
        }
        window.removeEventListener('gematria:cookie-consent', onConsentEvent);
        window.__gematriaConversionTrackingPending = false;
        installConversionTracking();
      });
    }
    return;
  }

  window.__gematriaConversionTrackingInstalled = true;

  function createSessionId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  const TRACKING_SESSION_KEY = 'gematria_tracking_session_id';

  function getStoredSessionId() {
    try {
      return window.sessionStorage.getItem(TRACKING_SESSION_KEY);
    } catch {
      return null;
    }
  }

  function persistSessionId(sessionId) {
    try {
      window.sessionStorage.setItem(TRACKING_SESSION_KEY, sessionId);
    } catch {
      // Ignore storage failures (Safari private mode / restricted WebView).
    }
  }

  const storedSessionId = getStoredSessionId();
  const trackingSessionId = storedSessionId || createSessionId();

  if (!storedSessionId) {
    persistSessionId(trackingSessionId);
  }

  const REPORTABLE_ACTIONS = new Set(['image_download']);

  function normalizeActionName(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    return /^[a-z0-9_]{2,80}$/.test(normalized) ? normalized : null;
  }

  function shouldReportAction(actionName) {
    return Boolean(actionName) && (actionName.endsWith('_click') || REPORTABLE_ACTIONS.has(actionName));
  }

  // Page URLs can carry one-time secrets (account-recovery.html?recovery_code=…)
  // and these reports land in the admin-visible audit log, so only the origin
  // and path of a URL are ever reported.
  function withoutQuery(url) {
    try {
      const parsed = new URL(url, window.location.href);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return '';
    }
  }

  function currentPageUrl() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  function currentReferrer() {
    return document.referrer ? withoutQuery(document.referrer) : '';
  }

  function reportButtonEvent(action, metadata = {}) {
    const normalizedAction = normalizeActionName(action);
    // Re-checked per event so withdrawing consent from Cookie settings takes
    // effect without a reload.
    if (!shouldReportAction(normalizedAction) || !hasTrackingConsent()) {
      return;
    }

    const payload = {
      route: window.location.pathname,
      action: normalizedAction,
      metadata,
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

  function normalizeText(value) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    return normalized.slice(0, 120);
  }

  function buildCssSelector(element) {
    if (!(element instanceof Element)) {
      return '';
    }
    if (element.id) {
      return `#${element.id}`;
    }

    const segments = [];
    let node = element;
    while (node instanceof Element && node !== document.body && segments.length < 5) {
      const tag = node.tagName.toLowerCase();
      const classSegment = String(node.className || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((className) => `.${className.replace(/[^a-z0-9_-]/gi, '')}`)
        .join('');
      const siblingIndex = node.parentElement
        ? Array.from(node.parentElement.children).filter((child) => child.tagName === node.tagName).indexOf(node) + 1
        : 1;
      segments.unshift(`${tag}${classSegment}:nth-of-type(${Math.max(siblingIndex, 1)})`);
      node = node.parentElement;
    }
    return segments.join(' > ').slice(0, 240);
  }

  function track(eventName, properties = {}) {
    if (!hasTrackingConsent()) {
      return null;
    }

    const payload = {
      event: eventName,
      timestamp: new Date().toISOString(),
      pagePath: window.location.pathname,
      pageUrl: currentPageUrl(),
      referrer: currentReferrer(),
      trackingSessionId,
      ...properties,
    };

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);

    window.dispatchEvent(new CustomEvent('gematria:track', { detail: payload }));
    reportButtonEvent(payload.event, payload);
    return payload;
  }

  window.document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('a, button') : null;
    if (!target) {
      return;
    }

    const source = normalizeText(
      target.getAttribute('data-track-source')
      || target.getAttribute('aria-label')
      || target.textContent
      || target.id
      || target.className
    );
    const destination = target instanceof HTMLAnchorElement ? (target.getAttribute('href') || '') : '';
    const action = target.getAttribute('data-track-action') || 'sitewide_element_click';
    const elementId = normalizeText(target.id || '');
    const elementSelector = normalizeText(buildCssSelector(target));
    const elementLink = elementId
      ? `${currentPageUrl()}#${encodeURIComponent(elementId)}`
      : currentPageUrl();

    reportButtonEvent(action, {
      source: source || 'unknown',
      destination: normalizeText(destination),
      elementType: target.tagName.toLowerCase(),
      elementId,
      elementSelector,
      elementLink,
      pagePath: window.location.pathname,
      pageUrl: currentPageUrl(),
      referrer: currentReferrer(),
      trackingSessionId,
      timestamp: new Date().toISOString(),
    });
  }, { capture: true });

  window.gematriaTracking = {
    sessionId: trackingSessionId,
    track,
  };
})();
