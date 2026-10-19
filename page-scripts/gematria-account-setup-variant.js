(function () {
  try {
    var url = new URL(location.href);
    var ret = url.searchParams.get('return') || '';
    // The header "Join free" button (?from=nav) is a plain sign-up. A home-page
    // referrer used to turn it into the Level 0 beginner-course page.
    var fromNav = url.searchParams.get('from') === 'nav';
    var ref = document.referrer || '';
    var variant = 'default';
    if (
      !fromNav &&
      (ret.indexOf('gematria-basics') !== -1 ||
        /\/(index|gematria-guide|badge)\.html(\?|#|$)|\/\/[^\/]+\/?$/.test(ref))
    ) {
      variant = 'learning';
    } else if (
      /\/(calculator|multi-cipher-calculator|gematria-results|name-calculator)\.html/.test(ref)
    ) {
      variant = 'calculator';
    }
    document.documentElement.dataset.l0Variant = variant;
  } catch (e) {
    document.documentElement.dataset.l0Variant = 'learning';
  }
})();
