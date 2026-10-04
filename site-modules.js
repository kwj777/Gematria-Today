(() => {
  // Mirrors DEFAULT_SITE_MODULES in netlify/functions/_site-modules.mjs. Every
  // module is on unless an admin saved it off.
  const DEFAULT_MODULES = Object.freeze({
    forum: true,
    knowbot: true,
    gemabot: true,
    blog: true,
    membership: true,
    wordnik_wotd_slider: true,
    blog_home_slider: true,
    blog_home_featured_grid: true,
  });

  const STORAGE_KEY = 'gematria.siteModules';
  // The switches the server last reported. A failed /api/public-site-modules
  // fetch used to fall back to the defaults -- every module on -- and so
  // re-showed whatever an admin had switched off.
  const LAST_KNOWN_STORAGE_KEY = 'gematria.siteModules.lastKnown';
  const normalizeName = (value) => String(value || '').trim().toLowerCase();
  let activeModules = { ...DEFAULT_MODULES };
  let superAdminCanOverrideModules = false;

  const parseModuleOverrides = (rawValue) => {
    if (!rawValue || typeof rawValue !== 'object') {
      return {};
    }

    return Object.entries(rawValue).reduce((result, [rawKey, rawEnabled]) => {
      const name = normalizeName(rawKey);
      if (!name || !(name in DEFAULT_MODULES)) {
        return result;
      }
      result[name] = Boolean(rawEnabled);
      return result;
    }, {});
  };

  const parseModulesFromQuery = () => {
    const url = new URL(window.location.href);
    const value = url.searchParams.get('modules');
    if (!value) {
      return {};
    }

    const requestedModules = value
      .split(',')
      .map((entry) => normalizeName(entry))
      .filter(Boolean);

    if (requestedModules.length === 0) {
      return {};
    }

    return Object.keys(DEFAULT_MODULES).reduce((result, name) => {
      result[name] = requestedModules.includes(name);
      return result;
    }, {});
  };

  const parseStoredModules = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return {};
      }
      return parseModuleOverrides(JSON.parse(raw));
    } catch {
      return {};
    }
  };

  const storeModules = (modules) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parseModuleOverrides(modules)));
    } catch {
      // Ignore storage write failures (private mode, quota, etc).
    }
  };

  const readLastKnownModules = () => {
    try {
      const raw = window.localStorage.getItem(LAST_KNOWN_STORAGE_KEY);
      return raw ? parseModuleOverrides(JSON.parse(raw)) : {};
    } catch {
      return {};
    }
  };

  const storeLastKnownModules = (modules) => {
    try {
      window.localStorage.setItem(LAST_KNOWN_STORAGE_KEY, JSON.stringify(parseModuleOverrides(modules)));
    } catch {
      // A per-browser convenience only; the server enforces the switches.
    }
  };

  const isEnabled = (moduleName) => activeModules[normalizeName(moduleName)] !== false;

  const MODULE_PATH_MATCHERS = Object.freeze({
    blog: [/\/blog(?:\.html)?(?:[?#].*)?$/i],
    forum: [/\/forum(?:\.html)?(?:[?#].*)?$/i, /\/forum-reputation-scale(?:\.html)?(?:[?#].*)?$/i],
    // Sign-up and upgrade links only. Switching membership off stops new
    // sign-ups and charges; existing members still sign in at /member and
    // cancel from its billing portal, so links to /member itself (Log in,
    // Dashboard, the footer's Membership) stay.
    membership: [
      /\/gematria-account-setup(?:\.html)?(?:[?#].*)?$/i,
      /\/member(?:\.html)?(?:\?[^#]*)?#(?:registerForm|membershipUpgradeSection)$/i,
      /\/member(?:\.html)?\?(?:[^#]*&)?auth=register(?:[&#].*)?$/i,
    ],
    gemabot: [/\/ai-agent(?:\.html)?(?:[?#].*)?$/i],
    knowbot: [/\/searchbot(?:\.html)?(?:[?#].*)?$/i],
  });

  const MODULE_PAGE_NAMES = Object.freeze({
    forum: 'The forum',
    knowbot: 'SiteSeeker',
    gemabot: 'GemaBot',
    blog: 'The blog',
    membership: 'Membership sign-up',
  });

  const MODULE_LINK_HIDDEN_FLAG = 'moduleLinkHidden';
  const MODULE_PRELOAD_HIDDEN_FLAG = 'modulePreloadHidden';
  const MODULE_PAGE_HIDDEN_FLAG = 'modulePageHidden';

  // A page whose <main> carries data-module-page="<module>" belongs to that
  // module. Its pages used to load and run as normal with the module off;
  // now the content is set aside behind a notice. The inline !important
  // display beats any class a page script toggles later.
  const buildModuleDisabledNotice = (moduleName) => {
    const notice = document.createElement('section');
    notice.className = 'content-panel p-4 p-lg-5 my-4 mx-auto text-center';
    notice.setAttribute('data-module-disabled-notice', moduleName);
    notice.setAttribute('role', 'status');
    const heading = document.createElement('h1');
    heading.className = 'h3 mb-3';
    heading.textContent = `${MODULE_PAGE_NAMES[moduleName] || 'This feature'} is currently unavailable`;
    const body = document.createElement('p');
    body.className = 'text-muted mb-4';
    body.textContent = 'This part of Gematria.Today is switched off for now. Please check back later.';
    const link = document.createElement('a');
    link.className = 'btn btn-primary';
    link.href = '/';
    link.textContent = 'Back to the home page';
    notice.append(heading, body, link);
    return notice;
  };

  const applyModulePageState = () => {
    document.querySelectorAll('[data-module-page]').forEach((page) => {
      const moduleName = normalizeName(page.getAttribute('data-module-page'));
      const disabled = Boolean(moduleName) && !isEnabled(moduleName);
      const existingNotice = page.querySelector(':scope > [data-module-disabled-notice]');

      if (!disabled) {
        existingNotice?.remove();
        Array.from(page.children).forEach((child) => {
          if (child.dataset[MODULE_PAGE_HIDDEN_FLAG] === '1') {
            child.style.removeProperty('display');
            child.removeAttribute('aria-hidden');
            delete child.dataset[MODULE_PAGE_HIDDEN_FLAG];
          }
        });
        return;
      }

      Array.from(page.children).forEach((child) => {
        if (child === existingNotice || child.dataset[MODULE_PAGE_HIDDEN_FLAG] === '1') {
          return;
        }
        child.style.setProperty('display', 'none', 'important');
        child.setAttribute('aria-hidden', 'true');
        child.dataset[MODULE_PAGE_HIDDEN_FLAG] = '1';
      });
      if (!existingNotice) {
        page.prepend(buildModuleDisabledNotice(moduleName));
      }
    });
  };

  const applySynchronousModuleOverrides = () => {
    const lastKnownModules = readLastKnownModules();
    const preloadOverrides = {
      ...lastKnownModules,
      ...parseModuleOverrides(window.SITE_MODULE_OVERRIDES || {}),
      ...parseStoredModules(),
      ...parseModulesFromQuery(),
    };

    // Until the server answers, go by what it said last time, so a returning
    // visitor does not see a switched-off page flash up first.
    activeModules = { ...DEFAULT_MODULES, ...lastKnownModules };
    applyModulePageState();

    document.querySelectorAll('[data-module]').forEach((element) => {
      const requiredModules = String(element.getAttribute('data-module') || '')
        .split(',')
        .map((moduleName) => normalizeName(moduleName))
        .filter(Boolean);

      if (requiredModules.length === 0) {
        return;
      }

      const shouldHide = requiredModules.some((moduleName) => (
        moduleName in preloadOverrides && preloadOverrides[moduleName] === false
      ));

      if (!shouldHide) {
        return;
      }

      if (element.classList.contains('d-none')) {
        return;
      }

      element.classList.add('d-none');
      element.dataset[MODULE_PRELOAD_HIDDEN_FLAG] = '1';
      element.setAttribute('aria-hidden', 'true');
    });
  };

  const applyModuleLinkVisibility = () => {
    document.querySelectorAll('[data-module-link-hidden="true"]').forEach((element) => {
      element.classList.remove('d-none');
      element.removeAttribute('aria-hidden');
      element.removeAttribute('data-module-link-hidden');
    });

    document.querySelectorAll('a[href]').forEach((link) => {
      const href = String(link.getAttribute('href') || '').trim();
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
        return;
      }

      const disabledModule = Object.entries(MODULE_PATH_MATCHERS).find(([moduleName, matchers]) => (
        isEnabled(moduleName) === false
        && matchers.some((matcher) => matcher.test(href))
      ));

      const container = link.closest('[data-module-link-container], .nav-item, li') || link;

      if (superAdminCanOverrideModules) {
        if (container.dataset[MODULE_LINK_HIDDEN_FLAG] === '1') {
          container.classList.remove('d-none');
          container.removeAttribute('aria-hidden');
          delete container.dataset[MODULE_LINK_HIDDEN_FLAG];
        }
        return;
      }

      if (!disabledModule) {
        if (container.dataset[MODULE_LINK_HIDDEN_FLAG] === '1') {
          container.classList.remove('d-none');
          container.removeAttribute('aria-hidden');
          delete container.dataset[MODULE_LINK_HIDDEN_FLAG];
        }
        return;
      }

      container.classList.add('d-none');
      container.setAttribute('aria-hidden', 'true');
      container.setAttribute('data-module-link-hidden', 'true');
    });
  };

  const applyModuleVisibility = () => {
    document.querySelectorAll('[data-module]').forEach((element) => {
      const requiredModules = String(element.getAttribute('data-module') || '')
        .split(',')
        .map((moduleName) => normalizeName(moduleName))
        .filter(Boolean);

      if (requiredModules.length === 0) {
        return;
      }

      const shouldShow = requiredModules.every((moduleName) => isEnabled(moduleName));
      const hideMode = element.getAttribute('data-module-hide') || 'class';

      if (shouldShow) {
        element.classList.remove('d-none');
        if (element.dataset[MODULE_PRELOAD_HIDDEN_FLAG] === '1') {
          delete element.dataset[MODULE_PRELOAD_HIDDEN_FLAG];
        }
        element.removeAttribute('aria-hidden');
        if (hideMode === 'disable' && 'disabled' in element) {
          element.disabled = false;
        }
        return;
      }

      element.classList.add('d-none');
      element.setAttribute('aria-hidden', 'true');
      if (element.dataset[MODULE_PRELOAD_HIDDEN_FLAG] === '1') {
        delete element.dataset[MODULE_PRELOAD_HIDDEN_FLAG];
      }
      if (hideMode === 'disable' && 'disabled' in element) {
        element.disabled = true;
      }
    });

    applyModuleLinkVisibility();
    applyModulePageState();
  };

  const renderSuperAdminTogglePanel = () => {
    const host = document.querySelector('[data-super-admin-module-toggles-host]');
    const existingPanel = document.getElementById('superAdminModuleTogglePanel');

    if (!superAdminCanOverrideModules || !host) {
      existingPanel?.remove();
      return;
    }

    const moduleMeta = [
      ['forum', 'Forum'],
      ['knowbot', 'SiteSeeker'],
      ['gemabot', 'GemaBot'],
      ['blog', 'Blog'],
      ['membership', 'Membership'],
      ['wordnik_wotd_slider', 'Word of the Day'],
      ['blog_home_slider', 'Home Blog Slider'],
      ['blog_home_featured_grid', 'Home Featured Grid'],
    ];

    const panel = existingPanel || document.createElement('div');
    panel.id = 'superAdminModuleTogglePanel';
    panel.className = 'row g-3';

    panel.innerHTML = moduleMeta.map(([name, label]) => {
      const checked = isEnabled(name) ? 'checked' : '';
      return `
        <div class="col-md-6 col-xl-4">
          <label class="form-check form-switch">
            <input class="form-check-input" type="checkbox" data-super-admin-module-toggle="${name}" ${checked} />
            <span class="form-check-label">${label}</span>
          </label>
        </div>`;
    }).join('');

    if (!existingPanel) {
      host.appendChild(panel);
    }

    panel.querySelectorAll('[data-super-admin-module-toggle]').forEach((field) => {
      field.addEventListener('change', () => {
        const moduleName = normalizeName(field.getAttribute('data-super-admin-module-toggle'));
        if (!moduleName || !(moduleName in DEFAULT_MODULES)) {
          return;
        }

        activeModules = {
          ...activeModules,
          [moduleName]: Boolean(field.checked),
        };
        storeModules(activeModules);
        applyModuleVisibility();
      });
    });
  };

  const fetchGlobalModules = async () => {
    try {
      const response = await fetch('/api/public-site-modules', {
        method: 'GET',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        return { modules: readLastKnownModules() };
      }
      const payload = await response.json();
      const modules = parseModuleOverrides(payload?.modules);
      storeLastKnownModules(modules);
      return { modules };
    } catch {
      return { modules: readLastKnownModules() };
    }
  };

  const isSuperAdminSession = async () => {
    try {
      const response = await fetch('/api/admin-session', {
        method: 'GET',
        credentials: 'include',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        return false;
      }
      const payload = await response.json();
      return Boolean(payload?.authenticated && payload?.user?.role === 'super_admin');
    } catch {
      return false;
    }
  };

  // The answer to "is this a super admin?" is only ever used for two things:
  // honouring a module override, and rendering the toggle panel. Asking anyway
  // meant every anonymous visitor to the home page, the membership page and
  // account setup triggered /api/admin-session -- which runs the full admin
  // schema bootstrap before it checks any credential. Skip the round trip when
  // there is nothing an admin session could change.
  const superAdminAnswerCouldMatter = () => {
    if (document.querySelector('[data-super-admin-module-toggles-host]')) {
      return true;
    }
    if (Object.keys(parseModulesFromQuery()).length > 0) {
      return true;
    }
    try {
      return Boolean(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      return false;
    }
  };

  const applyModuleSettings = async () => {
    const [globalSettings, canOverride] = await Promise.all([
      fetchGlobalModules(),
      superAdminAnswerCouldMatter() ? isSuperAdminSession() : Promise.resolve(false),
    ]);
    superAdminCanOverrideModules = canOverride;

    activeModules = {
      ...DEFAULT_MODULES,
      ...(globalSettings.modules || {}),
      ...parseModuleOverrides(window.SITE_MODULE_OVERRIDES || {}),
    };

    if (canOverride) {
      activeModules = {
        ...activeModules,
        ...parseStoredModules(),
        ...parseModulesFromQuery(),
      };
    }

    renderSuperAdminTogglePanel();
    applyModuleVisibility();
  };

  window.GematriaModules = Object.freeze({
    defaults: { ...DEFAULT_MODULES },
    get active() {
      return { ...activeModules };
    },
    storageKey: STORAGE_KEY,
    isEnabled,
    applyModuleVisibility,
    applyModuleSettings,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applySynchronousModuleOverrides();
      applyModuleSettings().catch(() => {
        applyModuleVisibility();
      });
    }, { once: true });
  } else {
    applySynchronousModuleOverrides();
    applyModuleSettings().catch(() => {
      applyModuleVisibility();
    });
  }
})();
