      const faqLoading = document.getElementById('faqLoading');
      const faqError = document.getElementById('faqError');
      const faqBody = document.getElementById('faqBody');
      const faqGroups = document.getElementById('faqGroups');
      const faqToc = document.getElementById('faqToc');
      const faqSearch = document.getElementById('faqSearch');
      const faqSearchStatus = document.getElementById('faqSearchStatus');
      const faqNoResults = document.getElementById('faqNoResults');
      const faqExpandAll = document.getElementById('faqExpandAll');
      const faqCollapseAll = document.getElementById('faqCollapseAll');

      const escapeHtml = (value = '') => String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

      const slugify = (value = '') => String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'faq-item';

      const CATEGORY_RULES = [
        { id: 'getting-started', label: 'Getting started', patterns: [/get(ting)? started/i, /\bnew to\b/i, /how do i (start|begin|use the site)/i, /first (time|step)/i, /\bsign up\b/i] },
        { id: 'calculators', label: 'Calculators', patterns: [/calculator/i, /calculate/i, /\bcipher/i, /\bvalues?\b/i, /name.{0,20}value/i, /word.{0,10}phrase/i] },
        { id: 'methodology', label: 'Methodology', patterns: [/method/i, /pattern/i, /\bmatch/i, /compar/i, /evidence/i, /accuracy/i, /pythagorean/i, /\benglish gematria\b/i, /research/i] },
        { id: 'membership', label: 'Membership & account', patterns: [/\bmember/i, /\baccount/i, /\blogin\b/i, /\bpassword/i, /subscri/i, /billing/i, /premium/i, /supporter/i, /upgrade/i, /payment/i, /cancel/i] },
        { id: 'editorial', label: 'Editorial & trust', patterns: [/editorial/i, /\bpolicy\b/i, /\bsource/i, /disclaim/i, /\btrust/i, /review process/i, /author/i, /correction/i] },
      ];
      const FALLBACK_CATEGORY = { id: 'general', label: 'General' };

      function categorize(item) {
        const haystack = `${item.question} ${item.answer}`;
        for (const rule of CATEGORY_RULES) {
          if (rule.patterns.some((p) => p.test(haystack))) {
            return rule;
          }
        }
        return FALLBACK_CATEGORY;
      }

      function getBootstrapCollapse(el) {
        if (!window.bootstrap || !window.bootstrap.Collapse) return null;
        return window.bootstrap.Collapse.getOrCreateInstance(el, { toggle: false });
      }

      function setAllCollapsed(collapsed) {
        const panels = faqGroups.querySelectorAll('.accordion-collapse');
        panels.forEach((panel) => {
          const button = document.querySelector(`[data-bs-target="#${panel.id}"]`);
          const instance = getBootstrapCollapse(panel);
          if (instance) {
            collapsed ? instance.hide() : instance.show();
          } else {
            panel.classList.toggle('show', !collapsed);
          }
          if (button) {
            button.classList.toggle('collapsed', collapsed);
            button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
          }
        });
      }

      function renderGroups(items) {
        const buckets = new Map();
        items.forEach((item) => {
          const cat = categorize(item);
          if (!buckets.has(cat.id)) {
            buckets.set(cat.id, { id: cat.id, label: cat.label, items: [] });
          }
          buckets.get(cat.id).items.push(item);
        });

        const orderedIds = [...CATEGORY_RULES.map((r) => r.id), FALLBACK_CATEGORY.id];
        const groups = orderedIds
          .map((id) => buckets.get(id))
          .filter(Boolean);

        faqGroups.innerHTML = groups.map((group) => `
          <section class="faq-category-section mb-4" id="faq-cat-${group.id}" data-faq-category="${group.id}">
            <h2 class="h4 faq-category-heading mb-3">${escapeHtml(group.label)} <span class="faq-category-count text-muted small">(${group.items.length})</span></h2>
            <div class="accordion faq-accordion-group">
              ${group.items.map((item) => {
                const slug = slugify(item.question);
                const headingId = `faqHeading-${slug}`;
                const panelId = `faqPanel-${slug}`;
                return `
                  <div class="accordion-item faq-card mb-3 border-0" data-faq-question="${escapeHtml(item.question.toLowerCase())}" data-faq-answer="${escapeHtml(item.answer.toLowerCase())}" data-faq-slug="${escapeHtml(slug)}">
                    <h3 class="accordion-header" id="${headingId}">
                      <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${panelId}" aria-expanded="false" aria-controls="${panelId}">${escapeHtml(item.question)}</button>
                    </h3>
                    <div id="${panelId}" class="accordion-collapse collapse" aria-labelledby="${headingId}">
                      <div class="accordion-body">
                        ${escapeHtml(item.answer).replaceAll('\n', '<br /><br />')}
                        <p class="faq-share mt-3 mb-0 small">
                          <a href="#${panelId}" class="faq-share__link" data-faq-share="${escapeHtml(slug)}">Link to this answer</a>
                        </p>
                      </div>
                    </div>
                  </div>`;
              }).join('')}
            </div>
          </section>`).join('');

        faqToc.innerHTML = groups.map((group) => `
          <li class="faq-toc__item">
            <a class="faq-toc__link" href="#faq-cat-${group.id}" data-faq-toc="${group.id}">
              <span class="faq-toc__label">${escapeHtml(group.label)}</span>
              <span class="faq-toc__count">${group.items.length}</span>
            </a>
          </li>`).join('');

        return groups;
      }

      function applySearch(term, totalCount) {
        const normalized = (term || '').trim().toLowerCase();
        const sections = faqGroups.querySelectorAll('.faq-category-section');
        let visible = 0;
        sections.forEach((section) => {
          const cards = section.querySelectorAll('.accordion-item');
          let sectionVisible = 0;
          cards.forEach((node) => {
            if (!normalized) {
              node.hidden = false;
              sectionVisible++;
              return;
            }
            const q = node.getAttribute('data-faq-question') || '';
            const a = node.getAttribute('data-faq-answer') || '';
            const match = q.includes(normalized) || a.includes(normalized);
            node.hidden = !match;
            if (match) sectionVisible++;
          });
          section.hidden = sectionVisible === 0;
          visible += sectionVisible;
        });

        // Hide TOC entries whose section is hidden.
        const tocLinks = faqToc.querySelectorAll('[data-faq-toc]');
        tocLinks.forEach((link) => {
          const id = link.getAttribute('data-faq-toc');
          const section = faqGroups.querySelector(`#faq-cat-${id}`);
          link.parentElement.hidden = !!(section && section.hidden);
        });

        if (faqSearchStatus) {
          faqSearchStatus.textContent = normalized
            ? `${visible} of ${totalCount} questions match “${term.trim()}”.`
            : `${totalCount} questions available.`;
        }
        if (faqNoResults) faqNoResults.classList.toggle('d-none', visible > 0);
      }

      function updateUrlParam(name, value) {
        try {
          const url = new URL(window.location.href);
          if (value) {
            url.searchParams.set(name, value);
          } else {
            url.searchParams.delete(name);
          }
          window.history.replaceState(null, '', url);
        } catch {
          /* ignore */
        }
      }

      function injectFaqSchema(items) {
        const head = document.head;
        if (!head) return;
        // Remove existing FAQPage schema scripts to avoid duplicates.
        const existing = head.querySelectorAll('script[type="application/ld+json"]');
        existing.forEach((script) => {
          try {
            const parsed = JSON.parse(script.textContent || '{}');
            if (parsed && parsed['@type'] === 'FAQPage') {
              script.remove();
            }
          } catch {
            /* ignore */
          }
        });
        const schema = {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: items.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: { '@type': 'Answer', text: item.answer },
          })),
          author: { '@type': 'Organization', name: 'Gematria.Today Editorial Team' },
          dateModified: '2026-03-28',
          mainEntityOfPage: 'https://gematria.today/faq.html',
        };
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(schema);
        head.appendChild(script);
      }

      // Pull seed items from the existing static JSON-LD so they participate
      // in dedupe even before we replace the schema.
      const schemaFaqItems = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .flatMap((scriptElement) => {
          try {
            const schema = JSON.parse(scriptElement.textContent || '{}');
            const entities = Array.isArray(schema?.mainEntity) ? schema.mainEntity : [];
            return entities
              .map((entry) => ({
                question: entry?.name,
                answer: entry?.acceptedAnswer?.text,
              }))
              .filter((entry) => entry.question && entry.answer);
          } catch {
            return [];
          }
        });

      // Buffer any term typed before the network response lands so the search
      // input feels live from first paint instead of looking inert. Applied
      // for real once the items render.
      let pendingSearchTerm = '';
      faqSearch?.addEventListener('input', function bufferPreLoadInput() {
        pendingSearchTerm = faqSearch.value;
      });

      // /api/public-faqs returns one page at a time. Asking once, with no
      // limit, silently dropped every published FAQ past the API's default
      // page size from both the page and its FAQPage schema.
      const FAQ_PAGE_SIZE = 100;
      const MAX_FAQ_PAGES = 20;
      const fetchFaqPage = (offset) => fetch(`/api/public-faqs?limit=${FAQ_PAGE_SIZE}&offset=${offset}`)
        .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
        .then(({ ok, payload }) => {
          if (!ok) {
            throw new Error(payload.error || 'Failed to load FAQ entries');
          }
          return payload;
        });
      const fetchAllPublishedFaqs = async () => {
        const collected = [];
        let offset = 0;
        for (let page = 0; page < MAX_FAQ_PAGES; page += 1) {
          const payload = await fetchFaqPage(offset);
          collected.push(...(payload.items || []));
          const nextOffset = Number(payload.nextOffset);
          if (!payload.hasMore || !Number.isFinite(nextOffset) || nextOffset <= offset) {
            break;
          }
          offset = nextOffset;
        }
        return collected;
      };

      fetchAllPublishedFaqs()
        .then((publishedItems) => {
          const uniqueByQuestion = new Map();

          [...publishedItems, ...schemaFaqItems].forEach((item) => {
            const question = String(item?.question || '').trim();
            const answer = String(item?.answer || '').trim();
            if (!question || !answer) return;
            if (!uniqueByQuestion.has(question.toLowerCase())) {
              uniqueByQuestion.set(question.toLowerCase(), { question, answer });
            }
          });

          const items = Array.from(uniqueByQuestion.values());
          if (!items.length) {
            faqLoading.textContent = 'No FAQ entries have been published yet.';
            return;
          }

          faqLoading.classList.add('d-none');
          faqBody.classList.remove('d-none');
          renderGroups(items);
          injectFaqSchema(items);

          if (faqSearch) {
            faqSearch.disabled = false;
          }
          if (faqSearchStatus) {
            faqSearchStatus.textContent = `${items.length} questions available.`;
          }

          // Deep-link: ?q=<term>. Also replay anything the user typed while
          // we were still loading.
          const params = new URLSearchParams(window.location.search);
          const initialQuery = params.get('q') || pendingSearchTerm || '';
          if (initialQuery && faqSearch) {
            faqSearch.value = initialQuery;
            applySearch(initialQuery, items.length);
          }

          // Deep-link: ?id=<slug> or hash #faqPanel-<slug>
          let targetSlug = params.get('id') || '';
          if (!targetSlug && window.location.hash.startsWith('#faqPanel-')) {
            targetSlug = window.location.hash.slice('#faqPanel-'.length);
          }
          if (targetSlug) {
            const card = faqGroups.querySelector(`[data-faq-slug="${CSS.escape(targetSlug)}"]`);
            if (card) {
              const panel = card.querySelector('.accordion-collapse');
              const button = card.querySelector('.accordion-button');
              if (panel) {
                const instance = getBootstrapCollapse(panel);
                if (instance) {
                  instance.show();
                } else {
                  panel.classList.add('show');
                }
              }
              if (button) {
                button.classList.remove('collapsed');
                button.setAttribute('aria-expanded', 'true');
              }
              // Defer scroll so layout settles after content swap.
              window.setTimeout(() => {
                card.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // The panel id is created in JS, so native fragment focus never
                // applies -- arriving from a ?id= link (the site chatbot emits
                // exactly these) left focus on <body>, so the next Tab started
                // over from the top of the page.
                button?.focus({ preventScroll: true });
              }, 60);
            }
          }

          let faqSearchTimer = null;
          faqSearch?.addEventListener('input', () => {
            if (faqSearchTimer) window.clearTimeout(faqSearchTimer);
            faqSearchTimer = window.setTimeout(() => {
              const term = faqSearch.value;
              applySearch(term, items.length);
              updateUrlParam('q', term.trim());
            }, 120);
          });

          faqExpandAll?.addEventListener('click', () => setAllCollapsed(false));
          faqCollapseAll?.addEventListener('click', () => setAllCollapsed(true));

          // Copy a deep link to a specific answer.
          faqGroups.addEventListener('click', (event) => {
            const link = event.target.closest('[data-faq-share]');
            if (!link) return;
            event.preventDefault();
            const slug = link.getAttribute('data-faq-share');
            try {
              const url = new URL(window.location.href);
              url.searchParams.set('id', slug);
              url.hash = `faqPanel-${slug}`;
              window.history.replaceState(null, '', url);
              if (navigator.clipboard) {
                navigator.clipboard.writeText(url.toString()).catch(() => {});
              }
              const original = link.textContent;
              link.textContent = 'Link copied';
              window.setTimeout(() => { link.textContent = original; }, 1500);
            } catch {
              /* ignore */
            }
          });

          // Highlight the active category in the TOC as the user scrolls.
          if ('IntersectionObserver' in window) {
            const sections = faqGroups.querySelectorAll('.faq-category-section');
            const observer = new IntersectionObserver((entries) => {
              entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const id = entry.target.getAttribute('data-faq-category');
                faqToc.querySelectorAll('[data-faq-toc]').forEach((link) => {
                  link.classList.toggle('is-active', link.getAttribute('data-faq-toc') === id);
                });
              });
            }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });
            sections.forEach((section) => observer.observe(section));
          }
        })
        .catch((error) => {
          faqLoading.classList.add('d-none');
          faqError.textContent = error.message;
          faqError.classList.remove('d-none');
          // Surface a visible dead-search state instead of leaving the input
          // looking like it still works.
          if (faqSearch) {
            faqSearch.disabled = true;
          }
          if (faqSearchStatus) {
            faqSearchStatus.textContent = 'Search index unavailable. Try refreshing the page.';
          }
        });
