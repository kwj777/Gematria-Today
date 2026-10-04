(function () {
  // The one check for "send the visitor back here" values that arrive in a
  // query string: admin.html?next=, the calculators' ?returnTo= learning-path
  // link and the results page's ?returnTo= back link. Each page used to carry
  // its own copy, and every copy trusted a prefix test ('/' but not '//') or a
  // same-origin test on the resolved URL. Neither catches '/.//evil.example':
  // it starts with one slash and resolves on this origin, but its path
  // normalizes to '//evil.example', which a browser reads as a
  // protocol-relative link to another site once it lands in an href or in
  // window.location. So the resolved path is checked too.
  //
  // Returns a root-relative path (pathname + search + hash) on this origin,
  // or '' when the value is not one.
  function toSafeInternalPath(value) {
    const raw = String(value ?? '').trim();
    if (!raw.startsWith('/')) {
      return '';
    }

    let parsed;
    try {
      parsed = new URL(raw, window.location.origin);
    } catch {
      return '';
    }

    if (parsed.origin !== window.location.origin || /^[/\\]{2}/.test(parsed.pathname)) {
      return '';
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }

  window.gematriaSafePath = Object.freeze({ toSafeInternalPath });
})();
