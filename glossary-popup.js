(function () {
  if (window.__gematriaGlossaryLoaded) return;
  window.__gematriaGlossaryLoaded = true;

  var CACHE_KEY = 'gematria.glossary.v1';
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
    '.defn-term:hover,.defn-term:focus-visible{outline:none;border-bottom-style:solid;color:#0d6efd;}' +
    '.defn-popup{position:absolute;z-index:1080;max-width:320px;background:#0f172a;color:#f8fafc;padding:.75rem .9rem;border-radius:.5rem;box-shadow:0 10px 28px rgba(15,23,42,.35);font-size:.875rem;line-height:1.45;}' +
    '.defn-popup[hidden]{display:none;}' +
    '.defn-popup__title{font-weight:600;margin-bottom:.25rem;}' +
    '.defn-popup__body{margin:0 0 .5rem;color:#e2e8f0;}' +
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
    main.querySelectorAll('dl').forEach(function (dl) {
      var kids = Array.from(dl.children);
      for (var i = 0; i < kids.length; i++) {
        if (kids[i].tagName !== 'DT') continue;
        var dt = kids[i];
        var dd = kids[i + 1];
        if (!dd || dd.tagName !== 'DD') continue;
        var label = (dt.textContent || '').trim();
        if (!label) continue;
        var slug = dt.id && dt.id.indexOf('defn-') === 0 ? dt.id.slice(5) : slugify(label);
        var defText = (dd.textContent || '').replace(/\s+/g, ' ').trim();
        if (defText.length > 260) defText = defText.slice(0, 257).replace(/\s+\S*$/, '') + '…';
        terms.push({
          slug: slug,
          label: label,
          definition: defText,
          aliases: buildAliases(label)
        });
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
    A: 1, BUTTON: 1, CODE: 1, PRE: 1, INPUT: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1,
    LABEL: 1, NAV: 1, HEADER: 1, FOOTER: 1, FORM: 1, SCRIPT: 1, STYLE: 1, NOSCRIPT: 1,
    H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1
  };

  function ancestorDisallowed(node, root) {
    var p = node.parentNode;
    while (p && p !== root && p.nodeType === 1) {
      if (SKIP_TAGS[p.tagName]) return true;
      var cls = p.classList;
      if (cls) {
        if (cls.contains('defn-term') || cls.contains('defn-popup')) return true;
        if (cls.contains('no-glossary')) return true;
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
        btn.setAttribute('aria-describedby', POPUP_ID);
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

  function ensurePopup() {
    if (popup) return popup;
    popup = document.createElement('div');
    popup.id = POPUP_ID;
    popup.className = 'defn-popup';
    popup.setAttribute('role', 'tooltip');
    popup.hidden = true;
    document.body.appendChild(popup);
    popup.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
    popup.addEventListener('mouseleave', scheduleHide);
    return popup;
  }

  function buildPopup(term) {
    popup.innerHTML = '';
    var title = document.createElement('div');
    title.className = 'defn-popup__title';
    title.textContent = term.label;
    var body = document.createElement('p');
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

  function positionPopup(btn) {
    popup.style.left = '0px';
    popup.style.top = '0px';
    var r = btn.getBoundingClientRect();
    var pr = popup.getBoundingClientRect();
    var docW = document.documentElement.clientWidth;
    var top = window.scrollY + r.bottom + 8;
    var left = window.scrollX + r.left + (r.width / 2) - (pr.width / 2);
    var minLeft = window.scrollX + 8;
    var maxLeft = window.scrollX + docW - pr.width - 8;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;
    if (r.bottom + pr.height + 16 > document.documentElement.clientHeight && r.top > pr.height + 16) {
      top = window.scrollY + r.top - pr.height - 8;
    }
    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
  }

  function showFor(btn) {
    if (!indexRef) return;
    ensurePopup();
    clearTimeout(hideTimer);
    var slug = btn.getAttribute('data-defn-slug');
    var term = indexRef.bySlug[slug];
    if (!term) return;
    activeBtn = btn;
    buildPopup(term);
    popup.hidden = false;
    positionPopup(btn);
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (!popup) return;
      if (popup.matches(':hover')) return;
      if (activeBtn && (activeBtn.matches(':hover') || document.activeElement === activeBtn)) return;
      popup.hidden = true;
      activeBtn = null;
    }, 150);
  }

  function bindGlobalHandlers() {
    document.addEventListener('mouseover', function (e) {
      var btn = e.target.closest && e.target.closest('.defn-term');
      if (btn) showFor(btn);
    });
    document.addEventListener('mouseout', function (e) {
      if (e.target.closest && e.target.closest('.defn-term')) scheduleHide();
    });
    document.addEventListener('focusin', function (e) {
      var btn = e.target.closest && e.target.closest('.defn-term');
      if (btn) showFor(btn);
      else if (popup && !e.target.closest('#' + POPUP_ID)) scheduleHide();
    });
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.defn-term');
      if (btn) {
        e.preventDefault();
        if (activeBtn === btn && popup && !popup.hidden) {
          popup.hidden = true;
          activeBtn = null;
        } else {
          showFor(btn);
        }
        return;
      }
      if (popup && !popup.hidden && !e.target.closest('#' + POPUP_ID)) {
        popup.hidden = true;
        activeBtn = null;
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && popup && !popup.hidden) {
        popup.hidden = true;
        if (activeBtn) activeBtn.focus();
        activeBtn = null;
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
