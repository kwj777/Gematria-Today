(function installCookieConsent() {
  if (typeof window === 'undefined' || window.__gematriaCookieConsentInstalled) {
    return;
  }

  window.__gematriaCookieConsentInstalled = true;

  var CONSENT_KEY = 'gematria_cookie_consent';
  var LEGACY_CONSENT_KEY = 'endtimes_cookie_consent';
  var CONSENT_MODE_REGIONS = Array.isArray(window.GEMATRIA_CONSENT_MODE_REGIONS)
    ? window.GEMATRIA_CONSENT_MODE_REGIONS
    : [
        'AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IS',
        'IT', 'LI', 'LT', 'LU', 'LV', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'GB',
      ];

  function getConsent() {
    try {
      var current = window.localStorage.getItem(CONSENT_KEY);
      if (current !== null) {
        return current;
      }
      var legacy = window.localStorage.getItem(LEGACY_CONSENT_KEY);
      if (legacy !== null) {
        // Migrate legacy value forward, best-effort.
        try {
          window.localStorage.setItem(CONSENT_KEY, legacy);
          window.localStorage.removeItem(LEGACY_CONSENT_KEY);
        } catch (e) {
          // Ignore migration write failures.
        }
        return legacy;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function setConsent(value) {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch (e) {
      // Ignore storage failures (private mode, quota, etc).
    }
    try {
      window.localStorage.removeItem(LEGACY_CONSENT_KEY);
    } catch (e) {
      // Ignore failures clearing the legacy key.
    }
  }

  function isRegionScopedForBanner() {
    try {
      var timeZone = String((Intl.DateTimeFormat && Intl.DateTimeFormat().resolvedOptions().timeZone) || '');
      if (!timeZone) {
        return true;
      }

      if (timeZone.indexOf('Europe/') === 0) {
        return true;
      }

      return ['Atlantic/Canary', 'Atlantic/Faroe', 'Atlantic/Madeira', 'Atlantic/Reykjavik'].indexOf(timeZone) !== -1;
    } catch (e) {
      return true;
    }
  }

  function isAdminSession() {
    try {
      return document.cookie.split(';').some(function (c) {
        var trimmed = c.trim();
        return trimmed.startsWith('gematria_admin_session=')
          || trimmed.startsWith('endtimes_admin_session=');
      });
    } catch (e) {
      return false;
    }
  }

  function applyConsentMode(accepted) {
    if (window.__gematriaGoogleAnalyticsEnabled !== true || typeof window.gtag !== 'function') {
      return;
    }

    var status = accepted ? 'granted' : 'denied';
    window.gtag('consent', 'update', {
      analytics_storage: status,
      ad_storage: status,
      ad_user_data: status,
      ad_personalization: status,
      region: CONSENT_MODE_REGIONS,
    });
  }

  function fireConsentEvent(accepted) {
    try {
      window.dispatchEvent(
        new CustomEvent('gematria:cookie-consent', {
          detail: { accepted: accepted },
          bubbles: false,
        })
      );
    } catch (e) {
      // Ignore event dispatch failures.
    }
  }

  function hideBanner(banner) {
    banner.setAttribute('aria-hidden', 'true');
    banner.classList.remove('cookie-consent-banner--visible');
    setTimeout(function () {
      if (banner.parentNode) {
        banner.parentNode.removeChild(banner);
      }
    }, 300);
  }

  function showBanner() {
    var banner = document.createElement('div');
    banner.id = 'cookieConsentBanner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-modal', 'false');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.setAttribute('aria-live', 'polite');
    banner.className = 'cookie-consent-banner';

    banner.innerHTML =
      '<div class="cookie-consent-inner">' +
      '<p class="cookie-consent-text">' +
      'We use analytics cookies to understand anonymous site usage and improve the experience. ' +
      '<a href="/privacy.html" class="cookie-consent-link">Privacy Policy</a>' +
      '</p>' +
      '<div class="cookie-consent-actions">' +
      '<button id="cookieConsentAccept" class="cookie-consent-btn cookie-consent-btn--accept" type="button">Accept</button>' +
      '<button id="cookieConsentDecline" class="cookie-consent-btn cookie-consent-btn--decline" type="button">Decline</button>' +
      '</div>' +
      '</div>';

    document.body.appendChild(banner);

    // Trigger slide-in on next frame so the CSS transition fires.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        banner.classList.add('cookie-consent-banner--visible');
      });
    });

    document.getElementById('cookieConsentAccept').addEventListener('click', function () {
      setConsent('accepted');
      applyConsentMode(true);
      fireConsentEvent(true);
      hideBanner(banner);
    });

    document.getElementById('cookieConsentDecline').addEventListener('click', function () {
      setConsent('declined');
      applyConsentMode(false);
      fireConsentEvent(false);
      hideBanner(banner);
    });
  }

  // Expose a minimal read-only API for other scripts.
  window.gematriaCookieConsent = Object.freeze({
    getConsent: getConsent,
    CONSENT_KEY: CONSENT_KEY,
    consentModeRegions: CONSENT_MODE_REGIONS.slice(),
  });

  var savedConsent = getConsent();
  if (savedConsent === 'accepted') {
    applyConsentMode(true);
  } else if (savedConsent === 'declined') {
    applyConsentMode(false);
  }

  // Skip for admin sessions, out-of-scope regions, or when the user has already decided.
  if (isAdminSession() || !isRegionScopedForBanner() || savedConsent !== null) {
    return;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBanner, { once: true });
  } else {
    showBanner();
  }
})();
