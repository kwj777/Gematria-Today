const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&#39;');

const stripHtml = (value) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const buildPostExcerpt = (post, maxLength = 165) => {
  const sourceText = stripHtml(post?.summary || post?.body || '');
  if (!sourceText) {
    return 'Read this featured post for the full analysis and supporting notes.';
  }
  if (sourceText.length <= maxLength) {
    return sourceText;
  }
  return `${sourceText.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const normalizePostImageUrl = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }
  return `/${raw.replace(/^\.?\//, '')}`;
};

const HOME_HERO_IMAGE_WIDTH = 1200;
const HOME_HERO_IMAGE_HEIGHT = 675;

const optimizeHomeHeroImageUrl = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }
  if (raw.startsWith('data:')) {
    return raw;
  }

  const normalized = normalizePostImageUrl(raw);
  if (!normalized || /\.svg($|[?#])/i.test(normalized)) {
    return normalized;
  }

  try {
    const candidate = new URL(normalized, window.location.origin);
    const sourcePath = `${candidate.pathname}${candidate.search}`;
    const optimized = new URL('/.netlify/images', window.location.origin);
    optimized.searchParams.set('url', sourcePath);
    optimized.searchParams.set('w', String(HOME_HERO_IMAGE_WIDTH));
    optimized.searchParams.set('h', String(HOME_HERO_IMAGE_HEIGHT));
    optimized.searchParams.set('fit', 'cover');
    optimized.searchParams.set('fm', 'webp');
    optimized.searchParams.set('q', '75');
    return `${optimized.pathname}${optimized.search}`;
  } catch (_error) {
    return normalized;
  }
};

const applyHomeHeroImageOptimization = (scope = document) => {
  const images = Array.from(scope.querySelectorAll('#homeHeroCarousel img.hero-selling-points-image'));
  images.forEach((img, index) => {
    const optimizedSrc = optimizeHomeHeroImageUrl(img.getAttribute('src') || img.src || '');
    if (optimizedSrc) {
      img.setAttribute('src', optimizedSrc);
    }
    img.setAttribute('width', String(HOME_HERO_IMAGE_WIDTH));
    img.setAttribute('height', String(HOME_HERO_IMAGE_HEIGHT));
    img.setAttribute('decoding', 'async');
    img.setAttribute('loading', index === 0 ? 'eager' : 'lazy');
  });
};

function renderHomepageFeaturedGrid(posts, state = 'data') {
  const spots = posts.slice(0, 6);
  const grid = document.getElementById('homeFeaturedPostsGrid');
  if (!grid) {
    return;
  }

  grid.setAttribute('aria-busy', 'false');

  if (state === 'error') {
    grid.innerHTML = `
      <div class="col-12">
        <article class="blog-home-featured-card p-4 p-lg-5">
          <span class="badge text-bg-danger mb-3">Couldn't load</span>
          <h3 class="mb-3">Featured posts are temporarily unavailable.</h3>
          <p class="text-muted mb-4">We couldn't reach the server. Try refreshing the page, or jump straight to the blog.</p>
          <a class="btn btn-outline-primary" href="/blog.html">View all posts</a>
        </article>
      </div>
    `;
    return;
  }

  if (!spots.length) {
    grid.innerHTML = `
      <div class="col-12">
        <article class="blog-home-featured-card p-4 p-lg-5">
          <span class="badge text-bg-secondary mb-3">Featured</span>
          <h3 class="mb-3">No featured homepage posts selected yet.</h3>
          <p class="text-muted mb-4">Enable "Show this post in the home page slider" on published posts to fill these six spots.</p>
          <a class="btn btn-outline-primary" href="/blog.html">Browse all blog posts</a>
        </article>
      </div>
    `;
    return;
  }

  grid.innerHTML = spots.map((post, index) => {
    const slug = String(post.slug || `post-${index}`).trim();
    const title = String(post.title || 'Featured post').trim() || 'Featured post';
    const excerpt = buildPostExcerpt(post);
    const heroImageUrl = normalizePostImageUrl(post.sliderImageUrl || post.imageUrl) || '/assets/blog-hero-gematria.svg';
    const href = `/blog.html?post=${encodeURIComponent(slug)}#${encodeURIComponent(slug)}`;

    return `
      <div class="col-12 col-md-6 col-xl-4">
        <article class="blog-home-featured-card h-100 p-3 p-lg-4">
          <a href="${href}" class="text-decoration-none" aria-label="Read ${escapeHtml(title)}" title="${escapeHtml(title)}" rel="bookmark">
            <figure class="blog-home-featured-image-frame mb-3">
              <img class="blog-home-featured-image" src="${escapeHtml(heroImageUrl)}" alt="${escapeHtml(title)} hero image" loading="lazy" decoding="async" />
            </figure>
            <span class="visually-hidden">Read featured post: ${escapeHtml(title)}.</span>
          </a>
          <h3 class="h5 mb-2">${escapeHtml(title)}</h3>
          <p class="text-muted mb-3">${escapeHtml(excerpt)}</p>
          <a class="btn btn-warning btn-sm blog-home-featured-readmore" href="${href}" rel="bookmark" aria-label="Read more about ${escapeHtml(title)}" title="Read more about ${escapeHtml(title)}">Read more<span class="seo-offscreen-text"> about ${escapeHtml(title)}</span></a>
        </article>
      </div>
    `;
  }).join('');
}

function renderHomepageSlider(posts, state = 'data') {
  const normalizedPosts = posts.slice(0, 5);
  const indicators = document.getElementById('blogPostsCarouselIndicators');
  const carouselInner = document.getElementById('blogPostsCarouselInner');

  if (!indicators || !carouselInner) {
    return;
  }

  carouselInner.setAttribute('aria-busy', 'false');

  if (state === 'error') {
    indicators.innerHTML = '';
    carouselInner.innerHTML = `
      <div class="carousel-item active">
        <article class="blog-slide-card p-4 p-lg-5">
          <span class="badge text-bg-danger mb-3">Couldn't load</span>
          <h3 class="mb-3">Featured posts are temporarily unavailable.</h3>
          <p class="text-muted mb-4">We couldn't reach the server. Try refreshing the page, or jump straight to the blog.</p>
          <a class="btn btn-outline-primary" href="/blog.html">View all posts</a>
        </article>
      </div>
    `;
    return;
  }

  if (!normalizedPosts.length) {
    indicators.innerHTML = '';
    carouselInner.innerHTML = `
      <div class="carousel-item active">
        <article class="blog-slide-card p-4 p-lg-5">
          <span class="badge text-bg-secondary mb-3">Blog</span>
          <h3 class="mb-3">No blog posts are currently selected for the home slider.</h3>
          <p class="text-muted mb-4">Check the "Show this post in the home page slider" box on a published blog post to feature it here.</p>
          <a class="btn btn-outline-primary" href="/blog.html">Browse all blog posts</a>
        </article>
      </div>
    `;
    return;
  }

  indicators.innerHTML = normalizedPosts.map((post, index) => `
    <button type="button" data-bs-target="#blogPostsCarousel" data-bs-slide-to="${index}" class="${index === 0 ? 'active' : ''}" ${index === 0 ? 'aria-current="true"' : ''} aria-label="Slide ${index + 1}"></button>
  `).join('');

  carouselInner.innerHTML = normalizedPosts.map((post, index) => {
    const slug = String(post.slug || `post-${index}`).trim();
    const heroImageUrl = normalizePostImageUrl(post.sliderImageUrl || post.imageUrl) || '/assets/blog-hero-gematria.svg';
    return `
      <div class="carousel-item ${index === 0 ? 'active' : ''}">
        <article class="blog-slide-card p-4 p-lg-5">
          <a href="/blog.html?post=${encodeURIComponent(slug)}#${encodeURIComponent(slug)}" class="d-block text-decoration-none" aria-label="Read ${escapeHtml(post.title || 'featured post')}" title="${escapeHtml(post.title || 'Read this featured post')}" rel="bookmark">
            <figure class="blog-slide-image-frame mb-0">
                <img class="blog-slide-image" src="${escapeHtml(heroImageUrl)}" alt="${escapeHtml(post.title || 'Featured post')} hero image" loading="lazy" decoding="async" />
                <figcaption class="blog-slide-cta">
                  <span class="btn btn-warning fw-semibold" aria-hidden="true">Read</span>
                </figcaption>
              </figure>
          </a>
        </article>
      </div>
    `;
  }).join('');
}

const englishGematria = (value) => String(value ?? '').toUpperCase().split('').reduce((sum, char) => {
  const code = char.charCodeAt(0);
  if (code < 65 || code > 90) return sum;
  return sum + ((code - 64) * 6);
}, 0);

const digitalRoot = (value) => {
  const digits = String(Math.abs(Number(value) || 0)).replace(/\D/g, '');
  if (!digits) return 0;
  let total = digits.split('').reduce((sum, digit) => sum + Number(digit), 0);
  while (total > 9) {
    total = String(total).split('').reduce((sum, digit) => sum + Number(digit), 0);
  }
  return total;
};

const buildLetterBreakdown = (word) => {
  const letters = String(word ?? '').toUpperCase().replace(/[^A-Z]/g, '').split('');
  if (letters.length === 0) return 'No alphabetical letters';
  return letters.map((char) => `${char}=${(char.charCodeAt(0) - 64) * 6}`).join(' · ');
};

function renderHomeHeroIndicators() {
  const carousel = document.getElementById('homeHeroCarousel');
  const indicators = document.getElementById('homeHeroCarouselIndicators');
  if (!carousel || !indicators) {
    return;
  }

  const visibleSlides = Array.from(carousel.querySelectorAll('.carousel-inner > .carousel-item')).filter((slide) => !slide.classList.contains('d-none'));
  indicators.innerHTML = visibleSlides.map((_, index) => `<button type="button" data-bs-target="#homeHeroCarousel" data-bs-slide-to="${index}" class="${index === 0 ? 'active' : ''}" ${index === 0 ? 'aria-current="true"' : ''} aria-label="Highlight slide ${index + 1}"></button>`).join('');

  visibleSlides.forEach((slide, index) => {
    slide.classList.toggle('active', index === 0);
  });
}

async function loadWordnikWordOfDayHero() {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller ? window.setTimeout(() => controller.abort(), 8000) : null;
  try {
    const response = await fetch('/api/wordnikWordOfDay', {
      headers: { accept: 'application/json' },
      signal: controller ? controller.signal : undefined,
    });
    if (!response.ok) {
      throw new Error('Failed to load Wordnik word of the day.');
    }
    const payload = await response.json();
    const word = String(payload?.word || '').trim();
    if (!word) {
      throw new Error('Missing word of the day.');
    }

    const total = Number(payload?.total) || englishGematria(word);
    const root = Number(payload?.digitalRoot) || digitalRoot(total);
    const definitionPreview = String(payload?.definitionPreview || '').trim();
    const definitionHref = `/definition?word=${encodeURIComponent(word)}&returnTo=${encodeURIComponent('/')}`;
    const calculatorHref = `/calculator.html?query=${encodeURIComponent(word)}`;

    const title = document.getElementById('homeWordnikWotdTitle');
    const definition = document.getElementById('homeWordnikWotdDefinition');
    const totalEl = document.getElementById('homeWordnikWotdTotal');
    const rootEl = document.getElementById('homeWordnikWotdRoot');
    const breakdownEl = document.getElementById('homeWordnikWotdBreakdown');
    const definitionCta = document.getElementById('homeWordnikWotdDefinitionCta');
    const calculatorCta = document.getElementById('homeWordnikWotdCalculatorCta');

    if (title) title.textContent = word;
    if (definition) definition.textContent = definitionPreview || 'Definition preview unavailable today.';
    if (totalEl) totalEl.textContent = String(total);
    if (rootEl) rootEl.textContent = String(root);
    if (breakdownEl) breakdownEl.textContent = buildLetterBreakdown(word);
    if (definitionCta) {
      definitionCta.href = definitionHref;
      definitionCta.hidden = !definitionPreview;
    }
    if (calculatorCta) calculatorCta.href = calculatorHref;
  } catch (_error) {
    const title = document.getElementById('homeWordnikWotdTitle');
    const definition = document.getElementById('homeWordnikWotdDefinition');
    const totalEl = document.getElementById('homeWordnikWotdTotal');
    const rootEl = document.getElementById('homeWordnikWotdRoot');
    const breakdownEl = document.getElementById('homeWordnikWotdBreakdown');
    const definitionCta = document.getElementById('homeWordnikWotdDefinitionCta');
    if (title) title.textContent = 'Word of the day is unavailable';
    if (definition) definition.textContent = 'We couldn’t load today’s Wordnik selection. You can still explore the calculator below.';
    if (totalEl) totalEl.textContent = '—';
    if (rootEl) rootEl.textContent = '—';
    if (breakdownEl) breakdownEl.textContent = 'Reload the page to try again.';
    if (definitionCta) {
      definitionCta.textContent = 'Reload page';
      definitionCta.href = window.location.pathname + window.location.search;
      definitionCta.removeAttribute('target');
      definitionCta.removeAttribute('rel');
      definitionCta.hidden = false;
    }
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
    const section = document.querySelector('[data-module="wordnik_wotd_slider"]');
    section?.setAttribute('aria-busy', 'false');
    document.getElementById('homeWordnikWotdTitle')?.classList.remove('placeholder-glow');
    document.getElementById('homeWordnikWotdDefinition')?.classList.remove('placeholder-glow');
    document.getElementById('homeWordnikWotdBreakdown')?.classList.remove('placeholder-glow');
  }
}

const fetchFeaturedPosts = async () => {
  const response = await fetch('/api/public-posts?featured=true&limit=6');
  if (!response.ok) {
    throw new Error('Failed to load featured posts');
  }
  return response.json();
};

const resetHomeReadMoreButtons = () => {
  document.querySelectorAll('.blog-home-featured-readmore').forEach((button) => {
    button.setAttribute('aria-label', String(button.getAttribute('title') || 'Read more'));
    const readMoreTextNode = button.childNodes[0];
    if (readMoreTextNode) {
      readMoreTextNode.textContent = 'Read more';
    }
  });
};

const setHomeReadMoreWorkingState = () => {
  document.addEventListener('click', (event) => {
    const featuredReadMoreButton = event.target.closest('.blog-home-featured-readmore');
    if (featuredReadMoreButton) {
      featuredReadMoreButton.textContent = 'Working...';
      featuredReadMoreButton.setAttribute('aria-label', 'Working...');
    }
  });

  window.addEventListener('pageshow', () => {
    resetHomeReadMoreButtons();
  });
};

const runAfterFirstPaint = (callback) => {
  const invoke = () => window.setTimeout(callback, 0);

  if (typeof window.requestAnimationFrame !== 'function') {
    invoke();
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(invoke);
  });
};

const applyStaticContentPromise = () => Promise.race([
  fetch('/api/public-static-content?page=home')
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Failed to load static content')))),
  new Promise((_, reject) => window.setTimeout(() => reject(new Error('Timed out while loading static content')), 2500)),
])
  .then((payload) => {
    const content = payload?.content || {};

    if (content.seoTitle) {
      document.title = content.seoTitle;
      const pageSeoTitleNode = document.getElementById('pageSeoTitle');
      if (pageSeoTitleNode) {
        pageSeoTitleNode.textContent = content.seoTitle;
      }
    }

    if (content.metaDescription) {
      const pageMetaDescriptionNode = document.getElementById('pageMetaDescription');
      if (pageMetaDescriptionNode) {
        pageMetaDescriptionNode.setAttribute('content', content.metaDescription);
      }
    }

    if (content.heroHeadline) {
      const primaryHeadlineNode = document.getElementById('homeHeroTitle');
      if (primaryHeadlineNode) {
        primaryHeadlineNode.textContent = content.heroHeadline;
      }
    }

    if (content.heroBody) {
      const primaryBodyNode = document.getElementById('homeHeroLead');
      if (primaryBodyNode) {
        primaryBodyNode.textContent = content.heroBody;
      }
    }

    const primaryCtaNode = document.getElementById('homeJoinCta');
    if (primaryCtaNode) {
      if (content.ctaLabel) {
        primaryCtaNode.textContent = content.ctaLabel;
      }
      if (content.ctaUrl) {
        primaryCtaNode.setAttribute('href', content.ctaUrl);
      }
    }

    const secondaryCtaNode = document.getElementById('homeCalculatorCta');
    if (secondaryCtaNode) {
      if (content.ctaLabelSecondary) {
        secondaryCtaNode.textContent = content.ctaLabelSecondary;
      }
      if (content.ctaUrlSecondary) {
        secondaryCtaNode.setAttribute('href', content.ctaUrlSecondary);
      }
    }

    const quaternaryCtaNode = document.getElementById('homeNewsCta');
    if (quaternaryCtaNode) {
      if (content.ctaLabelQuaternary) {
        quaternaryCtaNode.textContent = content.ctaLabelQuaternary;
      }
      if (content.ctaUrlQuaternary) {
        quaternaryCtaNode.setAttribute('href', content.ctaUrlQuaternary);
      }
    }
  })
  .catch(() => {});

const computeEnglishGematria = (input) => {
  let total = 0;
  const upper = String(input || '').toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const code = upper.charCodeAt(i);
    if (code >= 65 && code <= 90) total += (code - 64) * 6;
  }
  return total;
};

