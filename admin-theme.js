/**
 * admin-theme.js — Shared admin dark/light toggle and Bootswatch theme switcher.
 *
 * Load this as a synchronous (non-deferred) script in <head> so that
 * applyTheme() runs before the browser paints, preventing flash of unstyled
 * content. The interactive wiring (button click, select change) is deferred
 * to DOMContentLoaded.
 *
 * Pages that carry <link id="bootstrapThemeStylesheet"> (currently admin.html)
 * also get live Bootswatch theme switching. All other admin pages only use the
 * dark/light toggle; applyBootswatchTheme() is a safe no-op for them.
 *
 * Exposes window.adminTheme for use by admin.html's inline script.
 */
(function () {
  var ADMIN_THEME_STORAGE_KEY = 'adminThemePreference';
  var ADMIN_BOOTSWATCH_STORAGE_KEY = 'adminBootswatchTheme';

  var BOOTSTRAP_STYLESHEET = {
    href: '/assets/vendor/bootstrap/css/bootstrap.min.css',
    integrity: 'sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH',
  };

  var BOOTSWATCH_THEME_OPTIONS = Object.freeze({
    bootstrap: BOOTSTRAP_STYLESHEET,
    cerulean: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/cerulean/bootstrap.min.css' },
    cosmo: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/cosmo/bootstrap.min.css' },
    darkly: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/darkly/bootstrap.min.css' },
    flatly: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/flatly/bootstrap.min.css' },
    litera: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/litera/bootstrap.min.css' },
    lumen: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/lumen/bootstrap.min.css' },
    lux: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/lux/bootstrap.min.css' },
    materia: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/materia/bootstrap.min.css' },
    minty: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/minty/bootstrap.min.css' },
    morph: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/morph/bootstrap.min.css' },
    pulse: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/pulse/bootstrap.min.css' },
    quartz: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/quartz/bootstrap.min.css' },
    sandstone: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/sandstone/bootstrap.min.css' },
    simplex: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/simplex/bootstrap.min.css' },
    sketchy: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/sketchy/bootstrap.min.css' },
    slate: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/slate/bootstrap.min.css' },
    solar: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/solar/bootstrap.min.css' },
    spacelab: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/spacelab/bootstrap.min.css' },
    superhero: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/superhero/bootstrap.min.css' },
    united: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/united/bootstrap.min.css' },
    vapor: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/vapor/bootstrap.min.css' },
    yeti: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/yeti/bootstrap.min.css' },
    zephyr: { href: 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/zephyr/bootstrap.min.css' },
  });

  function normalizeTheme(theme) {
    return theme === 'dark' ? 'dark' : 'light';
  }

  // What every admin page's markup puts inside the button.
  var THEME_TOGGLE_MARKUP_TEXT = 'Dark mode';

  // The button, once the parser can add nothing more inside it. Labelling it
  // as soon as the start tag is in the DOM let the parser append the markup
  // text after the label ("Light modeDark mode") when a network chunk ended
  // inside the button. Once the whole markup text is in, only </button> can
  // follow; a next sibling or a finished document means it already has.
  // Waiting for the sibling alone painted the wrong label on a dark page
  // when a chunk ended right after </button>.
  function parsedThemeToggleButton() {
    var btn = document.getElementById('themeToggleButton');
    if (!btn) return null;
    var complete = btn.textContent === THEME_TOGGLE_MARKUP_TEXT
      || btn.nextSibling
      || document.readyState !== 'loading';
    return complete ? btn : null;
  }

  function currentTheme() {
    return normalizeTheme(document.documentElement.getAttribute('data-bs-theme'));
  }

  // The button names what a click does: "Light mode" while the page is dark,
  // "Dark mode" while it is light. An earlier fix froze the text at "Dark
  // mode" and left the state to aria-pressed, which only a screen reader
  // announces, so sighted admins saw a label that never changed. A plain
  // action button has no pressed state to contradict its name (WCAG 4.1.2).
  // Same as public-theme.js. Returns false until the button is parsed.
  function updateThemeToggleButton(theme) {
    var btn = parsedThemeToggleButton();
    if (!btn) return false;
    var label = theme === 'dark' ? 'Light mode' : 'Dark mode';
    // Write only on a change: the parse watcher below sees this write too.
    if (btn.textContent !== label) btn.textContent = label;
    // The visible text is the name; aria-pressed or an aria-label could only
    // disagree with it.
    btn.removeAttribute('aria-pressed');
    btn.removeAttribute('aria-label');
    return true;
  }

  function applyTheme(theme) {
    var normalizedTheme = normalizeTheme(theme);
    document.documentElement.setAttribute('data-bs-theme', normalizedTheme);
    updateThemeToggleButton(normalizedTheme);
  }

  // Keep the label on the theme the page actually has. This script runs in
  // <head>, before the button exists, and DOMContentLoaded waits for every
  // body script, so a dark page used to show "Dark mode" while it loaded. The
  // parse watcher labels the button as soon as it is parsed, before it is
  // painted. The theme watcher also catches data-bs-theme set by anything
  // other than this script.
  var buttonParseWatcher = null;

  function watchThemeToggleButton() {
    var Observer = window.MutationObserver;
    if (typeof Observer !== 'function') return;
    var root = document.documentElement;
    new Observer(function () {
      updateThemeToggleButton(currentTheme());
    }).observe(root, { attributes: true, attributeFilter: ['data-bs-theme'] });
    if (updateThemeToggleButton(currentTheme())) return;
    buttonParseWatcher = new Observer(function () {
      if (updateThemeToggleButton(currentTheme())) stopButtonParseWatcher();
    });
    buttonParseWatcher.observe(root, { childList: true, subtree: true });
  }

  function stopButtonParseWatcher() {
    if (!buttonParseWatcher) return;
    buttonParseWatcher.disconnect();
    buttonParseWatcher = null;
  }

  function loadThemePreference() {
    try {
      return normalizeTheme(window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY));
    } catch (e) {
      return 'light';
    }
  }

  function persistThemePreference(theme) {
    try {
      window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, theme);
    } catch (e) {
      // Ignore localStorage failures in private mode / quota exhaustion.
    }
  }

  function normalizeBootswatchTheme(themeId) {
    return BOOTSWATCH_THEME_OPTIONS[themeId] ? themeId : 'bootstrap';
  }

  function applyBootswatchTheme(themeId) {
    var bootstrapThemeStylesheet = document.getElementById('bootstrapThemeStylesheet');
    if (!bootstrapThemeStylesheet) return; // No-op on pages without the switchable stylesheet.
    var normalizedThemeId = normalizeBootswatchTheme(themeId);
    var selectedTheme = BOOTSWATCH_THEME_OPTIONS[normalizedThemeId];
    bootstrapThemeStylesheet.setAttribute('href', selectedTheme.href);
    if (selectedTheme.integrity) {
      bootstrapThemeStylesheet.setAttribute('integrity', selectedTheme.integrity);
    } else {
      bootstrapThemeStylesheet.removeAttribute('integrity');
    }
    bootstrapThemeStylesheet.setAttribute('crossorigin', 'anonymous');
    var bootswatchThemeSelect = document.getElementById('bootswatchThemeSelect');
    if (bootswatchThemeSelect) {
      bootswatchThemeSelect.value = normalizedThemeId;
    }
  }

  function loadBootswatchPreference() {
    try {
      return normalizeBootswatchTheme(window.localStorage.getItem(ADMIN_BOOTSWATCH_STORAGE_KEY));
    } catch (e) {
      return 'bootstrap';
    }
  }

  function persistBootswatchPreference(themeId) {
    try {
      window.localStorage.setItem(ADMIN_BOOTSWATCH_STORAGE_KEY, normalizeBootswatchTheme(themeId));
    } catch (e) {
      // Ignore localStorage failures in private mode / quota exhaustion.
    }
  }

  // Apply theme immediately to prevent flash of unstyled content.
  applyTheme(loadThemePreference());
  watchThemeToggleButton();
  applyBootswatchTheme(loadBootswatchPreference());

  // Safety net: admin.html hides #authPanel and #dashboardPanel via the
  // admin-render-pending body class until page-scripts/admin-1.js calls
  // settleInitialRender(). If that script throws (e.g. a stale cached copy
  // referencing a removed element), clear the class anyway so the user
  // still sees the login form instead of a blank page.
  function clearAdminRenderPending() {
    if (document.body) {
      document.body.classList.remove('admin-render-pending');
    }
  }
  window.addEventListener('error', clearAdminRenderPending);
  window.setTimeout(clearAdminRenderPending, 5000);

  // Wire up interactive controls after the DOM is ready.
  document.addEventListener('DOMContentLoaded', function () {
    // Pages without the button would otherwise keep the parse watcher on.
    stopButtonParseWatcher();
    updateThemeToggleButton(currentTheme());

    var themeToggleButton = document.getElementById('themeToggleButton');
    if (themeToggleButton) {
      themeToggleButton.addEventListener('click', function () {
        var nextTheme = currentTheme() === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
        persistThemePreference(nextTheme);
      });
    }

    var bootswatchThemeSelect = document.getElementById('bootswatchThemeSelect');
    if (bootswatchThemeSelect) {
      bootswatchThemeSelect.addEventListener('change', function () {
        var nextTheme = normalizeBootswatchTheme(bootswatchThemeSelect.value);
        applyBootswatchTheme(nextTheme);
        persistBootswatchPreference(nextTheme);
      });
    }

    var bootswatchThemeResetButton = document.getElementById('bootswatchThemeResetButton');
    if (bootswatchThemeResetButton) {
      bootswatchThemeResetButton.addEventListener('click', function () {
        applyBootswatchTheme('bootstrap');
        persistBootswatchPreference('bootstrap');
      });
    }
  });

  // Session expiry used to be handled differently on every admin page: some
  // hard-redirected and lost the page you were on, others printed "Visit Admin
  // to sign in" with no link at all. None passed ?next=, even though
  // admin.html already implements a safe next-redirect consumer.
  function adminSignInUrl() {
    var here = window.location.pathname + window.location.search + window.location.hash;
    return '/admin.html?next=' + encodeURIComponent(here);
  }

  function isAuthError(error) {
    var status = error && error.status;
    if (status === 401 || status === 403) return true;
    var message = String((error && error.message) || error || '').toLowerCase();
    return message.indexOf('unauthorized') !== -1
      || message.indexOf('authentication') !== -1
      || message.indexOf('not signed in') !== -1;
  }

  // Returns true when it handled the error, so callers can `if (...) return;`.
  function handleAuthError(error, options) {
    if (!isAuthError(error)) return false;
    var settings = options || {};
    if (settings.redirect === false) {
      var target = settings.target;
      if (target) {
        target.innerHTML = '';
        var message = document.createElement('span');
        message.textContent = 'Your admin session has expired. ';
        var link = document.createElement('a');
        link.href = adminSignInUrl();
        link.textContent = 'Sign in and return to this page';
        target.appendChild(message);
        target.appendChild(link);
      }
      return true;
    }
    window.location.assign(adminSignInUrl());
    return true;
  }

  window.adminSession = {
    signInUrl: adminSignInUrl,
    isAuthError: isAuthError,
    handleAuthError: handleAuthError,
  };

  // Expose what admin.html's inline script needs for its super-admin global theme controls.
  window.adminTheme = {
    normalizeBootswatchTheme: normalizeBootswatchTheme,
    BOOTSWATCH_THEME_OPTIONS: BOOTSWATCH_THEME_OPTIONS,
  };
})();
