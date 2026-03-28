(function installConversionTracking() {
  if (typeof window === 'undefined' || window.__endTimesConversionTrackingInstalled) {
    return;
  }

  window.__endTimesConversionTrackingInstalled = true;

  function createSessionId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  const TRACKING_SESSION_KEY = 'endtimes_tracking_session_id';
  const storedSessionId = window.sessionStorage.getItem(TRACKING_SESSION_KEY);
  const trackingSessionId = storedSessionId || createSessionId();

  if (!storedSessionId) {
    window.sessionStorage.setItem(TRACKING_SESSION_KEY, trackingSessionId);
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
    return payload;
  }

  window.endTimesTracking = {
    sessionId: trackingSessionId,
    track,
  };
})();
