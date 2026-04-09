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
  let activeModules = { ...DEFAULT_MODULES };

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

  const applySuperAdminOverrides = async () => {
    const canOverride = await isSuperAdminSession();
    if (!canOverride) {
      return;
    }

    activeModules = {
      ...DEFAULT_MODULES,
      ...parseStoredModules(),
      ...parseModuleOverrides(window.SITE_MODULE_OVERRIDES || {}),
      ...parseModulesFromQuery(),
    };
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
    applySuperAdminOverrides,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyModuleVisibility();
      applySuperAdminOverrides().catch(() => {});
    }, { once: true });
  } else {
    applyModuleVisibility();
    applySuperAdminOverrides().catch(() => {});
  }
})();
