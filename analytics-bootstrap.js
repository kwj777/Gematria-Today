(() => {
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }

  const gaMeasurementId = 'G-E611H84D6Y';
  const consentModeRegions = ['AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'GB'];

  function isLocalDevelopmentHost(hostname) {
    if (!hostname) {
      return false;
    }

    const normalized = String(hostname).trim().toLowerCase();
    return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized.endsWith('.localhost');
  }

  function isGoogleAnalyticsEnabled() {
    if (isLocalDevelopmentHost(window.location && window.location.hostname)) {
      return false;
    }

    if (window.SITE_MODULE_OVERRIDES && window.SITE_MODULE_OVERRIDES.google_analytics === false) {
      return false;
    }

    try {
      const stored = window.localStorage.getItem('gematria.siteModules');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.google_analytics === false) {
          return false;
        }
      }
    } catch (_error) {
      // Ignore storage parse errors.
    }

    try {
      const moduleParam = new URLSearchParams(window.location.search).get('modules');
      if (moduleParam) {
        const requested = moduleParam.split(',').map((entry) => String(entry).trim().toLowerCase()).filter(Boolean);
        return requested.includes('google_analytics');
      }
    } catch (_error) {
      // Ignore URL parsing errors.
    }

    return true;
  }

  const googleAnalyticsEnabled = isGoogleAnalyticsEnabled();
  window.__gematriaGoogleAnalyticsEnabled = googleAnalyticsEnabled;

  if (!googleAnalyticsEnabled) {
    window[`ga-disable-${gaMeasurementId}`] = true;
    return;
  }

  window.GEMATRIA_CONSENT_MODE_REGIONS = consentModeRegions;

  gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
  });

  gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: 500,
    region: consentModeRegions,
  });

  function initializeGoogleAnalytics() {
    if (window.__gematriaGoogleAnalyticsInitialized) {
      return;
    }

    window.__gematriaGoogleAnalyticsInitialized = true;

    const gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaMeasurementId)}`;
    gaScript.setAttribute('fetchpriority', 'low');
    document.head.appendChild(gaScript);

    gtag('js', new Date());
    gtag('config', gaMeasurementId);
  }
  initializeGoogleAnalytics();
})();
