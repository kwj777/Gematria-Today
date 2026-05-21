/* Sticky-shrink for the site nav: when the page is scrolled past a small
 * threshold, add .is-scrolled to the sticky navbar so theme.css can tighten
 * its padding and shrink the logo. Uses requestAnimationFrame to avoid
 * doing layout work on every scroll event. */
(function installNavShrink() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__navShrinkInstalled) return;
  window.__navShrinkInstalled = true;

  const SCROLL_THRESHOLD = 12;

  function init() {
    const nav = document.querySelector('nav.navbar.sticky-top[data-nav-shrink]');
    if (!nav) return;

    let ticking = false;

    function update() {
      ticking = false;
      const shouldShrink = window.scrollY > SCROLL_THRESHOLD;
      nav.classList.toggle('is-scrolled', shouldShrink);
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
