    (function () {
      'use strict';

      // -----------------------------------------------------------------------
      // Utilities
      // -----------------------------------------------------------------------

      function showMessage(text, type) {
        var el = document.getElementById('hubMessage');
        el.className = 'alert alert-' + type + ' mb-4';
        el.textContent = text;
        el.classList.remove('d-none');
        clearTimeout(el._timer);
        el._timer = setTimeout(function () { el.classList.add('d-none'); }, 6000);
      }

      // -----------------------------------------------------------------------
      // Auth
      // -----------------------------------------------------------------------

      var currentUser = null;

      function checkSession() {
        return fetch('/api/admin-session', { credentials: 'same-origin' })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (!data.authenticated) {
              document.getElementById('accessDeniedBanner').classList.remove('d-none');
              document.body.classList.remove('hub-render-pending');
              return null;
            }
            var user = data.user;
            var isSuperAdmin = user.role === 'super_admin';
            var isAdmin = isSuperAdmin || user.role === 'admin' || user.isAdmin === true;
            if (!isAdmin) {
              document.getElementById('accessDeniedBanner').classList.remove('d-none');
              document.body.classList.remove('hub-render-pending');
              return null;
            }
            currentUser = user;
            var roleLabel = isSuperAdmin ? 'Super Admin' : 'Admin';
            document.getElementById('sessionMeta').textContent =
              'Signed in as ' + currentUser.username + ' \u00b7 ' + roleLabel;
            document.getElementById('hubPanel').classList.remove('d-none');
            if (!isSuperAdmin) {
              document.getElementById('siteListPanel').classList.add('d-none');
              document.getElementById('shared-secret-config').classList.add('d-none');
            }
            document.body.classList.remove('hub-render-pending');
            return isSuperAdmin ? 'super_admin' : 'admin';
          })
          .catch(function () {
            window.location.href = '/admin.html';
          });
      }

      document.getElementById('logoutButton').addEventListener('click', function () {
        fetch('/api/admin-logout', { method: 'POST', credentials: 'same-origin' })
          .finally(function () { window.location.href = '/admin.html'; });
      });

      // -----------------------------------------------------------------------
      // Site list
      // -----------------------------------------------------------------------

      var registeredSites = [];
      var siteAdaptationSelect = document.getElementById('siteAdaptationSelect');
      var refreshSiteAdaptationGuidesButton = document.getElementById('refreshSiteAdaptationGuidesButton');
      var openSiteAdaptationGuideButton = document.getElementById('openSiteAdaptationGuideButton');
      var siteAdaptationStatus = document.getElementById('siteAdaptationStatus');
      var siteListPanelHeader = document.getElementById('siteListPanelHeader');
      var siteListPanelBody = document.getElementById('siteListPanelBody');
      var refreshSitesBtn = document.getElementById('refreshSitesBtn');
      var collapseButtons = document.querySelectorAll('.admin-section-toggle[data-bs-toggle="collapse"]');

      function bindManualCollapseToggle(button) {
        var targetSelector = button.getAttribute('data-bs-target');
        if (!targetSelector || !window.bootstrap || !window.bootstrap.Collapse) {
          return;
        }
        var panel = document.querySelector(targetSelector);
        if (!panel) {
          return;
        }

        var collapseInstance = window.bootstrap.Collapse.getOrCreateInstance(panel, { toggle: false });

        button.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          collapseInstance.toggle();
        });

        panel.addEventListener('shown.bs.collapse', function () {
          button.classList.remove('collapsed');
          button.setAttribute('aria-expanded', 'true');
        });

        panel.addEventListener('hidden.bs.collapse', function () {
          button.classList.add('collapsed');
          button.setAttribute('aria-expanded', 'false');
        });
      }

      collapseButtons.forEach(bindManualCollapseToggle);

      function loadSites() {
        var loading = document.getElementById('siteListLoading');
        var empty = document.getElementById('siteListEmpty');
        var list = document.getElementById('siteList');

        loading.classList.remove('d-none');
        empty.classList.add('d-none');
        list.innerHTML = '';

        return fetch('/api/admin-hub', { credentials: 'same-origin' })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            loading.classList.add('d-none');
            registeredSites = data.sites || [];

            if (!registeredSites.length) {
              empty.classList.remove('d-none');
              renderSiteEditor([]);
              return;
            }

            registeredSites.forEach(function (site) {
              list.appendChild(buildSiteCard(site));
            });

            renderSiteEditor(registeredSites);
          })
          .catch(function () {
            loading.classList.add('d-none');
            showMessage('Failed to load sites.', 'danger');
          });
      }

      function buildSiteCard(site) {
        var col = document.createElement('div');
        col.className = 'col-md-6 col-xl-4';
        col.innerHTML =
          '<div class="site-card p-4 h-100 d-flex flex-column gap-3">' +
            '<div>' +
              '<h3 class="h6 mb-1">' + escHtml(site.name) + '</h3>' +
              '<p class="site-url text-muted mb-0">' + escHtml(site.url) + '</p>' +
            '</div>' +
            '<div class="mt-auto">' +
              '<button class="btn btn-primary btn-sm w-100" data-site-id="' + escHtml(site.id) + '" type="button">' +
                'Enter as Admin' +
              '</button>' +
            '</div>' +
          '</div>';

        col.querySelector('button').addEventListener('click', function () {
          enterSite(site);
        });

        return col;
      }

      function enterSite(site) {
        var btn = document.querySelector('[data-site-id="' + site.id + '"]');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Generating token\u2026';
        }

        fetch('/api/admin-hub', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'generate-token', siteId: site.id }),
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (!data.loginUrl) {
              throw new Error(data.error || 'No login URL returned');
            }
            // Open in new tab — the token is consumed on first load
            window.open(data.loginUrl, '_blank', 'noopener,noreferrer');

            if (btn) {
              // Show a countdown so the user knows the token is expiring
              var seconds = Number(data.expiresInSeconds || 300);
              startCountdown(btn, site.name, seconds);
            }
          })
          .catch(function (err) {
            showMessage('Could not enter ' + site.name + ': ' + (err.message || 'Unknown error'), 'danger');
            if (btn) {
              btn.disabled = false;
              btn.textContent = 'Enter as Admin';
            }
          });
      }

      function startCountdown(btn, siteName, seconds) {
        var remaining = seconds;
        btn.classList.add('btn-secondary');
        btn.classList.remove('btn-primary');

        function tick() {
          if (remaining <= 0) {
            btn.disabled = false;
            btn.textContent = 'Enter as Admin';
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-primary');
            return;
          }
          btn.textContent = 'Opened \u2014 token expires in ' + remaining + 's';
          remaining--;
          setTimeout(tick, 1000);
        }

        tick();
      }

      siteListPanelBody.addEventListener('show.bs.collapse', function () {
        siteListPanelHeader.classList.add('site-list-expanded');
        refreshSitesBtn.classList.remove('d-none');
      });

      siteListPanelBody.addEventListener('hide.bs.collapse', function () {
        siteListPanelHeader.classList.remove('site-list-expanded');
        refreshSitesBtn.classList.add('d-none');
      });

      refreshSitesBtn.addEventListener('click', loadSites);

      function setSiteAdaptationStatus(message, isError) {
        siteAdaptationStatus.textContent = message;
        siteAdaptationStatus.classList.toggle('text-danger', Boolean(isError));
        siteAdaptationStatus.classList.toggle('text-muted', !isError);
      }

      function buildGuideOptionHtml(guide) {
        var label = (guide.displayName || guide.file || '').trim();
        var file = String(guide.file || '').trim();
        if (!file) return '';
        return '<option value="' + escHtml(file) + '">' + escHtml(label) + '</option>';
      }

      function loadSiteAdaptationGuides() {
        setSiteAdaptationStatus('Loading guides…', false);
        refreshSiteAdaptationGuidesButton.disabled = true;
        openSiteAdaptationGuideButton.disabled = true;

        return fetch('/api/admin-hub?action=guide-index', { credentials: 'same-origin' })
          .then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
              // A 403 (plain admins cannot read the guides) carries an error
              // body with no guides. Report it rather than "no guides found".
              if (!res.ok) {
                var error = new Error((data && data.error) || 'Failed to load guides (' + res.status + ')');
                error.fromServer = true;
                throw error;
              }
              return data;
            });
          })
          .then(function (data) {
            var guides = Array.isArray(data && data.guides) ? data.guides : [];
            var options = guides.map(buildGuideOptionHtml).filter(Boolean);
            if (!options.length) {
              siteAdaptationSelect.innerHTML = '<option value="">No guides found</option>';
              siteAdaptationSelect.disabled = true;
              setSiteAdaptationStatus('No secure site adaptation guides found.', false);
              return;
            }

            siteAdaptationSelect.innerHTML = options.join('');
            siteAdaptationSelect.disabled = false;
            openSiteAdaptationGuideButton.disabled = false;
            setSiteAdaptationStatus('Loaded ' + guides.length + ' secure guide' + (guides.length === 1 ? '' : 's') + '.', false);
          })
          .catch(function (err) {
            siteAdaptationSelect.innerHTML = '<option value="">Could not load guides</option>';
            siteAdaptationSelect.disabled = true;
            setSiteAdaptationStatus(err && err.fromServer ? err.message : 'Failed to load secure site adaptation guides.', true);
          })
          .finally(function () {
            refreshSiteAdaptationGuidesButton.disabled = false;
          });
      }

      refreshSiteAdaptationGuidesButton.addEventListener('click', loadSiteAdaptationGuides);

      // Guides are opened at their own URL, where super-admin-static-page checks
      // the session and serves them. They load /theme.css, marked and
      // /site-adaptation-guide-renderer.js by root-relative URL, which a blob:
      // URL cannot resolve, so loading the HTML into a blob left a blank page.
      var GUIDE_FILE_PATTERN = /^[a-z0-9-]+-site-adaptation-guide\.html$/;

      openSiteAdaptationGuideButton.addEventListener('click', function () {
        var selectedFile = String(siteAdaptationSelect.value || '').trim();
        if (!GUIDE_FILE_PATTERN.test(selectedFile)) return;

        var win = window.open('/' + selectedFile, '_blank');
        if (!win) {
          setSiteAdaptationStatus('Popup blocked \u2014 allow popups for this site and try again.', true);
          return;
        }

        try { win.opener = null; } catch (_) {}
        setSiteAdaptationStatus('', false);
      });

      // -----------------------------------------------------------------------
      // Site editor
      // -----------------------------------------------------------------------

      function renderSiteEditor(sites) {
        var editor = document.getElementById('siteEditor');
        editor.innerHTML = '';

        (sites.length ? sites : []).forEach(function (site, i) {
          editor.appendChild(buildEditorRow(site, i));
        });

        updateEditorIndices();
      }

      function buildEditorRow(site, index) {
        var row = document.createElement('div');
        row.className = 'row g-2 mb-2 align-items-end site-editor-row';
        row.dataset.index = String(index);
        row.innerHTML =
          '<div class="col-md-2">' +
            '<label class="form-label small mb-1">ID</label>' +
            '<input class="form-control form-control-sm field-id" value="' + escHtml(site.id || '') + '" placeholder="site-1" />' +
          '</div>' +
          '<div class="col-md-2">' +
            '<label class="form-label small mb-1">Name</label>' +
            '<input class="form-control form-control-sm field-name" value="' + escHtml(site.name || '') + '" placeholder="My Site" />' +
          '</div>' +
          '<div class="col-md-2">' +
            '<label class="form-label small mb-1">URL</label>' +
            '<input class="form-control form-control-sm field-url" value="' + escHtml(site.url || '') + '" placeholder="https://example.com" />' +
          '</div>' +
          '<div class="col-md-2">' +
            '<label class="form-label small mb-1">Netlify Site ID</label>' +
            '<input class="form-control form-control-sm field-netlify-site-id" value="' + escHtml(site.netlifySiteId || '') + '" placeholder="1234abcd-..." autocomplete="off" />' +
          '</div>' +
          '<div class="col-md-2">' +
            '<label class="form-label small mb-1">Shared Secret <span class="text-muted">(HUB_SHARED_SECRET)</span></label>' +
            '<input class="form-control form-control-sm field-secret" type="password" value="' + escHtml(site.sharedSecret || '') + '" placeholder="Leave blank to keep existing" autocomplete="off" />' +
          '</div>' +
          '<div class="col-md-2">' +
            '<p class="small text-muted mb-2">Manage secret + removal from this site\'s <a href="/admin-super-admin.html">Super Admin</a> page.</p>' +
          '</div>';

        return row;
      }

      function updateEditorIndices() {
        document.querySelectorAll('.site-editor-row').forEach(function (row, i) {
          row.dataset.index = String(i);
        });
      }

      document.getElementById('addSiteBtn').addEventListener('click', function () {
        var editor = document.getElementById('siteEditor');
        var count = editor.querySelectorAll('.site-editor-row').length;
        editor.appendChild(buildEditorRow({ id: '', name: '', url: '', sharedSecret: '' }, count));
      });

      document.getElementById('saveSitesBtn').addEventListener('click', function () {
        var rows = document.querySelectorAll('.site-editor-row');
        var sites = [];

        rows.forEach(function (row) {
          var id = row.querySelector('.field-id').value.trim();
          var name = row.querySelector('.field-name').value.trim();
          var url = row.querySelector('.field-url').value.trim();
          var secret = row.querySelector('.field-secret').value.trim();
          var netlifySiteId = row.querySelector('.field-netlify-site-id').value.trim();

          if (!id && !name && !url && !secret && !netlifySiteId) return; // skip blank rows

          // When the secret field is blank, carry the existing secret from
          // the loaded site list (so admins don't have to re-enter it on every save).
          var existingSecret = '';
          var existingSite = registeredSites.find(function (s) { return s.id === id; });
          if (!secret && existingSite) {
            // We don't have the secret client-side (it's never sent), so we
            // send a sentinel that tells the server to keep the existing value.
            existingSecret = '__keep__';
          }

          sites.push({ id: id, name: name, url: url, netlifySiteId: netlifySiteId, sharedSecret: secret || existingSecret });
        });

        var saveResult = document.getElementById('saveResult');
        var btn = document.getElementById('saveSitesBtn');
        btn.disabled = true;
        saveResult.textContent = 'Saving\u2026';

        fetch('/api/admin-hub', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save-sites', sites: sites }),
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            btn.disabled = false;
            if (data.saved) {
              saveResult.textContent = 'Saved ' + (data.sites || []).length + ' site(s).';
              loadSites();
            } else {
              saveResult.textContent = 'Error: ' + (data.error || 'Unknown error');
            }
          })
          .catch(function () {
            btn.disabled = false;
            saveResult.textContent = 'Network error — changes not saved.';
          });
      });

      // -----------------------------------------------------------------------
      // Escape helper
      // -----------------------------------------------------------------------

      function escHtml(str) {
        return String(str || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      // -----------------------------------------------------------------------
      // Init
      // -----------------------------------------------------------------------

      checkSession().then(function (role) {
        if (!role) return;
        if (role === 'super_admin') loadSites();
        loadSiteAdaptationGuides();
      });

    })();
