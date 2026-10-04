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

  // The choice made on this page view, kept in memory so it still counts when
  // localStorage is unavailable (private mode, blocked site data).
  var sessionPrefs = null;

  function currentPreferences() {
    return sessionPrefs || parseConsent(getConsent());
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

  var bannerRegion = isRegionScopedForBanner();

  // Every tracker on the site (Google Analytics, conversion-tracking.js, the
  // click reporters in ui-feedback.js and the page scripts) asks this one
  // function, so declining in the banner stops all of them. With no stored
  // choice the region decides: opt-in where the banner is shown, opt-out
  // elsewhere, as privacy.html describes.
  function isAnalyticsAllowed() {
    var prefs = currentPreferences();
    if (prefs) {
      return prefs.analytics === true;
    }
    return !bannerRegion;
  }

  // Global Privacy Control is an opt-out of "sale" and "sharing" (privacy.html
  // #dnt). Google's advertising signals are the only thing here that could
  // amount to sharing, so GPC keeps them denied whatever the stored choice is.
  function hasGlobalPrivacyControl() {
    try {
      return !!window.navigator && window.navigator.globalPrivacyControl === true;
    } catch (e) {
      return false;
    }
  }

  // The admin session cookie is HttpOnly and never visible to document.cookie;
  // the server sets this readable flag (no secret in it) alongside it.
  function isAdminSession() {
    try {
      return document.cookie.split(';').some(function (c) {
        return c.trim().startsWith('gematria_admin_flag=');
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
    var advertisingStatus = prefs.advertising && !hasGlobalPrivacyControl() ? 'granted' : 'denied';
    // No `region` here: an explicit choice applies wherever the visitor is,
    // which is how someone outside the consent-mode regions opts out.
    window.gtag('consent', 'update', {
      analytics_storage: analyticsStatus,
      ad_storage: advertisingStatus,
      ad_user_data: advertisingStatus,
      ad_personalization: advertisingStatus,
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

  // Where keyboard focus goes when the banner closes: the element that had it
  // when the banner opened (the footer's Cookie settings button on a reopen).
  var returnFocusTarget = null;

  function restoreFocus(banner) {
    var target = returnFocusTarget;
    returnFocusTarget = null;
    var active = document.activeElement;
    // Only hand back focus the banner holds (or that fell to <body> when a
    // button was clicked); never pull it from somewhere the visitor moved on to.
    if (active && active !== document.body && !banner.contains(active)) {
      return;
    }
    if (!target || target === document.body || !target.isConnected) {
      // First load: the banner took focus from nowhere in particular. Removing
      // it would leave the next Tab at the end of the document, so start the
      // visitor at the main content instead.
      target = document.getElementById('mainContent');
      if (target && !target.hasAttribute('tabindex')) {
        var main = target;
        main.setAttribute('tabindex', '-1');
        main.addEventListener('blur', function () {
          main.removeAttribute('tabindex');
        }, { once: true });
      }
    }
    if (!target) {
      return;
    }
    try { target.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function hideBanner(banner) {
    // Before aria-hidden, so focus never sits inside a hidden subtree.
    restoreFocus(banner);
    banner.setAttribute('aria-hidden', 'true');
    banner.classList.remove('cookie-consent-banner--visible');
    setTimeout(function () {
      if (banner.parentNode) {
        banner.parentNode.removeChild(banner);
      }
    }, 300);
  }

  function persistAndApply(banner, prefs) {
    sessionPrefs = prefs;
    setConsent(serializeConsent(prefs));
    applyConsentMode(prefs);
    fireConsentEvent(prefs);
    hideBanner(banner);
  }

  // `existingPrefs` is set when the banner is reopened from Cookie settings, so
  // the checkboxes show what the visitor chose last time instead of resetting.
  // `returnFocusTo` is the control that reopened it.
  function showBanner(existingPrefs, returnFocusTo) {
    returnFocusTarget = returnFocusTo || document.activeElement;
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
      'We use Google Analytics and our own click and sign-up measurement to see how the site is used. Decline all, accept all, or open <em>Customize</em> to pick analytics and advertising independently. ' +
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
      '<span><strong>Analytics</strong> — Google Analytics page views and our own click and sign-up measurement, which help us see which pages are useful.</span>' +
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

    // The banner is appended at the end of <body>, so a keyboard user would
    // not reach it until the very end of the tab order. Focus the container
    // (not a button, so no option is pre-selected) without trapping focus.
    banner.setAttribute('tabindex', '-1');
    try { banner.focus({ preventScroll: true }); } catch (e) { /* ignore */ }

    // Escape dismisses without recording a decision, so the banner returns on
    // the next page rather than silently counting as a "no".
    banner.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      hideBanner(banner);
    });

    var acceptBtn = document.getElementById('cookieConsentAccept');
    var declineBtn = document.getElementById('cookieConsentDecline');
    var customizeBtn = document.getElementById('cookieConsentCustomize');
    var saveBtn = document.getElementById('cookieConsentSave');
    var optionsPanel = document.getElementById('cookieConsentOptions');
    var analyticsBox = document.getElementById('cookieConsentAnalytics');
    var advertisingBox = document.getElementById('cookieConsentAdvertising');

    if (existingPrefs) {
      analyticsBox.checked = !!existingPrefs.analytics;
      advertisingBox.checked = !!existingPrefs.advertising;
      // Reopening is an explicit request to change something, so start on the
      // detailed view rather than making the user find Customize again.
      customizeBtn.setAttribute('aria-expanded', 'true');
      optionsPanel.hidden = false;
    }

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

  // Expose a minimal API for other scripts. `reopen` exists because consent
  // has to be as easy to withdraw as it was to give: the banner never returned
  // once a choice was stored, and privacy.html promises "the controls on the
  // Site". The footer's Cookie settings link calls this.
  window.gematriaCookieConsent = Object.freeze({
    getConsent: getConsent,
    getConsentPreferences: currentPreferences,
    analyticsAllowed: isAnalyticsAllowed,
    CONSENT_KEY: CONSENT_KEY,
    consentModeRegions: CONSENT_MODE_REGIONS.slice(),
    reopen: function reopen(returnFocusTo) {
      var existing = document.getElementById('cookieConsentBanner');
      if (existing) {
        try { existing.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
        return;
      }
      showBanner(currentPreferences(), returnFocusTo);
    },
  });

  // Wired here rather than per-page so every page with the footer gets it.
  document.addEventListener('click', function (event) {
    var trigger = event.target && event.target.closest
      ? event.target.closest('[data-cookie-settings]')
      : null;
    if (!trigger) return;
    event.preventDefault();
    window.gematriaCookieConsent.reopen(trigger);
  });

  var savedConsent = getConsent();
  var savedPrefs = parseConsent(savedConsent);
  if (savedPrefs) {
    applyConsentMode(savedPrefs);
  }

  // Skip for admin sessions, out-of-scope regions, or when the user has already decided.
  if (isAdminSession() || !bannerRegion || savedConsent !== null) {
    return;
  }

  if (document.readyState === 'loading') {
    // Wrapped: passed directly, the DOMContentLoaded event became existingPrefs.
    document.addEventListener('DOMContentLoaded', function () { showBanner(); }, { once: true });
  } else {
    showBanner();
  }
})();
