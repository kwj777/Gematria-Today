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
          var txt = clone.textContent.replace(/\s+/g, ' ').trim();
          if (txt.length > 260) txt = txt.slice(0, 257).replace(/\s+\S*$/, '') + '…';
          return txt;
        }

        main.querySelectorAll('dl').forEach(function (dl) {
          var kids = Array.from(dl.children);
          for (var i = 0; i < kids.length; i++) {
            if (kids[i].tagName !== 'DT') continue;
            var dt = kids[i];
            var dd = kids[i + 1];
            if (!dd || dd.tagName !== 'DD') continue;
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

            terms.push({ slug: slug, label: label, dtId: dt.id, dd: dd, aliases: aliases });
          }
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

        if (!aliasIndex.length) return;

        var union = aliasIndex.map(function (a) { return escapeRegex(a.alias); }).join('|');
        var re = new RegExp('\\b(' + union + ')\\b', 'gi');

        function findTermFor(matchText) {
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

        function shouldSkipParent(node, root) {
          var p = node.parentNode;
          while (p && p !== root) {
            var tag = p.tagName;
            if (tag === 'A' || tag === 'BUTTON' || tag === 'CODE') return true;
            if (p.classList && p.classList.contains('defn-term')) return true;
            p = p.parentNode;
          }
          return false;
        }

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

        document.addEventListener('mouseover', function (e) {
          var btn = e.target.closest('.defn-term');
          if (btn) showFor(btn);
        });
        document.addEventListener('mouseout', function (e) {
          if (e.target.closest('.defn-term')) scheduleHide();
        });
        popup.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
        popup.addEventListener('mouseleave', scheduleHide);
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
      })();
