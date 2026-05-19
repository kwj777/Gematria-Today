(function () {
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
