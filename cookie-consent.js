(function installCookieConsent() {
  if (typeof window === 'undefined' || window.__gematriaCookieConsentInstalled) {
    return;
  }

  window.__gematriaCookieConsentInstalled = true;

  var CONSENT_KEY = 'gematria_cookie_consent';
  var CONSENT_MODE_REGIONS = Array.isArray(window.GEMATRIA_CONSENT_MODE_REGIONS)
    ? window.GEMATRIA_CONSENT_MODE_REGIONS
    : [
        'AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IS',
        'IT', 'LI', 'LT', 'LU', 'LV', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'GB',
      ];

  function getConsent() {
    try {
      return window.localStorage.getItem(CONSENT_KEY);
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
  }

  // Legacy values were the strings 'accepted' / 'declined'; new storage is a
  // JSON object {a:0|1, m:0|1} so analytics and advertising can be toggled
  // independently (EDPB/ICO guidance: categories must be separately consentable).
  function parseConsent(raw) {
    if (!raw) return null;
    if (raw === 'accepted') return { analytics: true, advertising: true };
    if (raw === 'declined') return { analytics: false, advertising: false };
    try {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { analytics: !!parsed.a, advertising: !!parsed.m };
      }
    } catch (e) {
      // Fall through and treat as null (re-prompt).
    }
    return null;
  }

  function serializeConsent(prefs) {
    return JSON.stringify({ a: prefs.analytics ? 1 : 0, m: prefs.advertising ? 1 : 0 });
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
        return c.trim().startsWith('gematria_admin_session=');
      });
    } catch (e) {
      return false;
    }
  }

  function applyConsentMode(prefs) {
    if (window.__gematriaGoogleAnalyticsEnabled !== true || typeof window.gtag !== 'function') {
      return;
    }

    var analyticsStatus = prefs.analytics ? 'granted' : 'denied';
    var advertisingStatus = prefs.advertising ? 'granted' : 'denied';
    window.gtag('consent', 'update', {
      analytics_storage: analyticsStatus,
      ad_storage: advertisingStatus,
      ad_user_data: advertisingStatus,
      ad_personalization: advertisingStatus,
      region: CONSENT_MODE_REGIONS,
    });
  }

  function fireConsentEvent(prefs) {
    try {
      window.dispatchEvent(
        new CustomEvent('gematria:cookie-consent', {
          detail: {
            // `accepted` is preserved for any legacy listener that only cared
            // about the binary signal; new code should read prefs.
            accepted: prefs.analytics || prefs.advertising,
            analytics: prefs.analytics,
            advertising: prefs.advertising,
          },
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

  function persistAndApply(banner, prefs) {
    setConsent(serializeConsent(prefs));
    applyConsentMode(prefs);
    fireConsentEvent(prefs);
    hideBanner(banner);
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
      'We use Google Analytics to measure anonymous site usage. Decline all, accept all, or open <em>Customize</em> to pick analytics and advertising independently. ' +
      '<a href="/privacy.html" class="cookie-consent-link">Privacy Policy</a>' +
      '</p>' +
      '<div class="cookie-consent-actions">' +
      '<button id="cookieConsentDecline" class="cookie-consent-btn cookie-consent-btn--decline" type="button" aria-label="Decline analytics and advertising cookies">Decline all</button>' +
      '<button id="cookieConsentCustomize" class="cookie-consent-btn cookie-consent-btn--customize" type="button" aria-expanded="false" aria-controls="cookieConsentOptions">Customize</button>' +
      '<button id="cookieConsentAccept" class="cookie-consent-btn cookie-consent-btn--accept" type="button" aria-label="Accept analytics and advertising cookies">Accept all</button>' +
      '</div>' +
      '<div id="cookieConsentOptions" class="cookie-consent-options" hidden>' +
      '<label class="cookie-consent-option">' +
      '<input type="checkbox" id="cookieConsentAnalytics" />' +
      '<span><strong>Analytics</strong> — anonymous page-view counts that help us see which pages are useful.</span>' +
      '</label>' +
      '<label class="cookie-consent-option">' +
      '<input type="checkbox" id="cookieConsentAdvertising" />' +
      '<span><strong>Advertising</strong> — personalization signals reserved for any future ad delivery (none today).</span>' +
      '</label>' +
      '<div class="cookie-consent-options__actions">' +
      '<button id="cookieConsentSave" class="cookie-consent-btn cookie-consent-btn--save" type="button">Save my choices</button>' +
      '</div>' +
      '</div>' +
      '</div>';

    document.body.appendChild(banner);

    // Trigger slide-in on next frame so the CSS transition fires.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        banner.classList.add('cookie-consent-banner--visible');
      });
    });

    var acceptBtn = document.getElementById('cookieConsentAccept');
    var declineBtn = document.getElementById('cookieConsentDecline');
    var customizeBtn = document.getElementById('cookieConsentCustomize');
    var saveBtn = document.getElementById('cookieConsentSave');
    var optionsPanel = document.getElementById('cookieConsentOptions');
    var analyticsBox = document.getElementById('cookieConsentAnalytics');
    var advertisingBox = document.getElementById('cookieConsentAdvertising');

    acceptBtn.addEventListener('click', function () {
      persistAndApply(banner, { analytics: true, advertising: true });
    });

    declineBtn.addEventListener('click', function () {
      persistAndApply(banner, { analytics: false, advertising: false });
    });

    customizeBtn.addEventListener('click', function () {
      var expanded = customizeBtn.getAttribute('aria-expanded') === 'true';
      if (expanded) {
        customizeBtn.setAttribute('aria-expanded', 'false');
        optionsPanel.hidden = true;
      } else {
        customizeBtn.setAttribute('aria-expanded', 'true');
        optionsPanel.hidden = false;
        // Move focus into the panel so keyboard users land somewhere meaningful.
        try { analyticsBox.focus(); } catch (e) { /* ignore */ }
      }
    });

    saveBtn.addEventListener('click', function () {
      persistAndApply(banner, {
        analytics: !!analyticsBox.checked,
        advertising: !!advertisingBox.checked,
      });
    });
  }

  // Expose a minimal read-only API for other scripts.
  window.gematriaCookieConsent = Object.freeze({
    getConsent: getConsent,
    getConsentPreferences: function () { return parseConsent(getConsent()); },
    CONSENT_KEY: CONSENT_KEY,
    consentModeRegions: CONSENT_MODE_REGIONS.slice(),
  });

  var savedConsent = getConsent();
  var savedPrefs = parseConsent(savedConsent);
  if (savedPrefs) {
    applyConsentMode(savedPrefs);
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
