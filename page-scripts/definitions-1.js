      (function () {
        var main = document.getElementById('mainContent');
        if (!main) return;

        var terms = [];
        var aliasIndex = [];

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

        function shortDef(dd) {
          var clone = dd.cloneNode(true);
          clone.querySelectorAll('button.defn-term').forEach(function (b) {
            b.replaceWith(document.createTextNode(b.textContent));
          });
          clone.querySelectorAll('.defn-example').forEach(function (b) { b.remove(); });
          var txt = clone.textContent.replace(/\s+/g, ' ').trim();
          if (txt.length > 260) txt = txt.slice(0, 257).replace(/\s+\S*$/, '') + '…';
          return txt;
        }

        // Walk every <dl> and collect dt/dd pairs whether they are direct
        // children of the <dl> or wrapped in a <div class="defn-card">.
        function collectPairs(dl) {
          var pairs = [];
          Array.from(dl.children).forEach(function (child) {
            if (child.tagName === 'DT') {
              var dt = child;
              var dd = dt.nextElementSibling;
              while (dd && dd.tagName !== 'DD') dd = dd.nextElementSibling;
              if (dd) pairs.push({ dt: dt, dd: dd, card: null });
            } else if (child.tagName === 'DIV') {
              var dt2 = child.querySelector(':scope > .defn-card__head > dt, :scope > dt');
              var dd2 = child.querySelector(':scope > dd');
              if (dt2 && dd2) pairs.push({ dt: dt2, dd: dd2, card: child });
            }
          });
          return pairs;
        }

        main.querySelectorAll('dl').forEach(function (dl) {
          collectPairs(dl).forEach(function (pair) {
            var dt = pair.dt;
            var dd = pair.dd;
            var label = dt.textContent.trim();
            var slug = slugify(label);
            if (!dt.id) dt.id = 'defn-' + slug;

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
            aliases = aliases.filter(function (a, idx) { return aliases.indexOf(a) === idx; });

            terms.push({
              slug: slug,
              label: label,
              dtId: dt.id,
              dt: dt,
              dd: dd,
              card: pair.card,
              aliases: aliases
            });
          });
        });

        var termsBySlug = {};
        terms.forEach(function (t) {
          termsBySlug[t.slug] = t;
          t.aliasSet = new Set(t.aliases.map(function (a) { return a.toLowerCase(); }));
          t.aliases.forEach(function (a) {
            aliasIndex.push({ alias: a, lower: a.toLowerCase(), term: t });
          });
        });
        aliasIndex.sort(function (a, b) { return b.alias.length - a.alias.length; });

        // ---------- Cross-link terms inside definitions ----------
        if (aliasIndex.length) {
          var union = aliasIndex.map(function (a) { return escapeRegex(a.alias); }).join('|');
          var re = new RegExp('\\b(' + union + ')\\b', 'gi');

          var findTermFor = function (matchText) {
            var lower = matchText.toLowerCase();
            for (var i = 0; i < aliasIndex.length; i++) {
              if (aliasIndex[i].lower === lower) return aliasIndex[i].term;
            }
            var singular = lower.replace(/ies$/, 'y').replace(/s$/, '');
            for (var j = 0; j < aliasIndex.length; j++) {
              if (aliasIndex[j].lower === singular) return aliasIndex[j].term;
            }
            return null;
          };

          var shouldSkipParent = function (node, root) {
            var p = node.parentNode;
            while (p && p !== root) {
              var tag = p.tagName;
              if (tag === 'A' || tag === 'BUTTON' || tag === 'CODE') return true;
              if (p.classList && (p.classList.contains('defn-term') || p.classList.contains('defn-example'))) return true;
              p = p.parentNode;
            }
            return false;
          };

          terms.forEach(function (term) {
            var walker = document.createTreeWalker(term.dd, NodeFilter.SHOW_TEXT, null);
            var nodes = [];
            var n;
            while ((n = walker.nextNode())) {
              if (!shouldSkipParent(n, term.dd)) nodes.push(n);
            }
            nodes.forEach(function (textNode) {
              var text = textNode.nodeValue;
              re.lastIndex = 0;
              if (!re.test(text)) return;
              re.lastIndex = 0;
              var frag = document.createDocumentFragment();
              var lastIdx = 0;
              var m;
              var replaced = false;
              while ((m = re.exec(text))) {
                var matched = m[0];
                var lookup = findTermFor(matched);
                if (!lookup) continue;
                if (lookup === term) continue;
                if (term.aliasSet.has(matched.toLowerCase())) continue;
                frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'defn-term';
                btn.setAttribute('data-defn-slug', lookup.slug);
                btn.setAttribute('aria-describedby', 'defn-popup');
                btn.textContent = matched;
                frag.appendChild(btn);
                lastIdx = m.index + matched.length;
                replaced = true;
              }
              if (!replaced) return;
              frag.appendChild(document.createTextNode(text.slice(lastIdx)));
              textNode.parentNode.replaceChild(frag, textNode);
            });
          });
        }

        // ---------- Hover popup ----------
        var popup = document.createElement('div');
        popup.id = 'defn-popup';
        popup.className = 'defn-popup';
        popup.setAttribute('role', 'tooltip');
        popup.hidden = true;
        document.body.appendChild(popup);

        var activeBtn = null;
        var hideTimer = null;

        function buildPopup(term) {
          popup.innerHTML = '';
          var title = document.createElement('div');
          title.className = 'defn-popup__title';
          title.textContent = term.label;
          var body = document.createElement('p');
          body.className = 'defn-popup__body';
          body.textContent = shortDef(term.dd);
          var link = document.createElement('a');
          link.className = 'defn-popup__link';
          link.href = '#' + term.dtId;
          link.textContent = 'Jump to full definition →';
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
          clearTimeout(hideTimer);
          var slug = btn.getAttribute('data-defn-slug');
          var term = termsBySlug[slug];
          if (!term) return;
          activeBtn = btn;
          buildPopup(term);
          popup.hidden = false;
          positionPopup(btn);
        }

        function scheduleHide() {
          clearTimeout(hideTimer);
          hideTimer = setTimeout(function () {
            if (popup.matches(':hover')) return;
            if (activeBtn && (activeBtn.matches(':hover') || document.activeElement === activeBtn)) return;
            popup.hidden = true;
            activeBtn = null;
          }, 150);
        }

        // On touch-only devices iOS treats the first tap on a hoverable
        // element as a hover preview and withholds the click event until the
        // second tap. Only attach hover triggers on devices with real hover.
        var hasHover = !!(window.matchMedia && window.matchMedia('(hover: hover)').matches);
        if (hasHover) {
          document.addEventListener('mouseover', function (e) {
            var btn = e.target.closest('.defn-term');
            if (btn) showFor(btn);
          });
          document.addEventListener('mouseout', function (e) {
            if (e.target.closest('.defn-term')) scheduleHide();
          });
          popup.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
          popup.addEventListener('mouseleave', scheduleHide);
        }
        document.addEventListener('focusin', function (e) {
          var btn = e.target.closest('.defn-term');
          if (btn) showFor(btn);
          else if (!e.target.closest('#defn-popup')) scheduleHide();
        });
        document.addEventListener('click', function (e) {
          var btn = e.target.closest('.defn-term');
          if (btn) {
            e.preventDefault();
            if (activeBtn === btn && !popup.hidden) {
              popup.hidden = true;
              activeBtn = null;
            } else {
              showFor(btn);
            }
            return;
          }
          if (!e.target.closest('#defn-popup')) {
            popup.hidden = true;
            activeBtn = null;
          }
        });
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape' && !popup.hidden) {
            popup.hidden = true;
            if (activeBtn) activeBtn.focus();
            activeBtn = null;
          }
        });
        window.addEventListener('resize', function () {
          if (!popup.hidden && activeBtn) positionPopup(activeBtn);
        });
        window.addEventListener('scroll', function () {
          if (!popup.hidden && activeBtn) positionPopup(activeBtn);
        }, { passive: true });

        // ---------- A–Z jump strip ----------
        var azContainer = document.getElementById('glossaryAz');
        if (azContainer) {
          var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
          var firstTermByLetter = {};
          terms.forEach(function (t) {
            var first = t.label.charAt(0).toUpperCase();
            if (first >= 'A' && first <= 'Z' && !firstTermByLetter[first]) {
              firstTermByLetter[first] = t;
            }
          });
          letters.forEach(function (letter) {
            var target = firstTermByLetter[letter];
            if (target) {
              var a = document.createElement('a');
              a.href = '#' + target.dtId;
              a.textContent = letter;
              a.setAttribute('aria-label', 'Jump to terms starting with ' + letter);
              azContainer.appendChild(a);
            } else {
              var s = document.createElement('span');
              s.className = 'is-disabled';
              s.textContent = letter;
              s.setAttribute('aria-hidden', 'true');
              azContainer.appendChild(s);
            }
          });
        }

        // ---------- Per-card section counts ----------
        var sectionEls = Array.from(main.querySelectorAll('.defn-section'));
        function updateSectionCounts() {
          sectionEls.forEach(function (section) {
            var countEl = section.querySelector('[data-section-count]');
            if (!countEl) return;
            var cards = section.querySelectorAll('.defn-card');
            var visible = 0;
            cards.forEach(function (c) { if (!c.hidden) visible++; });
            if (visible === cards.length) {
              countEl.textContent = cards.length + ' term' + (cards.length === 1 ? '' : 's');
            } else {
              countEl.textContent = visible + ' of ' + cards.length;
            }
          });
        }
        updateSectionCounts();

        // ---------- Live filter ----------
        var searchInput = document.getElementById('glossarySearchInput');
        var clearBtn = document.getElementById('glossarySearchClear');
        var countEl = document.getElementById('glossarySearchCount');
        var noResultsEl = document.getElementById('glossaryNoResults');
        var allCards = Array.from(main.querySelectorAll('.defn-card'));

        function clearHighlights() {
          allCards.forEach(function (card) {
            card.querySelectorAll('mark.defn-hl').forEach(function (m) {
              var parent = m.parentNode;
              parent.replaceChild(document.createTextNode(m.textContent), m);
              parent.normalize();
            });
          });
        }

        function highlightInCard(card, query) {
          if (!query) return;
          var qLower = query.toLowerCase();
          var qLen = query.length;
          var walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
              if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
              var p = node.parentNode;
              while (p && p !== card) {
                if (p.tagName === 'BUTTON' || p.classList && p.classList.contains('defn-anchor')) return NodeFilter.FILTER_REJECT;
                p = p.parentNode;
              }
              return node.nodeValue.toLowerCase().indexOf(qLower) === -1
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT;
            }
          });
          var toProcess = [];
          var n;
          while ((n = walker.nextNode())) toProcess.push(n);
          toProcess.forEach(function (textNode) {
            var text = textNode.nodeValue;
            var lower = text.toLowerCase();
            var frag = document.createDocumentFragment();
            var i = 0;
            var idx;
            while ((idx = lower.indexOf(qLower, i)) !== -1) {
              if (idx > i) frag.appendChild(document.createTextNode(text.slice(i, idx)));
              var mark = document.createElement('mark');
              mark.className = 'defn-hl';
              mark.textContent = text.slice(idx, idx + qLen);
              frag.appendChild(mark);
              i = idx + qLen;
            }
            if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
            textNode.parentNode.replaceChild(frag, textNode);
          });
        }

        function cardMatches(card, query) {
          if (!query) return true;
          var q = query.toLowerCase();
          var dt = card.querySelector('dt');
          var dd = card.querySelector('dd');
          var label = dt ? dt.textContent.toLowerCase() : '';
          var def = dd ? dd.textContent.toLowerCase() : '';
          if (label.indexOf(q) !== -1) return true;
          if (def.indexOf(q) !== -1) return true;
          // Match against aliases
          var slug = dt && dt.id ? dt.id.replace(/^defn-/, '') : null;
          var term = slug ? termsBySlug[slug] : null;
          if (term) {
            for (var i = 0; i < term.aliases.length; i++) {
              if (term.aliases[i].toLowerCase().indexOf(q) !== -1) return true;
            }
          }
          return false;
        }

        function applyFilter(rawQuery) {
          var query = (rawQuery || '').trim();
          clearHighlights();
          var visibleCount = 0;
          allCards.forEach(function (card) {
            var match = cardMatches(card, query);
            card.hidden = !match;
            if (match) {
              visibleCount++;
              if (query) highlightInCard(card, query);
            }
          });
          sectionEls.forEach(function (section) {
            var anyVisible = section.querySelectorAll('.defn-card:not([hidden])').length > 0;
            section.classList.toggle('is-empty', !anyVisible);
          });
          updateSectionCounts();
          if (clearBtn) clearBtn.hidden = !query;
          if (noResultsEl) noResultsEl.classList.toggle('is-visible', !!query && visibleCount === 0);
          if (countEl) {
            if (query) {
              countEl.hidden = false;
              countEl.textContent = visibleCount + ' of ' + allCards.length + ' term' + (allCards.length === 1 ? '' : 's') + ' shown';
            } else {
              countEl.hidden = true;
              countEl.textContent = '';
            }
          }
          // Dim A–Z letters that have no visible match
          if (azContainer) {
            var visibleFirsts = {};
            allCards.forEach(function (card) {
              if (card.hidden) return;
              var dt = card.querySelector('dt');
              if (!dt) return;
              var first = dt.textContent.trim().charAt(0).toUpperCase();
              visibleFirsts[first] = true;
            });
            azContainer.querySelectorAll('a').forEach(function (a) {
              var letter = a.textContent;
              a.classList.toggle('is-disabled', !!query && !visibleFirsts[letter]);
            });
          }
        }

        if (searchInput) {
          var debounceTimer = null;
          searchInput.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            var v = searchInput.value;
            debounceTimer = setTimeout(function () { applyFilter(v); }, 80);
          });
          searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && searchInput.value) {
              e.preventDefault();
              searchInput.value = '';
              applyFilter('');
            }
          });
        }
        if (clearBtn) {
          clearBtn.addEventListener('click', function () {
            if (!searchInput) return;
            searchInput.value = '';
            applyFilter('');
            searchInput.focus();
          });
        }
        // Keyboard shortcut: "/" focuses the search box
        document.addEventListener('keydown', function (e) {
          if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
            var t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            if (searchInput) {
              e.preventDefault();
              searchInput.focus();
              searchInput.select();
            }
          }
        });

        // ---------- Copy-link buttons ----------
        function flashCard(card) {
          if (!card) return;
          card.classList.add('is-flash');
          setTimeout(function () { card.classList.remove('is-flash'); }, 1400);
        }
        document.addEventListener('click', function (e) {
          var anchor = e.target.closest('.defn-anchor');
          if (!anchor) return;
          e.preventDefault();
          var href = anchor.getAttribute('href') || '';
          var hash = href.indexOf('#') >= 0 ? href.slice(href.indexOf('#')) : '';
          if (!hash) return;
          var url = window.location.origin + window.location.pathname + hash;
          var done = function () {
            anchor.classList.add('is-copied');
            var original = anchor.textContent;
            anchor.textContent = '✓';
            setTimeout(function () {
              anchor.classList.remove('is-copied');
              anchor.textContent = original;
            }, 1100);
          };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(done, function () { done(); });
          } else {
            try {
              var ta = document.createElement('textarea');
              ta.value = url;
              ta.setAttribute('readonly', '');
              ta.style.position = 'absolute';
              ta.style.left = '-9999px';
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
            } catch (_) {}
            done();
          }
          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', hash);
          } else {
            window.location.hash = hash;
          }
          var target = document.querySelector(hash);
          var card = target && target.closest ? target.closest('.defn-card') : null;
          flashCard(card);
        });

        // ---------- Active section highlighting in TOC ----------
        var tocLinks = Array.from(document.querySelectorAll('#glossaryTocList a'));
        if (tocLinks.length && 'IntersectionObserver' in window) {
          var linkById = {};
          tocLinks.forEach(function (a) {
            var id = (a.getAttribute('href') || '').replace(/^#/, '');
            if (id) linkById[id] = a;
          });
          var setActive = function (id) {
            tocLinks.forEach(function (a) { a.classList.remove('is-active'); });
            if (id && linkById[id]) linkById[id].classList.add('is-active');
          };
          var visibleSections = new Set();
          var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) visibleSections.add(entry.target.id);
              else visibleSections.delete(entry.target.id);
            });
            // Pick the first section in DOM order that is currently intersecting
            for (var i = 0; i < sectionEls.length; i++) {
              if (visibleSections.has(sectionEls[i].id)) {
                setActive(sectionEls[i].id);
                return;
              }
            }
          }, { rootMargin: '-120px 0px -55% 0px', threshold: 0 });
          sectionEls.forEach(function (s) { if (s.id) io.observe(s); });
        }

        // ---------- Sticky controls shadow ----------
        var controlsEl = document.getElementById('glossaryControls');
        if (controlsEl && 'IntersectionObserver' in window) {
          var sentinel = document.createElement('div');
          sentinel.setAttribute('aria-hidden', 'true');
          sentinel.style.height = '1px';
          controlsEl.parentNode.insertBefore(sentinel, controlsEl);
          var stuckIo = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
              controlsEl.classList.toggle('is-stuck', !entry.isIntersecting);
            });
          }, { threshold: 0 });
          stuckIo.observe(sentinel);
        }

        // ---------- Mobile TOC toggle ----------
        var tocToggle = document.querySelector('.glossary-toc-toggle');
        var tocWrap = document.getElementById('glossaryTocWrap');
        if (tocToggle && tocWrap) {
          tocToggle.addEventListener('click', function () {
            var open = tocWrap.classList.toggle('is-open');
            tocToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
          });
          // Close on link click (mobile)
          tocWrap.addEventListener('click', function (e) {
            if (e.target.tagName === 'A' && window.matchMedia('(max-width: 991.98px)').matches) {
              tocWrap.classList.remove('is-open');
              tocToggle.setAttribute('aria-expanded', 'false');
            }
          });
        }

        // ---------- Highlight current hash on load ----------
        if (window.location.hash) {
          var initial = document.querySelector(window.location.hash);
          var initialCard = initial && initial.closest ? initial.closest('.defn-card') : null;
          if (initialCard) {
            setTimeout(function () { flashCard(initialCard); }, 250);
          }
        }

        // ---------- Print glossary button ----------
        // Triggers the browser's print dialog. The existing @media print
        // rules in theme-deferred.css already strip nav/footer and reset
        // surfaces to white, so the printed/PDF-saved output reads cleanly.
        var printButton = document.getElementById('printGlossaryButton');
        if (printButton && typeof window.print === 'function') {
          printButton.addEventListener('click', function () { window.print(); });
        }
      })();
