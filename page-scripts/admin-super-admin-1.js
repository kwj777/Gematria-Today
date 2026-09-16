      const sessionMeta = document.getElementById('sessionMeta');
      const superAdminPanel = document.getElementById('superAdminPanel');
      const siteModulesForm = document.getElementById('siteModulesForm');
      const saveMessage = document.getElementById('saveMessage');
      const errorMessage = document.getElementById('errorMessage');
      const globalBootswatchThemeSelect = document.getElementById('globalBootswatchThemeSelect');
      const saveGlobalBootswatchThemeButton = document.getElementById('saveGlobalBootswatchThemeButton');
      const globalBootswatchThemeResetButton = document.getElementById('globalBootswatchThemeResetButton');
      const globalBootswatchThemeMeta = document.getElementById('globalBootswatchThemeMeta');
      const privateBootswatchThemeSelect = document.getElementById('privateBootswatchThemeSelect');
      const savePrivateBootswatchThemeButton = document.getElementById('savePrivateBootswatchThemeButton');
      const privateBootswatchThemeResetButton = document.getElementById('privateBootswatchThemeResetButton');
      const privateBootswatchThemeMeta = document.getElementById('privateBootswatchThemeMeta');
      const generateHubSharedSecretButton = document.getElementById('generateHubSharedSecretButton');
      const removeFromHubButton = document.getElementById('removeFromHubButton');
      const hubSiteIdentity = document.getElementById('hubSiteIdentity');

      const DEFAULT_SITE_MODULES = Object.freeze({ forum: true, knowbot: true, gemabot: true, blog: true, membership: true, wordnik_wotd_slider: true, blog_home_slider: true, blog_home_featured_grid: true });
      let state = {
        user: null,
        settings: null,
        siteModules: { ...DEFAULT_SITE_MODULES },
        themeCatalog: { activeThemeSlug: 'default', presets: [] },
        privateThemeCatalog: { activeThemeSlug: 'default', presets: [] },
        hubSites: [],
        currentHubSite: null,
      };

      function showMessage(target, message) {
        target.textContent = message;
        target.classList.remove('d-none');
      }

      function clearMessage(target) {
        target.textContent = '';
        target.classList.add('d-none');
      }

      async function request(url, options = {}) {
        const response = await fetch(url, {
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', ...(options.headers || {}) },
          ...options,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || `Request failed (${response.status})`);
        }
        return payload;
      }

      function normalizeBootswatchTheme(themeId) {
        const options = new Set(Array.from(globalBootswatchThemeSelect.options).map((option) => option.value));
        return options.has(themeId) ? themeId : 'bootstrap';
      }

      function getBootswatchThemeLabel(themeId) {
        if (themeId === 'bootstrap') return 'Bootstrap default';
        return themeId.charAt(0).toUpperCase() + themeId.slice(1);
      }

      function normalizeThemeCatalog(catalog = {}) {
        return {
          activeThemeSlug: String(catalog?.activeThemeSlug || 'default').trim().toLowerCase(),
          presets: Array.isArray(catalog?.presets) ? catalog.presets : [],
        };
      }

      function setPrivateThemePreviewSessionCookie(enabled) {
        if (enabled) {
          document.cookie = 'private_theme_preview=1; Path=/; SameSite=Lax; Secure';
          return;
        }
        document.cookie = 'private_theme_preview=; Path=/; SameSite=Lax; Secure; Max-Age=0';
      }

      function refreshThemeStylesheets() {
        const nonce = Date.now();
        document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
          const href = String(link.getAttribute('href') || '');
          if (!href.includes('/theme.css') && !href.includes('/api/public-theme-css')) return;
          const url = new URL(link.href, window.location.origin);
          url.searchParams.set('preview_nonce', String(nonce));
          link.href = url.toString();
        });
      }

      function getGlobalBootswatchThemeId(catalog = {}) {
        const normalizedCatalog = normalizeThemeCatalog(catalog);
        if (!normalizedCatalog.activeThemeSlug.startsWith('bootswatch-')) return 'bootstrap';
        return normalizeBootswatchTheme(normalizedCatalog.activeThemeSlug.slice('bootswatch-'.length));
      }

      function buildThemeCatalogForBootswatch(themeId) {
        const normalizedThemeId = normalizeBootswatchTheme(themeId);
        const existingCatalog = normalizeThemeCatalog(state.themeCatalog);
        const preservedPresets = existingCatalog.presets.filter((preset) => !String(preset?.slug || '').startsWith('bootswatch-'));
        if (normalizedThemeId === 'bootstrap') {
          return { ...existingCatalog, activeThemeSlug: 'default', presets: preservedPresets };
        }
        const slug = `bootswatch-${normalizedThemeId}`;
        return {
          ...existingCatalog,
          activeThemeSlug: slug,
          presets: [...preservedPresets, {
            name: getBootswatchThemeLabel(normalizedThemeId),
            slug,
            description: `Global Bootswatch theme (${normalizedThemeId}).`,
            variables: {},
            customCss: `@import url('https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/${normalizedThemeId}/bootstrap.min.css');`,
          }],
        };
      }

      function renderSiteModules() {
        const moduleMeta = [['forum', 'Forum'], ['knowbot', 'SiteSeeker'], ['gemabot', 'GemaBot'], ['blog', 'Blog'], ['membership', 'Membership'], ['wordnik_wotd_slider', 'Word of the Day'], ['blog_home_slider', 'Home Blog Slider'], ['blog_home_featured_grid', 'Home Featured Grid']];
        const modules = { ...DEFAULT_SITE_MODULES, ...(state.siteModules || {}) };
        siteModulesForm.removeAttribute('aria-busy');
        siteModulesForm.innerHTML = moduleMeta.map(([name, label]) => `
          <div class="col-md-6 col-xl-4">
            <label class="form-check form-switch">
              <input class="form-check-input" type="checkbox" data-site-module="${name}" ${modules[name] !== false ? 'checked' : ''} />
              <span class="form-check-label">${label}</span>
            </label>
          </div>`).join('');
      }


      function renderGlobalThemeSettings() {
        const selectedThemeId = getGlobalBootswatchThemeId(state.themeCatalog);
        globalBootswatchThemeSelect.value = selectedThemeId;
        globalBootswatchThemeMeta.textContent = selectedThemeId === 'bootstrap'
          ? 'Global theme is set to Bootstrap default.'
          : `Global theme is set to ${getBootswatchThemeLabel(selectedThemeId)}.`;
      }

      function renderPrivateThemeSettings() {
        const selectedThemeId = getGlobalBootswatchThemeId(state.privateThemeCatalog);
        privateBootswatchThemeSelect.value = selectedThemeId;
        privateBootswatchThemeMeta.textContent = selectedThemeId === 'bootstrap'
          ? 'Private preview theme is currently Bootstrap default.'
          : `Private preview theme is set to ${getBootswatchThemeLabel(selectedThemeId)}.`;
      }

      function findCurrentHubSite(sites = []) {
        const currentOrigin = String(window.location.origin || '').replace(/\/$/, '').toLowerCase();
        return sites.find((site) => String(site?.url || '').replace(/\/$/, '').toLowerCase() === currentOrigin) || null;
      }

      function updateHubSiteControls() {
        state.currentHubSite = findCurrentHubSite(state.hubSites);
        if (!state.currentHubSite) {
          hubSiteIdentity.textContent = 'This site is not currently registered in the admin hub.';
          generateHubSharedSecretButton.disabled = false;
          removeFromHubButton.disabled = true;
          return;
        }

        const siteId = String(state.currentHubSite.id || '').trim();
        const siteName = String(state.currentHubSite.name || '').trim();
        hubSiteIdentity.textContent = `Registered as ${siteName || siteId} (${siteId}).`;
        generateHubSharedSecretButton.disabled = !siteId;
        removeFromHubButton.disabled = !siteId;
      }

      async function loadHubSites() {
        try {
          const payload = await request('/api/admin-hub', { method: 'GET' });
          state.hubSites = Array.isArray(payload?.sites) ? payload.sites : [];
        } catch (error) {
          state.hubSites = [];
          hubSiteIdentity.textContent = 'Unable to load hub registration state from /api/admin-hub.';
          generateHubSharedSecretButton.disabled = true;
          removeFromHubButton.disabled = true;
          return;
        }

        updateHubSiteControls();
      }

      async function loadSessionAndSettings() {
        try {
          const payload = await request('/api/admin-session', { method: 'GET' });
          if (!payload?.authenticated || payload?.user?.role !== 'super_admin') {
            window.location.assign(window.adminSession?.signInUrl?.() || '/admin.html');
            return;
          }
          state.user = payload.user;
          sessionMeta.textContent = `Signed in as ${payload.user.username} (${payload.user.role}).`;

          const settingsPayload = await request('/api/admin-settings');
          state.settings = settingsPayload.settings || {};
          state.siteModules = { ...DEFAULT_SITE_MODULES, ...(state.settings.siteModules || {}) };
          state.themeCatalog = normalizeThemeCatalog(state.settings.themeCatalog || {});
          state.privateThemeCatalog = normalizeThemeCatalog(state.settings.privateThemeCatalog || {});
          renderSiteModules();
          renderGlobalThemeSettings();
          renderPrivateThemeSettings();
          superAdminPanel.classList.remove('d-none');
          document.getElementById('hubEntryPanel').classList.remove('d-none');
          await loadHubSites();
        } catch (error) {
          showMessage(errorMessage, error.message || 'Unable to verify super admin session.');
          sessionMeta.textContent = 'Unable to verify super admin session.';
        }
      }

      async function saveSiteModules() {
        clearMessage(errorMessage);
        clearMessage(saveMessage);
        const nextModules = { ...DEFAULT_SITE_MODULES };
        siteModulesForm.querySelectorAll('[data-site-module]').forEach((field) => {
          const moduleName = String(field.dataset.siteModule || '').trim().toLowerCase();
          if (Object.hasOwn(nextModules, moduleName)) nextModules[moduleName] = Boolean(field.checked);
        });

        try {
          const payload = await request('/api/admin-settings', {
            method: 'PUT',
            body: JSON.stringify({
              siteModules: nextModules,
            }),
          });
          state.settings = payload.settings || state.settings;
          state.siteModules = { ...DEFAULT_SITE_MODULES, ...(state.settings.siteModules || {}) };
          renderSiteModules();
          showMessage(saveMessage, 'Site module switches saved.');
          window.showToast?.('Site module switches saved. Please allow up to 10 minutes for changes to take effect.', 'info');
        } catch (error) {
          showMessage(errorMessage, error.message || 'Unable to save site module switches.');
        }
      }

      siteModulesForm?.addEventListener('change', async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || !target.matches('[data-site-module]')) return;
        await saveSiteModules();
      });


      saveGlobalBootswatchThemeButton?.addEventListener('click', async () => {
        clearMessage(errorMessage);
        clearMessage(saveMessage);
        const selectedTheme = normalizeBootswatchTheme(globalBootswatchThemeSelect.value || 'bootstrap');
        try {
          const payload = await request('/api/admin-settings', {
            method: 'PUT',
            body: JSON.stringify({
              themeCatalog: buildThemeCatalogForBootswatch(selectedTheme),
              privateThemeCatalog: state.privateThemeCatalog,
            }),
          });
          state.settings = payload.settings || state.settings;
          state.themeCatalog = normalizeThemeCatalog(state.settings.themeCatalog || {});
          renderGlobalThemeSettings();
          showMessage(saveMessage, selectedTheme === 'bootstrap'
            ? 'Global theme reset to Bootstrap default.'
            : `Global theme updated to ${getBootswatchThemeLabel(selectedTheme)}.`);
          window.showToast?.('Global theme saved. Please allow up to 10 minutes for cached pages to refresh.', 'info');
        } catch (error) {
          showMessage(errorMessage, error.message || 'Unable to save global theme.');
        }
      });

      globalBootswatchThemeResetButton?.addEventListener('click', () => {
        globalBootswatchThemeSelect.value = 'bootstrap';
      });

      savePrivateBootswatchThemeButton?.addEventListener('click', async () => {
        clearMessage(errorMessage);
        clearMessage(saveMessage);
        const selectedTheme = normalizeBootswatchTheme(privateBootswatchThemeSelect.value || 'bootstrap');
        try {
          const payload = await request('/api/admin-settings', {
            method: 'PUT',
            body: JSON.stringify({
              themeCatalog: state.themeCatalog,
              privateThemeCatalog: buildThemeCatalogForBootswatch(selectedTheme),
            }),
          });
          state.settings = payload.settings || state.settings;
          state.privateThemeCatalog = normalizeThemeCatalog(state.settings.privateThemeCatalog || {});
          setPrivateThemePreviewSessionCookie(selectedTheme !== 'bootstrap');
          refreshThemeStylesheets();
          renderPrivateThemeSettings();
          showMessage(saveMessage, selectedTheme === 'bootstrap'
            ? 'Private preview theme reset to Bootstrap default.'
            : `Private preview theme updated to ${getBootswatchThemeLabel(selectedTheme)}.`);
          window.showToast?.('Private preview theme saved for this browser session only and applied immediately.', 'info');
        } catch (error) {
          showMessage(errorMessage, error.message || 'Unable to save private preview theme.');
        }
      });

      privateBootswatchThemeResetButton?.addEventListener('click', () => {
        privateBootswatchThemeSelect.value = 'bootstrap';
      });

      generateHubSharedSecretButton?.addEventListener('click', async () => {
        clearMessage(errorMessage);
        clearMessage(saveMessage);
        const currentSiteId = String(state.currentHubSite?.id || '').trim();

        const originalLabel = generateHubSharedSecretButton.textContent;
        generateHubSharedSecretButton.disabled = true;
        generateHubSharedSecretButton.textContent = 'Saving…';
        try {
          const payload = await request('/api/admin-hub', {
            method: 'POST',
            body: JSON.stringify({
              action: 'generate-shared-secret',
              ...(currentSiteId ? { siteId: currentSiteId } : {}),
            }),
          });
          if (!payload?.saved || !payload?.sharedSecret) {
            throw new Error(payload?.error || 'Could not save HUB_SHARED_SECRET');
          }
          const savedSiteId = String(payload?.site?.id || currentSiteId || 'this site').trim();
          if (payload?.netlifySync?.saved === false) {
            showMessage(
              saveMessage,
              `Generated HUB_SHARED_SECRET for ${savedSiteId}, but automatic Netlify sync failed. Copy this value and set HUB_SHARED_SECRET manually in Netlify: ${payload.sharedSecret}`,
            );
          } else {
            showMessage(saveMessage, `Generated and stored HUB_SHARED_SECRET for ${savedSiteId}.`);
          }
          await loadHubSites();
        } catch (error) {
          showMessage(errorMessage, error.message || 'Unable to generate shared secret.');
        } finally {
          generateHubSharedSecretButton.textContent = originalLabel;
          updateHubSiteControls();
        }
      });

      removeFromHubButton?.addEventListener('click', async () => {
        clearMessage(errorMessage);
        clearMessage(saveMessage);
        const currentSiteId = String(state.currentHubSite?.id || '').trim();
        if (!currentSiteId) {
          showMessage(errorMessage, 'This site is not registered in the hub yet.');
          return;
        }

        const confirmed = window.confirm(`Remove this site (${currentSiteId}) from the admin hub?`);
        if (!confirmed) {
          return;
        }

        const nextSites = state.hubSites.filter((site) => String(site?.id || '').trim() !== currentSiteId);
        const originalLabel = removeFromHubButton.textContent;
        removeFromHubButton.disabled = true;
        removeFromHubButton.textContent = 'Removing…';
        try {
          const payload = await request('/api/admin-hub', {
            method: 'POST',
            body: JSON.stringify({ action: 'save-sites', sites: nextSites }),
          });
          state.hubSites = Array.isArray(payload?.sites) ? payload.sites : nextSites;
          updateHubSiteControls();
          showMessage(saveMessage, `Removed ${currentSiteId} from the admin hub list.`);
        } catch (error) {
          showMessage(errorMessage, error.message || 'Unable to remove this site from the hub.');
        } finally {
          removeFromHubButton.textContent = originalLabel;
          updateHubSiteControls();
        }
      });

      loadSessionAndSettings();
