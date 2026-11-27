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
          <span class="badge badge-contrast-danger mb-3">Couldn't load</span>
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
    const href = `/blog/${encodeURIComponent(slug)}`;

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
          <span class="badge badge-contrast-danger mb-3">Couldn't load</span>
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
          <a href="/blog/${encodeURIComponent(slug)}" class="d-block text-decoration-none" aria-label="Read ${escapeHtml(post.title || 'featured post')}" title="${escapeHtml(post.title || 'Read this featured post')}" rel="bookmark">
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

  initializeBlogCarouselRotation(normalizedPosts.length);
}

// Rotation for the featured-post slider. Bootstrap's autoplay
// (data-bs-ride="carousel") advanced every five seconds with no way to stop
// it, and each slide change hid whatever link had keyboard focus, so the next
// Tab started over at the top of the page (WCAG 2.2.2, 2.4.3). It also restarts
// itself on every mouseleave and control click, which would override a Pause
// button, so the page drives the rotation instead: it holds while the pointer
// or keyboard focus is inside the slider, stops when the visitor presses Pause,
// and starts stopped for anyone who prefers reduced motion (Play still works).
function initializeBlogCarouselRotation(slideCount) {
  const carouselEl = document.getElementById('blogPostsCarousel');
  const toggle = document.getElementById('blogPostsCarouselRotation');
  const inner = document.getElementById('blogPostsCarouselInner');
  if (!carouselEl || !toggle || carouselEl.dataset.rotation === 'ready') return;
  if (slideCount < 2) {
    toggle.hidden = true;
    return;
  }
  if (!window.bootstrap?.Carousel) {
    // bootstrap.bundle loads after this module; the posts can arrive first.
    window.addEventListener('load', () => initializeBlogCarouselRotation(slideCount), { once: true });
    return;
  }
  carouselEl.dataset.rotation = 'ready';

  // Same settings as the data-bs-* attributes, in case a control click made
  // the instance first: never autoplay by itself, never resume on mouseleave.
  const carousel = window.bootstrap.Carousel.getOrCreateInstance(carouselEl, { ride: false, pause: false });
  const prefersReducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  let playing = !prefersReducedMotion;
  let pointerInside = false;
  let focusInside = false;

  const apply = () => {
    const running = playing && !pointerInside && !focusInside;
    if (running) carousel.cycle();
    else carousel.pause();
    // Announcing every automatic slide change would talk over the page.
    inner?.setAttribute('aria-live', running ? 'off' : 'polite');
    toggle.textContent = playing ? 'Pause slideshow' : 'Play slideshow';
  };

  carouselEl.addEventListener('mouseenter', () => { pointerInside = true; apply(); });
  carouselEl.addEventListener('mouseleave', () => { pointerInside = false; apply(); });
  carouselEl.addEventListener('focusin', () => { focusInside = true; apply(); });
  carouselEl.addEventListener('focusout', (event) => {
    if (event.relatedTarget && carouselEl.contains(event.relatedTarget)) return;
    focusInside = false;
    apply();
  });
  toggle.addEventListener('click', () => {
    playing = !playing;
    apply();
  });
  toggle.hidden = false;
  apply();
}

// NFKC, then ASCII letters only: the same rule as englishGematria.mjs.
const englishGematria = (value) => String(value ?? '').normalize('NFKC').replace(/[^A-Za-z]/g, '').toUpperCase().split('').reduce((sum, char) => {
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
  const letters = String(word ?? '').normalize('NFKC').replace(/[^A-Za-z]/g, '').toUpperCase().split('');
  if (letters.length === 0) return 'No alphabetical letters';
  return letters.map((char) => `${char}=${(char.charCodeAt(0) - 64) * 6}`).join(' · ');
};

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
    if (calculatorCta) {
      calculatorCta.href = calculatorHref;
      const labelWord = word.length > 14 ? `${word.slice(0, 13)}…` : word;
      calculatorCta.textContent = `Explore "${labelWord}" in the calculator`;
    }
  } catch (_error) {
    const title = document.getElementById('homeWordnikWotdTitle');
    const definition = document.getElementById('homeWordnikWotdDefinition');
    const totalEl = document.getElementById('homeWordnikWotdTotal');
    const rootEl = document.getElementById('homeWordnikWotdRoot');
    const breakdownEl = document.getElementById('homeWordnikWotdBreakdown');
    const definitionCta = document.getElementById('homeWordnikWotdDefinitionCta');
    // The success branch points this at the word's calculator page. In the error
    // branch there is no word, so it was a primary CTA opening an empty
    // calculator from inside a panel explaining that nothing loaded.
    const calculatorCta = document.getElementById('homeWordnikWotdCalculatorCta');
    if (calculatorCta) calculatorCta.hidden = true;
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

  })
  .catch(() => {});

const computeEnglishGematria = (input) => {
  let total = 0;
  const upper = String(input || '').normalize('NFKC').replace(/[^A-Za-z]/g, '').toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const code = upper.charCodeAt(i);
    if (code >= 65 && code <= 90) total += (code - 64) * 6;
  }
  return total;
};

