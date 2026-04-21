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

function renderHomepageFeaturedGrid(posts) {
  const spots = posts.slice(0, 6);
  const grid = document.getElementById('homeFeaturedPostsGrid');
  if (!grid) {
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

function renderHomepageSlider(posts) {
  const normalizedPosts = posts.slice(0, 5);
  const indicators = document.getElementById('blogPostsCarouselIndicators');
  const carouselInner = document.getElementById('blogPostsCarouselInner');

  if (!indicators || !carouselInner) {
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

const buildWotdGematriaSvgDataUri = ({ word, total, root, definitionPreview }) => {
  const letters = String(word ?? '').toUpperCase().replace(/[^A-Z]/g, '').split('');
  const letterBreakdown = letters.map((char) => `${char}=${(char.charCodeAt(0) - 64) * 6}`).join(' · ') || 'No alphabetical letters';
  const previewText = String(definitionPreview || 'No definition preview available today.').slice(0, 220);
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)"/>
  <text x="68" y="98" fill="#fbbf24" font-size="33" font-family="Arial, sans-serif" font-weight="700">Wordnik Word of the Day</text>
  <text x="68" y="172" fill="#f8fafc" font-size="64" font-family="Arial, sans-serif" font-weight="800">${escapeHtml(String(word || 'Unknown'))}</text>
  <text x="68" y="240" fill="#e2e8f0" font-size="32" font-family="Arial, sans-serif">Total: ${Number(total) || englishGematria(word)}</text>
  <text x="390" y="240" fill="#e2e8f0" font-size="32" font-family="Arial, sans-serif">Digital root: ${Number(root) || digitalRoot(total)}</text>
  <text x="68" y="292" fill="#93c5fd" font-size="23" font-family="Arial, sans-serif">${escapeHtml(letterBreakdown)}</text>
  <foreignObject x="68" y="338" width="1064" height="240">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;color:#cbd5e1;font-size:26px;line-height:1.35;">${escapeHtml(previewText)}</div>
  </foreignObject>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
  try {
    const response = await fetch('/api/wordnikWordOfDay', { headers: { accept: 'application/json' } });
    if (!response.ok) {
      throw new Error('Failed to load Wordnik word of the day.');
    }
    const payload = await response.json();
    const word = String(payload?.word || '').trim();
    if (!word) {
      throw new Error('Missing word of the day.');
    }

    const total = Number(payload?.total);
    const root = Number(payload?.digitalRoot);
    const definitionPreview = String(payload?.definitionPreview || '').trim();
    const definitionHref = `/definition?word=${encodeURIComponent(word)}`;
    const calculatorHref = `/calculator.html?query=${encodeURIComponent(word)}`;

    const title = document.getElementById('homeWordnikWotdTitle');
    const definition = document.getElementById('homeWordnikWotdDefinition');
    const overlayMeta = document.getElementById('homeWordnikWotdOverlayMeta');
    const image = document.getElementById('homeWordnikWotdImage');
    const cardLink = document.getElementById('homeWordnikWotdCardLink');
    const definitionCta = document.getElementById('homeWordnikWotdDefinitionCta');
    const calculatorCta = document.getElementById('homeWordnikWotdCalculatorCta');

    if (title) title.textContent = `${word}: daily gematria calculation`;
    if (definition) definition.textContent = definitionPreview || 'Definition preview unavailable today.';
    if (overlayMeta) overlayMeta.textContent = `Total ${total} • Digital root ${root}`;
    if (image) image.src = optimizeHomeHeroImageUrl(buildWotdGematriaSvgDataUri({ word, total, root, definitionPreview }));
    if (cardLink) cardLink.href = calculatorHref;
    if (definitionCta) definitionCta.href = definitionHref;
    if (calculatorCta) calculatorCta.href = calculatorHref;
  } catch (_error) {
    const definition = document.getElementById('homeWordnikWotdDefinition');
    if (definition) definition.textContent = 'Word of the day is temporarily unavailable. Please check back soon.';
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
  document.querySelectorAll('.hero-why-gematria-readmore').forEach((badge) => {
    badge.textContent = 'Read more';
  });
};

const setHomeReadMoreWorkingState = () => {
  document.addEventListener('click', (event) => {
    const featuredReadMoreButton = event.target.closest('.blog-home-featured-readmore');
    if (featuredReadMoreButton) {
      featuredReadMoreButton.textContent = 'Working...';
      featuredReadMoreButton.setAttribute('aria-label', 'Working...');
      return;
    }

    const homeHeroReadMoreLink = event.target.closest('#homeHeroCarousel a');
    if (!homeHeroReadMoreLink) {
      return;
    }

    const heroReadMoreBadge = homeHeroReadMoreLink.querySelector('.hero-why-gematria-readmore');
    if (heroReadMoreBadge) {
      heroReadMoreBadge.textContent = 'Working...';
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

    if (content.heroHeadlineSecondary) {
      const secondaryHeadlineNode = document.getElementById('homeHeroSecondaryTitle');
      if (secondaryHeadlineNode) {
        secondaryHeadlineNode.textContent = content.heroHeadlineSecondary;
      }
    }

    if (content.heroBodySecondary) {
      const secondaryBodyNode = document.getElementById('homeHeroSecondaryLead');
      if (secondaryBodyNode) {
        secondaryBodyNode.textContent = content.heroBodySecondary;
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

    const tertiaryCtaNode = document.getElementById('homeEschatologyCta');
    if (tertiaryCtaNode) {
      if (content.ctaLabelTertiary) {
        tertiaryCtaNode.textContent = content.ctaLabelTertiary;
      }
      if (content.ctaUrlTertiary) {
        tertiaryCtaNode.setAttribute('href', content.ctaUrlTertiary);
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

const initializeHomePage = () => {
  renderHomeHeroIndicators();
  applyHomeHeroImageOptimization();
  resetHomeReadMoreButtons();
  setHomeReadMoreWorkingState();

  document.getElementById('homeJoinCta')?.addEventListener('click', () => {
    window.endTimesTracking?.track('beginner_path_start_click', {
      source: 'home_hero_primary_cta',
      destination: '/gematria-account-setup.html',
    });
  });

  document.getElementById('homeCalculatorCta')?.addEventListener('click', () => {
    window.endTimesTracking?.track('beginner_path_try_calculator_click', {
      source: 'home_hero_secondary_cta',
      destination: '/calculator.html',
    });
  });

  document.getElementById('homeEschatologyCta')?.addEventListener('click', () => {
    window.endTimesTracking?.track('home_eschatology_cta_click', {
      source: 'home_hero_eschatology_slide',
      destination: '/blog.html',
    });
  });

  runAfterFirstPaint(() => {
    loadWordnikWordOfDayHero().finally(() => {
      window.EndTimesModules?.applyModuleVisibility?.();
      renderHomeHeroIndicators();
      applyHomeHeroImageOptimization();
    });

    Promise.all([
      applyStaticContentPromise(),
      Promise.race([
        fetchFeaturedPosts(),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error('Timed out while loading featured posts')), 4000)),
      ]).catch(() => ({ items: [] })),
    ])
      .then(([, featuredPostsPayload]) => {
        const featuredItems = featuredPostsPayload?.items || [];
        renderHomepageSlider(featuredItems);
        renderHomepageFeaturedGrid(featuredItems);
      });
  });
};

initializeHomePage();
