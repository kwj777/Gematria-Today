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

  const isEnabled = (moduleName) => activeModules[normalizeName(moduleName)] !== false;

  const MODULE_PATH_MATCHERS = Object.freeze({
    news: [/\/news(?:\.html)?(?:[?#].*)?$/i],
    blog: [/\/blog(?:\.html)?(?:[?#].*)?$/i],
    forum: [/\/forum(?:\.html)?(?:[?#].*)?$/i],
    membership: [/\/member(?:\.html)?(?:[?#].*)?$/i],
  });

  const MODULE_LINK_HIDDEN_FLAG = 'moduleLinkHidden';

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

  const renderSuperAdminTogglePanel = () => {
    const existingPanel = document.getElementById('superAdminModuleTogglePanel');
    if (!superAdminCanOverrideModules) {
      existingPanel?.remove();
      return;
    }

    const moduleEntries = Object.keys(DEFAULT_MODULES);
    const panel = existingPanel || document.createElement('aside');
    panel.id = 'superAdminModuleTogglePanel';
    panel.setAttribute('aria-label', 'Super admin module toggles');
    panel.style.position = 'fixed';
    panel.style.right = '1rem';
    panel.style.bottom = '1rem';
    panel.style.zIndex = '1050';
    panel.style.width = 'min(92vw, 320px)';
    panel.style.maxHeight = '70vh';
    panel.style.overflow = 'auto';
    panel.style.padding = '0.75rem';
    panel.style.border = '1px solid rgba(0,0,0,0.16)';
    panel.style.borderRadius = '0.75rem';
    panel.style.background = 'rgba(255,255,255,0.98)';
    panel.style.boxShadow = '0 0.5rem 1.5rem rgba(0,0,0,0.18)';
    panel.style.fontSize = '0.9rem';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:0.5rem;">
        <strong>Super admin modules</strong>
        <div style="display:flex;gap:0.35rem;flex-wrap:wrap;justify-content:flex-end;">
          <button type="button" data-modules-action="enable-disabled" style="border:1px solid #0d6efd;background:#fff;border-radius:0.5rem;padding:0.2rem 0.5rem;cursor:pointer;">Enable disabled</button>
          <button type="button" data-modules-action="reset" style="border:1px solid #6c757d;background:#fff;border-radius:0.5rem;padding:0.2rem 0.5rem;cursor:pointer;">Reset</button>
        </div>
      </div>
      <p style="margin:0 0 0.5rem;color:#495057;">Choose what to show while you work. Changes stay in this browser only.</p>
      <div data-module-toggle-list style="display:grid;gap:0.35rem;"></div>
    `;

    const list = panel.querySelector('[data-module-toggle-list]');
    list.innerHTML = moduleEntries.map((moduleName) => `
      <label style="display:flex;align-items:center;gap:0.5rem;margin:0;">
        <input type="checkbox" data-module-toggle="${moduleName}" ${isEnabled(moduleName) ? 'checked' : ''}>
        <span style="text-transform:capitalize;">${moduleName}</span>
      </label>
    `).join('');

    panel.querySelectorAll('[data-module-toggle]').forEach((field) => {
      field.addEventListener('change', () => {
        const moduleName = normalizeName(field.getAttribute('data-module-toggle'));
        if (!moduleName || !(moduleName in DEFAULT_MODULES)) {
          return;
        }

        activeModules = {
          ...DEFAULT_MODULES,
          ...activeModules,
          [moduleName]: Boolean(field.checked),
        };
        storeModules(activeModules);
        applyModuleVisibility();
      });
    });

    panel.querySelector('[data-modules-action="reset"]')?.addEventListener('click', () => {
      activeModules = { ...DEFAULT_MODULES };
      storeModules(activeModules);
      renderSuperAdminTogglePanel();
      applyModuleVisibility();
    });

    panel.querySelector('[data-modules-action="enable-disabled"]')?.addEventListener('click', () => {
      activeModules = Object.keys(DEFAULT_MODULES).reduce((result, moduleName) => {
        result[moduleName] = true;
        return result;
      }, {});
      storeModules(activeModules);
      renderSuperAdminTogglePanel();
      applyModuleVisibility();
    });

    if (!existingPanel) {
      document.body.appendChild(panel);
    }
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
    superAdminCanOverrideModules = canOverride;

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

    renderSuperAdminTogglePanel();
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
