(() => {
  const DEFAULT_MODULES = Object.freeze({
    forum: true,
    knowbot: true,
    gemabot: true,
    news: true,
    blog: true,
    membership: true,
  });

  const STORAGE_KEY = 'endtimes.siteModules';
  const normalizeName = (value) => String(value || '').trim().toLowerCase();
  const DISABLED_MODULES = Object.freeze(Object.keys(DEFAULT_MODULES).reduce((result, name) => {
    result[name] = false;
    return result;
  }, {}));

  let activeModules = { ...DISABLED_MODULES };

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

  const isEnabled = (moduleName) => activeModules[normalizeName(moduleName)] !== false;

  const MODULE_PATH_MATCHERS = Object.freeze({
    news: [/\/news(?:\.html)?(?:[?#].*)?$/i],
    blog: [/\/blog(?:\.html)?(?:[?#].*)?$/i],
    forum: [/\/forum(?:\.html)?(?:[?#].*)?$/i],
    membership: [/\/member(?:\.html)?(?:[?#].*)?$/i],
  });

  const MODULE_LINK_HIDDEN_FLAG = 'moduleLinkHidden';

  const applyModuleLinkVisibility = () => {
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
      container.dataset[MODULE_LINK_HIDDEN_FLAG] = '1';
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
        element.removeAttribute('aria-hidden');
        if (hideMode === 'disable' && 'disabled' in element) {
          element.disabled = false;
        }
        return;
      }

      element.classList.add('d-none');
      element.setAttribute('aria-hidden', 'true');
      if (hideMode === 'disable' && 'disabled' in element) {
        element.disabled = true;
      }
    });

    applyModuleLinkVisibility();
  };

  const fetchGlobalModules = async () => {
    try {
      const response = await fetch('/api/public-site-modules', {
        method: 'GET',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        return {};
      }
      const payload = await response.json();
      return parseModuleOverrides(payload?.modules);
    } catch {
      return {};
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

  const applyModuleSettings = async () => {
    const [globalModules, canOverride] = await Promise.all([
      fetchGlobalModules(),
      isSuperAdminSession(),
    ]);

    activeModules = {
      ...DEFAULT_MODULES,
      ...globalModules,
      ...parseModuleOverrides(window.SITE_MODULE_OVERRIDES || {}),
    };

    if (canOverride) {
      activeModules = {
        ...activeModules,
        ...parseStoredModules(),
        ...parseModulesFromQuery(),
      };
    }

    applyModuleVisibility();
  };

  window.EndTimesModules = Object.freeze({
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
      applyModuleVisibility();
      applyModuleSettings().catch(() => {});
    }, { once: true });
  } else {
    applyModuleVisibility();
    applyModuleSettings().catch(() => {});
  }
})();