const initializeHeroQuickCalc = () => {
  const input = document.getElementById('heroQuickCalcInput');
  const valueNode = document.getElementById('heroQuickCalcValue');
  const caption = document.getElementById('heroQuickCalcCaption');
  const deepLink = document.getElementById('heroQuickCalcDeepLink');
  if (!input || !valueNode || !deepLink) return;

  const exampleWord = (input.getAttribute('placeholder') || 'light').replace(/^e\.g\.\s*/i, '').trim() || 'light';
  const defaultCaption = caption ? caption.textContent : 'English gematria value';

  let trackedThisSession = false;
  const update = () => {
    const raw = input.value.trim();
    if (!raw) {
      const exampleTotal = computeEnglishGematria(exampleWord);
      valueNode.textContent = exampleTotal.toLocaleString();
      valueNode.setAttribute('data-example', 'true');
      if (caption) caption.textContent = `Example — value of "${exampleWord}"`;
      deepLink.textContent = 'See it on the full calculator →';
      deepLink.setAttribute('href', `/calculator.html?query=${encodeURIComponent(exampleWord)}`);
      deepLink.setAttribute('aria-disabled', 'true');
      deepLink.removeAttribute('data-active');
      return;
    }
    const total = computeEnglishGematria(raw);
    valueNode.textContent = total.toLocaleString();
    valueNode.removeAttribute('data-example');
    if (caption) caption.textContent = defaultCaption;
    deepLink.textContent = 'See it on the full calculator →';
    deepLink.setAttribute('href', `/calculator.html?query=${encodeURIComponent(raw)}`);
    deepLink.setAttribute('aria-disabled', 'false');
    deepLink.setAttribute('data-active', 'true');
    if (!trackedThisSession) {
      trackedThisSession = true;
      window.gematriaTracking?.track('home_hero_quick_calc_used', { source: 'home_hero_quick_calc' });
    }
  };

  update();

  input.addEventListener('input', update);
  deepLink.addEventListener('click', () => {
    window.gematriaTracking?.track('home_hero_quick_calc_deep_link_click', {
      source: 'home_hero_quick_calc',
      destination: deepLink.getAttribute('href') || '',
      tier: window.__gematriaAuthTier || 'anon',
    });
  });
};

