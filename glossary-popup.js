(function () {
  if (window.__gematriaGlossaryLoaded) return;
  window.__gematriaGlossaryLoaded = true;

  var CACHE_KEY = 'gematria.glossary.v2';
  var CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  var DEFINITIONS_URL = '/definitions.html';
  var STYLE_ID = 'gematria-glossary-styles';
  var POPUP_ID = 'gematria-glossary-popup';
  var PROCESSED_FLAG = '__gematriaGlossaryProcessed';

  // On the definitions page itself, the inline script handles things.
  var path = (window.location.pathname || '').toLowerCase();
  if (path === '/definitions.html' || path === '/definitions') return;

  var STYLES =
    '.defn-term{background:none;border:0;padding:0;margin:0;font:inherit;color:inherit;cursor:help;border-bottom:1px dotted currentColor;text-decoration:none;line-height:inherit;}' +
    // #0d6efd was 3.92:1 on the cream page and 3.97:1 on the dark hero, so
    // the term turned unreadable exactly when pointed at. Light surfaces get
    // the darker link blue (5.61:1 on cream), dark ones a light blue (4.77:1
    // or better): the dark theme, plus the panels that are navy in both
    // themes -- the hero, Word of the Day, and the home page learning-path
    // promo, where the darker blue would be 1.96:1. src/definitions.html
    // carries its own copy of these two rules (this script skips that page).
    '.defn-term:hover,.defn-term:focus-visible{outline:none;border-bottom-style:solid;color:#0a58ca;}' +
    ':root[data-bs-theme="dark"] .defn-term:hover,:root[data-bs-theme="dark"] .defn-term:focus-visible,' +
    '.hero-panel .defn-term:hover,.hero-panel .defn-term:focus-visible,' +
    '.word-of-day-spotlight .defn-term:hover,.word-of-day-spotlight .defn-term:focus-visible,' +
    '.learning-path-promo .defn-term:hover,.learning-path-promo .defn-term:focus-visible{color:#93c5fd;}' +
    // Fixed rather than absolute: the popup now lives next to whichever term
    // opened it (so the keyboard can reach the link inside it), and that parent
    // could be anything. Viewport coordinates plus the correction in
    // positionPopup keep placement independent of where it sits in the DOM.
    '.defn-popup{position:fixed;display:block;z-index:1080;max-width:320px;background:#0f172a;color:#f8fafc;padding:.75rem .9rem;border-radius:.5rem;box-shadow:0 10px 28px rgba(15,23,42,.35);font-size:.875rem;line-height:1.45;text-align:left;font-weight:400;}' +
    '.defn-popup[hidden]{display:none;}' +
    '.defn-popup__title{display:block;font-weight:600;margin-bottom:.25rem;}' +
    '.defn-popup__body{display:block;margin:0 0 .5rem;color:#e2e8f0;}' +
    '.defn-popup__link{color:#93c5fd;font-size:.8125rem;text-decoration:underline;}' +
    '.defn-popup__link:hover,.defn-popup__link:focus-visible{color:#bfdbfe;}';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  function slugify(s) {
    return s.toLowerCase()
      .replace(/[()\/&]/g, ' ')
      .replace(/[^a-z0-9 ]+/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.ts || !Array.isArray(parsed.terms)) return null;
      if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
      return parsed.terms;
    } catch (_) {
      return null;
    }
  }

  function writeCache(terms) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), terms: terms }));
    } catch (_) {
      // ignore quota errors
    }
  }

  function buildAliases(label) {
    var primaries = [];
    var paren = label.match(/^(.+?)\s*\((.+)\)\s*$/);
    if (paren) {
      primaries.push(paren[1].trim());
      primaries.push(paren[2].trim());
      primaries.push(label);
    } else {
      primaries.push(label);
    }
    primaries = primaries.reduce(function (acc, p) {
      if (p.indexOf('/') !== -1) {
        p.split('/').forEach(function (part) {
          var trimmed = part.trim();
          if (trimmed) acc.push(trimmed);
        });
      }
      acc.push(p);
      return acc;
    }, []);

    var aliases = [];
    primaries.forEach(function (p) {
      aliases.push(p);
      if (/[a-z]$/i.test(p) && !/s$/i.test(p)) aliases.push(p + 's');
      if (/y$/i.test(p)) aliases.push(p.slice(0, -1) + 'ies');
      if (/-/.test(p)) aliases.push(p.replace(/-/g, ' '));
    });
    return aliases.filter(function (a, i) { return a.length > 2 && aliases.indexOf(a) === i; });
  }

  function parseDefinitionsHtml(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var main = doc.getElementById('mainContent') || doc.body;
    if (!main) return [];
    var terms = [];
    var seen = {};

    function recordPair(dt, dd) {
      if (!dt || !dd) return;
      var label = (dt.textContent || '').trim();
      if (!label) return;
      var slug = dt.id && dt.id.indexOf('defn-') === 0 ? dt.id.slice(5) : slugify(label);
      if (seen[slug]) return;
      seen[slug] = true;
      var ddClone = dd.cloneNode(true);
      var examples = ddClone.querySelectorAll('.defn-example');
      for (var i = 0; i < examples.length; i++) examples[i].parentNode.removeChild(examples[i]);
      var defText = (ddClone.textContent || '').replace(/\s+/g, ' ').trim();
      if (defText.length > 260) defText = defText.slice(0, 257).replace(/\s+\S*$/, '') + '…';
      terms.push({
        slug: slug,
        label: label,
        definition: defText,
        aliases: buildAliases(label)
      });
    }

    // Walk each <dl> in order. Children may be flat DT/DD pairs or
    // <div class="defn-card"> wrappers containing DT and DD.
    main.querySelectorAll('dl').forEach(function (dl) {
      var kids = Array.from(dl.children);
      for (var i = 0; i < kids.length; i++) {
        var child = kids[i];
        if (child.tagName === 'DT') {
          var dd = kids[i + 1];
          if (dd && dd.tagName === 'DD') recordPair(child, dd);
        } else if (child.tagName === 'DIV') {
          var dt2 = child.querySelector('dt');
          var dd2 = child.querySelector('dd');
          recordPair(dt2, dd2);
        }
      }
    });
    return terms;
  }

  function loadTerms() {
    var cached = readCache();
    if (cached) return Promise.resolve(cached);
    return fetch(DEFINITIONS_URL, { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (html) {
        if (!html) return [];
        var terms = parseDefinitionsHtml(html);
        if (terms.length) writeCache(terms);
        return terms;
      })
      .catch(function () { return []; });
  }

  var SKIP_TAGS = {
    A: 1, BUTTON: 1, SUMMARY: 1, CODE: 1, PRE: 1, INPUT: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1,
    LABEL: 1, NAV: 1, HEADER: 1, FOOTER: 1, FORM: 1, SCRIPT: 1, STYLE: 1, NOSCRIPT: 1,
    H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1
  };

  var INTERACTIVE_ROLES = {
    button: 1, link: 1, tab: 1, menuitem: 1, menuitemcheckbox: 1,
    menuitemradio: 1, option: 1, switch: 1, checkbox: 1, radio: 1, treeitem: 1
  };

  function ancestorDisallowed(node, root) {
    var p = node.parentNode;
    while (p && p !== root && p.nodeType === 1) {
      if (SKIP_TAGS[p.tagName]) return true;
      var role = p.getAttribute && p.getAttribute('role');
      if (role && INTERACTIVE_ROLES[role]) return true;
      var cls = p.classList;
      if (cls) {
        if (cls.contains('defn-term') || cls.contains('defn-popup')) return true;
        if (cls.contains('no-glossary')) return true;
        if (cls.contains('section-kicker')) return true;
      }
      if (p.hasAttribute && p.hasAttribute('data-no-glossary')) return true;
      if (p.isContentEditable) return true;
      p = p.parentNode;
    }
    return false;
  }

  function buildIndex(terms) {
    var bySlug = {};
    var aliasIndex = [];
    terms.forEach(function (t) {
      bySlug[t.slug] = t;
      t.aliasSet = new Set(t.aliases.map(function (a) { return a.toLowerCase(); }));
      t.aliases.forEach(function (a) {
        aliasIndex.push({ alias: a, lower: a.toLowerCase(), term: t });
      });
    });
    aliasIndex.sort(function (a, b) { return b.alias.length - a.alias.length; });
    var union = aliasIndex.map(function (a) { return escapeRegex(a.alias); }).join('|');
    var re = union ? new RegExp('\\b(' + union + ')\\b', 'gi') : null;
    return { bySlug: bySlug, aliasIndex: aliasIndex, re: re };
  }

  function findTermFor(matchText, aliasIndex) {
    var lower = matchText.toLowerCase();
    for (var i = 0; i < aliasIndex.length; i++) {
      if (aliasIndex[i].lower === lower) return aliasIndex[i].term;
    }
    var singular = lower.replace(/ies$/, 'y').replace(/s$/, '');
    for (var j = 0; j < aliasIndex.length; j++) {
      if (aliasIndex[j].lower === singular) return aliasIndex[j].term;
    }
    return null;
  }

  function isInsideGlossaryNode(el) {
    if (!el || el.nodeType !== 1) return false;
    if (typeof el.closest === 'function') {
      return !!el.closest('.defn-term, .defn-popup');
    }
    var p = el;
    while (p && p.nodeType === 1) {
      if (p.classList && (p.classList.contains('defn-term') || p.classList.contains('defn-popup'))) return true;
      p = p.parentNode;
    }
    return false;
  }

  function processRoot(root, index) {
    if (!root || !index.re) return;
    if (root.nodeType !== 1) return;
    if (isInsideGlossaryNode(root)) return;
    if (SKIP_TAGS[root.tagName]) return;
    var rootRole = root.getAttribute && root.getAttribute('role');
    if (rootRole && INTERACTIVE_ROLES[rootRole]) return;
    if (root[PROCESSED_FLAG]) return;
    root[PROCESSED_FLAG] = true;

    // Limit how many times the same term gets converted per root, to keep
    // popups useful rather than spammy. First occurrence only.
    var seenTerms = new Set();

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (ancestorDisallowed(node, root)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    var textNodes = [];
    var n;
    while ((n = walker.nextNode())) textNodes.push(n);

    textNodes.forEach(function (textNode) {
      var text = textNode.nodeValue;
      var re = index.re;
      re.lastIndex = 0;
      if (!re.test(text)) return;
      re.lastIndex = 0;
      var frag = document.createDocumentFragment();
      var lastIdx = 0;
      var m;
      var replaced = false;
      while ((m = re.exec(text))) {
        var matched = m[0];
        var term = findTermFor(matched, index.aliasIndex);
        if (!term) continue;
        if (seenTerms.has(term.slug)) continue;
        frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'defn-term';
        btn.setAttribute('data-defn-slug', term.slug);
        // A disclosure, not a tooltip. The panel holds a link, which ARIA's
        // tooltip pattern does not allow -- and aria-describedby pointed at an
        // element that is `hidden` almost always, so it described nothing.
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', POPUP_ID);
        btn.textContent = matched;
        frag.appendChild(btn);
        lastIdx = m.index + matched.length;
        replaced = true;
        seenTerms.add(term.slug);
      }
      if (!replaced) return;
      frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      suppressObserver = true;
      try {
        textNode.parentNode.replaceChild(frag, textNode);
      } finally {
        suppressObserver = false;
      }
    });
  }

  // Popup behavior
  var popup = null;
  var activeBtn = null;
  var hideTimer = null;
  var indexRef = null;
  var suppressObserver = false;
  // Guards for the ways hover, focus and click fight each other on one term.
  var suppressFocusOpen = false;
  var openedThisInteraction = false;
  // On touch-only devices iOS Safari interprets the first tap on a hoverable
  // element as a "hover preview" and withholds the click event until the
  // second tap. Gate all hover-triggered popup behavior to real pointers.
  var HAS_HOVER = !!(window.matchMedia && window.matchMedia('(hover: hover)').matches);

  function ensurePopup() {
    if (popup) return popup;
    // A <span>, not a <div>: terms are substituted into text nodes, so the
    // panel is inserted next to a button that is usually inside a <p>. A block
    // element there is invalid nesting; phrasing content is not.
    popup = document.createElement('span');
    popup.id = POPUP_ID;
    popup.className = 'defn-popup';
    popup.hidden = true;
    document.body.appendChild(popup);
    if (HAS_HOVER) {
      popup.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
      popup.addEventListener('mouseleave', scheduleHide);
    }
    return popup;
  }

  function buildPopup(term) {
    popup.innerHTML = '';
    var title = document.createElement('span');
    title.className = 'defn-popup__title';
    title.textContent = term.label;
    var body = document.createElement('span');
    body.className = 'defn-popup__body';
    body.textContent = term.definition;
    var link = document.createElement('a');
    link.className = 'defn-popup__link';
    link.href = '/definitions.html#defn-' + term.slug;
    link.textContent = 'See full definition →';
    popup.appendChild(title);
    popup.appendChild(body);
    popup.appendChild(link);
  }

  function focusIsInsidePopup() {
    return !!(popup && document.activeElement && popup.contains(document.activeElement));
  }

  function hidePopup(restoreFocus) {
    if (!popup) return;
    var btn = activeBtn;
    popup.hidden = true;
    activeBtn = null;
    openedThisInteraction = false;
    if (!btn) return;
    btn.setAttribute('aria-expanded', 'false');
    if (!restoreFocus) return;
    // Focus opens the panel, so handing focus back to the term reopened the
    // thing we just closed -- Escape appeared to do nothing at all. Suppress
    // the focus handler for the duration of this one synchronous call.
    suppressFocusOpen = true;
    try {
      btn.focus();
    } finally {
      suppressFocusOpen = false;
    }
  }

  function positionPopup(btn) {
    popup.style.left = '0px';
    popup.style.top = '0px';
    var r = btn.getBoundingClientRect();
    var pr = popup.getBoundingClientRect();
    var docW = document.documentElement.clientWidth;
    var top = r.bottom + 8;
    var left = r.left + (r.width / 2) - (pr.width / 2);
    if (left < 8) left = 8;
    if (left > docW - pr.width - 8) left = docW - pr.width - 8;
    if (r.bottom + pr.height + 16 > document.documentElement.clientHeight && r.top > pr.height + 16) {
      top = r.top - pr.height - 8;
    }

    popup.style.top = top + 'px';
    popup.style.left = left + 'px';

    // `position: fixed` resolves against the viewport only while no ancestor
    // creates a containing block -- a transform, filter or contain anywhere up
    // the tree silently changes the origin. Now that the panel is parented to
    // whichever term opened it, that ancestor chain is not knowable up front.
    // Measure where it actually landed and correct by the difference, which is
    // right for any containing block rather than for the ones we predicted.
    var landed = popup.getBoundingClientRect();
    var dx = left - landed.left;
    var dy = top - landed.top;
    if (dx || dy) {
      popup.style.top = (top + dy) + 'px';
      popup.style.left = (left + dx) + 'px';
    }
  }

  function showFor(btn) {
    if (!indexRef) return;
    ensurePopup();
    clearTimeout(hideTimer);
    var slug = btn.getAttribute('data-defn-slug');
    var term = indexRef.bySlug[slug];
    if (!term) return;
    if (activeBtn && activeBtn !== btn) activeBtn.setAttribute('aria-expanded', 'false');
    // Whether this call is what put the panel on screen. The click handler
    // reads it so that the pointer or focus event which opened the panel
    // moments earlier is not immediately undone by the click that caused it:
    // hovering a term opened the panel and clicking it closed it again, so a
    // deliberate click made the definition flash and vanish.
    // Only ever set here, never cleared: one interaction fires several of these
    // (mouseover, then focusin from the same mousedown), and the later calls are
    // no-ops on an already-open panel. Clearing the flag on those made the click
    // look unprompted again. The click handler is what clears it.
    if (!(popup && !popup.hidden && activeBtn === btn)) openedThisInteraction = true;
    activeBtn = btn;
    buildPopup(term);
    // The panel used to live at the end of <body>, so Tab from a term never
    // reached the "See full definition" link inside it -- and the blur handler
    // hid the panel before a keyboard user could travel that far anyway
    // (WCAG 1.4.13). Parenting it to the term puts the link at the very next
    // tab stop. It is position:fixed, so this changes tab order without
    // affecting layout.
    if (btn.nextSibling !== popup) {
      suppressObserver = true;
      try {
        btn.insertAdjacentElement('afterend', popup);
      } finally {
        suppressObserver = false;
      }
    }
    btn.setAttribute('aria-expanded', 'true');
    popup.hidden = false;
    positionPopup(btn);
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (!popup) return;
      if (popup.matches(':hover')) return;
      // Keeps the panel alive while the keyboard is inside it. Without this,
      // moving the pointer away closed the panel under a user who had tabbed
      // into the link.
      if (focusIsInsidePopup()) return;
      if (activeBtn && (activeBtn.matches(':hover') || document.activeElement === activeBtn)) return;
      hidePopup(false);
    }, 150);
  }

  function bindGlobalHandlers() {
    if (HAS_HOVER) {
      document.addEventListener('mouseover', function (e) {
        var btn = e.target.closest && e.target.closest('.defn-term');
        if (btn) showFor(btn);
      });
      document.addEventListener('mouseout', function (e) {
        if (e.target.closest && e.target.closest('.defn-term')) scheduleHide();
      });
    }
    document.addEventListener('focusin', function (e) {
      var btn = e.target.closest && e.target.closest('.defn-term');
      if (btn) {
        if (suppressFocusOpen) return;
        showFor(btn);
      } else if (popup && !e.target.closest('#' + POPUP_ID)) {
        scheduleHide();
      }
    });
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.defn-term');
      if (btn) {
        e.preventDefault();
        if (activeBtn === btn && popup && !popup.hidden && !openedThisInteraction) {
          hidePopup(false);
        } else {
          showFor(btn);
        }
        openedThisInteraction = false;
        return;
      }
      if (popup && !popup.hidden && !e.target.closest('#' + POPUP_ID)) {
        hidePopup(false);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && popup && !popup.hidden) {
        // Return focus to the term, including when Escape is pressed from
        // inside the panel -- otherwise closing it strands focus on a
        // detached node and the next Tab restarts at the top of the page.
        hidePopup(true);
      }
    });
    window.addEventListener('resize', function () {
      if (popup && !popup.hidden && activeBtn) positionPopup(activeBtn);
    });
    window.addEventListener('scroll', function () {
      if (popup && !popup.hidden && activeBtn) positionPopup(activeBtn);
    }, { passive: true });
  }

  function defaultRoots() {
    var roots = [];
    document.querySelectorAll('[data-glossary-scope]').forEach(function (el) { roots.push(el); });
    if (roots.length) return roots;
    var main = document.getElementById('mainContent');
    if (main) {
      // Prefer specific containers inside main to reduce false positives.
      var nodes = main.querySelectorAll('.content-panel, .blog-post-body, .blog-post-card, article, .hero-panel');
      if (nodes.length) {
        nodes.forEach(function (n) { roots.push(n); });
      } else {
        roots.push(main);
      }
    }
    return roots;
  }

  function applyTo(root) {
    if (!indexRef) return;
    if (!root) {
      defaultRoots().forEach(function (r) { processRoot(r, indexRef); });
      return;
    }
    if (root.nodeType === 1) processRoot(root, indexRef);
  }

  function setupObserver() {
    var main = document.getElementById('mainContent');
    if (!main || typeof MutationObserver !== 'function') return;
    var pending = false;
    var queued = [];
    var obs = new MutationObserver(function (mutations) {
      if (suppressObserver) return;
      mutations.forEach(function (m) {
        m.addedNodes && m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (isInsideGlossaryNode(node)) return;
          queued.push(node);
        });
      });
      if (queued.length && !pending) {
        pending = true;
        requestAnimationFrame(function () {
          pending = false;
          var batch = queued.splice(0);
          batch.forEach(function (node) {
            if (!document.contains(node)) return;
            // Reset processed flag for genuinely new subtrees so they get scanned.
            applyTo(node);
          });
        });
      }
    });
    obs.observe(main, { childList: true, subtree: true });
  }

  function init() {
    injectStyles();
    bindGlobalHandlers();
    loadTerms().then(function (terms) {
      if (!terms || !terms.length) return;
      indexRef = buildIndex(terms);
      setupObserver();
      applyTo(null);
    });
  }

  window.GematriaGlossary = {
    apply: function (root) { applyTo(root); },
    refresh: function () {
      try { sessionStorage.removeItem(CACHE_KEY); } catch (_) {}
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
