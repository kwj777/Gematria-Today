      const faqLoading = document.getElementById('faqLoading');
      const faqError = document.getElementById('faqError');
      const faqAccordion = document.getElementById('faqAccordion');
      const faqPageLoadingOverlay = document.getElementById('faqPageLoadingOverlay');

      function hideFaqPageLoadingOverlay() {
        if (faqPageLoadingOverlay) {
          faqPageLoadingOverlay.hidden = true;
        }
      }

      const escapeHtml = (value = '') => String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

      const schemaFaqItems = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .flatMap((scriptElement) => {
          try {
            const schema = JSON.parse(scriptElement.textContent || '{}');
            const entities = Array.isArray(schema?.mainEntity) ? schema.mainEntity : [];
            return entities
              .map((entry) => ({
                question: entry?.name,
                answer: entry?.acceptedAnswer?.text
              }))
              .filter((entry) => entry.question && entry.answer);
          } catch {
            return [];
          }
        });

      fetch('/api/public-faqs')
        .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
        .then(({ ok, payload }) => {
          if (!ok) {
            throw new Error(payload.error || 'Failed to load FAQ entries');
          }

          const publishedItems = payload.items || [];
          const uniqueByQuestion = new Map();

          [...publishedItems, ...schemaFaqItems].forEach((item) => {
            const question = String(item?.question || '').trim();
            const answer = String(item?.answer || '').trim();
            if (!question || !answer) {
              return;
            }
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
          faqAccordion.classList.remove('d-none');
          faqAccordion.innerHTML = items.map((item, index) => `
            <div class="accordion-item faq-card ${index < items.length - 1 ? 'mb-3' : ''} border-0" data-faq-question="${escapeHtml(item.question.toLowerCase())}" data-faq-answer="${escapeHtml(item.answer.toLowerCase())}">
              <h2 class="accordion-header" id="faqHeading${index}">
                <button class="accordion-button ${index === 0 ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#faqPanel${index}" aria-expanded="${index === 0 ? 'true' : 'false'}" aria-controls="faqPanel${index}">${escapeHtml(item.question)}</button>
              </h2>
              <div id="faqPanel${index}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}" aria-labelledby="faqHeading${index}" data-bs-parent="#faqAccordion">
                <div class="accordion-body">${escapeHtml(item.answer).replaceAll('\n', '<br /><br />')}</div>
              </div>
            </div>`).join('');

          const faqSearchShell = document.getElementById('faqSearchShell');
          const faqSearch = document.getElementById('faqSearch');
          const faqSearchStatus = document.getElementById('faqSearchStatus');
          const faqNoResults = document.getElementById('faqNoResults');
          if (faqSearchShell) faqSearchShell.classList.remove('d-none');
          if (faqSearchStatus) faqSearchStatus.textContent = `${items.length} questions available.`;

          let faqSearchTimer = null;
          faqSearch?.addEventListener('input', () => {
            if (faqSearchTimer) window.clearTimeout(faqSearchTimer);
            faqSearchTimer = window.setTimeout(() => {
              const term = faqSearch.value.trim().toLowerCase();
              const accordionItems = faqAccordion.querySelectorAll('.accordion-item');
              let visible = 0;
              accordionItems.forEach((node) => {
                if (!term) {
                  node.hidden = false;
                  visible++;
                  return;
                }
                const q = node.getAttribute('data-faq-question') || '';
                const a = node.getAttribute('data-faq-answer') || '';
                const match = q.includes(term) || a.includes(term);
                node.hidden = !match;
                if (match) visible++;
              });
              if (faqSearchStatus) {
                faqSearchStatus.textContent = term
                  ? `${visible} of ${items.length} questions match "${term}".`
                  : `${items.length} questions available.`;
              }
              if (faqNoResults) faqNoResults.classList.toggle('d-none', visible > 0);
            }, 120);
          });
        })
        .catch((error) => {
          faqLoading.classList.add('d-none');
          faqError.textContent = error.message;
          faqError.classList.remove('d-none');
        })
        .finally(() => {
          hideFaqPageLoadingOverlay();
        });