const initializeHomePage = () => {
  renderHomeHeroIndicators();
  applyHomeHeroImageOptimization();
  resetHomeReadMoreButtons();
  setHomeReadMoreWorkingState();

  document.getElementById('homeJoinCta')?.addEventListener('click', () => {
    window.gematriaTracking?.track('beginner_path_start_click', {
      source: 'home_hero_primary_cta',
      destination: '/gematria-account-setup.html',
    });
  });

  document.getElementById('homeCalculatorCta')?.addEventListener('click', () => {
    window.gematriaTracking?.track('beginner_path_try_calculator_click', {
      source: 'home_hero_secondary_cta',
      destination: '/calculator.html',
    });
  });

  initializeHeroQuickCalc();

  runAfterFirstPaint(() => {
    loadWordnikWordOfDayHero().finally(() => {
      window.GematriaModules?.applyModuleVisibility?.();
      renderHomeHeroIndicators();
      applyHomeHeroImageOptimization();
    });

    Promise.all([
      applyStaticContentPromise(),
      Promise.race([
        fetchFeaturedPosts(),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error('Timed out while loading featured posts')), 4000)),
      ]).catch(() => ({ items: [], error: true })),
    ])
      .then(([, featuredPostsPayload]) => {
        const featuredItems = featuredPostsPayload?.items || [];
        const state = featuredPostsPayload?.error ? 'error' : 'data';
        renderHomepageSlider(featuredItems, state);
        renderHomepageFeaturedGrid(featuredItems, state);
      });
  });
};

initializeHomePage();
