(function installConversionTracking() {
  if (typeof window === 'undefined' || window.__endTimesConversionTrackingInstalled) {
    return;
  }

  window.__endTimesConversionTrackingInstalled = true;

  function isAdminSession() {
    try {
      return document.cookie.split(';').some(function (c) {
        return c.trim().startsWith('endtimes_admin_session=');
      });
    } catch {
      return false;
    }
  }

  if (isAdminSession()) {
    return;
  }

  function createSessionId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  const TRACKING_SESSION_KEY = 'endtimes_tracking_session_id';

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

  function reportButtonEvent(action, metadata = {}) {
    const normalizedAction = normalizeActionName(action);
    if (!shouldReportAction(normalizedAction)) {
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

  function track(eventName, properties = {}) {
    const payload = {
      event: eventName,
      timestamp: new Date().toISOString(),
      pagePath: window.location.pathname,
      pageUrl: window.location.href,
      referrer: document.referrer || '',
      trackingSessionId,
      ...properties,
    };

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);

    window.dispatchEvent(new CustomEvent('endtimes:track', { detail: payload }));
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

    reportButtonEvent(action, {
      source: source || 'unknown',
      destination: normalizeText(destination),
      elementType: target.tagName.toLowerCase(),
      pagePath: window.location.pathname,
      pageUrl: window.location.href,
      referrer: document.referrer || '',
      trackingSessionId,
      timestamp: new Date().toISOString(),
    });
  }, { capture: true });

  window.endTimesTracking = {
    sessionId: trackingSessionId,
    track,
  };
})();
