      const authPanel = document.getElementById('authPanel');
      const dashboardPanel = document.getElementById('dashboardPanel');
      const authMessage = document.getElementById('authMessage');
      const saveMessage = document.getElementById('saveMessage');
      const cacheMessage = document.getElementById('cacheMessage');
      const errorMessage = document.getElementById('errorMessage');
      const proposalPendingCount = document.getElementById('proposalPendingCount');
      const taskCount = document.getElementById('taskCount');
      const sessionMeta = document.getElementById('sessionMeta');
      const superAdminNavItem = document.getElementById('superAdminNavItem');
      const siteHubNavLink = document.getElementById('siteHubNavLink');
      const superAdminWorkspaceLink = document.getElementById('superAdminWorkspaceLink');
      const stripeSecretKeyInput = document.getElementById('stripeSecretKey');
      const stripeWebhookSigningSecretInput = document.getElementById('stripeWebhookSigningSecret');
      const stripeSecretKeyToggle = document.getElementById('stripeSecretKeyToggle');
      const stripeWebhookSigningSecretToggle = document.getElementById('stripeWebhookSigningSecretToggle');
      const sendgridApiKeyInput = document.getElementById('sendgridApiKey');
      const sendgridApiKeyToggle = document.getElementById('sendgridApiKeyToggle');
      const postImageUrlInput = document.getElementById('postImageUrl');
      const postImageDropzone = document.getElementById('postImageDropzone');
      const postImageFileInput = document.getElementById('postImageFile');
      const postImageUploadMeta = document.getElementById('postImageUploadMeta');
      const workspaceFilter = document.getElementById('workspaceFilter');
      const workspaceModules = Array.from(document.querySelectorAll('[data-admin-workspace]'));
      const siteModulesPanel = document.getElementById('siteModulesPanel');
      const siteModulesForm = document.getElementById('siteModulesForm');
      const globalBootswatchThemeSelect = document.getElementById('globalBootswatchThemeSelect');
      const saveGlobalBootswatchThemeButton = document.getElementById('saveGlobalBootswatchThemeButton');
      const globalBootswatchThemeResetButton = document.getElementById('globalBootswatchThemeResetButton');
      const globalBootswatchThemeMeta = document.getElementById('globalBootswatchThemeMeta');

      let initialRenderSettled = false;

      function settleInitialRender() {
        if (initialRenderSettled) {
          return;
        }
        initialRenderSettled = true;
        document.body.classList.remove('admin-render-pending');
      }

      const DEFAULT_SITE_MODULES = Object.freeze({
        forum: true,
        knowbot: true,
        gemabot: true,
        blog: true,
        membership: true,
      });

      function updateSuperAdminUi(isSuperAdmin) {
        superAdminNavItem?.classList.toggle('d-none', !isSuperAdmin);
        superAdminWorkspaceLink?.classList.toggle('d-none', !isSuperAdmin);
        if (siteHubNavLink) {
          siteHubNavLink.textContent = isSuperAdmin ? 'Site Hub' : 'Public Site';
          siteHubNavLink.href = isSuperAdmin ? '/admin-hub.html' : '/index.html';
        }
      }

      function applyWorkspaceFilter() {
        const selectedWorkspace = workspaceFilter?.value || 'all';
        workspaceModules.forEach((module) => {
          const moduleWorkspace = module.dataset.adminWorkspace || 'all';
          const superAdminOnly = module.dataset.superAdminOnly === 'true';
          const isSuperAdmin = state.user?.role === 'super_admin';
          const shouldShow = (selectedWorkspace === 'all' || moduleWorkspace === selectedWorkspace)
            && module.dataset.module !== 'deprecated-post-form'
            && (!superAdminOnly || isSuperAdmin);
          module.classList.toggle('d-none', !shouldShow);
        });
      }

      const postImagePreview = document.getElementById('postImagePreview');
      const postClearImageUrlButton = document.getElementById('postClearImageUrlButton');

      const TAG_SEPARATOR_PATTERN = /[;,]/;
      const state = { user: null, posts: [], proposals: [], chatbotFeedback: [], chatbotFeedbackStats: { expected: 0, unexpected: 0 }, faqs: [], schemaFaqs: [], tasks: [], stripeSettings: null, emailSettings: null, siteModules: { ...DEFAULT_SITE_MODULES }, themeCatalog: { activeThemeSlug: 'default', presets: [] }, latestGrantedMember: null, latestPromotedMember: null, editingPostId: null, editingFaqId: null, replaceStripeSecretKey: false, replaceStripeWebhookSigningSecret: false, replaceSendgridApiKey: false, emailTemplates: [], editingEmailTemplateId: null };
      const escapeHtml = (value = '') => String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

      const getPostTagList = (post) => {
        const tags = [];
        const addTag = (tagValue) => {
          const normalizedTag = String(tagValue || '').trim();
          if (!normalizedTag) {
            return;
          }
          if (tags.some((tag) => tag.toLowerCase() === normalizedTag.toLowerCase())) {
            return;
          }
          tags.push(normalizedTag);
        };

        if (Array.isArray(post.tags)) {
          post.tags.forEach((tagValue) => addTag(tagValue));
        }

        if (typeof post.tag === 'string') {
          post.tag.split(TAG_SEPARATOR_PATTERN).forEach((tagValue) => addTag(tagValue));
        }

        return tags;
      };

      const renderPostTagBadges = (post) => getPostTagList(post)
        .map((tag) => `<span class="badge text-bg-warning">${escapeHtml(tag)}</span>`)
        .join('');

      function getBootswatchThemeLabel(themeId) {
        if (themeId === 'bootstrap') {
          return 'Bootstrap default';
        }
        return themeId.charAt(0).toUpperCase() + themeId.slice(1);
      }

      function normalizeThemeCatalog(catalog = {}) {
        return {
          activeThemeSlug: String(catalog?.activeThemeSlug || 'default').trim().toLowerCase(),
          presets: Array.isArray(catalog?.presets) ? catalog.presets : [],
        };
      }

      function getGlobalBootswatchThemeId(catalog = {}) {
        const normalizedCatalog = normalizeThemeCatalog(catalog);
        const activeSlug = normalizedCatalog.activeThemeSlug;
        if (!activeSlug.startsWith('bootswatch-')) {
          return 'bootstrap';
        }
        return window.adminTheme.normalizeBootswatchTheme(activeSlug.slice('bootswatch-'.length));
      }

      function buildThemeCatalogForBootswatch(themeId) {
        const normalizedThemeId = window.adminTheme.normalizeBootswatchTheme(themeId);
        const existingCatalog = normalizeThemeCatalog(state.themeCatalog);
        const preservedPresets = existingCatalog.presets.filter((preset) => !String(preset?.slug || '').startsWith('bootswatch-'));
        if (normalizedThemeId === 'bootstrap') {
          return {
            ...existingCatalog,
            activeThemeSlug: 'default',
            presets: preservedPresets,
          };
        }
        const selectedTheme = window.adminTheme.BOOTSWATCH_THEME_OPTIONS[normalizedThemeId];
        const slug = `bootswatch-${normalizedThemeId}`;
        const preset = {
          name: getBootswatchThemeLabel(normalizedThemeId),
          slug,
          description: `Global Bootswatch theme (${normalizedThemeId}).`,
          variables: {},
          customCss: `@import url('${selectedTheme.href}');`,
        };
        return {
          ...existingCatalog,
          activeThemeSlug: slug,
          presets: [...preservedPresets, preset],
        };
      }

      function renderGlobalThemeSettings() {
        const isSuperAdmin = state.user?.role === 'super_admin';
        const selectedThemeId = getGlobalBootswatchThemeId(state.themeCatalog);
        if (globalBootswatchThemeSelect) {
          globalBootswatchThemeSelect.value = selectedThemeId;
          globalBootswatchThemeSelect.disabled = !isSuperAdmin;
        }
        saveGlobalBootswatchThemeButton?.toggleAttribute('disabled', !isSuperAdmin);
        globalBootswatchThemeResetButton?.toggleAttribute('disabled', !isSuperAdmin);

        if (!globalBootswatchThemeMeta) {
          return;
        }
        if (!state.user) {
          globalBootswatchThemeMeta.textContent = 'Sign in as a super admin to manage global theme settings.';
          return;
        }
        if (!isSuperAdmin) {
          globalBootswatchThemeMeta.textContent = 'Only super admins can update the global Bootswatch theme.';
          return;
        }
        globalBootswatchThemeMeta.textContent = selectedThemeId === 'bootstrap'
          ? 'Global theme is set to Bootstrap default.'
          : `Global theme is set to ${getBootswatchThemeLabel(selectedThemeId)}.`;
      }


      function renderTagsInUse() {
        const tagsInUse = [...new Map(state.posts
          .flatMap((post) => getPostTagList(post))
          .map((tag) => [tag.toLowerCase(), tag])).values()]
          .sort((left, right) => left.localeCompare(right));
        const target = document.getElementById('postTagsInUse');
        target.innerHTML = tagsInUse.length
          ? `Tags in use: ${tagsInUse.map((tag) => `<button type="button" class="btn btn-sm btn-outline-secondary me-1 mb-1" data-use-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('')}`
          : 'Tags in use: none yet.';
      }



      function addTagToPostField(tagValue) {
        const input = document.getElementById('postTag');
        const tags = input.value
          .split(TAG_SEPARATOR_PATTERN)
          .map((tag) => tag.trim())
          .filter(Boolean);
        if (!tags.some((tag) => tag.toLowerCase() === String(tagValue).trim().toLowerCase())) {
          tags.push(String(tagValue).trim());
        }
        input.value = tags.join(', ');
        input.focus();
      }
      const messageTimeouts = new WeakMap();

      function isElementInViewport(element) {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight);
      }

      function showMessage(target, message, options = {}) {
        const timeoutMs = Number(options.timeoutMs);
        const existingTimeout = messageTimeouts.get(target);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
          messageTimeouts.delete(target);
        }
        target.textContent = message;
        target.classList.remove('d-none');
        // Alerts are pinned above the fold, so submitting a form near the
        // bottom of a long admin page produced feedback nobody could see.
        if (!isElementInViewport(target)) {
          target.setAttribute('tabindex', '-1');
          target.scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            block: 'nearest',
          });
          target.focus({ preventScroll: true });
        }
        if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
          const timeoutHandle = window.setTimeout(() => {
            if (target.textContent === message) {
              clearMessage(target);
            }
            messageTimeouts.delete(target);
          }, timeoutMs);
          messageTimeouts.set(target, timeoutHandle);
        }
      }

      function clearMessage(target) {
        target.textContent = '';
        target.classList.add('d-none');
      }

      function collapseAdminSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (!section || !section.classList.contains('show') || !window.bootstrap?.Collapse) {
          return;
        }
        window.bootstrap.Collapse.getOrCreateInstance(section).hide();
      }

      function setPostImageMeta(message = '') {
        postImageUploadMeta.textContent = message;
      }

      function renderPostImagePreview(imageUrl) {
        const normalizedValue = String(imageUrl || '').trim();
        if (!normalizedValue) {
          postImagePreview.classList.add('d-none');
          postImagePreview.innerHTML = '';
          return;
        }
        postImagePreview.classList.remove('d-none');
        postImagePreview.innerHTML = `<img class="post-image-preview__img" src="${escapeHtml(normalizedValue)}" alt="Selected blog cover preview" loading="lazy" decoding="async" />`;
      }

      function loadImageFromFile(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Could not read image file.'));
            image.src = String(reader.result || '');
          };
          reader.onerror = () => reject(new Error('Could not read image file.'));
          reader.readAsDataURL(file);
        });
      }

      async function createPostImageDataUrl(file) {
        const image = await loadImageFromFile(file);
        const maxWidth = 1600;
        const maxHeight = 900;
        const sourceWidth = image.width || maxWidth;
        const sourceHeight = image.height || maxHeight;
        const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
        const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
        const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Could not process image.');
        }
        context.drawImage(image, 0, 0, targetWidth, targetHeight);
        return canvas.toDataURL('image/webp', 0.85);
      }

      async function handlePostImageFile(file) {
        if (!file) {
          return;
        }
        if (!file.type.startsWith('image/')) {
          throw new Error('Please choose an image file.');
        }
        const maxFileBytes = 8 * 1024 * 1024;
        if (file.size > maxFileBytes) {
          throw new Error('Image is too large. Please use a file under 8MB.');
        }
        setPostImageMeta('Processing image…');
        const imageUrl = await createPostImageDataUrl(file);
        postImageUrlInput.value = imageUrl;
        renderPostImagePreview(imageUrl);
        setPostImageMeta(`Image ready (${file.name}). URL created automatically.`);
      }

      function createGeneratedPostImageDataUrl(title = '', tag = '') {
        const baseTitle = String(title || '').trim() || 'Untitled Post';
        const baseTag = String(tag || '').trim() || 'Saved in admin';
        const palette = ['#1f2937', '#3b82f6', '#f59e0b', '#7c3aed', '#0ea5e9', '#ef4444'];
        const hash = Array.from(`${baseTitle}|${baseTag}`).reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) % 2147483647, 7);
        const start = palette[hash % palette.length];
        const end = palette[(hash + 3) % palette.length];
        const safeTitle = escapeHtml(baseTitle.slice(0, 72));
        const safeTag = escapeHtml(baseTag.slice(0, 56));
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-label="${safeTitle}"><defs><linearGradient id="post-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${start}"/><stop offset="100%" stop-color="${end}"/></linearGradient></defs><rect width="1600" height="900" fill="url(#post-bg)"/><rect x="90" y="120" width="1420" height="660" rx="32" fill="rgba(255,255,255,0.08)"/><text x="140" y="360" fill="#ffffff" font-size="68" font-family="Inter, Arial, sans-serif" font-weight="700">${safeTitle}</text><text x="140" y="450" fill="#e5e7eb" font-size="34" font-family="Inter, Arial, sans-serif">${safeTag}</text><text x="140" y="760" fill="#dbeafe" font-size="28" font-family="Inter, Arial, sans-serif">Gematria.Today</text></svg>`;
        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
      }

      async function request(url, options = {}) {
        const response = await fetch(url, {
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', ...(options.headers || {}) },
          ...options
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Request failed');
        }
        return payload;
      }

      function normalizeFaqText(value = '') {
        return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
      }

      async function loadSchemaFaqEntries() {
        try {
          const response = await fetch(`/faq.html?ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' });
          if (!response.ok) {
            return [];
          }
          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const jsonLdScripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
          const schemaEntries = [];
          for (const script of jsonLdScripts) {
            const scriptText = script.textContent || '';
            if (!scriptText.trim()) {
              continue;
            }
            let payload;
            try {
              payload = JSON.parse(scriptText);
            } catch (_error) {
              continue;
            }
            const nodes = Array.isArray(payload) ? payload : [payload];
            nodes.forEach((node) => {
              const mainEntity = node?.mainEntity;
              if (!Array.isArray(mainEntity)) {
                return;
              }
              mainEntity.forEach((item, index) => {
                const question = String(item?.name || '').trim();
                const answer = String(item?.acceptedAnswer?.text || '').trim();
                if (!question || !answer) {
                  return;
                }
                schemaEntries.push({
                  id: `schema-faq-${schemaEntries.length + index}` ,
                  question,
                  answer,
                  sortOrder: Number.isFinite(Number(index)) ? index : 0,
                  isPublished: true,
                  source: 'schema'
                });
              });
            });
          }

          const dedupedEntries = [];
          const seenKeys = new Set();
          schemaEntries.forEach((entry) => {
            const key = `${normalizeFaqText(entry.question)}::${normalizeFaqText(entry.answer)}`;
            if (seenKeys.has(key)) {
              return;
            }
            seenKeys.add(key);
            dedupedEntries.push(entry);
          });
          return dedupedEntries;
        } catch (_error) {
          return [];
        }
      }

      function setLoggedIn(isLoggedIn) {
        authPanel.classList.toggle('d-none', isLoggedIn);
        dashboardPanel.classList.toggle('d-none', !isLoggedIn);
        if (!isLoggedIn && siteModulesPanel) {
          siteModulesPanel.classList.add('d-none');
        }
      }

      function renderSiteModules() {
        if (!siteModulesForm) {
          return;
        }

        const moduleMeta = [
          ['forum', 'Forum'],
          ['knowbot', 'SiteSeeker'],
          ['gemabot', 'GemaBot'],
          ['blog', 'Blog'],
          ['membership', 'Membership'],
          ['wordnik_wotd_slider', 'Word of the Day'],
        ];

        const modules = { ...DEFAULT_SITE_MODULES, ...(state.siteModules || {}) };
        siteModulesForm.innerHTML = moduleMeta.map(([name, label]) => `
          <div class="col-md-6 col-xl-4">
            <label class="form-check form-switch">
              <input class="form-check-input" type="checkbox" data-site-module="${name}" ${modules[name] !== false ? 'checked' : ''} />
              <span class="form-check-label">${label}</span>
            </label>
          </div>`).join('');
      }

      function renderPosts() {
        renderTagsInUse();
      }

      function resetPostForm() {
        state.editingPostId = null;
        document.getElementById('postForm').reset();
        document.getElementById('postId').value = '';
        document.getElementById('postStatus').value = 'published';
        document.getElementById('postSubmitButton').textContent = 'Publish blog post';
        document.getElementById('postSaveDraftButton').textContent = 'Save without publishing';
        document.getElementById('postCancelButton').classList.add('d-none');
        document.getElementById('postSliderImageUrl').value = '';
        document.getElementById('postShowOnHomepage').checked = false;
        document.getElementById('postHideFromBlog').checked = false;
        document.getElementById('postScheduledPublishAt').value = '';
        setPostImageMeta('');
        renderPostImagePreview('');
      }

      function startPostEdit(postId) {
        const post = state.posts.find((item) => item.id === postId);
        if (!post) return;
        state.editingPostId = post.id;
        document.getElementById('postId').value = post.id;
        document.getElementById('postTitle').value = post.title || '';
        document.getElementById('postTag').value = post.tag || '';
        document.getElementById('postReadTime').value = post.readTime || '';
        document.getElementById('postImageUrl').value = post.imageUrl || '';
        document.getElementById('postSliderImageUrl').value = post.sliderImageUrl || '';
        document.getElementById('postShowOnHomepage').checked = Boolean(post.showOnHomepage);
        document.getElementById('postHideFromBlog').checked = Boolean(post.hideFromBlog);
        const scheduledPublishAt = String(post.scheduledPublishAt || '').trim();
        document.getElementById('postScheduledPublishAt').value = scheduledPublishAt ? new Date(scheduledPublishAt).toISOString().slice(0, 16) : '';
        document.getElementById('postSummary').value = post.summary || '';
        document.getElementById('postBody').value = post.body || '';
        const isDraft = String(post.status || '').toLowerCase() === 'draft';
        document.getElementById('postStatus').value = isDraft ? 'draft' : 'published';
        document.getElementById('postSubmitButton').textContent = isDraft ? 'Publish post' : 'Update published post';
        document.getElementById('postSaveDraftButton').textContent = isDraft ? 'Update saved draft' : 'Save as draft';
        document.getElementById('postCancelButton').classList.remove('d-none');
        setPostImageMeta(post.imageUrl ? 'Using saved image URL.' : '');
        renderPostImagePreview(post.imageUrl || '');
      }

      function renderFaqs() {
        const list = document.getElementById('faqList');
        const managedKeys = new Set(state.faqs.map((faq) => `${normalizeFaqText(faq.question)}::${normalizeFaqText(faq.answer)}`));
        const schemaOnlyFaqs = state.schemaFaqs.filter((faq) => !managedKeys.has(`${normalizeFaqText(faq.question)}::${normalizeFaqText(faq.answer)}`));
        const allFaqs = [...state.faqs, ...schemaOnlyFaqs];
        allFaqs.sort((left, right) => {
          const leftOrder = Number(left.sortOrder ?? 0);
          const rightOrder = Number(right.sortOrder ?? 0);
          if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
          }
          return String(left.question || '').localeCompare(String(right.question || ''));
        });
        list.innerHTML = allFaqs.length ? allFaqs.map((faq) => {
          const isSchemaOnly = faq.source === 'schema';
          return `
          <article class="admin-item-card mb-3 p-3">
            <div class="d-flex justify-content-between gap-3">
              <div>
                <div class="d-flex flex-wrap gap-2 mb-2">
                  <span class="badge text-bg-light">Order ${escapeHtml(faq.sortOrder)}</span>
                  <span class="badge ${faq.isPublished ? 'text-bg-info' : 'text-bg-secondary'}">${faq.isPublished ? 'Published' : 'Draft'}</span>
                  ${isSchemaOnly ? '<span class="badge text-bg-warning">FAQ page schema</span>' : ''}
                </div>
                <h4 class="h6 mb-1">${escapeHtml(faq.question)}</h4>
                <p class="small mb-0">${escapeHtml(faq.answer)}</p>
              </div>
              <div class="d-flex flex-column gap-2">
                ${isSchemaOnly ? '<button class="btn btn-sm btn-outline-secondary" type="button" disabled title="Schema FAQ entries are managed in faq.html JSON-LD.">Edit</button><button class="btn btn-sm btn-outline-secondary" type="button" disabled title="Schema FAQ entries are managed in faq.html JSON-LD.">Delete</button>' : `<button class="btn btn-sm btn-outline-primary" type="button" data-edit-faq="${faq.id}">Edit</button><button class="btn btn-sm btn-outline-danger" type="button" data-delete-faq="${faq.id}">Delete</button>`}
              </div>
            </div>
          </article>`;
        }).join('') : '<p class="text-muted small mb-0">No FAQ entries saved yet.</p>';
      }

      function resetFaqForm() {
        state.editingFaqId = null;
        document.getElementById('faqForm').reset();
        document.getElementById('faqId').value = '';
        document.getElementById('faqSortOrder').value = '0';
        document.getElementById('faqPublished').checked = true;
        document.getElementById('faqSubmitButton').textContent = 'Save FAQ entry';
        document.getElementById('faqCancelButton').classList.add('d-none');
      }

      function startFaqEdit(faqId) {
        const faq = state.faqs.find((item) => item.id === faqId);
        if (!faq) return;
        state.editingFaqId = faq.id;
        document.getElementById('faqId').value = faq.id;
        document.getElementById('faqQuestion').value = faq.question || '';
        document.getElementById('faqAnswer').value = faq.answer || '';
        document.getElementById('faqSortOrder').value = String(faq.sortOrder ?? 0);
        document.getElementById('faqPublished').checked = Boolean(faq.isPublished);
        document.getElementById('faqSubmitButton').textContent = 'Update FAQ entry';
        document.getElementById('faqCancelButton').classList.remove('d-none');
      }


      function setSecretFieldMode(fieldName, shouldEnable) {
        const config = {
          stripeSecretKey: {
            input: stripeSecretKeyInput,
            button: stripeSecretKeyToggle,
            stateKey: 'replaceStripeSecretKey',
            placeholder: 'Enter a new Stripe secret key',
          },
          stripeWebhookSigningSecret: {
            input: stripeWebhookSigningSecretInput,
            button: stripeWebhookSigningSecretToggle,
            stateKey: 'replaceStripeWebhookSigningSecret',
            placeholder: 'Enter a new Stripe webhook secret',
          },
          sendgridApiKey: {
            input: sendgridApiKeyInput,
            button: sendgridApiKeyToggle,
            stateKey: 'replaceSendgridApiKey',
            placeholder: 'Enter a new SendGrid API key',
          },
        }[fieldName];
        if (!config) return;
        state[config.stateKey] = shouldEnable;
        config.input.disabled = !shouldEnable;
        config.input.value = '';
        config.input.placeholder = config.placeholder;
        config.button.textContent = shouldEnable ? 'Keep existing' : 'Change';
        config.button.classList.toggle('btn-outline-secondary', !shouldEnable);
        config.button.classList.toggle('btn-outline-warning', shouldEnable);
      }

      function renderMembershipGrantMeta() {
        const meta = document.getElementById('membershipGrantMeta');
        const member = state.latestGrantedMember;
        if (!member) {
          meta.textContent = 'The premium term starts immediately and lasts for one year.';
          return;
        }

        const expiresText = member.membershipExpiresAt
          ? new Date(member.membershipExpiresAt).toLocaleString()
          : 'an upcoming renewal date';
        meta.textContent = `${member.email} now has premium access through ${expiresText}.`;
      }

      function renderMemberPromotionMeta() {
        const meta = document.getElementById('memberPromotionMeta');
        const member = state.latestPromotedMember;
        if (!member) {
          meta.textContent = 'Only premium and lifetime members can be promoted.';
          return;
        }
        meta.textContent = `${member.email} can now sign in to the admin dashboard with their existing account password.`;
      }

      function renderStripeSecretStatusBadge(id, isConfigured) {
        const badge = document.getElementById(id);
        if (!badge) return;
        badge.classList.remove('text-bg-success', 'text-bg-warning', 'text-bg-secondary');
        if (isConfigured) {
          badge.classList.add('text-bg-success');
          badge.dataset.status = 'saved';
          badge.textContent = 'Saved';
        } else {
          badge.classList.add('text-bg-warning');
          badge.dataset.status = 'missing';
          badge.textContent = 'Not configured';
        }
      }

      function renderStripeSettings() {
        const settings = state.stripeSettings || {};
        document.getElementById('stripeAccountId').value = settings.stripeAccountId || '';
        document.getElementById('stripePublishableKey').value = settings.stripePublishableKey || '';
        setSecretFieldMode('stripeSecretKey', false);
        setSecretFieldMode('stripeWebhookSigningSecret', false);
        renderStripeSecretStatusBadge('stripeSecretKeyStatus', !!settings.hasStripeSecretKey);
        renderStripeSecretStatusBadge('stripeWebhookSigningSecretStatus', !!settings.hasStripeWebhookSigningSecret);
        const configuredCount = [
          settings.stripeAccountId,
          settings.stripePublishableKey,
          settings.hasStripeSecretKey,
          settings.hasStripeWebhookSigningSecret,
        ].filter(Boolean).length;
        const hiddenDetails = [
          settings.hasStripeSecretKey ? 'secret key' : '',
          settings.hasStripeWebhookSigningSecret ? 'webhook signing secret' : '',
        ].filter(Boolean);
        const metaSuffix = hiddenDetails.length ? ` Hidden ${hiddenDetails.join(' and ')} stored securely.` : '';
        document.getElementById('stripeSettingsMeta').textContent = configuredCount
          ? `${configuredCount} Stripe detail${configuredCount === 1 ? '' : 's'} configured for hosted checkout.${metaSuffix}`
          : 'No Stripe account details saved yet.';
      }

      function renderEmailSettings() {
        const settings = state.emailSettings || {};
        document.getElementById('sendgridFromEmail').value = settings.sendgridFromEmail || '';
        document.getElementById('sendgridFromName').value = settings.sendgridFromName || '';
        document.getElementById('sendgridReplyToEmail').value = settings.sendgridReplyToEmail || '';
        document.getElementById('publicSiteUrl').value = settings.publicSiteUrl || '';
        setSecretFieldMode('sendgridApiKey', false);
        const configuredDetails = [
          settings.sendgridFromEmail ? 'verified sender email' : '',
          settings.sendgridFromName ? 'sender name' : '',
          settings.sendgridReplyToEmail ? 'reply-to email' : '',
          settings.publicSiteUrl ? 'public site URL' : '',
          settings.hasSendgridApiKey ? 'SendGrid API key' : '',
        ].filter(Boolean);
        document.getElementById('emailSettingsMeta').textContent = settings.emailDeliveryConfigured
          ? `Recovery emails are ready to send. Configured: ${configuredDetails.join(', ')}.`
          : configuredDetails.length
            ? `Recovery emails are not ready yet. Still required: ${settings.hasSendgridApiKey ? 'verified sender email' : 'verified sender email and SendGrid API key'}.`
            : 'No recovery email delivery settings saved yet.';
      }

      function renderEmailTemplates() {
        const templates = Array.isArray(state.emailTemplates) ? state.emailTemplates : [];
        const list = document.getElementById('emailTemplateList');
        list.innerHTML = templates.length
          ? templates.map((template) => `
            <article class="admin-item-card mb-3 p-3">
              <div class="d-flex justify-content-between gap-3">
                <div>
                  <div class="d-flex flex-wrap gap-2 mb-2">
                    <span class="badge text-bg-light">${escapeHtml(template.id || 'template')}</span>
                    <span class="badge ${template.subject ? 'text-bg-info' : 'text-bg-secondary'}">${template.subject ? 'Configured' : 'Draft'}</span>
                  </div>
                  <h4 class="h6 mb-1">${escapeHtml(template.name || template.id || 'Email template')}</h4>
                  <p class="small mb-0 text-muted">${escapeHtml(template.subject || 'No subject saved yet.')}</p>
                </div>
                <button class="btn btn-sm btn-outline-primary" type="button" data-edit-email-template="${escapeHtml(template.id)}">Edit</button>
              </div>
            </article>`).join('')
          : '<p class="text-muted small mb-0">No email templates saved yet.</p>';

        const configuredCount = templates.filter((template) => template.subject && template.body).length;
        document.getElementById('emailTemplatesMeta').textContent = templates.length
          ? `${configuredCount} of ${templates.length} email template${templates.length === 1 ? '' : 's'} fully configured.`
          : 'No email templates saved yet.';
      }

      function resetEmailTemplateForm() {
        state.editingEmailTemplateId = null;
        document.getElementById('emailTemplateForm').reset();
        document.getElementById('emailTemplateId').value = '';
        document.getElementById('emailTemplateName').value = '';
        document.getElementById('emailTemplateSubject').value = '';
        document.getElementById('emailTemplateBody').value = '';
        document.getElementById('emailTemplateSubmitButton').textContent = 'Save template';
        document.getElementById('emailTemplateCancelButton').classList.add('d-none');
      }

      function startEmailTemplateEdit(templateId) {
        const template = state.emailTemplates.find((item) => item.id === templateId);
        if (!template) {
          return;
        }
        state.editingEmailTemplateId = template.id;
        document.getElementById('emailTemplateId').value = template.id;
        document.getElementById('emailTemplateName').value = template.name || template.id;
        document.getElementById('emailTemplateSubject').value = template.subject || '';
        document.getElementById('emailTemplateBody').value = template.body || '';
        document.getElementById('emailTemplateSubmitButton').textContent = 'Update template';
        document.getElementById('emailTemplateCancelButton').classList.remove('d-none');
      }

      function renderTasks() {
        taskCount.textContent = String(state.tasks.length);
        const list = document.getElementById('taskList');
        list.innerHTML = state.tasks.length ? state.tasks.map((task) => `
          <article class="admin-item-card mb-3 p-3">
            <div class="d-flex justify-content-between gap-3">
              <div>
                <h4 class="h6 mb-1">${escapeHtml(task.title)}</h4>
                <div class="d-flex flex-wrap gap-2 mb-2">
                  ${task.owner ? `<span class="badge text-bg-secondary">${escapeHtml(task.owner)}</span>` : ''}
                  ${task.dueDate ? `<span class="badge text-bg-light">Due ${escapeHtml(task.dueDate)}</span>` : ''}
                </div>
                ${task.notes ? `<p class="small mb-0">${escapeHtml(task.notes)}</p>` : ''}
              </div>
              <button class="btn btn-sm btn-outline-success" type="button" data-delete-task="${task.id}">Done</button>
            </div>
          </article>`).join('') : '<p class="text-muted small mb-0">No open admin tasks right now.</p>';
      }

      function renderBlogProposals() {
        const list = document.getElementById('proposalList');
        const pendingBadge = document.getElementById('proposalPendingBadge');
        const pendingCount = state.proposals.filter((proposal) => proposal.status === 'pending').length;
        proposalPendingCount.textContent = String(pendingCount);
        if (pendingBadge) {
          pendingBadge.textContent = `${pendingCount} pending`;
        }
        if (!list) {
          return;
        }

        list.innerHTML = state.proposals.length ? state.proposals.map((proposal) => `
          <article class="admin-item-card mb-3 p-3">
            <div class="d-flex justify-content-between gap-3">
              <div>
                <div class="d-flex flex-wrap gap-2 mb-2">
                  <span class="badge ${proposal.status === 'pending' ? 'text-bg-danger' : 'text-bg-secondary'}">${escapeHtml(proposal.status || 'pending')}</span>
                  <span class="badge text-bg-light">${escapeHtml(new Date(proposal.createdAt).toLocaleString())}</span>
                  ${proposal.attributionUsername ? `<span class="badge text-bg-info">@${escapeHtml(proposal.attributionUsername)}</span>` : ''}
                </div>
                <h4 class="h6 mb-2">${escapeHtml(proposal.title || 'Untitled proposal')}</h4>
                <p class="small mb-2">${escapeHtml(proposal.summary || '')}</p>
                <p class="small text-muted mb-2">Suggested tags: ${escapeHtml(proposal.suggestedTags || 'none')}</p>
                ${proposal.proposedImageUrl ? `<p class="small text-muted mb-2">Suggested image URL: <span class="text-break">${escapeHtml(proposal.proposedImageUrl)}</span></p>` : ''}
                <details>
                  <summary class="small">View draft content</summary>
                  <pre class="small mt-2 mb-0 text-wrap" style="white-space: pre-wrap;">${escapeHtml(proposal.body || '')}</pre>
                </details>
              </div>
              <div class="d-flex flex-column gap-2" style="min-width: 220px;">
                <div class="form-check small">
                  <input id="proposalUseImage-${escapeHtml(proposal.id)}" class="form-check-input" type="checkbox" data-proposal-use-image="${escapeHtml(proposal.id)}" ${proposal.proposedImageUrl ? 'checked' : ''} ${proposal.proposedImageUrl ? '' : 'disabled'} />
                  <label class="form-check-label" for="proposalUseImage-${escapeHtml(proposal.id)}">Add proposed image to draft</label>
                </div>
                <a class="btn btn-sm btn-outline-primary" href="/admin-posts.html?loadProposal=${encodeURIComponent(proposal.id)}">Load into publishing workspace</a>
                <button class="btn btn-sm btn-outline-success" type="button" data-mark-proposal-reviewed="${escapeHtml(proposal.id)}">Mark reviewed</button>
                <button class="btn btn-sm btn-outline-secondary" type="button" data-mark-proposal-pending="${escapeHtml(proposal.id)}">Set pending</button>
              </div>
            </div>
          </article>`).join('') : '<p class="text-muted small mb-0">No proposals yet.</p>';
      }

      function renderChatbotFeedback() {
        const feedbackCount = document.getElementById('chatbotFeedbackCount');
        const feedbackSplit = document.getElementById('chatbotFeedbackSplit');
        const newCount = state.chatbotFeedback.filter((item) => (item.status || 'new') === 'new').length;
        if (feedbackCount) {
          feedbackCount.textContent = String(newCount);
        }
        if (feedbackSplit) {
          const expectedCount = Number(state.chatbotFeedbackStats?.expected || 0);
          const unexpectedCount = Number(state.chatbotFeedbackStats?.unexpected || 0);
          feedbackSplit.textContent = `Unexpected: ${unexpectedCount} · Expected: ${expectedCount}`;
        }
      }

      let latestSecondaryDashboardLoadId = 0;

      async function refreshDashboard() {
        const [posts, proposals, chatbotFeedback, faqs, tasks] = await Promise.all([
          request('/api/admin-posts'),
          request('/api/admin-blog-proposals'),
          request('/api/admin-chatbot-feedback'),
          request('/api/admin-faqs'),
          request('/api/admin-tasks'),
        ]);
        state.posts = posts.items || [];
        state.proposals = proposals.items || [];
        state.chatbotFeedback = chatbotFeedback.items || [];
        state.chatbotFeedbackStats = chatbotFeedback.stats || { expected: 0, unexpected: 0 };
        state.faqs = faqs.items || [];
        state.tasks = tasks.items || [];
        renderPosts();
        renderBlogProposals();
        renderChatbotFeedback();
        renderFaqs();
        renderTasks();
        renderMembershipGrantMeta();
        renderMemberPromotionMeta();

        const secondaryLoadId = ++latestSecondaryDashboardLoadId;
        Promise.allSettled([
          request('/api/admin-settings'),
          loadSchemaFaqEntries()
        ]).then((results) => {
          if (secondaryLoadId !== latestSecondaryDashboardLoadId) {
            return;
          }

          const [settingsResult, schemaFaqEntriesResult] = results;
          if (settingsResult.status === 'fulfilled') {
            const settings = settingsResult.value || {};
            state.stripeSettings = settings.settings || null;
            state.emailSettings = settings.settings || null;
            state.emailTemplates = settings.emailTemplates || [];
            state.siteModules = { ...DEFAULT_SITE_MODULES, ...((settings.settings && settings.settings.siteModules) || {}) };
            state.themeCatalog = normalizeThemeCatalog(settings.settings?.themeCatalog || {});
            renderStripeSettings();
            renderEmailSettings();
            renderEmailTemplates();
            renderSiteModules();
            renderGlobalThemeSettings();
          }

          if (schemaFaqEntriesResult.status === 'fulfilled') {
            state.schemaFaqs = schemaFaqEntriesResult.value || [];
            renderFaqs();
          }
        });
      }

      function consumeSafeNextRedirect() {
        const redirectAlreadyAttempted = new URLSearchParams(window.location.search).get('nextAttempted') === '1';
        if (redirectAlreadyAttempted) {
          return null;
        }

        const nextParam = new URLSearchParams(window.location.search).get('next');
        if (!nextParam || !nextParam.startsWith('/') || nextParam.startsWith('//')) {
          return null;
        }

        const storageKey = 'adminNextRedirectTarget';
        let previousTarget = '';
        try {
          previousTarget = sessionStorage.getItem(storageKey) || '';
        } catch {
          previousTarget = '';
        }

        if (previousTarget === nextParam) {
          try {
            sessionStorage.removeItem(storageKey);
          } catch {
            // Ignore storage availability issues.
          }
          return null;
        }

        try {
          sessionStorage.setItem(storageKey, nextParam);
        } catch {
          // Ignore storage availability issues.
        }

        return nextParam;
      }

      async function loadSession() {
        try {
          const payload = await request('/api/admin-session', { method: 'GET' });
          state.user = payload.user;
          sessionMeta.textContent = `Signed in as ${payload.user.username} (${payload.user.role || 'admin'})`;
          updateSuperAdminUi(payload.user.role === 'super_admin');
          setLoggedIn(true);
          const nextParam = consumeSafeNextRedirect();
          if (nextParam) {
            const redirectTarget = new URL(nextParam, window.location.origin);
            redirectTarget.searchParams.set('adminNextAttempted', '1');
            window.location.href = redirectTarget.pathname + redirectTarget.search + redirectTarget.hash;
            return;
          }
          // Dashboard data is fetched separately from the session check. When
          // both shared one try/catch, a single 500 from any of the five
          // parallel dashboard requests landed in the catch below and showed
          // the login form -- with no error -- to an admin whose session was
          // perfectly valid.
          try {
            await refreshDashboard();
            const loadProposalFromQuery = new URLSearchParams(window.location.search).get('loadProposal');
            if (loadProposalFromQuery) {
              await loadProposalIntoEditor(loadProposalFromQuery);
            }
          } catch (dashboardError) {
            showMessage(errorMessage, `${dashboardError.message || 'Could not load dashboard data.'} Your session is still active — retry from the controls above.`);
          }
        } catch (error) {
          state.user = null;
          sessionMeta.textContent = '';
          updateSuperAdminUi(false);
          state.siteModules = { ...DEFAULT_SITE_MODULES };
          state.themeCatalog = { activeThemeSlug: 'default', presets: [] };
          renderSiteModules();
          renderGlobalThemeSettings();
          setLoggedIn(false);
        } finally {
          settleInitialRender();
        }
      }

      document.getElementById('loginForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        clearMessage(authMessage);
        clearMessage(errorMessage);
        try {
          await request('/api/admin-login', {
            method: 'POST',
            body: JSON.stringify({
              username: document.getElementById('username').value,
              password: document.getElementById('password').value,
            })
          });
          event.target.reset();
          const nextParam = consumeSafeNextRedirect();
          if (nextParam) {
            const redirectTarget = new URL(nextParam, window.location.origin);
            redirectTarget.searchParams.set('adminNextAttempted', '1');
            window.location.href = redirectTarget.pathname + redirectTarget.search + redirectTarget.hash;
            return;
          }
          // "Unlock admin dashboard" used to redirect to /member.html, so the
          // admin landed on the member dashboard and had to navigate back.
          await loadSession();
        } catch (error) {
          showMessage(authMessage, error.message);
        }
      });

      document.getElementById('logoutButton').addEventListener('click', async () => {
        clearMessage(errorMessage);
        await request('/api/admin-logout', { method: 'POST', body: '{}' }).catch(() => null);
        state.user = null;
        updateSuperAdminUi(false);
        setLoggedIn(false);
      });

      document.getElementById('postTagsInUse').addEventListener('click', (event) => {
        const tagButton = event.target.closest('[data-use-tag]');
        if (!tagButton) {
          return;
        }
        addTagToPostField(tagButton.dataset.useTag || '');
      });

      postImageUrlInput.addEventListener('input', () => {
        renderPostImagePreview(postImageUrlInput.value);
      });

      postClearImageUrlButton.addEventListener('click', () => {
        postImageUrlInput.value = '';
        renderPostImagePreview('');
        setPostImageMeta('Image URL removed. You can paste a new URL or upload another image.');
        postImageUrlInput.focus();
      });

      postImageDropzone.addEventListener('click', () => {
        postImageFileInput.click();
      });

      postImageDropzone.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }
        event.preventDefault();
        postImageFileInput.click();
      });

      postImageDropzone.addEventListener('dragover', (event) => {
        event.preventDefault();
        postImageDropzone.classList.add('is-dragover');
      });

      postImageDropzone.addEventListener('dragleave', () => {
        postImageDropzone.classList.remove('is-dragover');
      });

      postImageDropzone.addEventListener('drop', async (event) => {
        event.preventDefault();
        postImageDropzone.classList.remove('is-dragover');
        clearMessage(errorMessage);
        const droppedFile = event.dataTransfer?.files?.[0];
        try {
          await handlePostImageFile(droppedFile);
        } catch (error) {
          setPostImageMeta('');
          showMessage(errorMessage, error.message);
        }
      });

      postImageFileInput.addEventListener('change', async (event) => {
        clearMessage(errorMessage);
        const selectedFile = event.target.files?.[0];
        try {
          await handlePostImageFile(selectedFile);
        } catch (error) {
          setPostImageMeta('');
          showMessage(errorMessage, error.message);
        } finally {
          event.target.value = '';
        }
      });

      document.getElementById('postForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        clearMessage(errorMessage);
        try {
          const postId = document.getElementById('postId').value;
          let requestedStatus = String(event.submitter?.dataset?.postStatus || document.getElementById('postStatus').value || 'published').toLowerCase() === 'draft' ? 'draft' : 'published';
          const postTitle = document.getElementById('postTitle').value;
          const postTag = document.getElementById('postTag').value;
          const providedImageUrl = document.getElementById('postImageUrl').value;
          const resolvedImageUrl = String(providedImageUrl || '').trim() || createGeneratedPostImageDataUrl(postTitle, postTag);
          const scheduledPublishAtInput = String(document.getElementById('postScheduledPublishAt').value || '').trim();
          const scheduledPublishAtValue = scheduledPublishAtInput ? new Date(scheduledPublishAtInput).toISOString() : '';
          const isScheduledForFuture = Boolean(scheduledPublishAtValue) && new Date(scheduledPublishAtValue).getTime() > Date.now();
          if (isScheduledForFuture) {
            requestedStatus = 'draft';
          }
          await request('/api/admin-posts', {
            method: postId ? 'PUT' : 'POST',
            body: JSON.stringify({
              id: postId || undefined,
              title: postTitle,
              tag: postTag,
              readTime: document.getElementById('postReadTime').value,
              imageUrl: resolvedImageUrl,
              sliderImageUrl: document.getElementById('postSliderImageUrl').value,
              showOnHomepage: document.getElementById('postShowOnHomepage').checked,
              hideFromBlog: document.getElementById('postHideFromBlog').checked,
              summary: document.getElementById('postSummary').value,
              body: document.getElementById('postBody').value,
              status: requestedStatus,
              scheduledPublishAt: scheduledPublishAtValue || null
            })
          });
          resetPostForm();
          showMessage(saveMessage, isScheduledForFuture
            ? 'Blog post scheduled and saved but not published yet.'
            : (requestedStatus === 'draft'
              ? 'Blog post saved but not published.'
              : 'Blog post published.'));
          await refreshDashboard();
          collapseAdminSection('postSectionBody');
        } catch (error) {
          showMessage(errorMessage, error.message);
        }
      });

      document.getElementById('postCancelButton').addEventListener('click', () => {
        resetPostForm();
      });

      document.getElementById('faqForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        clearMessage(errorMessage);
        try {
          const faqId = document.getElementById('faqId').value;
          await request('/api/admin-faqs', {
            method: faqId ? 'PUT' : 'POST',
            body: JSON.stringify({
              id: faqId || undefined,
              question: document.getElementById('faqQuestion').value,
              answer: document.getElementById('faqAnswer').value,
              sortOrder: Number(document.getElementById('faqSortOrder').value || 0),
              isPublished: document.getElementById('faqPublished').checked
            })
          });
          resetFaqForm();
          showMessage(saveMessage, faqId ? 'FAQ entry updated.' : 'FAQ entry saved.');
          await refreshDashboard();
          collapseAdminSection('faqSectionBody');
        } catch (error) {
          showMessage(errorMessage, error.message);
        }
      });

      document.getElementById('faqCancelButton').addEventListener('click', () => {
        resetFaqForm();
      });

      async function clearSiteCache(targetButton) {
        clearMessage(errorMessage);
        clearMessage(saveMessage);
        try {
          targetButton.disabled = true;
          const payload = await request('/api/admin-settings', {
            method: 'POST',
            body: JSON.stringify({ action: 'clear-cache' })
          });
          showMessage(cacheMessage, `Server cache cleared. ${payload.deletedCount || 0} entr${payload.deletedCount === 1 ? 'y was' : 'ies were'} removed.`);
        } catch (error) {
          showMessage(errorMessage, error.message);
        } finally {
          targetButton.disabled = false;
        }
      }


      document.getElementById('saveSiteModulesButton')?.addEventListener('click', async () => {
        clearMessage(errorMessage);
        if (!state.user || state.user.role !== 'super_admin') {
          showMessage(errorMessage, 'Only super admins can update site modules.');
          return;
        }

        const nextModules = { ...DEFAULT_SITE_MODULES };
        siteModulesForm?.querySelectorAll('[data-site-module]').forEach((field) => {
          const moduleName = String(field.dataset.siteModule || '').trim().toLowerCase();
          if (!moduleName || !Object.hasOwn(nextModules, moduleName)) {
            return;
          }
          nextModules[moduleName] = Boolean(field.checked);
        });

        try {
          const payload = await request('/api/admin-settings', {
            method: 'PUT',
            body: JSON.stringify({
              stripeAccountId: state.stripeSettings?.stripeAccountId || '',
              stripePublishableKey: state.stripeSettings?.stripePublishableKey || '',
              sendgridFromEmail: state.emailSettings?.sendgridFromEmail || '',
              sendgridFromName: state.emailSettings?.sendgridFromName || '',
              sendgridReplyToEmail: state.emailSettings?.sendgridReplyToEmail || '',
              publicSiteUrl: state.emailSettings?.publicSiteUrl || '',
              replaceStripeSecretKey: false,
              replaceStripeWebhookSigningSecret: false,
              replaceSendgridApiKey: false,
              siteModules: nextModules,
            })
          });
          state.siteModules = { ...DEFAULT_SITE_MODULES, ...((payload.settings && payload.settings.siteModules) || {}) };
          renderSiteModules();
          showMessage(saveMessage, 'Site module switches saved.', { timeoutMs: 10000 });
          window.showToast?.('Site module switches saved. Please allow up to 10 minutes for changes to take effect.', 'info');
        } catch (error) {
          showMessage(errorMessage, error.message);
        }
      });

      saveGlobalBootswatchThemeButton?.addEventListener('click', async () => {
        clearMessage(errorMessage);
        if (!state.user || state.user.role !== 'super_admin') {
          showMessage(errorMessage, 'Only super admins can update themes.');
          return;
        }

        const selectedTheme = window.adminTheme.normalizeBootswatchTheme(globalBootswatchThemeSelect?.value || 'bootstrap');
        try {
          const payload = await request('/api/admin-settings', {
            method: 'PUT',
            body: JSON.stringify({
              stripeAccountId: state.stripeSettings?.stripeAccountId || '',
              stripePublishableKey: state.stripeSettings?.stripePublishableKey || '',
              sendgridFromEmail: state.emailSettings?.sendgridFromEmail || '',
              sendgridFromName: state.emailSettings?.sendgridFromName || '',
              sendgridReplyToEmail: state.emailSettings?.sendgridReplyToEmail || '',
              publicSiteUrl: state.emailSettings?.publicSiteUrl || '',
              replaceStripeSecretKey: false,
              replaceStripeWebhookSigningSecret: false,
              replaceSendgridApiKey: false,
              themeCatalog: buildThemeCatalogForBootswatch(selectedTheme),
            }),
          });
          state.themeCatalog = normalizeThemeCatalog(payload.settings?.themeCatalog || {});
          renderGlobalThemeSettings();
          showMessage(saveMessage, selectedTheme === 'bootstrap'
            ? 'Global theme reset to Bootstrap default.'
            : `Global theme updated to ${getBootswatchThemeLabel(selectedTheme)}.`, { timeoutMs: 10000 });
          window.showToast?.('Global theme saved. Please allow up to 10 minutes for cached pages to refresh.', 'info');
        } catch (error) {
          showMessage(errorMessage, error.message);
        }
      });

      globalBootswatchThemeResetButton?.addEventListener('click', () => {
        if (globalBootswatchThemeSelect) {
          globalBootswatchThemeSelect.value = 'bootstrap';
        }
      });

      workspaceFilter?.addEventListener('change', applyWorkspaceFilter);
      applyWorkspaceFilter();

      document.getElementById('refreshSiteCacheButton').addEventListener('click', async (event) => {
        await clearSiteCache(event.currentTarget);
      });

      document.getElementById('clearCacheButton').addEventListener('click', async (event) => {
        await clearSiteCache(event.currentTarget);
      });

      document.getElementById('membershipGrantForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const grantEmail = (document.getElementById('memberGrantEmail').value || '').trim();
        // Same blast-radius guard as the promotion form below: a typo or an
        // autocomplete misfire hands a stranger a year of paid membership.
        const confirmed = window.confirm(
          'Grant a free one-year premium membership to ' + (grantEmail || 'this member') + '?\n\n' +
          'The premium term starts immediately and unlocks GemaBot, Premium ' +
          'Research, and premium forum access.'
        );
        if (!confirmed) {
          return;
        }
        clearMessage(errorMessage);
        try {
          const payload = await request('/api/admin-memberships', {
            method: 'POST',
            body: JSON.stringify({
              email: grantEmail
            })
          });
          state.latestGrantedMember = payload.member || null;
          renderMembershipGrantMeta();
          event.target.reset();
          showMessage(saveMessage, payload.message || 'Premium membership granted.');
          collapseAdminSection('membershipSectionBody');
        } catch (error) {
          showMessage(errorMessage, error.message);
        }
      });

      document.getElementById('memberPromotionForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const promotionEmail = (document.getElementById('memberPromotionEmail').value || '').trim();
        // Admin promotion is irreversible from this form (only Super Admin >
        // demote can undo it), so guard against typos and autocomplete misfires.
        const confirmed = window.confirm(
          'Promote ' + (promotionEmail || 'this member') + ' to admin?\n\n' +
          'Admins can edit every page, post, and member. This cannot be undone ' +
          'from this form — use Super Admin > demote to reverse it.'
        );
        if (!confirmed) {
          return;
        }
        clearMessage(errorMessage);
        try {
          const payload = await request('/api/admin-memberships', {
            method: 'POST',
            body: JSON.stringify({
              action: 'promote-admin',
              email: promotionEmail
            })
          });
          state.latestPromotedMember = payload.member || null;
          renderMemberPromotionMeta();
          event.target.reset();
          showMessage(saveMessage, payload.message || 'Member promoted to admin.');
          collapseAdminSection('promotionSectionBody');
        } catch (error) {
          showMessage(errorMessage, error.message);
        }
      });

      document.getElementById('emailSettingsForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        clearMessage(errorMessage);
        try {
          const payload = await request('/api/admin-settings', {
            method: 'PUT',
            body: JSON.stringify({
              sendgridFromEmail: document.getElementById('sendgridFromEmail').value,
              sendgridFromName: document.getElementById('sendgridFromName').value,
              sendgridReplyToEmail: document.getElementById('sendgridReplyToEmail').value,
              publicSiteUrl: document.getElementById('publicSiteUrl').value,
              sendgridApiKey: state.replaceSendgridApiKey ? sendgridApiKeyInput.value : undefined,
              replaceSendgridApiKey: state.replaceSendgridApiKey
            })
          });
          state.emailSettings = payload.settings || null;
          state.stripeSettings = payload.settings || null;
          renderEmailSettings();
          state.emailTemplates = payload.emailTemplates || state.emailTemplates;
          renderEmailTemplates();
          showMessage(saveMessage, 'Recovery email delivery settings saved.');
          collapseAdminSection('emailSectionBody');
        } catch (error) {
          showMessage(errorMessage, error.message);
        }
      });

      document.getElementById('stripeSettingsForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        clearMessage(errorMessage);
        try {
          const payload = await request('/api/admin-settings', {
            method: 'PUT',
            body: JSON.stringify({
              stripeAccountId: document.getElementById('stripeAccountId').value,
              stripePublishableKey: document.getElementById('stripePublishableKey').value,
              stripeSecretKey: state.replaceStripeSecretKey ? stripeSecretKeyInput.value : undefined,
              stripeWebhookSigningSecret: state.replaceStripeWebhookSigningSecret ? stripeWebhookSigningSecretInput.value : undefined,
              replaceStripeSecretKey: state.replaceStripeSecretKey,
              replaceStripeWebhookSigningSecret: state.replaceStripeWebhookSigningSecret
            })
          });
          state.stripeSettings = payload.settings || null;
          state.emailSettings = payload.settings || null;
          renderStripeSettings();
          showMessage(saveMessage, 'Stripe account details saved.');
          collapseAdminSection('stripeSectionBody');
        } catch (error) {
          showMessage(errorMessage, error.message);
        }
      });

      document.getElementById('emailTemplateForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        clearMessage(errorMessage);
        try {
          const templateId = document.getElementById('emailTemplateId').value;
          if (!templateId) {
            throw new Error('Select an email template to edit.');
          }
          const payload = await request('/api/admin-settings', {
            method: 'PUT',
            body: JSON.stringify({
              emailTemplate: {
                id: templateId,
                subject: document.getElementById('emailTemplateSubject').value,
                body: document.getElementById('emailTemplateBody').value,
              },
            }),
          });
          state.emailTemplates = payload.emailTemplates || state.emailTemplates;
          state.emailSettings = payload.settings || state.emailSettings;
          renderEmailTemplates();
          renderEmailSettings();
          startEmailTemplateEdit(templateId);
          showMessage(saveMessage, 'Email template saved.');
          collapseAdminSection('emailTemplatesSectionBody');
        } catch (error) {
          showMessage(errorMessage, error.message);
        }
      });

      document.getElementById('emailTemplateCancelButton').addEventListener('click', () => {
        resetEmailTemplateForm();
      });

      document.getElementById('taskForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        clearMessage(errorMessage);
        try {
          await request('/api/admin-tasks', {
            method: 'POST',
            body: JSON.stringify({
              title: document.getElementById('taskTitle').value,
              owner: document.getElementById('taskOwner').value,
              dueDate: document.getElementById('taskDueDate').value,
              notes: document.getElementById('taskNotes').value
            })
          });
          event.target.reset();
          showMessage(saveMessage, 'Admin task added.');
          await refreshDashboard();
          collapseAdminSection('taskSectionBody');
        } catch (error) {
          showMessage(errorMessage, error.message);
        }
      });

      async function loadProposalIntoEditor(proposalId) {
        const proposal = state.proposals.find((item) => item.id === proposalId);
        if (!proposal) {
          return false;
        }
        // The publishing module on this page is hidden (d-none + hidden +
        // display:none), so this used to fill invisible fields, scroll to
        // nothing, and report success. admin-posts.html implements the same
        // ?loadProposal= flow against a form the admin can actually see.
        if (!document.getElementById('postTitle')) {
          window.location.href = `/admin-posts.html?loadProposal=${encodeURIComponent(proposalId)}`;
          return true;
        }
        document.getElementById('postTitle').value = proposal.title || '';
        document.getElementById('postTag').value = proposal.suggestedTags || '';
        document.getElementById('postSummary').value = proposal.summary || '';
        document.getElementById('postBody').value = proposal.body || '';
        if (proposal.proposedImageUrl) {
          document.getElementById('postImageUrl').value = proposal.proposedImageUrl;
          renderPostImagePreview(proposal.proposedImageUrl);
          setPostImageMeta('Loaded proposal image URL into draft.');
        } else {
          document.getElementById('postImageUrl').value = '';
          renderPostImagePreview('');
          setPostImageMeta('Proposal has no suggested image URL.');
        }
        document.getElementById('postSectionBody').classList.add('show');
        document.getElementById('postSectionBody').scrollIntoView({ behavior: 'smooth', block: 'start' });
        showMessage(saveMessage, 'Proposal loaded into post editor.');
        return true;
      }

      document.addEventListener('click', async (event) => {
        const {
          editPost,
          deletePost,
          deleteFaq,
          editFaq,
          deleteTask,
          enableSecret,
          editEmailTemplate,
          loadProposal,
          markProposalReviewed,
          markProposalPending,
          submitFeedbackReply,
          markFeedbackReviewed,
          markFeedbackClosed
        } = event.target.dataset;
        if (enableSecret) {
          const stateKey = ({ stripeSecretKey: 'replaceStripeSecretKey', stripeWebhookSigningSecret: 'replaceStripeWebhookSigningSecret', sendgridApiKey: 'replaceSendgridApiKey' })[enableSecret];
          const shouldEnable = !state[stateKey];
          setSecretFieldMode(enableSecret, shouldEnable);
          if (shouldEnable) {
            ({ stripeSecretKey: stripeSecretKeyInput, stripeWebhookSigningSecret: stripeWebhookSigningSecretInput, sendgridApiKey: sendgridApiKeyInput }[enableSecret])?.focus();
          } else {
            event.target.blur();
          }
          return;
        }
        if (!editPost && !deletePost && !deleteFaq && !editFaq && !deleteTask && !editEmailTemplate && !loadProposal && !markProposalReviewed && !markProposalPending && !submitFeedbackReply && !markFeedbackReviewed && !markFeedbackClosed) {
          return;
        }
        clearMessage(errorMessage);
        try {
          if (editPost) {
            startPostEdit(editPost);
            return;
          }
          if (editFaq) {
            startFaqEdit(editFaq);
            return;
          }
          if (editEmailTemplate) {
            startEmailTemplateEdit(editEmailTemplate);
            return;
          }
          if (loadProposal) {
            const proposal = state.proposals.find((item) => item.id === loadProposal);
            if (!proposal) {
              throw new Error('Proposal not found.');
            }
            resetPostForm();
            document.getElementById('postTitle').value = proposal.title || '';
            document.getElementById('postTag').value = proposal.suggestedTags || '';
            document.getElementById('postSummary').value = proposal.summary || '';
            document.getElementById('postBody').value = proposal.body || '';
            const useImageCheckbox = document.getElementById(`proposalUseImage-${loadProposal}`);
            if (proposal.proposedImageUrl && useImageCheckbox?.checked) {
              document.getElementById('postImageUrl').value = proposal.proposedImageUrl;
              renderPostImagePreview(proposal.proposedImageUrl);
              setPostImageMeta('Loaded proposal image URL into draft.');
            }
            if (window.bootstrap?.Collapse) {
              window.bootstrap.Collapse.getOrCreateInstance(document.getElementById('postSectionBody'), { toggle: false }).show();
            }
            document.getElementById('postSectionBody').scrollIntoView({ behavior: 'smooth', block: 'start' });
            showMessage(saveMessage, 'Proposal loaded into the blog post editor.');
            return;
          }
          if (markProposalReviewed || markProposalPending) {
            const proposalId = markProposalReviewed || markProposalPending;
            const nextStatus = markProposalReviewed ? 'reviewed' : 'pending';
            await request('/api/admin-blog-proposals', {
              method: 'PATCH',
              body: JSON.stringify({ id: proposalId, status: nextStatus }),
            });
            showMessage(saveMessage, `Proposal marked as ${nextStatus}.`);
          }
          if (submitFeedbackReply) {
            const replyField = document.getElementById(`feedbackReply-${submitFeedbackReply}`);
            const adminReply = String(replyField?.value || '').trim();
            if (!adminReply) {
              throw new Error('Please enter a reply before saving.');
            }
            await request('/api/admin-chatbot-feedback', {
              method: 'PATCH',
              body: JSON.stringify({ id: submitFeedbackReply, adminReply }),
            });
            showMessage(saveMessage, 'Feedback reply saved and posted to the member dashboard.');
          }
          if (markFeedbackReviewed || markFeedbackClosed) {
            const feedbackId = markFeedbackReviewed || markFeedbackClosed;
            const status = markFeedbackReviewed ? 'reviewed' : 'closed';
            await request('/api/admin-chatbot-feedback', {
              method: 'PATCH',
              body: JSON.stringify({ id: feedbackId, status }),
            });
            showMessage(saveMessage, `Feedback marked as ${status}.`);
          }
          if (deletePost) {
            const postToDelete = state.posts.find((post) => String(post.id) === String(deletePost));
            const postTitle = postToDelete?.title ? ` "${postToDelete.title}"` : '';
            const confirmed = window.confirm(`Delete blog post${postTitle}? This action cannot be undone.`);
            if (!confirmed) {
              return;
            }
            await request(`/api/admin-posts?id=${encodeURIComponent(deletePost)}`, { method: 'DELETE' });
            if (state.editingPostId === deletePost) {
              resetPostForm();
            }
            showMessage(saveMessage, 'Blog post removed.');
          }
          if (deleteFaq) {
            // Mirrors the post-delete confirm above, which names its target.
            const faqToDelete = (state.faqs || []).find((faq) => String(faq.id) === String(deleteFaq));
            const faqQuestion = faqToDelete?.question ? `"${faqToDelete.question}"` : 'this FAQ entry';
            const confirmedFaqDelete = window.confirm(`Delete the FAQ entry ${faqQuestion}?\n\nThis action cannot be undone.`);
            if (!confirmedFaqDelete) {
              return;
            }
            await request(`/api/admin-faqs?id=${encodeURIComponent(deleteFaq)}`, { method: 'DELETE' });
            if (state.editingFaqId === deleteFaq) {
              resetFaqForm();
            }
            showMessage(saveMessage, 'FAQ entry removed.');
          }
          if (deleteTask) {
            await request(`/api/admin-tasks?id=${encodeURIComponent(deleteTask)}`, { method: 'DELETE' });
            showMessage(saveMessage, 'Task completed.');
          }
          await refreshDashboard();
        } catch (error) {
          showMessage(errorMessage, error.message);
        }
      });

      resetPostForm();
      resetFaqForm();
      renderMembershipGrantMeta();
      renderGlobalThemeSettings();
      resetEmailTemplateForm();
      loadSession();