// The name calculator has three fields, so only the first three words travel.
const NAME_CALCULATOR_FIELDS = 3;

const takeNameParts = (raw) => String(raw || '')
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, NAME_CALCULATOR_FIELDS);

// The name calculator fills its fields from name1/name2/name3 and renders
// straight away, so splitting what was typed here means the visitor lands on
// finished results rather than an empty form.
const buildNameCalculatorHref = (parts) => {
  if (!parts.length) return '/name-calculator.html';
  const searchParams = new URLSearchParams();
  parts.forEach((part, index) => searchParams.set(`name${index + 1}`, part));
  return `/name-calculator.html?${searchParams.toString()}`;
};

const initializeHeroQuickCalc = () => {
  const input = document.getElementById('heroQuickCalcInput');
  const valueNode = document.getElementById('heroQuickCalcValue');
  const caption = document.getElementById('heroQuickCalcCaption');
  const deepLink = document.getElementById('heroQuickCalcDeepLink');
  const nameLink = document.getElementById('heroQuickCalcNameLink');
  if (!input || !valueNode || !deepLink) return;

  const container = input.closest('.hero-quick-calc');
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
      deepLink.removeAttribute('aria-label');
      deepLink.setAttribute('aria-disabled', 'true');
      deepLink.setAttribute('tabindex', '-1');
      deepLink.removeAttribute('data-active');
      // Never disabled: the name calculator is worth opening with or without a
      // name to carry into it, so this route degrades to a plain link rather
      // than going inert the way the word calculator has to.
      if (nameLink) {
        nameLink.setAttribute('href', '/name-calculator.html');
        nameLink.removeAttribute('aria-label');
      }
      if (container) container.setAttribute('data-state', 'empty');
      return;
    }
    const total = computeEnglishGematria(raw);
    valueNode.textContent = total.toLocaleString();
    valueNode.removeAttribute('data-example');
    // Digits and emoji score 0, which reads as a broken calculator unless we
    // say why. The full calculators explain this in their hint text.
    if (caption) caption.textContent = total === 0 ? 'Only A–Z letters count toward the value.' : defaultCaption;
    deepLink.innerHTML = 'See it on the full calculator <span aria-hidden="true">&rarr;</span> <kbd class="hero-quick-calc__deep-link-kbd" aria-hidden="true">Enter</kbd>';
    deepLink.setAttribute('href', `/calculator.html?query=${encodeURIComponent(raw)}`);
    // Each name starts with the link's visible words, so a speech-input user
    // who says them hits the link (WCAG 2.5.3); the query follows.
    deepLink.setAttribute('aria-label', `See it on the full calculator: "${raw}" (press Enter)`);
    deepLink.setAttribute('aria-disabled', 'false');
    deepLink.removeAttribute('tabindex');
    deepLink.setAttribute('data-active', 'true');
    if (nameLink) {
      const nameParts = takeNameParts(raw);
      nameLink.setAttribute('href', buildNameCalculatorHref(nameParts));
      // Announce what actually travels, not what was typed: a fourth word is
      // dropped, and claiming otherwise in the label would be a lie.
      nameLink.setAttribute('aria-label', `Compare as a name: "${nameParts.join(' ')}" on the name calculator`);
    }
    if (container) container.setAttribute('data-state', 'filled');
    if (!trackedThisSession) {
      trackedThisSession = true;
      window.gematriaTracking?.track('home_hero_quick_calc_used', { source: 'home_hero_quick_calc' });
    }
  };

  update();

  input.addEventListener('input', update);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    if (deepLink.getAttribute('aria-disabled') === 'true') return;
    event.preventDefault();
    window.gematriaTracking?.track('home_hero_quick_calc_deep_link_click', {
      source: 'home_hero_quick_calc_enter',
      destination: deepLink.getAttribute('href') || '',
      tier: window.__gematriaAuthTier || 'anon',
    });
    window.location.assign(deepLink.getAttribute('href') || '/calculator.html');
  });
  deepLink.addEventListener('click', () => {
    window.gematriaTracking?.track('home_hero_quick_calc_deep_link_click', {
      source: 'home_hero_quick_calc',
      destination: deepLink.getAttribute('href') || '',
      tier: window.__gematriaAuthTier || 'anon',
    });
  });
};

const initializeHomePage = () => {
  resetHomeReadMoreButtons();
  setHomeReadMoreWorkingState();

  document.getElementById('learningPathPromoCta')?.addEventListener('click', () => {
    window.gematriaTracking?.track('beginner_path_start_click', {
      source: 'home_promo_strip',
      destination: '/gematria-account-setup.html',
    });
  });

  initializeHeroQuickCalc();

  runAfterFirstPaint(() => {
    loadWordnikWordOfDayHero().finally(() => {
      window.GematriaModules?.applyModuleVisibility?.();
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
