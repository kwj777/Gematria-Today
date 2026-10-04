/* Public theme toggle. Pairs with the early-paint theme bootstrap in
 * early-bootstrap.js, which sets the initial data-bs-theme value from
 * localStorage (or prefers-color-scheme as a fallback). This module wires
 * the navbar toggle buttons and keeps multiple buttons / tabs in sync.
 */
(function installPublicTheme() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  // Admin pages load this bundle too, but admin-theme.js owns their theme
  // under its own stored preference. It runs synchronously in <head>, before
  // this deferred bundle, so window.adminTheme is already set there. Following
  // the OS or a public-site tab here flipped an admin page's theme without
  // the admin choosing it, and left the admin button's label behind.
  if (window.adminTheme) return;
  if (window.__publicThemeInstalled) return;
  window.__publicThemeInstalled = true;

  var STORAGE_KEY = 'publicThemePreference';

  function readStored() {
    try {
      var v = window.localStorage.getItem(STORAGE_KEY);
      return v === 'dark' || v === 'light' ? v : null;
    } catch (_) {
      return null;
    }
  }

  function persist(theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (_) { /* private mode / quota — ignore */ }
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light';
  }

  // The button names what a click does, matching its icon (a moon while the
  // page is light, a sun while it is dark). A fixed "Dark mode" name left the
  // hover tooltip saying "Dark mode" over the sun. With an action name the
  // button has no pressed state to contradict it (WCAG 4.1.2), so aria-pressed
  // is dropped. The markup says "Switch theme", which is true in either mode
  // until this deferred script runs.
  function syncButton(button, theme) {
    var label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    button.removeAttribute('aria-pressed');
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  }

  function syncAllButtons(theme) {
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) syncButton(buttons[i], theme);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-bs-theme', theme);
    syncAllButtons(theme);
  }

  function handleClick() {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    persist(next);
  }

  function wireButtons() {
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      if (btn.__themeWired) continue;
      btn.__themeWired = true;
      btn.addEventListener('click', handleClick);
    }
    syncAllButtons(currentTheme());
  }

  // Follow OS preference changes while the user has no explicit choice.
  function watchOsPreference() {
    if (!window.matchMedia) return;
    var media;
    try {
      media = window.matchMedia('(prefers-color-scheme: dark)');
    } catch (_) {
      return;
    }
    function onChange(event) {
      if (readStored()) return; // explicit choice wins
      applyTheme(event.matches ? 'dark' : 'light');
    }
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
    } else if (typeof media.addListener === 'function') {
      media.addListener(onChange);
    }
  }

  // Keep other open tabs in sync when the preference changes.
  function watchStorage() {
    window.addEventListener('storage', function (event) {
      if (event.key !== STORAGE_KEY) return;
      var next = event.newValue === 'dark' || event.newValue === 'light' ? event.newValue : currentTheme();
      applyTheme(next);
    });
  }

  function init() {
    wireButtons();
    watchOsPreference();
    watchStorage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
