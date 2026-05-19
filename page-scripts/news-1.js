      const fallbackFeeds = [
        {
          name: 'Primary Feed',
          url: 'https://example.com/main-feed.xml',
          category: 'Featured',
          notes: 'Use this slot for your highest-priority RSS source while the admin feed list is still empty.',
          latestArticle: {
            title: 'Latest featured article preview',
            excerpt: 'When live feed parsing is unavailable, this fallback shows the expected latest-article layout with an excerpt and a direct article link.',
            link: 'https://example.com/main-article',
            publishedAtLabel: 'Awaiting live feed data'
          }
        },
        {
          name: 'Feed A',
          url: 'https://example.com/feed-a.xml',
          category: 'World',
          notes: 'Example editorial note for a secondary source.',
          latestArticle: {
            title: 'Secondary feed article preview',
            excerpt: 'Each feed card should surface the newest article title, a short excerpt, and a link out to the full story.',
            link: 'https://example.com/article-1',
            publishedAtLabel: 'Sample article'
          }
        },
        {
          name: 'Feed B',
          url: 'https://example.com/feed-b.xml',
          category: 'Alerts',
          notes: 'Use for urgent updates or time-sensitive stories.',
          latestArticle: {
            title: 'Alert feed article preview',
            excerpt: 'Feed cards stay readable even before real RSS data loads from the configured endpoint.',
            link: 'https://example.com/article-2',
            publishedAtLabel: 'Sample article'
          }
        }
      ];
      const escapeHtml = (value = '') => String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

      let allFeeds = [];

      function renderFeaturedEmpty(featuredFeedNode) {
        featuredFeedNode.innerHTML = `<div class="text-center text-muted"><h3 class="h5 mb-2">No feeds match your filters</h3><p class="mb-0 small">Try clearing the search box or selecting "All categories".</p></div>`;
      }

      function renderFeeds(feeds) {
        const featuredFeedNode = document.getElementById('featuredFeed');
        const feedGridNode = document.getElementById('feedGrid');
        featuredFeedNode.setAttribute('aria-busy', 'false');
        feedGridNode.setAttribute('aria-busy', 'false');

        if (!feeds.length) {
          renderFeaturedEmpty(featuredFeedNode);
          feedGridNode.innerHTML = '';
          return;
        }

        const featured = feeds[0];
        const featuredArticle = featured.latestArticle || {};
        featuredFeedNode.innerHTML = `<div><div class="d-flex flex-wrap gap-2 mb-3"><span class="badge text-bg-warning">Featured</span><span class="badge news-source-badge">${escapeHtml(featured.category || 'RSS Feed')}</span><span class="text-muted small align-self-center">${escapeHtml(featuredArticle.publishedAtLabel || 'Latest article')}</span></div><h3 class="display-6 fw-semibold mb-3">${escapeHtml(featuredArticle.title || featured.name)}</h3><p class="mb-3">${escapeHtml(featuredArticle.excerpt || featured.notes || 'Use the admin page to add notes for this source.')}</p>${featured.notes ? `<p class="text-muted small mb-4">Feed notes: ${escapeHtml(featured.notes)}</p>` : '<div class="mb-4"></div>'}<div class="d-flex flex-wrap gap-3 align-items-center"><a class="btn btn-primary" href="${escapeHtml(featuredArticle.link || featured.url)}" target="_blank" rel="noopener noreferrer">Read full article</a></div>${featured.latestArticleError ? `<p class="text-muted small mt-3 mb-0">Latest article unavailable: ${escapeHtml(featured.latestArticleError)}</p>` : '<p class="text-muted small mt-3 mb-0">Opens in a new window.</p>'}</div>`;
        feedGridNode.innerHTML = feeds.map((feed) => {
          const article = feed.latestArticle || {};
          return `<div class="col-md-6 col-xl-4"><article class="news-preview-card h-100 p-4 d-flex flex-column"><div class="d-flex flex-wrap gap-2 mb-3"><span class="badge text-bg-info">${escapeHtml(feed.category || 'RSS Feed')}</span></div><p class="text-muted small mb-2">${escapeHtml(feed.name)}</p><h3 class="h5 mb-3">${escapeHtml(article.title || `${feed.name} latest article unavailable`)}</h3><p class="text-muted mb-3">${escapeHtml(article.excerpt || feed.notes || 'No article excerpt was available from this feed.')}</p>${feed.notes ? `<p class="small text-muted mb-4">Feed notes: ${escapeHtml(feed.notes)}</p>` : '<div class="mb-4"></div>'}<div class="mt-auto d-flex justify-content-between align-items-center gap-3"><span class="small text-muted">${escapeHtml(article.publishedAtLabel || 'Latest article')}</span><a class="news-inline-link" href="${escapeHtml(article.link || feed.url)}" target="_blank" rel="noopener noreferrer">Open article</a></div>${feed.latestArticleError ? `<p class="text-muted small mt-3 mb-0">${escapeHtml(feed.latestArticleError)}</p>` : ''}</article></div>`;
        }).join('');
      }

      function getFilteredFeeds() {
        const categoryValue = document.getElementById('newsCategoryFilter')?.value || '';
        const sortValue = document.getElementById('newsSort')?.value || 'default';
        const searchValue = (document.getElementById('newsSearch')?.value || '').trim().toLowerCase();

        let result = allFeeds.slice();
        if (categoryValue) {
          result = result.filter((feed) => (feed.category || '') === categoryValue);
        }
        if (searchValue) {
          result = result.filter((feed) => {
            const article = feed.latestArticle || {};
            const haystack = [feed.name, feed.category, feed.notes, article.title, article.excerpt]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            return haystack.includes(searchValue);
          });
        }
        if (sortValue === 'source') {
          result.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        }
        return result;
      }

      function populateCategoryFilter() {
        const select = document.getElementById('newsCategoryFilter');
        if (!select) return;
        const previous = select.value;
        const categories = Array.from(new Set(allFeeds.map((feed) => feed.category).filter(Boolean))).sort();
        select.innerHTML = '<option value="">All categories</option>' +
          categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        if (categories.includes(previous)) {
          select.value = previous;
        }
      }

      function updateLastUpdatedLabel() {
        const node = document.getElementById('newsLastUpdated');
        if (!node) return;
        const now = new Date();
        const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
        node.textContent = `Last updated: ${time}`;
      }

      function applyFeeds(feeds) {
        allFeeds = Array.isArray(feeds) ? feeds : [];
        populateCategoryFilter();
        renderFeeds(getFilteredFeeds());
        updateLastUpdatedLabel();
      }

      function wireNewsFilters() {
        document.getElementById('newsCategoryFilter')?.addEventListener('change', () => renderFeeds(getFilteredFeeds()));
        document.getElementById('newsSort')?.addEventListener('change', () => renderFeeds(getFilteredFeeds()));
        const searchInput = document.getElementById('newsSearch');
        let searchTimer = null;
        searchInput?.addEventListener('input', () => {
          if (searchTimer) window.clearTimeout(searchTimer);
          searchTimer = window.setTimeout(() => renderFeeds(getFilteredFeeds()), 120);
        });
        const refreshFeeds = () => {
          const featuredFeedNode = document.getElementById('featuredFeed');
          const feedGridNode = document.getElementById('feedGrid');
          featuredFeedNode?.setAttribute('aria-busy', 'true');
          feedGridNode?.setAttribute('aria-busy', 'true');
          return fetch('/api/public-feeds', { cache: 'no-store' })
            .then((response) => response.ok ? response.json() : Promise.reject(new Error('Failed to load feeds')))
            .then((payload) => {
              applyFeeds(payload.items?.length ? payload.items : fallbackFeeds);
              setFeedStatusBanner(null);
            })
            .catch(() => {
              applyFeeds(fallbackFeeds);
              setFeedStatusBanner('Live RSS feeds could not be loaded. Showing placeholder content below — try again in a moment.');
            });
        };
        document.getElementById('newsRefreshButton')?.addEventListener('click', refreshFeeds);
        document.getElementById('feedStatusRetryButton')?.addEventListener('click', refreshFeeds);
      }

      function setFeedStatusBanner(message) {
        const banner = document.getElementById('feedStatusBanner');
        if (!banner) return;
        if (message) {
          const msgNode = document.getElementById('feedStatusBannerMessage');
          if (msgNode) msgNode.textContent = message;
          banner.classList.remove('d-none');
        } else {
          banner.classList.add('d-none');
        }
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireNewsFilters, { once: true });
      } else {
        wireNewsFilters();
      }

      const completeNewsPageRender = () => {
        document.body.classList.remove('page-render-pending');
        document.getElementById('pageRenderOverlay')?.remove();
      };

      const applyStaticContentPromise = fetch('/api/public-static-content?page=news')
        .then((response) => response.ok ? response.json() : Promise.reject(new Error('Failed to load static content')))
        .then((payload) => {
          const content = payload?.content || {};
          if (content.seoTitle) {
            document.title = content.seoTitle;
            const seoTitleNode = document.getElementById('pageSeoTitle');
            if (seoTitleNode) seoTitleNode.textContent = content.seoTitle;
          }
          if (content.metaDescription) {
            const metaNode = document.getElementById('pageMetaDescription');
            if (metaNode) metaNode.setAttribute('content', content.metaDescription);
          }
          if (content.heroHeadline) {
            const heroHeadlineNode = document.getElementById('heroHeadlinePrimary');
            if (heroHeadlineNode) heroHeadlineNode.textContent = content.heroHeadline;
          }
          if (content.heroBody) {
            const heroBodyNode = document.getElementById('heroBodyPrimary');
            if (heroBodyNode) heroBodyNode.textContent = content.heroBody;
          }
          const heroHeadlineSecondaryNode = document.getElementById('heroHeadlineSecondary');
          if (heroHeadlineSecondaryNode && content.heroHeadlineSecondary) {
            heroHeadlineSecondaryNode.textContent = content.heroHeadlineSecondary;
            heroHeadlineSecondaryNode.classList.remove('d-none');
          }
        })
        .catch(() => {});

      const renderFeedsPromise = fetch('/api/public-feeds')
        .then((response) => response.ok ? response.json() : Promise.reject(new Error('Failed to load feeds')))
        .then((payload) => {
          applyFeeds(payload.items?.length ? payload.items : fallbackFeeds);
          setFeedStatusBanner(null);
        })
        .catch(() => {
          applyFeeds(fallbackFeeds);
          setFeedStatusBanner('Live RSS feeds could not be loaded. Showing placeholder content below — try again in a moment.');
        });

      Promise.allSettled([applyStaticContentPromise, renderFeedsPromise])
        .finally(() => {
          window.requestAnimationFrame(() => completeNewsPageRender());
        });
