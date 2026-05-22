/* Nav helpers:
 *   1. Sticky-shrink — tag the sticky navbar with .is-scrolled past a small
 *      scroll threshold so theme.css can tighten padding and hide the
 *      brand tagline. Uses requestAnimationFrame to avoid layout work on
 *      every scroll event.
 *   2. "/" keyboard shortcut — jump to SiteSeeker search from any page. If
 *      the user is already on /searchbot.html, focus the question field;
 *      otherwise navigate there with ?focus=knowbot so the field can be
 *      focused on arrival. Ignored when typing in another input.
 */
(function installNavHelpers() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__navHelpersInstalled) return;
  window.__navHelpersInstalled = true;

  const SCROLL_THRESHOLD = 12;
  const SEARCH_PATH = '/searchbot.html';
  const SEARCH_INPUT_ID = 'chatQuestion';
  const SEARCH_FOCUS_PARAM = 'focus';
  const SEARCH_FOCUS_VALUE = 'knowbot';

  function isTypingTarget(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'INPUT') {
      // Allow "/" to work on inputs that aren't text-y (checkboxes, buttons).
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      const textyTypes = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);
      return textyTypes.has(type);
    }
    return tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function setupShrink() {
    const nav = document.querySelector('nav.navbar.sticky-top[data-nav-shrink]');
    if (!nav) return;
    let ticking = false;
    function update() {
      ticking = false;
      nav.classList.toggle('is-scrolled', window.scrollY > SCROLL_THRESHOLD);
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
  }

  function setupSearchShortcut() {
    function focusSearchInput() {
      const input = document.getElementById(SEARCH_INPUT_ID);
      if (!input) return false;
      try {
        input.focus({ preventScroll: false });
      } catch (_) {
        input.focus();
      }
      return true;
    }

    // If the user arrived via "?focus=knowbot", give the input focus.
    if (window.location.pathname === SEARCH_PATH) {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get(SEARCH_FOCUS_PARAM) === SEARCH_FOCUS_VALUE) {
          // Allow the page to settle before stealing focus.
          window.requestAnimationFrame(() => focusSearchInput());
        }
      } catch (_) { /* ignore malformed URL */ }
    }

    document.addEventListener('keydown', (event) => {
      if (event.key !== '/') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      if (window.location.pathname === SEARCH_PATH) {
        focusSearchInput();
      } else {
        window.location.href = `${SEARCH_PATH}?${SEARCH_FOCUS_PARAM}=${SEARCH_FOCUS_VALUE}`;
      }
    });
  }

  function init() {
    setupShrink();
    setupSearchShortcut();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
