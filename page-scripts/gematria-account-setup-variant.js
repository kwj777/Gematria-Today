(function () {
  try {
    var url = new URL(location.href);
    var ret = url.searchParams.get('return') || '';
    var ref = document.referrer || '';
    var variant = 'default';
    if (
      ret.indexOf('gematria-basics') !== -1 ||
      /\/(index|gematria-guide|badge)\.html(\?|#|$)|\/\/[^\/]+\/?$/.test(ref)
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
