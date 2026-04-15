(function installCookieConsent() {
  if (typeof window === 'undefined' || window.__endTimesCookieConsentInstalled) {
    return;
  }

  window.__endTimesCookieConsentInstalled = true;

  var CONSENT_KEY = 'endtimes_cookie_consent';

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

  function isAdminSession() {
    try {
      return document.cookie.split(';').some(function (c) {
        return c.trim().startsWith('endtimes_admin_session=');
      });
    } catch (e) {
      return false;
    }
  }

  function fireConsentEvent(accepted) {
    try {
      window.dispatchEvent(
        new CustomEvent('endtimes:cookie-consent', {
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
      'We use a session cookie to analyze anonymous site usage. No personal data is collected or shared with third parties. ' +
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
      fireConsentEvent(true);
      hideBanner(banner);
    });

    document.getElementById('cookieConsentDecline').addEventListener('click', function () {
      setConsent('declined');
      fireConsentEvent(false);
      hideBanner(banner);
    });
  }

  // Expose a minimal read-only API for other scripts.
  window.endTimesCookieConsent = Object.freeze({
    getConsent: getConsent,
    CONSENT_KEY: CONSENT_KEY,
  });

  // Skip for admin sessions or when the user has already decided.
  if (isAdminSession() || getConsent() !== null) {
    return;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBanner, { once: true });
  } else {
    showBanner();
  }
})();
