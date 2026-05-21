(function () {
  // Theme bootstrap. Runs before first paint so the cascade has the right
  // data-bs-theme value when <style> blocks are parsed. Stored preference
  // wins; otherwise follow the OS via prefers-color-scheme.
  var THEME_STORAGE_KEY = 'publicThemePreference';
  function readStoredTheme() {
    try {
      var v = window.localStorage.getItem(THEME_STORAGE_KEY);
      return v === 'dark' || v === 'light' ? v : null;
    } catch (_) {
      return null;
    }
  }
  function osPrefersDark() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (_) {
      return false;
    }
  }
  function applyInitialTheme() {
    var stored = readStoredTheme();
    var theme = stored || (osPrefersDark() ? 'dark' : 'light');
    document.documentElement.setAttribute('data-bs-theme', theme);
  }
  applyInitialTheme();

  var TIERS = ['anon', 'free', 'premium', 'lifetime'];
  function applyAuthState() {
    var tier;
    try {
      var m = document.cookie.match(/(?:^|; )gematria_member_tier=([^;]+)/);
      tier = m ? decodeURIComponent(m[1]) : 'anon';
      if (!/^(free|premium|lifetime)$/.test(tier)) tier = 'anon';
    } catch (_) {
      tier = 'anon';
    }
    window.__gematriaAuthTier = tier;
    var root = document.documentElement;
    for (var i = 0; i < TIERS.length; i++) {
      root.classList.remove('auth-' + TIERS[i]);
    }
    root.classList.add('auth-' + tier);
  }
  window.__gematriaSyncAuthState = applyAuthState;
  applyAuthState();

  var hasPromise = typeof window.Promise === 'function';
  var hasFetch = typeof window.fetch === 'function';
  var userAgent = ((window.navigator && window.navigator.userAgent) || '').toLowerCase();
  var isBot = /bot|crawl|spider|slurp|bingpreview|google web preview|facebookexternalhit|whatsapp|telegrambot|linkedinbot|twitterbot/.test(userAgent);
  if ((hasPromise && hasFetch) || isBot) {
    return;
  }

  var pathname = (window.location && window.location.pathname) || '';
  if (pathname === '/unsupported-browser.html') {
    return;
  }

  var redirectUrl = '/unsupported-browser.html?from=' + encodeURIComponent(pathname || '/');
  window.location.replace(redirectUrl);
})();
